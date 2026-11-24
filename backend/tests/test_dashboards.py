import json
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.connections.models import ConnectionCreateRequest
from app.connections.service import connection_service
from app.dashboards.models import DashboardCreate
from app.dashboards.planner import DashboardPlanner
from app.dashboards.service import dashboard_service
from app.main import app
from app.semantic.models import DimensionPublic, MetricPublic, ModelPublic
from app.semantic.service import semantic_service


@pytest.fixture
def setup_duckdb_and_model():
    # 1. Create demo DuckDB connection
    conn = connection_service.create_connection(
        ConnectionCreateRequest(
            name="Test Dash DuckDB",
            warehouse_type="duckdb",
        )
    )
    # 2. Seed default ecommerce model
    model = semantic_service.seed_default_ecommerce_set(
        connection_id=conn.id,
    )
    return conn, model


@pytest.mark.asyncio
async def test_create_dashboard_duckdb(setup_duckdb_and_model):
    conn, model = setup_duckdb_and_model
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/dashboards",
            json={"connection_id": conn.id, "name": "Executive Overview"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Executive Overview"
        assert data["connection_id"] == conn.id
        assert "model_name" in data
        assert "primary_time_column" in data
        assert data["model_name"] == model.name
        assert data["primary_time_column"] == model.primary_time_column
        assert len(data["charts"]) == 5
        chart_titles = [c["title"] for c in data["charts"]]
        assert "Revenue over time" in chart_titles
        assert "Revenue by category" in chart_titles
        assert "Revenue by country" in chart_titles
        assert "skipped_charts" in data
        assert data["skipped_charts"] == []


@pytest.mark.asyncio
async def test_create_dashboard_fails_without_semantic_model():
    conn = connection_service.create_connection(
        ConnectionCreateRequest(
            name="Empty DuckDB",
            warehouse_type="duckdb",
        )
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/dashboards",
            json={"connection_id": conn.id},
        )
        assert resp.status_code == 400
        assert "No confirmed semantic model" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_run_chart_and_caching(setup_duckdb_and_model):
    conn, model = setup_duckdb_and_model
    dash = dashboard_service.create_dashboard(
        DashboardCreate(connection_id=conn.id, name="Test Dashboard")
    )
    chart = dash.charts[0]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # First execution
        resp = await client.post(
            f"/api/v1/dashboards/{dash.id}/charts/{chart.id}/run",
            json={"date_range": "last_30_days"},
        )
        assert resp.status_code == 200
        data1 = resp.json()
        assert "rows" in data1
        assert "compiled_sql" in data1

        # Second execution (should hit query cache)
        resp2 = await client.post(
            f"/api/v1/dashboards/{dash.id}/charts/{chart.id}/run",
            json={"date_range": "last_30_days"},
        )
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["compiled_sql"] == data1["compiled_sql"]


@pytest.mark.asyncio
async def test_explain_stream_pipeline_steps_and_completed(setup_duckdb_and_model):
    conn, model = setup_duckdb_and_model
    dash = dashboard_service.create_dashboard(
        DashboardCreate(connection_id=conn.id, name="Explain Test Dashboard")
    )
    chart = dash.charts[0]  # Line chart revenue

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        events = []
        async with client.stream(
            "POST",
            f"/api/v1/dashboards/{dash.id}/charts/{chart.id}/explain",
            json={"baseline_mode": "previous_period"},
        ) as response:
            assert response.status_code == 200
            assert "text/event-stream" in response.headers["content-type"]
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    payload = json.loads(line[6:])
                    events.append(payload)

        # Confirm step progression (steps 1 through 10)
        step_names = [e.get("name") for e in events if "name" in e]
        assert "resolve" in step_names
        assert "noise" in step_names
        assert "drivers" in step_names
        assert "narrative" in step_names

        # Confirm final completed event
        completed_events = [e for e in events if e.get("event") == "completed"]
        assert len(completed_events) == 1
        final_payload = completed_events[0]
        assert "evidence" in final_payload
        assert "narrative" in final_payload
        assert final_payload["evidence"]["metric_name"] == "revenue"
        assert len(final_payload["narrative"]["headline"]) > 0
        assert len(final_payload["narrative"]["supporting_sentences"]) >= 2


def test_dashboard_planner_fixture_a_olist():
    """Fixture a) Olist fct_orders: customer_state, customer_region, items_revenue, freight_total, orders count.
    Assert charts are generated for customer_state, customer_region, NOT category/traffic_source."""
    now = 1700000000.0
    model = ModelPublic(
        id="model-olist",
        connection_id="conn-olist",
        name="Olist Orders",
        project_id="test",
        dataset_id="olist",
        table_name="fct_orders",
        primary_time_column="ordered_at",
        created_at=now,
        updated_at=now,
        dimensions=[
            DimensionPublic(
                id="d1",
                model_id="model-olist",
                name="customer_state",
                column_expression="customer_state",
                dimension_type="categorical",
                label="Customer State",
                is_identifier=False,
                exclude_from_explanation=False,
                created_at=now,
                updated_at=now,
            ),
            DimensionPublic(
                id="d2",
                model_id="model-olist",
                name="customer_region",
                column_expression="customer_region",
                dimension_type="categorical",
                label="Customer Region",
                is_identifier=False,
                exclude_from_explanation=False,
                created_at=now,
                updated_at=now,
            ),
            DimensionPublic(
                id="d3",
                model_id="model-olist",
                name="customer_id",
                column_expression="customer_id",
                dimension_type="categorical",
                label="Customer ID",
                is_identifier=True,
                exclude_from_explanation=True,
                created_at=now,
                updated_at=now,
            ),
            DimensionPublic(
                id="d4",
                model_id="model-olist",
                name="order_id",
                column_expression="order_id",
                dimension_type="categorical",
                label="Order ID",
                is_identifier=True,
                exclude_from_explanation=True,
                created_at=now,
                updated_at=now,
            ),
        ],
        metrics=[
            MetricPublic(
                id="m1",
                model_id="model-olist",
                name="items_revenue",
                metric_type="additive",
                numerator_expr="SUM(items_revenue)",
                display_format="currency",
                higher_is_better=True,
                created_at=now,
                updated_at=now,
            ),
            MetricPublic(
                id="m2",
                model_id="model-olist",
                name="freight_total",
                metric_type="additive",
                numerator_expr="SUM(freight_total)",
                display_format="currency",
                higher_is_better=True,
                created_at=now,
                updated_at=now,
            ),
            MetricPublic(
                id="m3",
                model_id="model-olist",
                name="orders_count",
                metric_type="additive",
                numerator_expr="COUNT(DISTINCT order_id)",
                display_format="integer",
                higher_is_better=True,
                created_at=now,
                updated_at=now,
            ),
        ],
    )

    plan = DashboardPlanner.plan(model)
    assert len(plan.charts) == 4
    all_dims = [dim for c in plan.charts if c.dimensions for dim in c.dimensions]
    assert "customer_state" in all_dims
    assert "customer_region" in all_dims
    assert "category" not in all_dims
    assert "traffic_source" not in all_dims

    for c in plan.charts:
        assert "category" not in c.title.lower()
        assert "traffic_source" not in c.title.lower()

    # Ratio chart skipped because model has no ratio metric
    ratio_skips = [
        s
        for s in plan.skipped_charts
        if "ratio" in s.title.lower() or "ratio" in s.reason.lower()
    ]
    assert len(ratio_skips) == 1
    assert "ratio" in ratio_skips[0].reason.lower()
    assert len(ratio_skips[0].suggestion) > 0


def test_dashboard_planner_fixture_b_single_metric_no_dimensions():
    """Fixture b) Model with single metric and no dimensions.
    Assert dimensional charts are skipped with clear plain notes."""
    now = 1700000000.0
    model = ModelPublic(
        id="model-single",
        connection_id="conn-single",
        name="Single Metric Model",
        project_id="test",
        dataset_id="single",
        table_name="events",
        primary_time_column="occurred_at",
        created_at=now,
        updated_at=now,
        dimensions=[],
        metrics=[
            MetricPublic(
                id="m1",
                model_id="model-single",
                name="event_total",
                metric_type="additive",
                numerator_expr="SUM(amount)",
                display_format="currency",
                higher_is_better=True,
                created_at=now,
                updated_at=now,
            ),
        ],
    )

    plan = DashboardPlanner.plan(model)
    # Only chart 1 (metric over time) is possible
    assert len(plan.charts) == 1
    assert plan.charts[0].metric == "event_total"

    # All dimensional and ratio charts skipped
    assert len(plan.skipped_charts) == 4
    dim_skips = [
        s
        for s in plan.skipped_charts
        if "dimension" in s.reason.lower() or "dimension" in s.title.lower()
    ]
    assert len(dim_skips) >= 2
    for s in plan.skipped_charts:
        assert len(s.reason) > 0
        assert len(s.suggestion) > 0


def test_dashboard_planner_fixture_c_no_ratio_metric():
    """Fixture c) Model with no ratio metric. Assert ratio chart is skipped with clear plain note."""
    now = 1700000000.0
    model = ModelPublic(
        id="model-noratio",
        connection_id="conn-noratio",
        name="No Ratio Model",
        project_id="test",
        dataset_id="noratio",
        table_name="fct_sales",
        primary_time_column="sale_time",
        created_at=now,
        updated_at=now,
        dimensions=[
            DimensionPublic(
                id="d1",
                model_id="model-noratio",
                name="region_code",
                column_expression="region_code",
                dimension_type="categorical",
                is_identifier=False,
                exclude_from_explanation=False,
                created_at=now,
                updated_at=now,
            ),
            DimensionPublic(
                id="d2",
                model_id="model-noratio",
                name="channel_type",
                column_expression="channel_type",
                dimension_type="categorical",
                is_identifier=False,
                exclude_from_explanation=False,
                created_at=now,
                updated_at=now,
            ),
        ],
        metrics=[
            MetricPublic(
                id="m1",
                model_id="model-noratio",
                name="total_amount",
                metric_type="additive",
                numerator_expr="SUM(amount)",
                display_format="currency",
                higher_is_better=True,
                created_at=now,
                updated_at=now,
            ),
            MetricPublic(
                id="m2",
                model_id="model-noratio",
                name="tx_count",
                metric_type="additive",
                numerator_expr="COUNT(*)",
                display_format="integer",
                higher_is_better=True,
                created_at=now,
                updated_at=now,
            ),
        ],
    )

    plan = DashboardPlanner.plan(model)
    assert len(plan.charts) == 4
    ratio_skips = [
        s
        for s in plan.skipped_charts
        if "ratio" in s.title.lower() or "ratio" in s.reason.lower()
    ]
    assert len(ratio_skips) == 1
    assert "ratio" in ratio_skips[0].reason.lower()
    assert len(ratio_skips[0].suggestion) > 0


def test_dashboard_planner_fixture_d_multiple_dimensions_and_ratio():
    """Fixture d) Model with multiple dimensions and ratio metric."""
    now = 1700000000.0
    model = ModelPublic(
        id="model-full",
        connection_id="conn-full",
        name="Full Model",
        project_id="test",
        dataset_id="full",
        table_name="fct_full",
        primary_time_column="event_time",
        created_at=now,
        updated_at=now,
        dimensions=[
            DimensionPublic(
                id="d1",
                model_id="model-full",
                name="segment",
                column_expression="segment",
                dimension_type="categorical",
                is_identifier=False,
                exclude_from_explanation=False,
                created_at=now,
                updated_at=now,
            ),
            DimensionPublic(
                id="d2",
                model_id="model-full",
                name="cohort",
                column_expression="cohort",
                dimension_type="categorical",
                is_identifier=False,
                exclude_from_explanation=False,
                created_at=now,
                updated_at=now,
            ),
        ],
        metrics=[
            MetricPublic(
                id="m1",
                model_id="model-full",
                name="revenue_amount",
                metric_type="additive",
                numerator_expr="SUM(val)",
                display_format="currency",
                higher_is_better=True,
                created_at=now,
                updated_at=now,
            ),
            MetricPublic(
                id="m2",
                model_id="model-full",
                name="conversion_ratio",
                metric_type="ratio",
                numerator_expr="COUNT(conversion_id)",
                denominator_expr="COUNT(visitor_id)",
                display_format="percent",
                higher_is_better=True,
                created_at=now,
                updated_at=now,
            ),
            MetricPublic(
                id="m3",
                model_id="model-full",
                name="event_count",
                metric_type="additive",
                numerator_expr="COUNT(*)",
                display_format="integer",
                higher_is_better=True,
                created_at=now,
                updated_at=now,
            ),
        ],
    )

    plan = DashboardPlanner.plan(model)
    assert len(plan.charts) == 5
    assert len(plan.skipped_charts) == 0

    assert plan.charts[0].metric == "revenue_amount"
    assert plan.charts[0].time_grain == "day"

    assert plan.charts[1].metric == "revenue_amount"
    assert plan.charts[1].dimensions == ["segment"]

    assert plan.charts[2].metric == "revenue_amount"
    assert plan.charts[2].dimensions == ["cohort"]

    assert plan.charts[3].metric == "conversion_ratio"
    assert plan.charts[3].time_grain == "day"

    assert plan.charts[4].metric == "event_count"
    assert plan.charts[4].dimensions == ["segment"]


def test_planner_no_ecommerce_hardcoded_names():
    """Assert NO ecommerce-specific hardcoded names in code or copy."""
    planner_path = Path(__file__).resolve().parent.parent / "app" / "dashboards" / "planner.py"
    assert planner_path.exists(), "planner.py must exist"
    code = planner_path.read_text().lower()

    forbidden_literals = [
        '"category"',
        "'category'",
        '"traffic_source"',
        "'traffic_source'",
        '"revenue"',
        "'revenue'",
        '"orders"',
        "'orders'",
        '"aov"',
        "'aov'",
    ]
    for literal in forbidden_literals:
        assert literal not in code, f"Found hardcoded literal {literal} in planner.py"
