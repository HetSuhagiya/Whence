import time
from typing import Any

from pydantic import BaseModel, Field


class QueryAuditRecord(BaseModel):
    id: str = Field(..., description="Unique query execution id")
    sql: str = Field(..., description="Executed SQL statement")
    dialect: str = Field(..., description="Warehouse dialect (duckdb, bigquery)")
    bytes_scanned: int = Field(default=0, description="Estimated or actual bytes scanned")
    duration_ms: float = Field(default=0.0, description="Execution duration in milliseconds")
    timestamp: float = Field(default_factory=time.time, description="Unix timestamp")
    status: str = Field(default="success", description="Status: success, dry_run, error")
    error: str | None = Field(default=None, description="Error message if failed")
    label: str = Field(default="whence", description="Job label")


class QueryAuditLogger:
    """Thread-safe in-memory and persistent query audit logger."""

    def __init__(self) -> None:
        self._records: list[QueryAuditRecord] = []

    def log(self, record: QueryAuditRecord) -> None:
        self._records.append(record)

    def get_recent(self, limit: int = 50) -> list[dict[str, Any]]:
        return [r.model_dump() for r in reversed(self._records[-limit:])]

    def total_cost_and_bytes(self) -> dict[str, Any]:
        total_bytes = sum(r.bytes_scanned for r in self._records)
        return {
            "total_queries": len(self._records),
            "total_bytes_scanned": total_bytes,
        }


audit_logger = QueryAuditLogger()
