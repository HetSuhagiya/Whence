import json
import time
import uuid
from typing import Any

from app.adapters.base import validate_metric_expression
from app.adapters.bigquery_adapter import BigQueryAdapter
from app.adapters.duckdb_adapter import DuckDBAdapter
from app.connections.service import connection_service
from app.db import get_connection_db
from app.semantic.models import (
    AutoSuggestResponse,
    DimensionCreate,
    DimensionPublic,
    DimensionType,
    DimensionUpdate,
    MetricCreate,
    MetricPreviewPoint,
    MetricPreviewRequest,
    MetricPreviewResponse,
    MetricPublic,
    MetricUpdate,
    MetricValidateRequest,
    MetricValidateResponse,
    MetricVersionPublic,
    ModelCreate,
    ModelJoin,
    ModelPublic,
    ModelUpdate,
)


class SemanticService:
    def _get_db(self) -> Any:
        return get_connection_db()

    def get_adapter_for_connection(self, connection_id: str) -> Any:
        conn = connection_service.get_connection(connection_id)
        if conn.warehouse_type == "duckdb":
            from app.demo_dataset import ensure_demo_ecommerce_dataset

            db_path = ensure_demo_ecommerce_dataset()
            return DuckDBAdapter(database_path=db_path)
        else:
            client = connection_service._get_bq_client(
                connection_id, billing_project=conn.billing_project
            )
            return BigQueryAdapter(
                project_id=conn.project_id or "",
                dataset_id="thelook_ecommerce",
                client=client,
            )

    # -------------------------------------------------------------
    # Models CRUD
    # -------------------------------------------------------------
    def create_model(self, req: ModelCreate) -> ModelPublic:
        now = time.time()
        model_id = str(uuid.uuid4())
        db = self._get_db()
        cur = db.cursor()

        cur.execute(
            """
            INSERT INTO models (
                id, connection_id, name, project_id, dataset_id,
                table_name, primary_time_column, description,
                joins, require_partition_filter, partition_column,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                model_id,
                req.connection_id,
                req.name,
                req.project_id,
                req.dataset_id,
                req.table_name,
                req.primary_time_column,
                req.description or "",
                json.dumps([j.model_dump() for j in req.joins]),
                1 if req.require_partition_filter else 0,
                req.partition_column,
                now,
                now,
            ),
        )
        db.commit()

        # Add initial dimensions if present
        for dim in req.dimensions:
            self.create_dimension(model_id, dim)

        # Add initial metrics if present
        for met in req.metrics:
            self.create_metric(model_id, met)

        return self.get_model(model_id)

    def get_model(self, model_id: str) -> ModelPublic:
        db = self._get_db()
        cur = db.cursor()
        cur.execute("SELECT * FROM models WHERE id = ?", (model_id,))
        row = cur.fetchone()
        if not row:
            raise KeyError(f"Model '{model_id}' not found.")

        # Fetch dimensions
        cur.execute(
            "SELECT * FROM dimensions WHERE model_id = ? ORDER BY is_identifier ASC, name ASC",
            (model_id,),
        )
        dim_rows = cur.fetchall()
        dimensions = [
            DimensionPublic(
                id=d["id"],
                model_id=d["model_id"],
                name=d["name"],
                column_expression=d["column_expression"],
                dimension_type=d["dimension_type"],
                label=d["label"],
                is_identifier=bool(d["is_identifier"]),
                exclude_from_explanation=bool(d["exclude_from_explanation"]),
                created_at=d["created_at"],
                updated_at=d["updated_at"],
            )
            for d in dim_rows
        ]

        # Fetch metrics
        cur.execute("SELECT * FROM metrics WHERE model_id = ? ORDER BY name ASC", (model_id,))
        met_rows = cur.fetchall()
        metrics = [
            MetricPublic(
                id=m["id"],
                model_id=m["model_id"],
                name=m["name"],
                description=m["description"],
                metric_type=m["metric_type"],
                numerator_expr=m["numerator_expr"],
                denominator_expr=m["denominator_expr"],
                fixed_filter=m["fixed_filter"],
                display_format=m["display_format"],
                higher_is_better=bool(m["higher_is_better"]),
                version=m["version"],
                created_at=m["created_at"],
                updated_at=m["updated_at"],
            )
            for m in met_rows
        ]

        joins_raw = row["joins"] if "joins" in row.keys() and row["joins"] else "[]"
        try:
            joins_list = json.loads(joins_raw)
            joins = [ModelJoin(**j) for j in joins_list]
        except Exception:
            joins = []

        require_partition_filter = (
            bool(row["require_partition_filter"])
            if "require_partition_filter" in row.keys() and row["require_partition_filter"] is not None
            else False
        )
        partition_column = (
            row["partition_column"]
            if "partition_column" in row.keys()
            else None
        )

        return ModelPublic(
            id=row["id"],
            connection_id=row["connection_id"],
            name=row["name"],
            project_id=row["project_id"],
            dataset_id=row["dataset_id"],
            table_name=row["table_name"],
            primary_time_column=row["primary_time_column"],
            description=row["description"],
            joins=joins,
            require_partition_filter=require_partition_filter,
            partition_column=partition_column,
            dimensions=dimensions,
            metrics=metrics,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def list_models(self, connection_id: str | None = None) -> list[ModelPublic]:
        db = self._get_db()
        cur = db.cursor()
        if connection_id:
            cur.execute(
                "SELECT id FROM models WHERE connection_id = ? ORDER BY created_at DESC",
                (connection_id,),
            )
        else:
            cur.execute("SELECT id FROM models ORDER BY created_at DESC")
        rows = cur.fetchall()
        return [self.get_model(r["id"]) for r in rows]

    def update_model(self, model_id: str, req: ModelUpdate) -> ModelPublic:
        now = time.time()
        db = self._get_db()
        cur = db.cursor()
        cur.execute("SELECT * FROM models WHERE id = ?", (model_id,))
        row = cur.fetchone()
        if not row:
            raise KeyError(f"Model '{model_id}' not found.")

        new_name = req.name if req.name is not None else row["name"]
        new_time = (
            req.primary_time_column
            if req.primary_time_column is not None
            else row["primary_time_column"]
        )
        new_desc = req.description if req.description is not None else row["description"]

        cur.execute(
            """
            UPDATE models
            SET name = ?, primary_time_column = ?, description = ?, updated_at = ?
            WHERE id = ?
            """,
            (new_name, new_time, new_desc, now, model_id),
        )
        db.commit()
        return self.get_model(model_id)

    def delete_model(self, model_id: str) -> None:
        db = self._get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM models WHERE id = ?", (model_id,))
        if cur.rowcount == 0:
            raise KeyError(f"Model '{model_id}' not found.")
        db.commit()

    # -------------------------------------------------------------
    # Dimensions CRUD
    # -------------------------------------------------------------
    def create_dimension(self, model_id: str, req: DimensionCreate) -> DimensionPublic:
        now = time.time()
        dim_id = str(uuid.uuid4())
        db = self._get_db()
        cur = db.cursor()

        # Verify model exists
        cur.execute("SELECT id FROM models WHERE id = ?", (model_id,))
        if not cur.fetchone():
            raise KeyError(f"Model '{model_id}' not found.")

        cur.execute(
            """
            INSERT INTO dimensions (
                id, model_id, name, column_expression, dimension_type, label,
                is_identifier, exclude_from_explanation, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                dim_id,
                model_id,
                req.name,
                req.column_expression,
                req.dimension_type,
                req.label or req.name,
                1 if req.is_identifier else 0,
                1 if req.exclude_from_explanation else 0,
                now,
                now,
            ),
        )
        db.commit()
        return self.get_dimension(dim_id)

    def get_dimension(self, dim_id: str) -> DimensionPublic:
        db = self._get_db()
        cur = db.cursor()
        cur.execute("SELECT * FROM dimensions WHERE id = ?", (dim_id,))
        d = cur.fetchone()
        if not d:
            raise KeyError(f"Dimension '{dim_id}' not found.")

        return DimensionPublic(
            id=d["id"],
            model_id=d["model_id"],
            name=d["name"],
            column_expression=d["column_expression"],
            dimension_type=d["dimension_type"],
            label=d["label"],
            is_identifier=bool(d["is_identifier"]),
            exclude_from_explanation=bool(d["exclude_from_explanation"]),
            created_at=d["created_at"],
            updated_at=d["updated_at"],
        )

    def update_dimension(self, dim_id: str, req: DimensionUpdate) -> DimensionPublic:
        now = time.time()
        db = self._get_db()
        cur = db.cursor()
        cur.execute("SELECT * FROM dimensions WHERE id = ?", (dim_id,))
        d = cur.fetchone()
        if not d:
            raise KeyError(f"Dimension '{dim_id}' not found.")

        new_expr = (
            req.column_expression if req.column_expression is not None else d["column_expression"]
        )
        new_type = req.dimension_type if req.dimension_type is not None else d["dimension_type"]
        new_label = req.label if req.label is not None else d["label"]
        new_id_flag = (
            1
            if (req.is_identifier if req.is_identifier is not None else bool(d["is_identifier"]))
            else 0
        )
        new_exclude = (
            1
            if (
                req.exclude_from_explanation
                if req.exclude_from_explanation is not None
                else bool(d["exclude_from_explanation"])
            )
            else 0
        )

        cur.execute(
            """
            UPDATE dimensions
            SET column_expression = ?, dimension_type = ?, label = ?,
                is_identifier = ?, exclude_from_explanation = ?, updated_at = ?
            WHERE id = ?
            """,
            (new_expr, new_type, new_label, new_id_flag, new_exclude, now, dim_id),
        )
        db.commit()
        return self.get_dimension(dim_id)

    def delete_dimension(self, dim_id: str) -> None:
        db = self._get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM dimensions WHERE id = ?", (dim_id,))
        if cur.rowcount == 0:
            raise KeyError(f"Dimension '{dim_id}' not found.")
        db.commit()

    # -------------------------------------------------------------
    # Metrics CRUD & Versioning
    # -------------------------------------------------------------
    def create_metric(self, model_id: str, req: MetricCreate) -> MetricPublic:
        # Determine dialect for validation
        db = self._get_db()
        cur = db.cursor()
        cur.execute(
            """
            SELECT c.warehouse_type
            FROM models m
            JOIN connections c ON m.connection_id = c.id
            WHERE m.id = ?
            """,
            (model_id,),
        )
        r = cur.fetchone()
        dialect = r["warehouse_type"] if r else "duckdb"

        # Validate expressions using sqlglot guardrail
        validate_metric_expression(req.numerator_expr, dialect=dialect)
        if req.denominator_expr:
            validate_metric_expression(req.denominator_expr, dialect=dialect)

        now = time.time()
        metric_id = str(uuid.uuid4())
        version = 1

        cur.execute(
            """
            INSERT INTO metrics (
                id, model_id, name, description, metric_type, numerator_expr,
                denominator_expr, fixed_filter, display_format, higher_is_better,
                version, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                metric_id,
                model_id,
                req.name,
                req.description or "",
                req.metric_type,
                req.numerator_expr,
                req.denominator_expr,
                req.fixed_filter,
                req.display_format,
                1 if req.higher_is_better else 0,
                version,
                now,
                now,
            ),
        )

        # Snapshot version 1
        v_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO metric_versions (
                id, metric_id, version, numerator_expr, denominator_expr,
                fixed_filter, display_format, higher_is_better, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                v_id,
                metric_id,
                version,
                req.numerator_expr,
                req.denominator_expr,
                req.fixed_filter,
                req.display_format,
                1 if req.higher_is_better else 0,
                now,
            ),
        )

        db.commit()
        return self.get_metric(metric_id)

    def get_metric(self, metric_id: str) -> MetricPublic:
        db = self._get_db()
        cur = db.cursor()
        cur.execute("SELECT * FROM metrics WHERE id = ?", (metric_id,))
        m = cur.fetchone()
        if not m:
            raise KeyError(f"Metric '{metric_id}' not found.")

        return MetricPublic(
            id=m["id"],
            model_id=m["model_id"],
            name=m["name"],
            description=m["description"],
            metric_type=m["metric_type"],
            numerator_expr=m["numerator_expr"],
            denominator_expr=m["denominator_expr"],
            fixed_filter=m["fixed_filter"],
            display_format=m["display_format"],
            higher_is_better=bool(m["higher_is_better"]),
            version=m["version"],
            created_at=m["created_at"],
            updated_at=m["updated_at"],
        )

    def update_metric(self, metric_id: str, req: MetricUpdate) -> MetricPublic:
        db = self._get_db()
        cur = db.cursor()
        cur.execute(
            """
            SELECT m.*, c.warehouse_type
            FROM metrics m
            JOIN models mo ON m.model_id = mo.id
            JOIN connections c ON mo.connection_id = c.id
            WHERE m.id = ?
            """,
            (metric_id,),
        )
        m = cur.fetchone()
        if not m:
            raise KeyError(f"Metric '{metric_id}' not found.")

        dialect = m["warehouse_type"] or "duckdb"
        new_name = req.name if req.name is not None else m["name"]
        new_desc = req.description if req.description is not None else m["description"]
        new_type = req.metric_type if req.metric_type is not None else m["metric_type"]
        new_num = req.numerator_expr if req.numerator_expr is not None else m["numerator_expr"]
        new_den = (
            req.denominator_expr if req.denominator_expr is not None else m["denominator_expr"]
        )
        new_filt = req.fixed_filter if req.fixed_filter is not None else m["fixed_filter"]
        new_fmt = req.display_format if req.display_format is not None else m["display_format"]
        new_higher = (
            1
            if (
                req.higher_is_better
                if req.higher_is_better is not None
                else bool(m["higher_is_better"])
            )
            else 0
        )

        # Validate
        validate_metric_expression(new_num, dialect=dialect)
        if new_den:
            validate_metric_expression(new_den, dialect=dialect)

        now = time.time()
        new_version = m["version"] + 1

        cur.execute(
            """
            UPDATE metrics
            SET name = ?, description = ?, metric_type = ?, numerator_expr = ?,
                denominator_expr = ?, fixed_filter = ?, display_format = ?,
                higher_is_better = ?, version = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                new_name,
                new_desc,
                new_type,
                new_num,
                new_den,
                new_filt,
                new_fmt,
                new_higher,
                new_version,
                now,
                metric_id,
            ),
        )

        # Record new version in history
        v_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO metric_versions (
                id, metric_id, version, numerator_expr, denominator_expr,
                fixed_filter, display_format, higher_is_better, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                v_id,
                metric_id,
                new_version,
                new_num,
                new_den,
                new_filt,
                new_fmt,
                new_higher,
                now,
            ),
        )

        db.commit()
        return self.get_metric(metric_id)

    def list_metric_versions(self, metric_id: str) -> list[MetricVersionPublic]:
        db = self._get_db()
        cur = db.cursor()
        cur.execute(
            "SELECT * FROM metric_versions WHERE metric_id = ? ORDER BY version DESC",
            (metric_id,),
        )
        rows = cur.fetchall()
        return [
            MetricVersionPublic(
                id=r["id"],
                metric_id=r["metric_id"],
                version=r["version"],
                numerator_expr=r["numerator_expr"],
                denominator_expr=r["denominator_expr"],
                fixed_filter=r["fixed_filter"],
                display_format=r["display_format"],
                higher_is_better=bool(r["higher_is_better"]),
                created_at=r["created_at"],
            )
            for r in rows
        ]

    def delete_metric(self, metric_id: str) -> None:
        db = self._get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM metrics WHERE id = ?", (metric_id,))
        if cur.rowcount == 0:
            raise KeyError(f"Metric '{metric_id}' not found.")
        db.commit()

    # -------------------------------------------------------------
    # Live Validation & Preview
    # -------------------------------------------------------------
    def validate_metric_formula(self, req: MetricValidateRequest) -> MetricValidateResponse:
        conn = connection_service.get_connection(req.connection_id)
        dialect = conn.warehouse_type
        try:
            validate_metric_expression(req.numerator_expr, dialect=dialect)
            if req.denominator_expr:
                validate_metric_expression(req.denominator_expr, dialect=dialect)
            formatted = req.numerator_expr
            if req.denominator_expr:
                formatted = f"({req.numerator_expr}) / ({req.denominator_expr})"
            return MetricValidateResponse(valid=True, formatted_sql=formatted)
        except Exception as e:
            return MetricValidateResponse(
                valid=False,
                formatted_sql=req.numerator_expr,
                error=str(e),
            )

    async def preview_metric_trend(self, req: MetricPreviewRequest) -> MetricPreviewResponse:
        model = self.get_model(req.model_id)
        metric = next((m for m in model.metrics if m.name == req.metric_name_or_expr), None)

        adapter = self.get_adapter_for_connection(req.connection_id)
        dialect = adapter.dialect
        time_col = model.primary_time_column
        tbl = (
            f"`{model.project_id}.{model.dataset_id}.{model.table_name}`"
            if dialect == "bigquery"
            else f'"{model.table_name}"'
        )

        # Build 30-day daily preview aggregation
        trunc_expr = (
            f"timestamp_trunc({time_col}, DAY)"
            if dialect == "bigquery"
            else f"date_trunc('day', {time_col})"
        )

        num_expr = metric.numerator_expr if metric else req.metric_name_or_expr
        den_expr = metric.denominator_expr if metric else None

        if den_expr:
            if dialect == "bigquery":
                calc = f"SAFE_DIVIDE({num_expr}, NULLIF({den_expr}, 0))"
            else:
                calc = f"({num_expr}) / NULLIF({den_expr}, 0)"
        else:
            calc = num_expr

        sql = (
            f"""
        SELECT
            strftime({trunc_expr}, '%Y-%m-%d') AS date_val,
            COALESCE({calc}, 0) AS metric_val
        FROM {tbl}
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT {req.days};
        """
            if dialect == "duckdb"
            else f"""
        SELECT
            FORMAT_DATE('%Y-%m-%d', DATE({trunc_expr})) AS date_val,
            COALESCE({calc}, 0) AS metric_val
        FROM {tbl}
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT {req.days};
        """
        )

        try:
            res = await adapter.run(sql)
            points: list[MetricPreviewPoint] = []
            total_val = 0.0
            # Reverse to chronological order
            for row in reversed(res.rows):
                val = float(row.get("metric_val") or 0.0)
                total_val += val
                points.append(
                    MetricPreviewPoint(date=str(row.get("date_val") or ""), value=round(val, 2))
                )

            fmt = metric.display_format if metric else "currency"
            unit = "$" if fmt == "currency" else "%" if fmt == "percent" else ""
            return MetricPreviewResponse(
                metric_name=metric.name if metric else "custom_preview",
                display_format=fmt,
                points=points,
                total_value=round(total_val, 2),
                unit=unit,
            )
        except Exception:
            # Fallback if connection has no table rows or mock environment
            return MetricPreviewResponse(
                metric_name=metric.name if metric else "custom_preview",
                display_format=metric.display_format if metric else "currency",
                points=[],
                total_value=0.0,
                unit="$",
            )

    # -------------------------------------------------------------
    # Auto-suggest & Default Ecommerce Seed Set
    # -------------------------------------------------------------
    def auto_suggest_for_table(self, connection_id: str, table_name: str) -> AutoSuggestResponse:
        _ = connection_service.get_connection(connection_id)
        sources = connection_service.get_sources(connection_id)
        target_source = (
            next((s for s in sources if s.table_name == table_name), None) if sources else None
        )
        columns = target_source.columns if target_source else []

        # If introspected table columns are present, tailor definitions to actual schema
        if columns:
            col_map = {c.name.lower(): c for c in columns}

            # 1. Detect primary time column
            time_candidates = [
                "created_at",
                "order_date",
                "timestamp",
                "date",
                "created_date",
                "ordered_at",
                "event_time",
                "order_timestamp",
            ]
            primary_time = "created_at"
            for tc in time_candidates:
                if tc in col_map:
                    primary_time = col_map[tc].name
                    break
            else:
                for c in columns:
                    if any(t in c.data_type.upper() for t in ["TIMESTAMP", "DATE", "DATETIME"]):
                        primary_time = c.name
                        break

            # 2. Dimensions
            dimensions: list[DimensionCreate] = []
            for c in columns:
                c_lower = c.name.lower()
                if c.name == primary_time:
                    continue
                is_id = any(
                    c_lower.endswith(sfx)
                    for sfx in ["_id", "id", "_code", "_key", "uuid", "_number"]
                )
                dim_type: DimensionType = "categorical"
                if (
                    any(t in c.data_type.upper() for t in ["INT", "FLOAT", "NUMERIC", "DECIMAL"])
                    and not is_id
                ):
                    dim_type = "numeric_bucket"
                elif any(t in c.data_type.upper() for t in ["DATE", "TIMESTAMP"]):
                    dim_type = "time"

                label = c.name.replace("_", " ").title()
                dimensions.append(
                    DimensionCreate(
                        name=c.name,
                        column_expression=c.name,
                        dimension_type=dim_type,
                        label=label,
                        is_identifier=is_id,
                        exclude_from_explanation=is_id,
                    )
                )

            # 3. Metrics
            metrics: list[MetricCreate] = []
            # Revenue
            price_col = next(
                (
                    c.name
                    for c in columns
                    if c.name.lower()
                    in ["sale_price", "price", "amount", "total_amount", "revenue", "sales"]
                ),
                None,
            )
            if price_col:
                metrics.append(
                    MetricCreate(
                        name="revenue",
                        description=f"Total revenue computed as SUM({price_col})",
                        metric_type="additive",
                        numerator_expr=f"SUM({price_col})",
                        display_format="currency",
                        higher_is_better=True,
                    )
                )
            else:
                metrics.append(
                    MetricCreate(
                        name="revenue",
                        description="Total revenue (SUM of sales)",
                        metric_type="additive",
                        numerator_expr="SUM(sale_price)",
                        display_format="currency",
                        higher_is_better=True,
                    )
                )

            # Orders
            order_id_col = next(
                (
                    c.name
                    for c in columns
                    if c.name.lower() in ["order_id", "id", "order_number", "orders"]
                ),
                None,
            )
            if order_id_col:
                metrics.append(
                    MetricCreate(
                        name="orders",
                        description=f"Distinct count of orders ({order_id_col})",
                        metric_type="additive",
                        numerator_expr=f"COUNT(DISTINCT {order_id_col})",
                        display_format="integer",
                        higher_is_better=True,
                    )
                )
            else:
                metrics.append(
                    MetricCreate(
                        name="orders",
                        description="Distinct count of orders placed",
                        metric_type="additive",
                        numerator_expr="COUNT(DISTINCT order_id)",
                        display_format="integer",
                        higher_is_better=True,
                    )
                )

            # Items sold
            item_col = next(
                (
                    c.name
                    for c in columns
                    if c.name.lower() in ["order_item_id", "item_id", "product_id", "line_item_id"]
                ),
                None,
            )
            if item_col:
                metrics.append(
                    MetricCreate(
                        name="items_sold",
                        description=f"Total count of items sold ({item_col})",
                        metric_type="additive",
                        numerator_expr=f"COUNT({item_col})",
                        display_format="integer",
                        higher_is_better=True,
                    )
                )
            else:
                metrics.append(
                    MetricCreate(
                        name="items_sold",
                        description="Total count of individual items sold",
                        metric_type="additive",
                        numerator_expr="COUNT(order_item_id)",
                        display_format="integer",
                        higher_is_better=True,
                    )
                )

            # AOV (Ratio: Revenue / Orders)
            metrics.append(
                MetricCreate(
                    name="aov",
                    description="Average order value (Revenue / Orders)",
                    metric_type="ratio",
                    numerator_expr=f"SUM({price_col})" if price_col else "SUM(sale_price)",
                    denominator_expr=(
                        f"COUNT(DISTINCT {order_id_col})"
                        if order_id_col
                        else "COUNT(DISTINCT order_id)"
                    ),
                    display_format="currency",
                    higher_is_better=True,
                )
            )

            # Items per order (Ratio: Items / Orders)
            metrics.append(
                MetricCreate(
                    name="items_per_order",
                    description="Average items per order (Items / Orders)",
                    metric_type="ratio",
                    numerator_expr=f"COUNT({item_col})" if item_col else "COUNT(order_item_id)",
                    denominator_expr=(
                        f"COUNT(DISTINCT {order_id_col})"
                        if order_id_col
                        else "COUNT(DISTINCT order_id)"
                    ),
                    display_format="decimal",
                    higher_is_better=True,
                )
            )

            return AutoSuggestResponse(
                model_name=f"{table_name.replace('_', ' ').title()} Model",
                primary_time_column=primary_time,
                dimensions=dimensions,
                metrics=metrics,
            )

        # Fallback to standard ecommerce schema (thelook_ecommerce)
        return AutoSuggestResponse(
            model_name="TheLook Ecommerce Orders",
            primary_time_column="created_at",
            dimensions=[
                DimensionCreate(
                    name="category",
                    column_expression="category",
                    dimension_type="categorical",
                    label="Product Category",
                    is_identifier=False,
                    exclude_from_explanation=False,
                ),
                DimensionCreate(
                    name="status",
                    column_expression="status",
                    dimension_type="categorical",
                    label="Order Status",
                    is_identifier=False,
                    exclude_from_explanation=False,
                ),
                DimensionCreate(
                    name="traffic_source",
                    column_expression="traffic_source",
                    dimension_type="categorical",
                    label="Traffic Source",
                    is_identifier=False,
                    exclude_from_explanation=False,
                ),
                DimensionCreate(
                    name="country",
                    column_expression="country",
                    dimension_type="categorical",
                    label="Country",
                    is_identifier=False,
                    exclude_from_explanation=False,
                ),
                DimensionCreate(
                    name="state",
                    column_expression="state",
                    dimension_type="categorical",
                    label="State / Region",
                    is_identifier=False,
                    exclude_from_explanation=False,
                ),
                DimensionCreate(
                    name="order_id",
                    column_expression="order_id",
                    dimension_type="categorical",
                    label="Order ID",
                    is_identifier=True,
                    exclude_from_explanation=True,
                ),
            ],
            metrics=[
                MetricCreate(
                    name="revenue",
                    description="Total net revenue from items sold",
                    metric_type="additive",
                    numerator_expr="SUM(sale_price)",
                    display_format="currency",
                    higher_is_better=True,
                ),
                MetricCreate(
                    name="orders",
                    description="Distinct count of orders placed",
                    metric_type="additive",
                    numerator_expr="COUNT(DISTINCT order_id)",
                    display_format="integer",
                    higher_is_better=True,
                ),
                MetricCreate(
                    name="items_sold",
                    description="Total count of individual items sold",
                    metric_type="additive",
                    numerator_expr="COUNT(order_item_id)",
                    display_format="integer",
                    higher_is_better=True,
                ),
                MetricCreate(
                    name="aov",
                    description="Average order value (Revenue / Orders)",
                    metric_type="ratio",
                    numerator_expr="SUM(sale_price)",
                    denominator_expr="COUNT(DISTINCT order_id)",
                    display_format="currency",
                    higher_is_better=True,
                ),
                MetricCreate(
                    name="items_per_order",
                    description="Average items per order (Items / Orders)",
                    metric_type="ratio",
                    numerator_expr="COUNT(order_item_id)",
                    denominator_expr="COUNT(DISTINCT order_id)",
                    display_format="decimal",
                    higher_is_better=True,
                ),
            ],
        )

    def seed_default_ecommerce_set(
        self,
        connection_id: str,
        project_id: str | None = None,
        dataset_id: str | None = None,
        table_name: str | None = None,
    ) -> ModelPublic:
        """
        Confirmed default metric and dimension set for ecommerce.
        Ships out-of-the-box definitions for the 5 charts:
        - revenue
        - orders
        - items_sold
        - aov (Average Order Value)
        - items_per_order
        And the key explanation dimensions (category, status, traffic_source, country, state).
        """
        conn = connection_service.get_connection(connection_id)
        sources = connection_service.get_sources(connection_id)

        # Infer project, dataset, table if not provided
        if not table_name or not project_id or not dataset_id:
            if sources:
                target_source = next(
                    (s for s in sources if "order" in s.table_name.lower()), sources[0]
                )
                project_id = project_id or target_source.project_id
                dataset_id = dataset_id or target_source.dataset_id
                table_name = table_name or target_source.table_name
            elif conn.warehouse_type == "duckdb":
                project_id = project_id or "duckdb_local"
                dataset_id = dataset_id or "main"
                table_name = table_name or "thelook_ecommerce_orders"
            else:
                project_id = (
                    project_id
                    or conn.billing_project
                    or conn.project_id
                    or "default_project"
                )
                dataset_id = dataset_id or "thelook_ecommerce"
                table_name = table_name or "orders"

        # Check if already seeded for this table
        existing = self.list_models(connection_id)
        for m in existing:
            if m.table_name == table_name:
                return m

        suggested = self.auto_suggest_for_table(connection_id, table_name)
        model_create = ModelCreate(
            connection_id=connection_id,
            name=suggested.model_name,
            project_id=project_id,
            dataset_id=dataset_id,
            table_name=table_name,
            primary_time_column=suggested.primary_time_column,
            description=(
                f"Default analytical model for {table_name} powering "
                "the 5 dashboard charts and driver explanations."
            ),
            dimensions=suggested.dimensions,
            metrics=suggested.metrics,
        )
        return self.create_model(model_create)


semantic_service = SemanticService()
