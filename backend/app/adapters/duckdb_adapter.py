import asyncio
import time
from typing import Any

import duckdb

from app.adapters.base import (
    ColumnInfo,
    DryRunResult,
    QueryResult,
    QueryTimeoutError,
    SchemaIntrospection,
    TableInfo,
    WarehouseAdapter,
)
from app.config import get_settings


class DuckDBAdapter(WarehouseAdapter):
    """
    DuckDB adapter for local development, demo mode, and the evaluation harness.
    Implements the standard WarehouseAdapter interface.
    """

    def __init__(self, database_path: str = ":memory:") -> None:
        self._database_path = database_path
        self._conn = duckdb.connect(database_path)

    @property
    def dialect(self) -> str:
        return "duckdb"

    def get_connection(self) -> duckdb.DuckDBPyConnection:
        return self._conn

    async def introspect(self) -> SchemaIntrospection:
        """Introspects tables, columns, types, row counts, and sample rows."""
        tables_res = self._conn.execute(
            """
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
            ORDER BY table_name;
            """
        ).fetchall()

        table_infos: list[TableInfo] = []

        for schema_name, table_name in tables_res:
            # Columns
            cols_res = self._conn.execute(
                f"""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = '{table_name}' AND table_schema = '{schema_name}'
                ORDER BY ordinal_position;
                """
            ).fetchall()

            columns: list[ColumnInfo] = []
            for col_name, dtype, is_null in cols_res:
                dt_upper = dtype.upper()
                numeric_types = ("INT", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "HUGEINT")
                is_num = any(t in dt_upper for t in numeric_types)
                is_time = any(t in dt_upper for t in ("DATE", "TIME", "TIMESTAMP"))
                is_str = any(t in dt_upper for t in ("VARCHAR", "TEXT", "CHAR", "STRING"))

                columns.append(
                    ColumnInfo(
                        name=col_name,
                        data_type=dtype,
                        is_nullable=(is_null == "YES"),
                        is_numeric=is_num,
                        is_temporal=is_time,
                        is_string=is_str,
                    )
                )

            # Row count
            count_res = self._conn.execute(
                f'SELECT COUNT(*) FROM "{schema_name}"."{table_name}"'
            ).fetchone()
            row_count = count_res[0] if count_res else 0

            # Sample rows (up to 5)
            sample_cur = self._conn.execute(f'SELECT * FROM "{schema_name}"."{table_name}" LIMIT 5')
            col_names = [desc[0] for desc in sample_cur.description]
            sample_tuples = sample_cur.fetchall()
            sample_rows = [dict(zip(col_names, row, strict=False)) for row in sample_tuples]

            table_infos.append(
                TableInfo(
                    name=table_name,
                    schema_name=schema_name,
                    row_count=row_count,
                    columns=columns,
                    sample_rows=sample_rows,
                )
            )

        return SchemaIntrospection(
            project_or_database=self._database_path,
            tables=table_infos,
        )

    async def _execute_dry_run(self, sql: str) -> DryRunResult:
        """Validates query via EXPLAIN in DuckDB and estimates scan size."""
        try:
            # Use EXPLAIN to validate SQL syntax and get execution plan
            explain_res = self._conn.execute(f"EXPLAIN {sql}").fetchall()
            plan_str = " ".join([str(r) for r in explain_res])

            # In-memory estimate based on table sizes involved or approximate bytes
            bytes_scanned = len(sql.encode("utf-8")) * 1024  # baseline simulated scan size
            if "EC:" in plan_str:
                # DuckDB estimated cardinality can inform size
                bytes_scanned = max(bytes_scanned, 1024 * 1024)

            return DryRunResult(
                valid=True,
                bytes_scanned=bytes_scanned,
            )
        except Exception as e:
            return DryRunResult(
                valid=False,
                bytes_scanned=0,
                error=str(e),
            )

    async def _execute_query(self, sql: str, params: dict[str, Any] | None = None) -> QueryResult:
        """Executes query with timeout enforcement."""
        settings = get_settings()
        start = time.perf_counter()

        def _run() -> tuple[list[str], list[dict[str, Any]], int]:
            cur = self._conn.execute(sql, params or {})
            col_names = [desc[0] for desc in cur.description] if cur.description else []
            rows_tuples = cur.fetchall()
            rows_dict = [dict(zip(col_names, row, strict=False)) for row in rows_tuples]
            return col_names, rows_dict, len(rows_dict)

        try:
            col_names, rows_dict, count = await asyncio.wait_for(
                asyncio.to_thread(_run),
                timeout=float(settings.QUERY_TIMEOUT_SECONDS),
            )
        except TimeoutError as e:
            raise QueryTimeoutError(
                f"Query timed out after {settings.QUERY_TIMEOUT_SECONDS} seconds."
            ) from e

        duration = (time.perf_counter() - start) * 1000.0

        return QueryResult(
            columns=col_names,
            rows=rows_dict,
            row_count=count,
            duration_ms=round(duration, 2),
            bytes_scanned=count * 64,
        )
