from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.adapters.base import QueryGuardrailError, QueryTimeoutError
from app.adapters.bigquery_adapter import BigQueryAdapter
from app.adapters.duckdb_adapter import DuckDBAdapter
from app.audit import audit_logger
from app.config import get_settings
from app.connections.router import router as connections_router
from app.crypto import CredentialCrypto
from app.db import init_db

settings = get_settings()

app = FastAPI(
    title="Whence Backend API",
    description="Deterministic explain engine and warehouse semantic layer",
    version="0.1.0",
)

# Initialize database tables
init_db()

# Mount connections router
app.include_router(connections_router, prefix="/api/v1")

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize in-memory DuckDB adapter for local development and stubbed BigQuery
crypto = CredentialCrypto(settings.WHENCE_MASTER_KEY)
duckdb_adapter = DuckDBAdapter(":memory:")
bigquery_adapter = BigQueryAdapter(crypto=crypto)


# Seed DuckDB with demo ecommerce schema for local development
def _seed_duckdb_demo() -> None:
    conn = duckdb_adapter.get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            order_id VARCHAR PRIMARY KEY,
            created_at TIMESTAMP,
            customer_state VARCHAR,
            payment_type VARCHAR,
            total_amount DOUBLE
        );
        """
    )
    # Check if empty, insert initial seed
    count = conn.execute("SELECT COUNT(*) FROM orders").fetchone()
    if count and count[0] == 0:
        conn.execute(
            """
            INSERT INTO orders VALUES
            ('ORD-001', '2026-11-20 10:15:00', 'CA', 'credit_card', 145.20),
            ('ORD-002', '2026-11-20 11:30:00', 'NY', 'paypal', 89.90),
            ('ORD-003', '2026-11-21 09:45:00', 'TX', 'credit_card', 210.00),
            ('ORD-004', '2026-11-21 14:10:00', 'CA', 'apple_pay', 45.00),
            ('ORD-005', '2026-11-22 16:00:00', 'WA', 'credit_card', 320.50);
            """
        )


_seed_duckdb_demo()


class QueryRequest(BaseModel):
    sql: str
    warehouse: str = Field(default="duckdb", description="'duckdb' or 'bigquery'")
    dry_run_only: bool = Field(default=False)
    params: dict[str, Any] | None = None


@app.get("/api/v1/health")
async def health_check() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "whence-api",
        "version": "0.1.0",
        "environment": settings.WHENCE_ENV,
        "supported_dialects": ["duckdb", "bigquery"],
    }


@app.get("/api/v1/adapters/status")
async def adapters_status() -> dict[str, Any]:
    duck_schema = await duckdb_adapter.introspect()
    bq_schema = await bigquery_adapter.introspect()
    return {
        "duckdb": {
            "dialect": duckdb_adapter.dialect,
            "connected": True,
            "database": duck_schema.project_or_database,
            "table_count": len(duck_schema.tables),
            "tables": [t.name for t in duck_schema.tables],
        },
        "bigquery": {
            "dialect": bigquery_adapter.dialect,
            "connected": True,
            "project_id": bigquery_adapter.project_id,
            "dataset_id": bigquery_adapter.dataset_id,
            "table_count": len(bq_schema.tables),
            "tables": [t.name for t in bq_schema.tables],
        },
    }


@app.post("/api/v1/adapters/query")
async def execute_query(req: QueryRequest) -> dict[str, Any]:
    adapter = duckdb_adapter if req.warehouse.lower() == "duckdb" else bigquery_adapter

    try:
        if req.dry_run_only:
            dry_run = await adapter.dry_run(req.sql)
            return {"type": "dry_run", "result": dry_run.model_dump()}
        else:
            query_res = await adapter.run(req.sql, req.params)
            return {"type": "query_result", "result": query_res.model_dump()}
    except QueryGuardrailError as e:
        raise HTTPException(status_code=400, detail=f"Guardrail error: {e}") from e
    except QueryTimeoutError as e:
        raise HTTPException(status_code=408, detail=f"Query timeout: {e}") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query execution failed: {e}") from e


@app.get("/api/v1/audit")
async def get_query_audit() -> dict[str, Any]:
    return {
        "summary": audit_logger.total_cost_and_bytes(),
        "recent_queries": audit_logger.get_recent(20),
    }


@app.get("/api/v1/settings")
async def get_public_settings() -> dict[str, Any]:
    """Returns safe, non-sensitive configuration settings."""
    return {
        "max_bytes_scanned_per_query": settings.MAX_BYTES_SCANNED_PER_QUERY,
        "query_timeout_seconds": settings.QUERY_TIMEOUT_SECONDS,
        "query_label": settings.WHENCE_QUERY_LABEL,
        "llm_provider": settings.LLM_PROVIDER,
        "llm_configured": bool(settings.LLM_API_KEY),
        "llm_daily_token_limit": settings.LLM_DAILY_TOKEN_LIMIT,
    }
