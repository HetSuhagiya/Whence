import json

import pytest
from httpx import ASGITransport, AsyncClient

from app.connections.models import ConnectionCreateRequest
from app.connections.service import connection_service
from app.dashboards.models import DashboardCreate
from app.dashboards.service import dashboard_service
from app.main import app
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
        assert len(data["charts"]) == 5
        chart_titles = [c["title"] for c in data["charts"]]
        assert "Revenue over time" in chart_titles
        assert "Revenue by category" in chart_titles
        assert "Orders by state" in chart_titles


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
