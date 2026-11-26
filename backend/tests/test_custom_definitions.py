import pytest

from app.adapters.base import (
    QueryGuardrailError,
    validate_dimension_expression,
)
from app.compiler.compiler import QueryCompiler
from app.compiler.spec import ChartSpec
from app.dashboards.models import DashboardChartCreate, DashboardCreate
from app.dashboards.service import dashboard_service
from app.explain.engine import ExplainEngine
from app.semantic.models import (
    DimensionCreate,
    DimensionPreviewRequest,
    MetricCreate,
    ModelCreate,
)
from app.semantic.service import semantic_service


def test_custom_dimension_ast_validator() -> None:
    # 1. Valid expressions
    validate_dimension_expression(
        "CASE WHEN delivery_days <= 3 THEN 'Fast' ELSE 'Standard' END",
        dialect="duckdb",
        allowed_columns=["delivery_days"],
    )
    validate_dimension_expression(
        "EXTRACT(MONTH FROM order_date)",
        dialect="duckdb",
        allowed_columns=["order_date"],
    )
    validate_dimension_expression(
        "UPPER(TRIM(status))",
        dialect="duckdb",
        allowed_columns=["status"],
    )
    validate_dimension_expression(
        "ROUND(price, 2)",
        dialect="duckdb",
        allowed_columns=["price"],
    )

    # 2. Rejection of window functions
    with pytest.raises(QueryGuardrailError, match="Window functions are not allowed"):
        validate_dimension_expression("SUM(price) OVER (PARTITION BY category)", dialect="duckdb")

    # 3. Rejection of subqueries
    with pytest.raises(QueryGuardrailError, match="Subqueries are not allowed"):
        validate_dimension_expression(
            "(SELECT name FROM users WHERE id = user_id)", dialect="duckdb"
        )

    # 4. Rejection of aggregate functions
    with pytest.raises(QueryGuardrailError, match="Aggregate function 'SUM' is not allowed"):
        validate_dimension_expression("SUM(price)", dialect="duckdb")

    # 5. Model column allowlist enforcement
    with pytest.raises(QueryGuardrailError, match="not on the model's table"):
        validate_dimension_expression(
            "non_existent_col + 1",
            dialect="duckdb",
            allowed_columns=["delivery_days", "price"],
        )


@pytest.mark.asyncio
async def test_dimension_preview_endpoint() -> None:
    from app.connections.models import ConnectionCreateRequest
    from app.connections.service import connection_service
    from app.demo_dataset import ensure_demo_ecommerce_dataset

    # Ensure demo dataset exists
    ensure_demo_ecommerce_dataset()

    # Create connection & model
    conn = connection_service.create_connection(
        ConnectionCreateRequest(name="Preview Test Conn", warehouse_type="duckdb")
    )
    model = semantic_service.create_model(
        ModelCreate(
            connection_id=conn.id,
            name="Orders Preview Model",
            project_id="local",
            dataset_id="main",
            table_name="orders",
            primary_time_column="created_at",
            anchor_date="2024-01-01",
        )
    )

    # Request preview of a custom bucketing expression
    preview_req = DimensionPreviewRequest(
        connection_id=conn.id,
        model_id=model.id,
        expression="CASE WHEN sale_price >= 100 THEN 'High Value' ELSE 'Regular Value' END",
        dimension_type="categorical",
    )
    res = await semantic_service.preview_dimension(preview_req)

    assert res.valid is True
    assert res.error is None
    assert len(res.values) > 0
    assert any(v.value in ("High Value", "Regular Value") for v in res.values)
    assert all(v.row_count > 0 for v in res.values)


def test_query_compiler_inlines_custom_dimension() -> None:
    from app.connections.models import ConnectionCreateRequest
    from app.connections.service import connection_service

    conn = connection_service.create_connection(
        ConnectionCreateRequest(name="Compiler Test Conn", warehouse_type="duckdb")
    )
    model = semantic_service.create_model(
        ModelCreate(
            connection_id=conn.id,
            name="Orders Compiler Model",
            project_id="local",
            dataset_id="main",
            table_name="orders",
            primary_time_column="created_at",
            anchor_date="2024-01-01",
            metrics=[
                MetricCreate(
                    name="total_revenue",
                    numerator_expr="SUM(sale_price)",
                    metric_type="additive",
                    display_format="currency",
                )
            ],
            dimensions=[
                DimensionCreate(
                    name="price_tier",
                    column_expression="CASE WHEN sale_price >= 100 THEN 'High' ELSE 'Low' END",
                    dimension_type="categorical",
                    is_custom=True,
                    expression="CASE WHEN sale_price >= 100 THEN 'High' ELSE 'Low' END",
                )
            ],
        )
    )

    compiler = QueryCompiler()
    spec = ChartSpec(
        model_id=model.id,
        metric="total_revenue",
        dimensions=["price_tier"],
        date_range="last_30_days",
        chart_type="bar",
    )
    compiled = compiler.compile(spec, dialect="duckdb")

    # Inlines expression in SELECT & in GROUP BY
    expected_expr = "CASE WHEN sale_price >= 100 THEN 'High' ELSE 'Low' END"
    assert f'{expected_expr} AS "price_tier"' in compiled.sql
    assert f"GROUP BY {expected_expr}" in compiled.sql


def test_dashboard_chart_endpoints_crud() -> None:
    from app.connections.models import ConnectionCreateRequest
    from app.connections.service import connection_service

    conn = connection_service.create_connection(
        ConnectionCreateRequest(name="Dashboard Test Conn", warehouse_type="duckdb")
    )
    semantic_service.create_model(
        ModelCreate(
            connection_id=conn.id,
            name="Dashboard Model",
            project_id="local",
            dataset_id="main",
            table_name="orders",
            primary_time_column="created_at",
            metrics=[
                MetricCreate(
                    name="order_count",
                    numerator_expr="COUNT(*)",
                    metric_type="additive",
                    display_format="integer",
                )
            ],
            dimensions=[
                DimensionCreate(
                    name="status",
                    column_expression="status",
                    dimension_type="categorical",
                )
            ],
        )
    )

    dash = dashboard_service.create_dashboard(DashboardCreate(connection_id=conn.id))
    initial_chart_count = len(dash.charts)

    # 1. Add chart
    add_req = DashboardChartCreate(
        title="Orders by Status",
        chart_type="bar",
        metric="order_count",
        breakdown_dimension="status",
    )
    added_chart = dashboard_service.add_chart(dash.id, add_req)
    assert added_chart.title == "Orders by Status"
    assert added_chart.chart_type == "bar"

    updated_dash = dashboard_service.get_dashboard(dash.id)
    assert len(updated_dash.charts) == initial_chart_count + 1

    # 2. Delete chart
    dashboard_service.delete_chart(dash.id, added_chart.id)
    final_dash = dashboard_service.get_dashboard(dash.id)
    assert len(final_dash.charts) == initial_chart_count
    assert not any(c.id == added_chart.id for c in final_dash.charts)


def test_explain_engine_custom_dimension_and_ratio_metric() -> None:
    """
    Automated test explaining a change through a custom expression dimension
    and a custom ratio metric (e.g. gross margin rate decomposed across tier segments).
    """
    engine = ExplainEngine()

    # Custom ratio metric: Return Rate = returned_items / total_items
    # Custom dimension: Tier bucketed by CASE WHEN ...
    # Baseline vs Current data:
    # 'Premium Tier' had a massive return rate increase from 0.05 (5%) to 0.20 (20%)
    # 'Standard Tier' remained steady at 0.04 (4%)
    dimension_data = {
        "customer_tier": {
            "baseline": {
                "Premium Tier": 50.0,  # returns
                "Standard Tier": 40.0,
            },
            "current": {
                "Premium Tier": 220.0,  # returns increased sharply
                "Standard Tier": 42.0,
            },
            "rows_baseline": {
                "Premium Tier": 1000,  # total units (rate 50/1000 = 5%)
                "Standard Tier": 1000,  # total units (rate 40/1000 = 4%)
            },
            "rows_current": {
                "Premium Tier": 1100,  # total units (rate 220/1100 = 20%)
                "Standard Tier": 1050,  # total units (rate 42/1050 = 4%)
            },
        }
    }

    baseline_total_returns = 90.0
    baseline_total_units = 2000.0
    baseline_rate = baseline_total_returns / baseline_total_units  # 0.045

    current_total_returns = 262.0
    current_total_units = 2150.0
    current_rate = current_total_returns / current_total_units  # ~0.12186

    evidence = engine.run_from_data(
        metric_name="return_rate",
        metric_type="ratio",
        time_grain="day",
        baseline_start="2024-01-01",
        baseline_end="2024-01-07",
        current_start="2024-01-08",
        current_end="2024-01-14",
        baseline_value=baseline_rate,
        current_value=current_rate,
        dimension_data=dimension_data,
        history_deltas=[0.005] * 12,
    )

    # Verify explain evidence produced
    assert evidence.metric_name == "return_rate"
    assert evidence.metric_type == "ratio"
    assert len(evidence.drivers) > 0

    # The top driver must be Premium Tier from the custom dimension
    top_driver = evidence.drivers[0]
    assert top_driver.dimension == "customer_tier"
    assert top_driver.segment_value == "Premium Tier"
    assert top_driver.direction == "positive"  # return rate jumped
    assert top_driver.share_of_change > 0.5  # accounted for > 50% of the change
    assert top_driver.rate_effect is not None  # ratio decomposition decomposed rate effect
