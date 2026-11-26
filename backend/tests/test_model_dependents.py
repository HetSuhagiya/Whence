import pytest
from httpx import ASGITransport, AsyncClient

from app.connections.models import ConnectionCreateRequest
from app.connections.service import connection_service
from app.dashboards.models import DashboardCreate
from app.dashboards.service import dashboard_service
from app.main import app
from app.semantic.service import semantic_service


@pytest.fixture
def setup_demo_with_dashboard():
    conn = connection_service.create_connection(
        ConnectionCreateRequest(
            name="Dependents Test DuckDB",
            warehouse_type="duckdb",
        )
    )
    model = semantic_service.seed_default_ecommerce_set(
        connection_id=conn.id,
    )
    dash = dashboard_service.create_dashboard(
        DashboardCreate(connection_id=conn.id, name="Test Dependents Dashboard")
    )
    return conn, model, dash


@pytest.mark.asyncio
async def test_get_dependents_404_when_model_missing():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/semantic/models/non-existent-id/dependents")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_dependents_empty_when_no_dashboards():
    conn = connection_service.create_connection(
        ConnectionCreateRequest(
            name="Empty Dependents DuckDB",
            warehouse_type="duckdb",
        )
    )
    model = semantic_service.seed_default_ecommerce_set(
        connection_id=conn.id,
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"/api/v1/semantic/models/{model.id}/dependents")
        assert resp.status_code == 200
        data = resp.json()
        assert data["dashboard_count"] == 0
        assert data["dashboards"] == []
        assert data["chart_count"] == 0
        assert data["charts"] == []


@pytest.mark.asyncio
async def test_get_dependents_with_dashboards_and_charts(setup_demo_with_dashboard):
    conn, model, dash = setup_demo_with_dashboard
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # All dependents for the model
        resp = await client.get(f"/api/v1/semantic/models/{model.id}/dependents")
        assert resp.status_code == 200
        data = resp.json()
        assert data["dashboard_count"] == 1
        assert data["dashboards"][0]["id"] == dash.id
        assert data["dashboards"][0]["name"] == "Test Dependents Dashboard"
        assert data["chart_count"] >= 1
        assert any(c["title"] == "Revenue over time" for c in data["charts"])

        # Filtered by metric_name
        resp_met = await client.get(
            f"/api/v1/semantic/models/{model.id}/dependents?metric_name=revenue"
        )
        assert resp_met.status_code == 200
        data_met = resp_met.json()
        assert data_met["dashboard_count"] == 1
        assert data_met["chart_count"] >= 1
        assert all("revenue" in c["title"].lower() for c in data_met["charts"])

        # Filtered by non-existent metric
        resp_none = await client.get(
            f"/api/v1/semantic/models/{model.id}/dependents?metric_name=non_existent_metric"
        )
        assert resp_none.status_code == 200
        data_none = resp_none.json()
        assert data_none["dashboard_count"] == 0
        assert data_none["dashboards"] == []
        assert data_none["chart_count"] == 0
        assert data_none["charts"] == []

        # Filtered by dimension_name
        resp_dim = await client.get(
            f"/api/v1/semantic/models/{model.id}/dependents?dimension_name=category"
        )
        assert resp_dim.status_code == 200
        data_dim = resp_dim.json()
        assert data_dim["dashboard_count"] == 1
        assert data_dim["chart_count"] >= 1
        assert any("category" in c["title"].lower() for c in data_dim["charts"])
