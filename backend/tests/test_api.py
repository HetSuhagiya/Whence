import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health_check() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "duckdb" in data["supported_dialects"]
        assert "bigquery" in data["supported_dialects"]


@pytest.mark.asyncio
async def test_adapters_status() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/adapters/status")
        assert response.status_code == 200
        data = response.json()
        assert "duckdb" in data
        assert "bigquery" in data
        assert data["duckdb"]["connected"] is True


@pytest.mark.asyncio
async def test_query_guardrail_rejection() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Dangerous query
        response = await client.post(
            "/api/v1/adapters/query",
            json={"sql": "DROP TABLE orders", "warehouse": "duckdb"},
        )
        assert response.status_code == 400
        assert "Guardrail error" in response.json()["detail"]


@pytest.mark.asyncio
async def test_valid_query_and_audit() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/adapters/query",
            json={"sql": "SELECT COUNT(*) as total_orders FROM orders", "warehouse": "duckdb"},
        )
        assert response.status_code == 200
        result = response.json()
        assert result["type"] == "query_result"
        assert result["result"]["row_count"] == 1

        # Check audit log
        audit_res = await client.get("/api/v1/audit")
        assert audit_res.status_code == 200
        audit_data = audit_res.json()
        assert audit_data["summary"]["total_queries"] >= 1
