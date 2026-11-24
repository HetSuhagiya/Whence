import datetime
from typing import Any

from app.adapters.base import (
    QueryByteCapExceededError,
    QueryGuardrailError,
    validate_sql,
)
from app.compiler.spec import ChartSpec, CompiledQuery
from app.connections.service import connection_service
from app.semantic.models import DimensionPublic, ModelPublic
from app.semantic.service import semantic_service


class QueryCompiler:
    """
    Deterministic SQL Query Compiler.
    Transforms a ChartSpec and Semantic Model into dialect-specific, safe SQL.
    Adheres strictly to the identifier validation, joins, week-start (Monday),
    time zone (UTC), and quoting rules from Sections 7 & 10.
    """

    def quote_identifier(self, identifier: str, dialect: str) -> str:
        """Quotes SQL identifiers cleanly based on dialect."""
        clean = identifier.replace("`", "").replace('"', "").strip()
        if dialect == "bigquery":
            return f"`{clean}`"
        return f'"{clean}"'

    def get_table_reference(self, model: ModelPublic, dialect: str) -> str:
        """Produces fully-qualified table reference."""
        if dialect == "bigquery":
            return f"`{model.project_id}.{model.dataset_id}.{model.table_name}`"
        return f'"{model.table_name}"'

    def _get_time_column_type(self, model: ModelPublic) -> str:
        """Determines the data type of the model's primary time column."""
        try:
            sources = connection_service.get_sources(model.connection_id)
            target_source = next((s for s in sources if s.table_name == model.table_name), None)
            if target_source:
                for col in target_source.columns:
                    if col.name.lower() == model.primary_time_column.lower():
                        return col.data_type.upper()
        except Exception:
            pass

        col_name = model.primary_time_column.lower()
        if "date" in col_name and "time" not in col_name:
            return "DATE"
        return "TIMESTAMP"

    def _resolve_anchor_date(self, model: ModelPublic) -> datetime.date:
        """Resolves the anchor date for the model, defaulting to today."""
        if model.anchor_date:
            try:
                return datetime.date.fromisoformat(model.anchor_date[:10])
            except Exception:
                pass
        return datetime.date.today()

    def compile(self, spec: ChartSpec, dialect: str = "duckdb") -> CompiledQuery:
        model = semantic_service.get_model(spec.model_id)
        clean_dialect = dialect.lower()
        if clean_dialect not in ("duckdb", "bigquery"):
            clean_dialect = "duckdb"

        # 0. Check partition filter requirement (Section 6 & Compiler requirement)
        if model.require_partition_filter:
            part_col = model.partition_column or model.primary_time_column
            has_part_filter = False
            if spec.date_range is not None:
                has_part_filter = True
            elif any(f.dimension == part_col or f.dimension == "time_period" for f in spec.filters):
                has_part_filter = True
            if not has_part_filter:
                raise QueryGuardrailError(
                    f"Model '{model.name}' requires a partition filter on '{part_col}'. "
                    f"Please specify a date_range or add a filter on '{part_col}'."
                )

        # 1. Resolve & Validate Metric
        metric = next((m for m in model.metrics if m.name == spec.metric), None)
        if not metric:
            available = [m.name for m in model.metrics]
            raise ValueError(
                f"Metric '{spec.metric}' is not declared on model '{model.name}'. "
                f"Available metrics: {available}"
            )

        # 2. Resolve & Validate Dimensions
        dim_map: dict[str, DimensionPublic] = {d.name: d for d in model.dimensions}
        time_col = model.primary_time_column
        base_alias = self.quote_identifier(model.table_name, clean_dialect)

        selected_dim_exprs: list[tuple[str, str]] = []  # (alias, sql_expression)

        # Breakdown dimensions
        for dim_name in spec.dimensions:
            if dim_name == "time_period" or dim_name == time_col:
                continue
            if dim_name not in dim_map:
                available = list(dim_map.keys())
                raise ValueError(
                    f"Dimension '{dim_name}' is not declared on model '{model.name}'. "
                    f"Available dimensions: {available}"
                )
            dim_obj = dim_map[dim_name]
            alias = self.quote_identifier(dim_name, clean_dialect)
            expr = dim_obj.column_expression
            if expr == dim_name:
                expr = self.quote_identifier(expr, clean_dialect)
            selected_dim_exprs.append((alias, expr))

        # 3. Detect and build joins (many-to-one declared keys, compiled as LEFT JOIN)
        all_referenced_text = " ".join(
            [
                metric.numerator_expr,
                metric.denominator_expr or "",
                metric.fixed_filter or "",
                *(expr for _, expr in selected_dim_exprs),
                *(f.dimension for f in spec.filters),
            ]
        )

        active_joins: list[str] = []
        if model.joins:
            for j in model.joins:
                if j.name in all_referenced_text or j.target_table in all_referenced_text:
                    if clean_dialect == "bigquery":
                        if "." in j.target_table:
                            target_ref = f"`{j.target_table}`"
                        else:
                            target_ref = f"`{model.project_id}.{model.dataset_id}.{j.target_table}`"
                    else:
                        target_ref = f'"{j.target_table}"'

                    join_alias = self.quote_identifier(j.name, clean_dialect)
                    left_col = f"{base_alias}.{self.quote_identifier(j.left_on, clean_dialect)}"
                    right_col = f"{join_alias}.{self.quote_identifier(j.right_on, clean_dialect)}"
                    join_type = j.join_type.upper()
                    active_joins.append(
                        f"{join_type} JOIN {target_ref} AS {join_alias} ON {left_col} = {right_col}"
                    )

        base_table_ref = self.get_table_reference(model, clean_dialect)
        if active_joins:
            from_clause = f"{base_table_ref} AS {base_alias}\n            " + "\n            ".join(
                active_joins
            )
            time_ref = f"{base_alias}.{self.quote_identifier(time_col, clean_dialect)}"
        else:
            from_clause = base_table_ref
            time_ref = self.quote_identifier(time_col, clean_dialect)

        # Resolve primary time column data type and anchor date
        time_type = self._get_time_column_type(model)

        # Time grain dimension (defined week start: Monday; defined time zone: UTC)
        if spec.time_grain:
            if clean_dialect == "bigquery":
                grain_map = {
                    "day": "DAY",
                    "week": "WEEK(MONDAY)",
                    "month": "MONTH",
                    "year": "YEAR",
                }
                bq_grain = grain_map.get(spec.time_grain, "DAY")
                if time_type == "DATE":
                    time_expr = f"FORMAT_DATE('%Y-%m-%d', DATE_TRUNC({time_ref}, {bq_grain}))"
                elif time_type == "DATETIME":
                    time_expr = f"FORMAT_DATETIME('%Y-%m-%d', DATETIME_TRUNC({time_ref}, {bq_grain}))"
                else:
                    time_expr = (
                        f"FORMAT_DATE('%Y-%m-%d', DATE(TIMESTAMP_TRUNC({time_ref}, {bq_grain}, 'UTC')))"
                    )
            else:
                duck_grain_map = {
                    "day": "day",
                    "week": "week",
                    "month": "month",
                    "year": "year",
                }
                dg = duck_grain_map.get(spec.time_grain, "day")
                time_expr = f"strftime(date_trunc('{dg}', {time_ref}), '%Y-%m-%d')"
            selected_dim_exprs.insert(0, ("time_period", time_expr))

        # 4. Where Clause Construction
        where_conditions: list[str] = []
        params: dict[str, Any] = {}
        anchor_d = self._resolve_anchor_date(model)

        def _format_date_val(d: datetime.date, is_end: bool = False) -> str:
            if time_type == "DATE":
                return d.isoformat()
            elif time_type == "DATETIME":
                time_str = "23:59:59" if is_end else "00:00:00"
                return f"{d.isoformat()} {time_str}"
            else:  # TIMESTAMP or default
                time_str = "23:59:59" if is_end else "00:00:00"
                return f"{d.isoformat()} {time_str}"

        def _cast_expr(param_name: str) -> str:
            if clean_dialect == "bigquery":
                ref = f"@{param_name}"
                if time_type == "DATE":
                    return f"DATE({ref})"
                elif time_type == "DATETIME":
                    return f"DATETIME({ref})"
                else:
                    return f"TIMESTAMP({ref})"
            else:
                ref = f"${param_name}"
                if time_type == "DATE":
                    return f"CAST({ref} AS DATE)"
                elif time_type == "DATETIME":
                    return f"CAST({ref} AS TIMESTAMP)"
                else:
                    return f"CAST({ref} AS TIMESTAMP)"

        # Time range filter
        start_d: datetime.date | None = None
        end_d: datetime.date | None = None

        if isinstance(spec.date_range, str):
            if spec.date_range == "last_7_days":
                end_d = anchor_d
                start_d = anchor_d - datetime.timedelta(days=7)
            elif spec.date_range == "last_30_days":
                end_d = anchor_d
                start_d = anchor_d - datetime.timedelta(days=30)
            elif spec.date_range == "last_90_days":
                end_d = anchor_d
                start_d = anchor_d - datetime.timedelta(days=90)
            elif spec.date_range == "last_12_months":
                end_d = anchor_d
                start_d = anchor_d - datetime.timedelta(days=365)
        elif isinstance(spec.date_range, dict):
            s_str = spec.date_range.get("start")
            e_str = spec.date_range.get("end")
            if s_str:
                try:
                    start_d = datetime.date.fromisoformat(str(s_str)[:10])
                except Exception:
                    pass
            if e_str:
                try:
                    end_d = datetime.date.fromisoformat(str(e_str)[:10])
                except Exception:
                    pass

        if start_d is not None:
            params["start_date"] = _format_date_val(start_d, is_end=False)
            where_conditions.append(f"{time_ref} >= {_cast_expr('start_date')}")

        if end_d is not None:
            params["end_date"] = _format_date_val(end_d, is_end=True)
            where_conditions.append(f"{time_ref} <= {_cast_expr('end_date')}")

        # Fixed metric filter
        if metric.fixed_filter:
            where_conditions.append(f"({metric.fixed_filter})")

        # Custom chart filters
        for i, f in enumerate(spec.filters):
            if f.dimension not in dim_map:
                continue
            dim_expr = dim_map[f.dimension].column_expression
            param_key = f"filter_{i}"
            params[param_key] = f.value
            if clean_dialect == "bigquery":
                where_conditions.append(f"{dim_expr} {f.operator} @{param_key}")
            else:
                where_conditions.append(f"{dim_expr} {f.operator} ${param_key}")

        where_clause = ""
        if where_conditions:
            where_clause = "WHERE " + " AND ".join(where_conditions)

        # 5. Group by & Order by clauses
        group_by_clause = ""
        if selected_dim_exprs:
            group_by_clause = "GROUP BY " + ", ".join(
                str(i + 1) for i in range(len(selected_dim_exprs))
            )

        if spec.time_grain:
            order_by_clause = "ORDER BY 1 ASC"
        else:
            order_by_clause = (
                f"ORDER BY {len(selected_dim_exprs) + 1} {spec.sort_direction.upper()}"
            )

        limit_clause = f"LIMIT {spec.limit}" if spec.limit else ""
        metric_col_alias = self.quote_identifier(metric.name, clean_dialect)

        # 6. Compile Additive vs Ratio Metric
        if metric.metric_type == "additive" or not metric.denominator_expr:
            select_items = [f"{expr} AS {alias}" for alias, expr in selected_dim_exprs]
            select_items.append(f"{metric.numerator_expr} AS {metric_col_alias}")

            sql = f"""
            SELECT
                {", ".join(select_items)}
            FROM {from_clause}
            {where_clause}
            {group_by_clause}
            {order_by_clause}
            {limit_clause}
            """.strip()
        else:
            # Ratio Metric: Aggregate numerator and denominator in CTE,
            # then compute ratio in outer SELECT
            cte_select_items = [f"{expr} AS {alias}" for alias, expr in selected_dim_exprs]
            cte_select_items.append(f"{metric.numerator_expr} AS _num")
            cte_select_items.append(f"{metric.denominator_expr} AS _den")

            outer_select_items = [alias for alias, _ in selected_dim_exprs]
            if clean_dialect == "bigquery":
                outer_select_items.append(
                    f"SAFE_DIVIDE(CAST(_num AS FLOAT64), NULLIF(_den, 0)) AS {metric_col_alias}"
                )
            else:
                outer_select_items.append(
                    f"CAST(_num AS DOUBLE) / NULLIF(_den, 0) AS {metric_col_alias}"
                )

            sql = f"""
            WITH cte_metric_agg AS (
                SELECT
                    {", ".join(cte_select_items)}
                FROM {from_clause}
                {where_clause}
                {group_by_clause}
            )
            SELECT
                {", ".join(outer_select_items)}
            FROM cte_metric_agg
            {order_by_clause}
            {limit_clause}
            """.strip()

        # 7. Verify against hardened sqlglot guardrail
        validate_sql(sql, dialect=clean_dialect)

        return CompiledQuery(sql=sql, dialect=clean_dialect, params=params)

    async def execute(self, spec: ChartSpec) -> Any:
        """Compiles ChartSpec, checks dry-run bytes against byte cap, and executes."""
        model = semantic_service.get_model(spec.model_id)
        adapter = semantic_service.get_adapter_for_connection(model.connection_id)
        compiled = self.compile(spec, dialect=adapter.dialect)

        # Dry run before execution to check validity and bytes cap
        dry_run = await adapter.dry_run(compiled.sql, params=compiled.params)
        if not dry_run.valid:
            if "above your" in (dry_run.error or "") or "limit" in (dry_run.error or ""):
                raise QueryByteCapExceededError(dry_run.error or "Byte cap exceeded.")
            raise QueryGuardrailError(f"Query dry-run failed: {dry_run.error}")

        res = await adapter.run(compiled.sql, params=compiled.params)
        return {
            "spec": spec,
            "columns": res.columns,
            "rows": res.rows,
            "sql": compiled.sql,
            "duration_ms": res.duration_ms,
            "bytes_scanned": res.bytes_scanned,
            "row_count": res.row_count,
        }


query_compiler = QueryCompiler()
