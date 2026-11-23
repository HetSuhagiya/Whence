import uuid
from abc import ABC, abstractmethod
from typing import Any

import sqlglot
from pydantic import BaseModel, Field
from sqlglot import exp

from app.audit import QueryAuditRecord, audit_logger
from app.config import get_settings


class ColumnInfo(BaseModel):
    name: str
    data_type: str
    is_nullable: bool = True
    is_numeric: bool = False
    is_temporal: bool = False
    is_string: bool = False


class TableInfo(BaseModel):
    name: str
    schema_name: str | None = None
    row_count: int | None = None
    columns: list[ColumnInfo] = Field(default_factory=list)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)


class SchemaIntrospection(BaseModel):
    project_or_database: str
    tables: list[TableInfo] = Field(default_factory=list)


class DryRunResult(BaseModel):
    valid: bool
    bytes_scanned: int = 0
    formatted_bytes: str = "0 B"
    error: str | None = None


class QueryResult(BaseModel):
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int
    duration_ms: float
    bytes_scanned: int = 0


class QueryGuardrailError(Exception):
    """Raised when a query violates safety guardrails (non-SELECT, byte cap exceeded, etc.)."""

    pass


class QueryByteCapExceededError(QueryGuardrailError):
    """Raised when a query's dry-run estimated bytes exceed the configured byte cap."""

    pass


class QueryTimeoutError(Exception):
    """Raised when query execution exceeds the configured timeout."""

    pass


def format_bytes(num_bytes: int) -> str:
    """Formats bytes into human readable format (B, KB, MB, GB, TB)."""
    val = float(num_bytes)
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if abs(val) < 1024.0:
            return f"{val:3.1f} {unit}"
        val /= 1024.0
    return f"{val:.1f} PB"


PROHIBITED_AST_NODES: tuple[type[exp.Expression], ...] = (
    exp.Insert,
    exp.Update,
    exp.Delete,
    exp.Drop,
    exp.Create,
    exp.Alter,
    exp.Command,
    exp.Transaction,
    exp.Commit,
    exp.Rollback,
    exp.Pragma,
    exp.Set,
    exp.Show,
    exp.Kill,
    exp.LoadData,
    exp.Export,
    exp.Merge,
)

PROHIBITED_FUNCTIONS: frozenset[str] = frozenset(
    {
        "EXTERNAL_QUERY",
        "READ_CSV",
        "READ_CSV_AUTO",
        "READ_PARQUET",
        "READ_JSON",
        "READ_JSON_AUTO",
        "READ_TEXT",
        "SCAN_PARQUET",
        "SQLITE_SCAN",
        "POSTGRES_SCAN",
        "HTTPFS",
        "COPY",
        "ATTACH",
        "DETACH",
        "INSTALL",
        "LOAD",
    }
)


def validate_sql(sql: str, dialect: str = "duckdb") -> exp.Select:
    """
    Hardened SQL Guardrail:
    Parses the SQL with sqlglot for the specified warehouse dialect.
    Strictly permits exactly ONE statement that is a SELECT or WITH ... SELECT.
    Rejects stacked statements, comment tricks hiding queries, DML inside CTEs,
    and functions (such as BigQuery EXTERNAL_QUERY, ML.*, or DuckDB external scans)
    that reach outside the warehouse tables.
    """
    if not sql or not sql.strip():
        raise QueryGuardrailError("Guardrail violation: Empty SQL query.")

    clean_dialect = dialect.lower()
    if clean_dialect not in ("duckdb", "bigquery"):
        clean_dialect = "duckdb"

    try:
        raw_statements = sqlglot.parse(sql, read=clean_dialect)
    except Exception as e:
        raise QueryGuardrailError(
            f"Guardrail violation: SQL syntax error or invalid dialect tokens: {e}"
        ) from e

    statements = [stmt for stmt in raw_statements if stmt is not None]
    if len(statements) == 0:
        raise QueryGuardrailError(
            "Guardrail violation: Query contains no executable SQL statements."
        )
    if len(statements) > 1:
        raise QueryGuardrailError(
            "Guardrail violation: Multi-statement queries are forbidden. "
            f"Found {len(statements)} statements."
        )

    root_stmt = statements[0]
    if not isinstance(root_stmt, exp.Select):
        raise QueryGuardrailError(
            "Guardrail violation: Only SELECT queries are permitted. "
            f"Found statement type '{type(root_stmt).__name__}'."
        )

    # Walk every node in the AST to detect nested DML/DDL or forbidden function calls
    for node in root_stmt.walk():
        if isinstance(node, PROHIBITED_AST_NODES):
            raise QueryGuardrailError(
                "Guardrail violation: Mutating statement or DDL/DML node detected: "
                f"'{type(node).__name__}'."
            )

        # Check for ML.* references (e.g. ML.PREDICT, ML.GENERATE_TEXT, etc.)
        if isinstance(node, exp.Table):
            db = (node.db or "").upper()
            tbl = (node.name or "").upper()
            if db == "ML" or tbl.startswith("ML."):
                raise QueryGuardrailError(
                    "Guardrail violation: BigQuery ML.* functions reaching outside "
                    f"warehouse tables are prohibited: '{node.sql()}'."
                )

        # Check function invocations
        func_name = ""
        if isinstance(node, exp.Anonymous):
            func_name = node.this.upper()
        elif isinstance(node, exp.Func):
            func_name = node.sql_name().upper()

        if func_name:
            if func_name in PROHIBITED_FUNCTIONS or func_name.startswith("ML."):
                raise QueryGuardrailError(
                    "Guardrail violation: Prohibited function reaching outside warehouse tables: "
                    f"'{func_name}'."
                )

    return root_stmt


ALLOWED_METRIC_FUNCTIONS: frozenset[str] = frozenset(
    {
        "SUM",
        "COUNT",
        "AVG",
        "MIN",
        "MAX",
        "COALESCE",
        "NULLIF",
        "ROUND",
        "ABS",
        "CEIL",
        "FLOOR",
        "CAST",
        "SAFE_DIVIDE",
        "DIVIDE",
        "DATE_TRUNC",
        "TIMESTAMP_TRUNC",
        "DATE",
        "DATETIME",
        "DISTINCT",
        "IF",
    }
)

AGGREGATE_FUNCTIONS: frozenset[str] = frozenset({"SUM", "COUNT", "AVG", "MIN", "MAX"})


def validate_metric_expression(
    expr: str,
    dialect: str = "duckdb",
    allowed_columns: list[str] | set[str] | None = None,
) -> None:
    """
    Validates user-written or generated metric expressions per Item 2 specifications:
    1. Function allowlist (SUM, COUNT, AVG, MIN, MAX, COALESCE, NULLIF, SAFE_DIVIDE, etc.)
    2. No subqueries
    3. No window functions (OVER ...)
    4. Only columns on the model's table or declared joins (when allowed_columns is provided)
    5. Single aggregation level (no nested aggregations like SUM(AVG(...)))
    """
    if not expr or not expr.strip():
        raise QueryGuardrailError("Metric expression cannot be empty.")

    if ";" in expr:
        raise QueryGuardrailError(
            "Guardrail violation: Multi-statement queries are forbidden in metric expressions."
        )

    synthetic_sql = f"SELECT {expr} FROM __whence_metric_validation_table__"
    root_stmt = validate_sql(synthetic_sql, dialect=dialect)

    if not root_stmt.expressions:
        raise QueryGuardrailError("Metric expression yielded no parseable projection.")

    metric_target = root_stmt.expressions[0]

    # Walk all nodes inside the metric expression
    allowed_cols_set = (
        {c.lower() for c in allowed_columns} if allowed_columns is not None else None
    )

    for node in metric_target.walk():
        # 1. No window functions
        if isinstance(node, (exp.Window, exp.WindowSpec)):
            raise QueryGuardrailError(
                "Guardrail violation: Window functions are not allowed in metric expressions."
            )

        # 2. No subqueries
        if node is not metric_target and isinstance(node, (exp.Select, exp.Subquery)):
            raise QueryGuardrailError(
                "Guardrail violation: Subqueries are not allowed in metric expressions."
            )

        # 3. Function allowlist & single aggregation level
        func_name = ""
        if isinstance(node, exp.Anonymous):
            func_name = node.this.upper()
        elif isinstance(node, exp.Func):
            func_name = node.sql_name().upper()

        if func_name:
            if func_name not in ALLOWED_METRIC_FUNCTIONS:
                raise QueryGuardrailError(
                    f"Guardrail violation: Function '{func_name}' is not in the allowed "
                    "metric function list."
                )

            # 4. Check for nested aggregation level
            if func_name in AGGREGATE_FUNCTIONS:
                # Walk descendants of this aggregate node to check for nested aggregates
                for child in node.walk():
                    if child is node:
                        continue
                    child_func = ""
                    if isinstance(child, exp.Anonymous):
                        child_func = child.this.upper()
                    elif isinstance(child, exp.Func):
                        child_func = child.sql_name().upper()

                    if child_func in AGGREGATE_FUNCTIONS:
                        raise QueryGuardrailError(
                            "Guardrail violation: Nested aggregations are not allowed in metric "
                            f"expressions (found '{child_func}' inside '{func_name}')."
                        )

        # 5. Column validation against model schema
        if isinstance(node, exp.Column) and allowed_cols_set is not None:
            col_name = node.name.lower()
            if col_name != "*" and col_name not in allowed_cols_set:
                raise QueryGuardrailError(
                    f"Guardrail violation: Column '{node.name}' is not on the model's table "
                    "or declared joins."
                )


class WarehouseAdapter(ABC):
    """Warehouse-agnostic adapter interface with built-in security guardrails and audit logging."""

    @property
    @abstractmethod
    def dialect(self) -> str:
        """Returns the SQL dialect name: 'duckdb' or 'bigquery'."""
        pass

    @abstractmethod
    async def introspect(self) -> SchemaIntrospection:
        """Introspects tables, columns, types, and sample rows."""
        pass

    @abstractmethod
    async def _execute_dry_run(self, sql: str) -> DryRunResult:
        """Underlying adapter implementation for dry run."""
        pass

    @abstractmethod
    async def _execute_query(self, sql: str, params: dict[str, Any] | None = None) -> QueryResult:
        """Underlying adapter implementation for executing query."""
        pass

    def validate_select_only(self, sql: str) -> None:
        """
        Guardrail: SELECT only.
        Parses SQL using dialect-aware sqlglot AST to ensure only SELECT (or CTE WITH ... SELECT)
        statements are allowed. Rejects DDL, DML, statement chaining, and external escapes.
        """
        validate_sql(sql, dialect=self.dialect)

    async def dry_run(self, sql: str) -> DryRunResult:
        """Validates query safety and estimates bytes scanned."""
        self.validate_select_only(sql)
        res = await self._execute_dry_run(sql)
        res.formatted_bytes = format_bytes(res.bytes_scanned)

        settings = get_settings()
        if res.bytes_scanned > settings.MAX_BYTES_SCANNED_PER_QUERY:
            scanned_str = format_bytes(res.bytes_scanned)
            cap_str = format_bytes(settings.MAX_BYTES_SCANNED_PER_QUERY)
            error_msg = (
                f"This query would scan {scanned_str}, above your {cap_str} limit. "
                "Narrow the date range or raise the limit in Settings."
            )
            res.valid = False
            res.error = error_msg

        audit_logger.log(
            QueryAuditRecord(
                id=str(uuid.uuid4()),
                sql=sql,
                dialect=self.dialect,
                bytes_scanned=res.bytes_scanned,
                duration_ms=0.0,
                status="dry_run" if res.valid else "error",
                error=res.error,
                label=settings.WHENCE_QUERY_LABEL,
            )
        )
        return res

    async def run(self, sql: str, params: dict[str, Any] | None = None) -> QueryResult:
        """
        Executes query with full guardrails:
        1. SELECT only validation
        2. Dry-run byte scan estimate & cap check
        3. Execution timeout
        4. Audit log recording
        """
        # Step 1: Validate SELECT only
        self.validate_select_only(sql)

        # Step 2: Dry-run check
        dry_run_res = await self.dry_run(sql)
        if not dry_run_res.valid:
            raise QueryGuardrailError(dry_run_res.error or "Dry run validation failed.")

        # Step 3: Run execution
        query_id = str(uuid.uuid4())
        settings = get_settings()
        try:
            result = await self._execute_query(sql, params)
            audit_logger.log(
                QueryAuditRecord(
                    id=query_id,
                    sql=sql,
                    dialect=self.dialect,
                    bytes_scanned=result.bytes_scanned or dry_run_res.bytes_scanned,
                    duration_ms=result.duration_ms,
                    status="success",
                    label=settings.WHENCE_QUERY_LABEL,
                )
            )
            return result
        except Exception as e:
            audit_logger.log(
                QueryAuditRecord(
                    id=query_id,
                    sql=sql,
                    dialect=self.dialect,
                    bytes_scanned=dry_run_res.bytes_scanned,
                    duration_ms=0.0,
                    status="error",
                    error=str(e),
                    label=settings.WHENCE_QUERY_LABEL,
                )
            )
            raise
