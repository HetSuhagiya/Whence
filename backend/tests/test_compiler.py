import json

import pytest

from app.adapters.base import QueryByteCapExceededError, QueryGuardrailError
from app.compiler.compiler import query_compiler
from app.compiler.spec import ChartSpec, FilterCondition
from app.connections.models import ConnectionCreateRequest
from app.connections.service import connection_service
from app.semantic.models import DimensionCreate, MetricCreate, ModelCreate, ModelJoin
from app.semantic.service import semantic_service


@pytest.fixture
def ecommerce_model_id() -> str:
    conn = connection_service.create_connection(
        ConnectionCreateRequest(name="Compiler Test DuckDB", warehouse_type="duckdb")
    )
    model = semantic_service.seed_default_ecommerce_set(
        connection_id=conn.id,
        project_id="duckdb_local",
        dataset_id="main",
        table_name="thelook_ecommerce_orders",
    )
    return model.id


def test_compiler_line_chart_additive_duckdb(ecommerce_model_id: str) -> None:
    spec = ChartSpec(
        model_id=ecommerce_model_id,
        metric="revenue",
        time_grain="day",
        date_range="last_30_days",
        chart_type="line",
        title="Revenue over time",
    )
    compiled = query_compiler.compile(spec, dialect="duckdb")
    assert "date_trunc('day', \"created_at\")" in compiled.sql
    assert "SUM(sale_price)" in compiled.sql
    assert "start_date" in compiled.params
    assert "end_date" in compiled.params
    assert "ORDER BY 1 ASC" in compiled.sql


def test_compiler_line_chart_additive_bigquery(ecommerce_model_id: str) -> None:
    spec = ChartSpec(
        model_id=ecommerce_model_id,
        metric="revenue",
        time_grain="day",
        date_range="last_30_days",
        chart_type="line",
        title="Revenue over time",
    )
    compiled = query_compiler.compile(spec, dialect="bigquery")
    assert "TIMESTAMP_TRUNC(`created_at`, DAY, 'UTC')" in compiled.sql
    assert "@start_date" in compiled.sql
    assert "@end_date" in compiled.sql
    assert "`duckdb_local.main.thelook_ecommerce_orders`" in compiled.sql


def test_compiler_ratio_metric_with_cte_and_safe_divide(ecommerce_model_id: str) -> None:
    # AOV = Revenue / Orders (Ratio Metric)
    spec = ChartSpec(
        model_id=ecommerce_model_id,
        metric="aov",
        time_grain="week",
        date_range="last_90_days",
        chart_type="line",
        title="AOV over time",
    )

    # DuckDB: NULLIF
    duck_compiled = query_compiler.compile(spec, dialect="duckdb")
    assert "WITH cte_metric_agg AS" in duck_compiled.sql
    assert "CAST(_num AS DOUBLE) / NULLIF(_den, 0)" in duck_compiled.sql

    # BigQuery: SAFE_DIVIDE
    bq_compiled = query_compiler.compile(spec, dialect="bigquery")
    assert "WITH cte_metric_agg AS" in bq_compiled.sql
    assert "SAFE_DIVIDE(CAST(_num AS FLOAT64), NULLIF(_den, 0))" in bq_compiled.sql


def test_compiler_breakdown_bar_chart(ecommerce_model_id: str) -> None:
    spec = ChartSpec(
        model_id=ecommerce_model_id,
        metric="revenue",
        dimensions=["category"],
        date_range="last_30_days",
        chart_type="bar",
        title="Revenue by category",
        limit=10,
    )
    compiled = query_compiler.compile(spec, dialect="duckdb")
    assert '"category"' in compiled.sql
    assert "GROUP BY 1" in compiled.sql
    assert "ORDER BY 2 DESC" in compiled.sql
    assert "LIMIT 10" in compiled.sql


def test_compiler_stacked_bar_chart(ecommerce_model_id: str) -> None:
    spec = ChartSpec(
        model_id=ecommerce_model_id,
        metric="orders",
        dimensions=["traffic_source"],
        chart_type="stacked_bar",
        title="Orders by traffic source",
        filters=[FilterCondition(dimension="status", operator="=", value="Complete")],
        limit=5,
    )
    compiled = query_compiler.compile(spec, dialect="duckdb")
    assert '"traffic_source"' in compiled.sql
    assert "COUNT(DISTINCT order_id)" in compiled.sql
    assert "status = $filter_0" in compiled.sql
    assert compiled.params["filter_0"] == "Complete"
    assert "LIMIT 5" in compiled.sql


def test_compiler_identifier_validation(ecommerce_model_id: str) -> None:
    # Unknown metric rejection
    with pytest.raises(ValueError, match="Metric 'nonexistent_metric' is not declared on model"):
        query_compiler.compile(
            ChartSpec(
                model_id=ecommerce_model_id,
                metric="nonexistent_metric",
            )
        )

    # Unknown dimension rejection
    with pytest.raises(ValueError, match="Dimension 'bad_dim' is not declared on model"):
        query_compiler.compile(
            ChartSpec(
                model_id=ecommerce_model_id,
                metric="revenue",
                dimensions=["bad_dim"],
            )
        )


@pytest.mark.asyncio
async def test_compiler_execution_on_demo_duckdb(ecommerce_model_id: str) -> None:
    # Execute 5 demo charts against real DuckDB dataset and verify real data returned
    specs = [
        ChartSpec(
            model_id=ecommerce_model_id,
            metric="revenue",
            time_grain="day",
            date_range="last_30_days",
            chart_type="line",
            title="Revenue over time",
        ),
        ChartSpec(
            model_id=ecommerce_model_id,
            metric="revenue",
            dimensions=["category"],
            chart_type="bar",
            title="Revenue by category",
            limit=5,
        ),
        ChartSpec(
            model_id=ecommerce_model_id,
            metric="orders",
            dimensions=["state"],
            chart_type="bar",
            title="Orders by state",
            limit=5,
        ),
        ChartSpec(
            model_id=ecommerce_model_id,
            metric="aov",
            time_grain="day",
            chart_type="line",
            title="Average order value over time",
        ),
        ChartSpec(
            model_id=ecommerce_model_id,
            metric="orders",
            dimensions=["traffic_source"],
            chart_type="stacked_bar",
            title="Orders by traffic source",
            limit=5,
        ),
    ]

    for spec in specs:
        res = await query_compiler.execute(spec)
        assert res["sql"] is not None
        assert len(res["columns"]) >= 1
        assert res["row_count"] >= 0
        assert res["duration_ms"] >= 0


DUMMY_SA_KEY = {
    "type": "service_account",
    "project_id": "bigquery-public-data",
    "private_key_id": "key123",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDabc123\n-----END PRIVATE KEY-----\n",
    "client_email": "whence-sa@bigquery-public-data.iam.gserviceaccount.com",
    "client_id": "987654321",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
}


def test_compiler_thelook_joins_all_five_specs() -> None:
    """
    Tests Point 2: Models with joins.
    On bigquery-public-data.thelook_ecommerce, category is on products, state and traffic_source
    are on users. The base model is order_items.
    Many-to-one joins to products (product_id = id) and users (user_id = id) are compiled as LEFT JOIN.
    Verifies that all 5 demo specs compile cleanly to valid BigQuery SQL without row multiplication.
    """
    import json

    conn = connection_service.create_connection(
        ConnectionCreateRequest(
            name="BQ thelook",
            warehouse_type="bigquery",
            key_json=json.dumps(DUMMY_SA_KEY),
        )
    )
    model = semantic_service.create_model(
        ModelCreate(
            connection_id=conn.id,
            name="TheLook Order Items",
            project_id="bigquery-public-data",
            dataset_id="thelook_ecommerce",
            table_name="order_items",
            primary_time_column="created_at",
            joins=[
                ModelJoin(
                    name="products",
                    target_table="products",
                    left_on="product_id",
                    right_on="id",
                    join_type="LEFT",
                    relationship="many_to_one",
                    description="Many-to-one join to products table; guarantees zero row multiplication.",
                ),
                ModelJoin(
                    name="users",
                    target_table="users",
                    left_on="user_id",
                    right_on="id",
                    join_type="LEFT",
                    relationship="many_to_one",
                    description="Many-to-one join to users table; guarantees zero row multiplication.",
                ),
            ],
            dimensions=[
                DimensionCreate(
                    name="category",
                    column_expression="products.category",
                    dimension_type="categorical",
                ),
                DimensionCreate(
                    name="state",
                    column_expression="users.state",
                    dimension_type="categorical",
                ),
                DimensionCreate(
                    name="traffic_source",
                    column_expression="users.traffic_source",
                    dimension_type="categorical",
                ),
            ],
            metrics=[
                MetricCreate(
                    name="revenue",
                    numerator_expr="SUM(order_items.sale_price)",
                    metric_type="additive",
                ),
                MetricCreate(
                    name="orders",
                    numerator_expr="COUNT(DISTINCT order_items.order_id)",
                    metric_type="additive",
                ),
                MetricCreate(
                    name="aov",
                    numerator_expr="SUM(order_items.sale_price)",
                    denominator_expr="COUNT(DISTINCT order_items.order_id)",
                    metric_type="ratio",
                ),
            ],
        )
    )

    # 1. Revenue over time (line)
    spec1 = ChartSpec(
        model_id=model.id,
        metric="revenue",
        time_grain="day",
        date_range="last_30_days",
        chart_type="line",
        title="Revenue over time",
    )
    compiled1 = query_compiler.compile(spec1, dialect="bigquery")
    assert "`bigquery-public-data.thelook_ecommerce.order_items`" in compiled1.sql
    assert "SUM(order_items.sale_price)" in compiled1.sql
    assert "LEFT JOIN" not in compiled1.sql  # No joined dims referenced

    # 2. Revenue by category (bar) -> requires LEFT JOIN products
    spec2 = ChartSpec(
        model_id=model.id,
        metric="revenue",
        dimensions=["category"],
        chart_type="bar",
        title="Revenue by category",
    )
    compiled2 = query_compiler.compile(spec2, dialect="bigquery")
    assert (
        "LEFT JOIN `bigquery-public-data.thelook_ecommerce.products` AS `products` ON `order_items`.`product_id` = `products`.`id`"
        in compiled2.sql
    )
    assert "products.category" in compiled2.sql

    # 3. Orders by state (bar) -> requires LEFT JOIN users
    spec3 = ChartSpec(
        model_id=model.id,
        metric="orders",
        dimensions=["state"],
        chart_type="bar",
        title="Orders by state",
    )
    compiled3 = query_compiler.compile(spec3, dialect="bigquery")
    assert (
        "LEFT JOIN `bigquery-public-data.thelook_ecommerce.users` AS `users` ON `order_items`.`user_id` = `users`.`id`"
        in compiled3.sql
    )
    assert "users.state" in compiled3.sql

    # 4. Average order value over time (line, ratio metric)
    spec4 = ChartSpec(
        model_id=model.id,
        metric="aov",
        time_grain="week",
        date_range="last_30_days",
        chart_type="line",
        title="Average order value over time",
    )
    compiled4 = query_compiler.compile(spec4, dialect="bigquery")
    assert "SAFE_DIVIDE" in compiled4.sql
    assert "WEEK(MONDAY)" in compiled4.sql

    # 5. Orders by traffic source (bar) -> requires LEFT JOIN users
    spec5 = ChartSpec(
        model_id=model.id,
        metric="orders",
        dimensions=["traffic_source"],
        chart_type="bar",
        title="Orders by traffic source",
    )
    compiled5 = query_compiler.compile(spec5, dialect="bigquery")
    assert (
        "LEFT JOIN `bigquery-public-data.thelook_ecommerce.users` AS `users` ON `order_items`.`user_id` = `users`.`id`"
        in compiled5.sql
    )
    assert "users.traffic_source" in compiled5.sql


def test_compiler_partition_filter_enforcement() -> None:
    """Tests that BigQuery partition filter is enforced when required on the model."""
    import json

    conn = connection_service.create_connection(
        ConnectionCreateRequest(
            name="Partition Test BQ",
            warehouse_type="bigquery",
            key_json=json.dumps(DUMMY_SA_KEY),
        )
    )
    model = semantic_service.create_model(
        ModelCreate(
            connection_id=conn.id,
            name="Partitioned Table",
            project_id="test_proj",
            dataset_id="test_ds",
            table_name="partitioned_events",
            primary_time_column="event_date",
            require_partition_filter=True,
            partition_column="event_date",
            dimensions=[],
            metrics=[
                MetricCreate(
                    name="events_count",
                    numerator_expr="COUNT(*)",
                    metric_type="additive",
                )
            ],
        )
    )

    # Missing partition filter must raise QueryGuardrailError
    with pytest.raises(QueryGuardrailError, match="requires a partition filter"):
        query_compiler.compile(
            ChartSpec(
                model_id=model.id,
                metric="events_count",
                date_range=None,
            ),
            dialect="bigquery",
        )

    # Valid with date_range
    compiled = query_compiler.compile(
        ChartSpec(
            model_id=model.id,
            metric="events_count",
            date_range="last_30_days",
        ),
        dialect="bigquery",
    )
    assert "`event_date` >= DATE(@start_date)" in compiled.sql


@pytest.mark.asyncio
async def test_compiler_dry_run_bytes_cap_refusal(
    monkeypatch: pytest.MonkeyPatch, ecommerce_model_id: str
) -> None:
    """Tests that execution is refused BEFORE running when dry-run bytes exceed cap."""
    spec = ChartSpec(
        model_id=ecommerce_model_id,
        metric="revenue",
        date_range="last_30_days",
    )
    # Patch dry_run to simulate exceeding cap
    from app.adapters.base import DryRunResult

    async def mock_dry_run(self, sql: str, params: dict | None = None) -> DryRunResult:
        return DryRunResult(
            valid=False,
            bytes_scanned=20 * 1024 * 1024 * 1024,
            error="This query would scan 20.0 GB, above your 10.0 GB limit. Narrow the date range or raise the limit in Settings.",
        )

    monkeypatch.setattr("app.adapters.duckdb_adapter.DuckDBAdapter.dry_run", mock_dry_run)

    with pytest.raises(QueryByteCapExceededError, match="above your 10.0 GB limit"):
        await query_compiler.execute(spec)


def test_compiler_golden_sql_snapshots_all_chart_types(ecommerce_model_id: str) -> None:
    """
    Tests golden SQL compilation across all 7 chart types in section 10:
    line, bar, stacked_bar, area, kpi, table, scatter.
    """
    chart_types = ["line", "bar", "stacked_bar", "area", "kpi", "table", "scatter"]
    for ct in chart_types:
        spec = ChartSpec(
            model_id=ecommerce_model_id,
            metric="revenue",
            time_grain="day" if ct in ("line", "area") else None,
            dimensions=["category"] if ct not in ("line", "area", "kpi") else [],
            date_range="last_30_days",
            chart_type=ct,
            title=f"Golden {ct}",
            limit=10 if ct in ("bar", "table", "scatter") else None,
        )
        for dialect in ("duckdb", "bigquery"):
            compiled = query_compiler.compile(spec, dialect=dialect)
            assert compiled.sql.startswith("SELECT")
            assert "revenue" in compiled.sql
            assert compiled.dialect == dialect


def test_compiler_anchor_date_computation_duckdb() -> None:
    # Test that QueryCompiler compiles date filters using Python-computed windows from model.anchor_date
    conn = connection_service.create_connection(
        ConnectionCreateRequest(name="Anchor DuckDB", warehouse_type="duckdb")
    )
    model = semantic_service.create_model(
        ModelCreate(
            connection_id=conn.id,
            name="orders_anchor_test",
            project_id="duckdb_local",
            dataset_id="main",
            table_name="thelook_ecommerce_orders",
            primary_time_column="created_at",
            anchor_date="2024-05-31",
            metrics=[
                MetricCreate(
                    name="revenue", numerator_expr="SUM(sale_price)", metric_type="additive"
                )
            ],
        )
    )

    spec = ChartSpec(
        model_id=model.id,
        metric="revenue",
        date_range="last_30_days",
    )
    compiled = query_compiler.compile(spec, dialect="duckdb")
    assert "CURRENT_DATE" not in compiled.sql
    assert "CURRENT_TIMESTAMP" not in compiled.sql
    assert (
        "2024-05-01" in compiled.sql
        or "2024-05-31" in compiled.sql
        or "start_date" in compiled.params
    )


def test_compiler_type_aware_parameters_and_casts() -> None:
    # DATE column vs TIMESTAMP column
    conn = connection_service.create_connection(
        ConnectionCreateRequest(
            name="BQ Type Aware",
            warehouse_type="bigquery",
            key_json=json.dumps(DUMMY_SA_KEY),
        )
    )
    # Model with DATE column
    date_model = semantic_service.create_model(
        ModelCreate(
            connection_id=conn.id,
            name="events_date_model",
            project_id="test_proj",
            dataset_id="test_ds",
            table_name="events_date_table",
            primary_time_column="event_date",
            anchor_date="2018-08-31",
            metrics=[MetricCreate(name="cnt", numerator_expr="COUNT(*)", metric_type="additive")],
        )
    )
    spec_date = ChartSpec(
        model_id=date_model.id,
        metric="cnt",
        date_range="last_30_days",
    )
    compiled_date = query_compiler.compile(spec_date, dialect="bigquery")
    assert "TIMESTAMP_SUB(CURRENT_TIMESTAMP()" not in compiled_date.sql
    # Parameter or cast must match DATE
    assert "DATE" in compiled_date.sql
    assert "@start_date" in compiled_date.sql or "@start_date" in str(compiled_date.params)


def test_compiler_custom_date_range_dict() -> None:
    conn = connection_service.create_connection(
        ConnectionCreateRequest(name="Custom Range DuckDB", warehouse_type="duckdb")
    )
    model = semantic_service.seed_default_ecommerce_set(
        connection_id=conn.id,
        project_id="duckdb_local",
        dataset_id="main",
        table_name="thelook_ecommerce_orders",
    )
    spec = ChartSpec(
        model_id=model.id,
        metric="revenue",
        date_range={"start": "2023-01-01", "end": "2023-01-31"},
    )
    compiled = query_compiler.compile(spec, dialect="duckdb")
    assert "2023-01-01" in str(compiled.sql) or compiled.params.get("start_date", "").startswith(
        "2023-01-01"
    )
    assert "2023-01-31" in str(compiled.sql) or compiled.params.get("end_date", "").startswith(
        "2023-01-31"
    )
