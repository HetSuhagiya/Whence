import json
import time
import uuid
from typing import Any

from app.adapters.base import (
    validate_dimension_expression,
    validate_metric_expression,
)
from app.adapters.bigquery_adapter import BigQueryAdapter
from app.adapters.duckdb_adapter import DuckDBAdapter
from app.connections.service import connection_service
from app.db import get_connection_db
from app.semantic.models import (
    AutoSuggestResponse,
    DependentChart,
    DependentDashboard,
    DimensionCreate,
    DimensionPreviewRequest,
    DimensionPreviewResponse,
    DimensionPreviewValue,
    DimensionPublic,
    DimensionType,
    DimensionUpdate,
    DisplayFormat,
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
    ModelDependentsResponse,
    ModelJoin,
    ModelPublic,
    ModelUpdate,
)

MAX_CATEGORICAL_CARDINALITY = 50

MEASURE_NAME_KEYWORDS = {
    "revenue",
    "sales",
    "price",
    "amount",
    "total",
    "cost",
    "freight",
    "payment",
    "fee",
    "tax",
    "discount",
    "margin",
    "profit",
    "spend",
    "subtotal",
    "gross",
    "net",
    "balance",
    "charge",
    "value",
    "quantity",
    "qty",
    "units",
}

DISCRETE_INT_KEYWORDS = {
    "score",
    "rating",
    "installment",
    "installments",
    "rank",
    "level",
    "step",
    "grade",
    "priority",
    "stars",
}

PII_OR_HIGH_CARDINALITY_KEYWORDS = {
    "email",
    "phone",
    "address",
    "street",
    "first_name",
    "last_name",
    "full_name",
    "zip",
    "postal_code",
    "postcode",
    "token",
    "hash",
    "password",
    "secret",
    "url",
    "description",
    "comment",
    "notes",
}


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
            location = conn.location
            if location == "US" or not location:
                sources = connection_service.get_sources(connection_id)
                if sources:
                    try:
                        first_s = sources[0]
                        table_ref = client.get_table(
                            f"{first_s.project_id}.{first_s.dataset_id}.{first_s.table_name}"
                        )
                        loc = getattr(table_ref, "location", None)
                        if isinstance(loc, str) and loc:
                            location = loc
                            db = self._get_db()
                            db.execute(
                                "UPDATE connections SET location = ? WHERE id = ?",
                                (location, connection_id),
                            )
                            db.commit()
                    except Exception:
                        pass
            return BigQueryAdapter(
                project_id=conn.project_id or "",
                dataset_id="thelook_ecommerce",
                location=location,
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
                anchor_date, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                req.anchor_date,
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
                is_custom=bool(d["is_custom"])
                if "is_custom" in d.keys() and d["is_custom"] is not None
                else False,
                expression=d["expression"] if "expression" in d.keys() else None,
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
                guided_config=json.loads(m["guided_config"])
                if "guided_config" in m.keys() and m["guided_config"]
                else None,
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
            if "require_partition_filter" in row.keys()
            and row["require_partition_filter"] is not None
            else False
        )
        partition_column = row["partition_column"] if "partition_column" in row.keys() else None
        anchor_date = row["anchor_date"] if "anchor_date" in row.keys() else None

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
            anchor_date=anchor_date,
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
        new_anchor = (
            req.anchor_date
            if req.anchor_date is not None
            else (row["anchor_date"] if "anchor_date" in row.keys() else None)
        )

        cur.execute(
            """
            UPDATE models
            SET name = ?, primary_time_column = ?, description = ?, anchor_date = ?, updated_at = ?
            WHERE id = ?
            """,
            (new_name, new_time, new_desc, new_anchor, now, model_id),
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

    def get_model_dependents(
        self,
        model_id: str,
        metric_name: str | None = None,
        dimension_name: str | None = None,
    ) -> ModelDependentsResponse:
        self.get_model(model_id)  # Validate model exists (raises KeyError if not found)
        db = self._get_db()
        cur = db.cursor()

        cur.execute("SELECT id, name FROM dashboards WHERE model_id = ?", (model_id,))
        dashboards_rows = cur.fetchall()
        dashboards_map = {d["id"]: d["name"] for d in dashboards_rows}

        cur.execute(
            """
            SELECT dc.id, dc.dashboard_id, dc.title, dc.chart_type, dc.chart_spec, d.name as dashboard_name
            FROM dashboard_charts dc
            JOIN dashboards d ON dc.dashboard_id = d.id
            WHERE d.model_id = ?
            """,
            (model_id,),
        )
        chart_rows = cur.fetchall()

        matching_charts: list[DependentChart] = []
        for cr in chart_rows:
            spec: dict[str, Any] = {}
            if cr["chart_spec"]:
                try:
                    spec = json.loads(cr["chart_spec"])
                except Exception:
                    spec = {}

            if metric_name and spec.get("metric") != metric_name:
                continue

            if dimension_name:
                dims = spec.get("dimensions", [])
                filters = spec.get("filters", [])
                filter_dims = [f.get("dimension") for f in filters if isinstance(f, dict)]
                if dimension_name not in dims and dimension_name not in filter_dims:
                    continue

            matching_charts.append(
                DependentChart(
                    id=cr["id"],
                    dashboard_id=cr["dashboard_id"],
                    dashboard_name=cr["dashboard_name"],
                    title=cr["title"],
                    chart_type=cr["chart_type"],
                    metric=spec.get("metric"),
                    dimensions=spec.get("dimensions", []),
                )
            )

        if metric_name or dimension_name:
            matching_dash_ids = {c.dashboard_id for c in matching_charts}
            matching_dashboards = [
                DependentDashboard(id=did, name=dname)
                for did, dname in dashboards_map.items()
                if did in matching_dash_ids
            ]
        else:
            matching_dashboards = [
                DependentDashboard(id=did, name=dname) for did, dname in dashboards_map.items()
            ]

        return ModelDependentsResponse(
            dashboard_count=len(matching_dashboards),
            dashboards=matching_dashboards,
            chart_count=len(matching_charts),
            charts=matching_charts,
        )

    # -------------------------------------------------------------
    # Dimensions CRUD
    # -------------------------------------------------------------
    def create_dimension(self, model_id: str, req: DimensionCreate) -> DimensionPublic:
        now = time.time()
        dim_id = str(uuid.uuid4())
        db = self._get_db()
        cur = db.cursor()

        # Verify model exists and get dialect
        cur.execute(
            """
            SELECT m.id, c.warehouse_type
            FROM models m
            JOIN connections c ON m.connection_id = c.id
            WHERE m.id = ?
            """,
            (model_id,),
        )
        row = cur.fetchone()
        if not row:
            raise KeyError(f"Model '{model_id}' not found.")
        dialect = row["warehouse_type"] if row else "duckdb"

        # If custom dimension expression provided, validate it
        expr_to_validate = req.expression or (req.column_expression if req.is_custom else None)
        if expr_to_validate and req.is_custom:
            validate_dimension_expression(expr_to_validate, dialect=dialect)

        cur.execute(
            """
            INSERT INTO dimensions (
                id, model_id, name, column_expression, dimension_type, label,
                is_identifier, exclude_from_explanation, is_custom, expression,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                1 if req.is_custom else 0,
                req.expression,
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
            is_custom=bool(d["is_custom"])
            if "is_custom" in d.keys() and d["is_custom"] is not None
            else False,
            expression=d["expression"] if "expression" in d.keys() else None,
            created_at=d["created_at"],
            updated_at=d["updated_at"],
        )

    def update_dimension(self, dim_id: str, req: DimensionUpdate) -> DimensionPublic:
        now = time.time()
        db = self._get_db()
        cur = db.cursor()
        cur.execute(
            """
            SELECT d.*, c.warehouse_type
            FROM dimensions d
            JOIN models m ON d.model_id = m.id
            JOIN connections c ON m.connection_id = c.id
            WHERE d.id = ?
            """,
            (dim_id,),
        )
        d = cur.fetchone()
        if not d:
            raise KeyError(f"Dimension '{dim_id}' not found.")
        dialect = d["warehouse_type"] if d else "duckdb"

        new_expr = (
            req.column_expression if req.column_expression is not None else d["column_expression"]
        )
        new_custom_expr = (
            req.expression
            if req.expression is not None
            else (d["expression"] if "expression" in d.keys() else None)
        )
        new_is_custom = (
            req.is_custom
            if req.is_custom is not None
            else (
                bool(d["is_custom"])
                if "is_custom" in d.keys() and d["is_custom"] is not None
                else False
            )
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

        if new_custom_expr and new_is_custom:
            validate_dimension_expression(new_custom_expr, dialect=dialect)

        cur.execute(
            """
            UPDATE dimensions
            SET column_expression = ?, dimension_type = ?, label = ?,
                is_identifier = ?, exclude_from_explanation = ?,
                is_custom = ?, expression = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                new_expr,
                new_type,
                new_label,
                new_id_flag,
                new_exclude,
                1 if new_is_custom else 0,
                new_custom_expr,
                now,
                dim_id,
            ),
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
        guided_config_json = json.dumps(req.guided_config) if req.guided_config else None

        cur.execute(
            """
            INSERT INTO metrics (
                id, model_id, name, description, metric_type, numerator_expr,
                denominator_expr, fixed_filter, display_format, higher_is_better,
                version, guided_config, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                guided_config_json,
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
            guided_config=json.loads(m["guided_config"])
            if "guided_config" in m.keys() and m["guided_config"]
            else None,
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
        new_guided_config = (
            json.dumps(req.guided_config)
            if req.guided_config is not None
            else (m["guided_config"] if "guided_config" in m.keys() else None)
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
                higher_is_better = ?, version = ?, guided_config = ?, updated_at = ?
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
                new_guided_config,
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

    async def preview_dimension(self, req: DimensionPreviewRequest) -> DimensionPreviewResponse:
        try:
            model = self.get_model(req.model_id)
        except KeyError:
            return DimensionPreviewResponse(valid=False, error=f"Model '{req.model_id}' not found.")

        adapter = self.get_adapter_for_connection(req.connection_id)
        clean_dialect = adapter.dialect

        # Gather allowed columns from model sources if available
        allowed_cols = None
        try:
            sources = connection_service.get_sources(req.connection_id)
            target_source = next((s for s in sources if s.table_name == model.table_name), None)
            if target_source:
                allowed_cols = {col.name.lower() for col in target_source.columns}
        except Exception:
            pass

        try:
            validate_dimension_expression(
                req.expression, dialect=clean_dialect, allowed_columns=allowed_cols
            )
        except Exception as e:
            return DimensionPreviewResponse(valid=False, error=str(e))

        table_ref = (
            f"`{model.project_id}.{model.dataset_id}.{model.table_name}`"
            if clean_dialect == "bigquery"
            else f'"{model.table_name}"'
        )
        time_col = model.primary_time_column

        where_conds = [f"{time_col} IS NOT NULL"] if time_col else []
        if model.require_partition_filter and model.anchor_date:
            part_col = model.partition_column or model.primary_time_column
            anchor_d = model.anchor_date[:10]
            if clean_dialect == "bigquery":
                where_conds.append(f"{part_col} >= DATE_SUB(DATE('{anchor_d}'), INTERVAL 90 DAY)")
            else:
                where_conds.append(f"{part_col} >= CAST('{anchor_d}' AS DATE) - INTERVAL 90 DAY")

        where_clause = f"WHERE {' AND '.join(where_conds)}" if where_conds else ""

        preview_sql = f"""
        SELECT
            {req.expression} AS preview_val,
            COUNT(*) AS row_count
        FROM {table_ref}
        {where_clause}
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 20
        """.strip()

        # Dry-run first to enforce byte cap
        try:
            dry_run = await adapter.dry_run(preview_sql)
            if not dry_run.valid:
                return DimensionPreviewResponse(
                    valid=False,
                    estimated_bytes=dry_run.bytes_scanned,
                    formatted_bytes=dry_run.formatted_bytes,
                    error=dry_run.error or "Dry-run failed",
                )
        except Exception as e:
            return DimensionPreviewResponse(valid=False, error=f"Dry run error: {e}")

        # Execute query
        try:
            q_res = await adapter.run(preview_sql)
            values = [
                DimensionPreviewValue(
                    value=r.get("preview_val") if r.get("preview_val") is not None else "(empty)",
                    row_count=int(r.get("row_count", 0)),
                )
                for r in q_res.rows
            ]
            return DimensionPreviewResponse(
                valid=True,
                estimated_bytes=dry_run.bytes_scanned,
                formatted_bytes=dry_run.formatted_bytes,
                values=values,
                total_distinct_values=len(values),
            )
        except Exception as e:
            return DimensionPreviewResponse(
                valid=False,
                estimated_bytes=dry_run.bytes_scanned,
                formatted_bytes=dry_run.formatted_bytes,
                error=f"Query execution error: {e}",
            )

    async def discover_and_set_anchor_date(self, model_id: str) -> ModelPublic:
        """
        Discovers the maximum date or partition metadata in the underlying table,
        and sets model.anchor_date to that date (formatted as YYYY-MM-DD).
        """
        model = self.get_model(model_id)
        adapter = self.get_adapter_for_connection(model.connection_id)
        time_col = model.primary_time_column

        if adapter.dialect == "duckdb":
            tbl_ref = f'"{model.table_name}"'
            time_ref = f'"{time_col}"'
            query = f"SELECT strftime(MAX({time_ref}), '%Y-%m-%d') AS max_date FROM {tbl_ref}"
        else:
            tbl_ref = f"`{model.project_id}.{model.dataset_id}.{model.table_name}`"
            time_ref = f"`{time_col}`"
            query = (
                f"SELECT FORMAT_DATE('%Y-%m-%d', DATE(MAX({time_ref}))) AS max_date FROM {tbl_ref}"
            )

        max_date_str: str | None = None
        try:
            res = await adapter.run(query)
            if res.rows and res.rows[0].get("max_date"):
                raw_val = res.rows[0]["max_date"]
                max_date_str = str(raw_val)[:10]
        except Exception:
            max_date_str = None

        if not max_date_str:
            from datetime import date

            max_date_str = date.today().isoformat()

        return self.update_model(model_id, ModelUpdate(anchor_date=max_date_str))

    # -------------------------------------------------------------
    # Auto-suggest & Default Ecommerce Seed Set
    # -------------------------------------------------------------
    def auto_suggest_for_table(
        self,
        connection_id: str,
        table_name: str,
        sample_rows: list[dict[str, Any]] | None = None,
    ) -> AutoSuggestResponse:
        conn = connection_service.get_connection(connection_id)
        sources = connection_service.get_sources(connection_id)
        target_source = (
            next((s for s in sources if s.table_name == table_name), None) if sources else None
        )
        columns = list(target_source.columns) if target_source and target_source.columns else []

        # Obtain free table-rows sample if not explicitly passed (never a billed scan)
        if sample_rows is None:
            if target_source and target_source.sample_rows:
                sample_rows = target_source.sample_rows
            else:
                try:
                    preview = connection_service.preview_table(
                        conn_id=connection_id,
                        project_id=target_source.project_id
                        if target_source
                        else (conn.project_id or "duckdb_local"),
                        dataset_id=target_source.dataset_id if target_source else "main",
                        table_name=table_name,
                        limit=100,
                    )
                    sample_rows = preview.rows
                    # If columns were empty, infer TableColumnInfo from preview
                    if not columns and preview.columns:
                        from app.connections.models import TableColumnInfo

                        columns = [
                            TableColumnInfo(name=c, data_type="VARCHAR") for c in preview.columns
                        ]
                except Exception:
                    sample_rows = []

        if not columns and sample_rows:
            from app.connections.models import TableColumnInfo

            first_row = sample_rows[0]
            columns = [TableColumnInfo(name=k, data_type="VARCHAR") for k in first_row.keys()]

        # If introspected table columns are present, tailor definitions to actual schema
        if columns:
            # Measure cardinality per column using the free sample rows (never a billed scan)
            sample_cardinality: dict[str, int] = {}
            if sample_rows:
                for c in columns:
                    vals = {
                        row[c.name]
                        for row in sample_rows
                        if c.name in row
                        and row[c.name] is not None
                        and str(row[c.name]).strip() != ""
                    }
                    sample_cardinality[c.name] = len(vals)

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
                "delivered_at",
            ]
            primary_time: str | None = None
            for tc in time_candidates:
                if tc in col_map:
                    primary_time = col_map[tc].name
                    break
            if not primary_time:
                for c in columns:
                    dt_u = c.data_type.upper()
                    c_low = c.name.lower()
                    if any(t in dt_u for t in ["TIMESTAMP", "DATE", "DATETIME", "TIME"]) or any(
                        c_low.endswith(sfx) for sfx in ["_at", "_date", "_time", "_timestamp"]
                    ):
                        primary_time = c.name
                        break
            if not primary_time:
                primary_time = "created_at"

            # 2. Dimensions and Numeric Measures categorization
            dimensions: list[DimensionCreate] = []
            numeric_measures: list[Any] = []

            for c in columns:
                c_lower = c.name.lower()
                dt_upper = c.data_type.upper()
                card = sample_cardinality.get(c.name)

                # Check if identifier
                is_id = (
                    any(
                        c_lower.endswith(sfx)
                        for sfx in [
                            "_id",
                            "id",
                            "_code",
                            "_key",
                            "uuid",
                            "_number",
                            "_num",
                            "_pk",
                            "_fk",
                            "_unique_id",
                            "sku",
                            "_sku",
                        ]
                    )
                    or c_lower in {"id", "uuid", "pk", "fk", "key", "code", "guid", "sku"}
                    or c_lower.startswith("id_")
                )

                # Check if timestamp / time column
                is_time = (
                    any(t in dt_upper for t in ["TIMESTAMP", "DATE", "DATETIME", "TIME"])
                    or any(c_lower.endswith(sfx) for sfx in ["_at", "_date", "_time", "_timestamp"])
                    or c_lower in {"date", "timestamp", "time", "day", "datetime"}
                )

                # Check if discrete small integer column (review_score, payment_installments, etc.)
                is_int = any(
                    t in dt_upper for t in ["INT", "INTEGER", "BIGINT", "SMALLINT", "TINYINT"]
                )
                is_discrete_int = is_int and (
                    any(k in c_lower for k in DISCRETE_INT_KEYWORDS)
                    or (
                        card is not None
                        and card <= MAX_CATEGORICAL_CARDINALITY
                        and not any(k in c_lower for k in MEASURE_NAME_KEYWORDS)
                    )
                )

                # Check if numeric measure
                is_float = any(
                    t in dt_upper for t in ["FLOAT", "DOUBLE", "NUMERIC", "DECIMAL", "REAL"]
                )
                has_measure_name = any(k in c_lower for k in MEASURE_NAME_KEYWORDS)
                is_high_card_num = (
                    (is_int or is_float) and card is not None and card > MAX_CATEGORICAL_CARDINALITY
                )
                is_dim_suffix = any(
                    c_lower.endswith(sfx)
                    for sfx in [
                        "_method",
                        "_type",
                        "_category",
                        "_status",
                        "_mode",
                        "_source",
                        "_channel",
                        "_name",
                    ]
                )

                is_measure = (
                    (not is_id)
                    and (not is_time)
                    and (not is_discrete_int)
                    and (not is_dim_suffix)
                    and (is_float or has_measure_name or is_high_card_num)
                )

                if is_measure:
                    numeric_measures.append(c)
                    continue

                # Primary time column is model's primary timeline, excluded from breakdown dimensions
                if c.name == primary_time:
                    continue

                # Determine dimension type and explanation eligibility
                if is_time:
                    dim_type: DimensionType = "time"
                    exclude_from_explanation = True
                elif is_id:
                    dim_type = "categorical"
                    exclude_from_explanation = True
                elif is_discrete_int:
                    dim_type = "categorical"
                    exclude_from_explanation = False
                else:
                    dim_type = "categorical"
                    # Check cardinality threshold boundary: up to 50 distinct values
                    is_high_card = card is not None and card > MAX_CATEGORICAL_CARDINALITY
                    has_pii = any(k in c_lower for k in PII_OR_HIGH_CARDINALITY_KEYWORDS)
                    exclude_from_explanation = is_high_card or has_pii

                label = c.name.replace("_", " ").title()
                dimensions.append(
                    DimensionCreate(
                        name=c.name,
                        column_expression=c.name,
                        dimension_type=dim_type,
                        label=label,
                        is_identifier=is_id,
                        exclude_from_explanation=exclude_from_explanation,
                    )
                )

            # 3. Metrics Generation
            metrics: list[MetricCreate] = []

            price_col = next(
                (
                    c.name
                    for c in columns
                    if c.name.lower()
                    in ["sale_price", "price", "amount", "total_amount", "revenue", "sales"]
                ),
                None,
            )
            order_id_col = next(
                (
                    c.name
                    for c in columns
                    if c.name.lower() in ["order_id", "id", "order_number", "orders"]
                ),
                None,
            )
            item_col = next(
                (
                    c.name
                    for c in columns
                    if c.name.lower() in ["order_item_id", "item_id", "product_id", "line_item_id"]
                ),
                None,
            )

            added_metric_names: set[str] = set()

            # Add all numeric measures as candidate metrics with SUM(col)
            for m_col in numeric_measures:
                m_lower = m_col.name.lower()
                fmt: DisplayFormat
                if any(
                    w in m_lower
                    for w in [
                        "price",
                        "revenue",
                        "sales",
                        "amount",
                        "cost",
                        "total",
                        "payment",
                        "freight",
                        "fee",
                        "tax",
                        "charge",
                        "margin",
                        "profit",
                        "spend",
                        "value",
                    ]
                ):
                    fmt = "currency"
                elif any(w in m_lower for w in ["percent", "pct", "rate", "ratio"]):
                    fmt = "percent"
                elif any(t in m_col.data_type.upper() for t in ["INT", "INTEGER", "BIGINT"]):
                    fmt = "integer"
                else:
                    fmt = "decimal"

                metric_name = m_col.name
                if m_col.name == price_col and "revenue" not in added_metric_names:
                    metric_name = "revenue"

                description = f"Total {m_col.name.replace('_', ' ')} computed as SUM({m_col.name})"
                metrics.append(
                    MetricCreate(
                        name=metric_name,
                        description=description,
                        metric_type="additive",
                        numerator_expr=f"SUM({m_col.name})",
                        display_format=fmt,
                        higher_is_better=True,
                    )
                )
                added_metric_names.add(metric_name)

            # If revenue metric wasn't created yet but table has price_col
            if "revenue" not in added_metric_names and price_col:
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
                added_metric_names.add("revenue")

            # Orders metric
            if order_id_col and "orders" not in added_metric_names:
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
                added_metric_names.add("orders")

            # Items sold metric
            if item_col and "items_sold" not in added_metric_names:
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
                added_metric_names.add("items_sold")

            # AOV (Ratio: Revenue / Orders)
            rev_metric = next(
                (
                    m
                    for m in metrics
                    if m.name
                    in [
                        "revenue",
                        "items_revenue",
                        "payment_total",
                        "total_amount",
                        "amount",
                        "sale_price",
                        "price",
                    ]
                ),
                None,
            )
            if rev_metric and order_id_col and "aov" not in added_metric_names:
                metrics.append(
                    MetricCreate(
                        name="aov",
                        description="Average order value (Revenue / Orders)",
                        metric_type="ratio",
                        numerator_expr=rev_metric.numerator_expr,
                        denominator_expr=f"COUNT(DISTINCT {order_id_col})",
                        display_format="currency",
                        higher_is_better=True,
                    )
                )
                added_metric_names.add("aov")

            # Items per order (Ratio: Items / Orders)
            items_metric = next((m for m in metrics if m.name == "items_sold"), None)
            if items_metric and order_id_col and "items_per_order" not in added_metric_names:
                metrics.append(
                    MetricCreate(
                        name="items_per_order",
                        description="Average items per order (Items / Orders)",
                        metric_type="ratio",
                        numerator_expr=items_metric.numerator_expr,
                        denominator_expr=f"COUNT(DISTINCT {order_id_col})",
                        display_format="decimal",
                        higher_is_better=True,
                    )
                )
                added_metric_names.add("items_per_order")

            model_name = (
                "TheLook Ecommerce Orders"
                if "thelook" in table_name.lower()
                else f"{table_name.replace('_', ' ').title()} Model"
            )
            return AutoSuggestResponse(
                model_name=model_name,
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
                    project_id or conn.billing_project or conn.project_id or "default_project"
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
        created_model = self.create_model(model_create)

        # Automatically discover and set anchor date if possible
        try:
            import asyncio
            import concurrent.futures

            try:
                asyncio.get_running_loop()
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    fut = executor.submit(
                        asyncio.run, self.discover_and_set_anchor_date(created_model.id)
                    )
                    return fut.result()
            except RuntimeError:
                return asyncio.run(self.discover_and_set_anchor_date(created_model.id))
        except Exception:
            return created_model


semantic_service = SemanticService()
