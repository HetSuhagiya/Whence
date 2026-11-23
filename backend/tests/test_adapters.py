from unittest.mock import MagicMock

import pytest

from app.adapters.base import QueryGuardrailError, QueryTimeoutError
from app.adapters.bigquery_adapter import BigQueryAdapter
from app.adapters.duckdb_adapter import DuckDBAdapter
from app.audit import audit_logger
from app.config import get_settings
from app.crypto import CredentialCrypto


@pytest.mark.asyncio
async def test_duckdb_adapter_introspect_and_query() -> None:
    adapter = DuckDBAdapter(":memory:")
    conn = adapter.get_connection()
    conn.execute(
        """
        CREATE TABLE sales (
            id VARCHAR,
            amount DOUBLE,
            category VARCHAR
        );
        INSERT INTO sales VALUES ('s1', 120.0, 'Electronics'), ('s2', 80.0, 'Apparel');
        """
    )

    schema = await adapter.introspect()
    assert len(schema.tables) >= 1
    sales_table = next(t for t in schema.tables if t.name == "sales")
    assert sales_table.row_count == 2
    assert len(sales_table.columns) == 3

    # Run valid SELECT query
    sql = "SELECT category, SUM(amount) as total FROM sales GROUP BY category ORDER BY total DESC"
    res = await adapter.run(sql)
    assert res.row_count == 2
    assert res.rows[0]["category"] == "Electronics"
    assert res.rows[0]["total"] == 120.0


@pytest.mark.asyncio
async def test_duckdb_guardrail_rejects_non_select() -> None:
    adapter = DuckDBAdapter(":memory:")

    # DROP TABLE
    with pytest.raises(QueryGuardrailError, match="Guardrail violation"):
        await adapter.run("DROP TABLE non_existent")

    # INSERT
    with pytest.raises(QueryGuardrailError, match="Guardrail violation"):
        await adapter.run("INSERT INTO orders VALUES ('x', 1)")

    # DELETE
    with pytest.raises(QueryGuardrailError, match="Guardrail violation"):
        await adapter.run("DELETE FROM orders WHERE 1=1")

    # Multi-statement injection
    with pytest.raises(QueryGuardrailError, match="Multi-statement queries are forbidden"):
        await adapter.run("SELECT 1; DROP TABLE orders;")


@pytest.mark.asyncio
async def test_duckdb_adapter_dry_run() -> None:
    adapter = DuckDBAdapter(":memory:")
    conn = adapter.get_connection()
    conn.execute("CREATE TABLE test_data (val INT);")

    dry_run = await adapter.dry_run("SELECT val FROM test_data")
    assert dry_run.valid is True
    assert dry_run.bytes_scanned >= 0

    bad_dry_run = await adapter.dry_run("SELECT nonexistent_column FROM test_data")
    assert bad_dry_run.valid is False
    assert bad_dry_run.error is not None


@pytest.mark.asyncio
async def test_duckdb_byte_cap_enforcement(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    # Temporarily set byte cap to 50 bytes so normal queries exceed it
    monkeypatch.setattr(settings, "MAX_BYTES_SCANNED_PER_QUERY", 50)

    adapter = DuckDBAdapter(":memory:")
    conn = adapter.get_connection()
    conn.execute("CREATE TABLE items (id INT); INSERT INTO items VALUES (1), (2);")

    with pytest.raises(
        QueryGuardrailError,
        match="above your .* limit. Narrow the date range or raise the limit in Settings.",
    ):
        await adapter.run("SELECT * FROM items")


@pytest.mark.asyncio
async def test_duckdb_query_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    # Set timeout to tiny duration (0.0001 seconds) so computation times out
    monkeypatch.setattr(settings, "QUERY_TIMEOUT_SECONDS", 0.0001)

    adapter = DuckDBAdapter(":memory:")
    with pytest.raises(QueryTimeoutError, match="Query timed out"):
        await adapter.run("SELECT count(*) FROM range(20000000)")


@pytest.mark.asyncio
async def test_query_audit_logging() -> None:
    adapter = DuckDBAdapter(":memory:")
    initial_log_count = len(audit_logger.get_recent(limit=100))

    await adapter.run("SELECT 42 as answer")
    recent = audit_logger.get_recent(limit=10)
    assert len(recent) > initial_log_count
    latest = recent[0]
    assert latest["dialect"] == "duckdb"
    assert latest["status"] == "success"
    assert latest["label"] == "whence"
    assert "SELECT 42 as answer" in latest["sql"]


@pytest.mark.asyncio
async def test_bigquery_adapter_guardrails() -> None:
    """Tests BigQuery guardrails (mock/unit tested, not live-tested)."""
    bq = BigQueryAdapter(project_id="test-bq", dataset_id="ecommerce")

    with pytest.raises(QueryGuardrailError, match="Only SELECT queries are permitted"):
        await bq.run("UPDATE orders SET amount = 0")

    with pytest.raises(QueryGuardrailError, match="Multi-statement"):
        await bq.run("SELECT 1; TRUNCATE TABLE orders;")


@pytest.mark.asyncio
async def test_bigquery_adapter_with_mock_client() -> None:
    """Tests BigQuery SDK interaction using a mock client (not live-tested against GCP)."""
    mock_client = MagicMock()

    # Mock dry-run query job
    mock_dry_job = MagicMock()
    mock_dry_job.total_bytes_processed = 10485760  # 10 MB
    mock_client.query.return_value = mock_dry_job

    bq = BigQueryAdapter(project_id="mock-proj", dataset_id="mock-ds", client=mock_client)
    dry_res = await bq.dry_run("SELECT order_id, amount FROM `mock-proj.mock-ds.orders`")

    assert dry_res.valid is True
    assert dry_res.bytes_scanned == 10485760
    assert dry_res.formatted_bytes == "10.0 MB"

    # Verify dry_run config had whence label
    call_kwargs = mock_client.query.call_args[1]
    assert call_kwargs["job_config"].dry_run is True
    assert call_kwargs["job_config"].labels == {"app": "whence"}


@pytest.mark.asyncio
async def test_bigquery_adapter_byte_cap_with_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "MAX_BYTES_SCANNED_PER_QUERY", 1000)

    mock_client = MagicMock()
    mock_dry_job = MagicMock()
    mock_dry_job.total_bytes_processed = 50_000_000_000  # 50 GB
    mock_client.query.return_value = mock_dry_job

    bq = BigQueryAdapter(project_id="mock-proj", dataset_id="mock-ds", client=mock_client)

    with pytest.raises(
        QueryGuardrailError,
        match="above your .* limit. Narrow the date range or raise the limit in Settings.",
    ):
        await bq.run("SELECT * FROM `mock-proj.mock-ds.orders`")


@pytest.mark.asyncio
async def test_bigquery_credentials_encryption() -> None:
    crypto = CredentialCrypto("0" * 64)
    enc_cred = crypto.encrypt(
        '{"project_id": "test-bq", "client_email": "sa@test-bq.iam.gserviceaccount.com"}'
    )

    bq = BigQueryAdapter(
        encrypted_credentials=enc_cred,
        project_id="test-bq",
        dataset_id="ecommerce",
        crypto=crypto,
    )
    assert bq.dialect == "bigquery"

    creds = bq.get_decrypted_credentials()
    assert creds is not None
    assert creds["project_id"] == "test-bq"


def test_sqlglot_hardened_guardrails() -> None:
    from app.adapters.base import validate_metric_expression, validate_sql

    # 1. Valid single SELECT statements
    assert validate_sql("SELECT 1 AS num", dialect="duckdb") is not None
    assert (
        validate_sql(
            "WITH sales AS (SELECT customer_id, sum(amount) AS total FROM orders GROUP BY 1) "
            "SELECT * FROM sales WHERE total > 100",
            dialect="bigquery",
        )
        is not None
    )

    # 2. Stacked statements
    with pytest.raises(QueryGuardrailError, match="Multi-statement queries are forbidden"):
        validate_sql("SELECT 1; DROP TABLE orders", dialect="duckdb")

    with pytest.raises(QueryGuardrailError, match="Multi-statement queries are forbidden"):
        validate_sql("SELECT 1; UPDATE orders SET total = 0", dialect="bigquery")

    # 3. Comment tricks
    with pytest.raises(QueryGuardrailError, match="Multi-statement queries are forbidden"):
        validate_sql("SELECT 1 /* comment */ ; DROP TABLE orders", dialect="duckdb")

    with pytest.raises(QueryGuardrailError, match="Multi-statement queries are forbidden"):
        validate_sql("SELECT 1 -- line comment\n; DROP TABLE orders", dialect="bigquery")

    with pytest.raises(QueryGuardrailError, match="Multi-statement queries are forbidden"):
        validate_sql("/* leading */ SELECT 1; /* trailing */ DROP TABLE orders", dialect="duckdb")

    # 4. Quoted keywords / identifiers
    # Valid: single SELECT where semicolon is inside quoted identifier
    assert validate_sql('SELECT * FROM "order; DROP TABLE orders"', dialect="duckdb") is not None

    # Invalid: stacked statement after quoted table name
    with pytest.raises(QueryGuardrailError, match="Multi-statement queries are forbidden"):
        validate_sql('SELECT * FROM "orders"; DROP TABLE users', dialect="duckdb")

    # 5. Case variations
    with pytest.raises(QueryGuardrailError, match="Multi-statement queries are forbidden"):
        validate_sql("sElEcT 1; dRoP tAbLe x", dialect="duckdb")

    assert validate_sql("wItH t As (SeLeCt 1) sElEcT * FrOm t", dialect="bigquery") is not None

    with pytest.raises(QueryGuardrailError, match="Only SELECT queries are permitted"):
        validate_sql("InSeRt InTo orders VaLuEs (1)", dialect="duckdb")

    # 6. CTE-wrapped DML
    with pytest.raises(QueryGuardrailError, match="Mutating statement or DDL/DML node detected"):
        validate_sql(
            "WITH deleted AS (DELETE FROM orders RETURNING *) SELECT * FROM deleted",
            dialect="duckdb",
        )

    with pytest.raises(QueryGuardrailError, match="Mutating statement or DDL/DML node detected"):
        validate_sql(
            "WITH inserted AS (INSERT INTO orders VALUES (1) RETURNING *) SELECT * FROM inserted",
            dialect="duckdb",
        )

    # 7. Prohibited functions reaching outside warehouse tables
    with pytest.raises(
        QueryGuardrailError, match="Prohibited function reaching outside warehouse tables"
    ):
        validate_sql(
            "SELECT * FROM EXTERNAL_QUERY('projects/p/locations/l/connections/c', 'SELECT 1')",
            dialect="bigquery",
        )

    with pytest.raises(
        QueryGuardrailError, match="BigQuery ML.* functions reaching outside warehouse tables"
    ):
        validate_sql(
            "SELECT * FROM ML.PREDICT(MODEL `proj.ds.model`, TABLE `proj.ds.data`)",
            dialect="bigquery",
        )

    with pytest.raises(
        QueryGuardrailError, match="BigQuery ML.* functions reaching outside warehouse tables"
    ):
        validate_sql(
            "SELECT * FROM ML.GENERATE_TEXT(MODEL `proj.ds.model`, TABLE `proj.ds.data`)",
            dialect="bigquery",
        )

    with pytest.raises(
        QueryGuardrailError, match="Prohibited function reaching outside warehouse tables"
    ):
        validate_sql("SELECT * FROM read_csv('data.csv')", dialect="duckdb")

    with pytest.raises(
        QueryGuardrailError, match="Prohibited function reaching outside warehouse tables"
    ):
        validate_sql("SELECT * FROM read_parquet('s3://bucket/data.parquet')", dialect="duckdb")

    # 8. Metric expression validation (Item 2 reuse)
    validate_metric_expression("sum(price * quantity)", dialect="bigquery")
    validate_metric_expression("count(distinct user_id)", dialect="duckdb")
    validate_metric_expression("SAFE_DIVIDE(sum(sale_price), count(distinct order_id))", dialect="bigquery")
    validate_metric_expression("sum(sale_price)", allowed_columns=["sale_price", "order_id"])

    # Rule: Multi-statement forbidden
    with pytest.raises(QueryGuardrailError, match="Multi-statement queries are forbidden"):
        validate_metric_expression("sum(price); DROP TABLE users", dialect="duckdb")

    # Rule: Prohibited functions
    with pytest.raises(
        QueryGuardrailError, match="Prohibited function|not in the allowed metric function list"
    ):
        validate_metric_expression("EXTERNAL_QUERY('c', '1')", dialect="bigquery")

    # Rule: Function allowlist (rejects arbitrary/dangerous functions)
    with pytest.raises(QueryGuardrailError, match="not in the allowed metric function list"):
        validate_metric_expression("SYSTEM_USER()", dialect="bigquery")

    with pytest.raises(QueryGuardrailError, match="not in the allowed metric function list"):
        validate_metric_expression("SLEEP(5)", dialect="duckdb")

    # Rule: No subqueries
    with pytest.raises(QueryGuardrailError, match="Subqueries are not allowed in metric expressions"):
        validate_metric_expression("SUM((SELECT sale_price FROM orders))", dialect="duckdb")

    with pytest.raises(QueryGuardrailError, match="Subqueries are not allowed in metric expressions"):
        validate_metric_expression("(SELECT 1)", dialect="bigquery")

    # Rule: No window functions
    with pytest.raises(QueryGuardrailError, match="Window functions are not allowed in metric expressions"):
        validate_metric_expression("SUM(sale_price) OVER (PARTITION BY category)", dialect="duckdb")

    # Rule: Nested aggregations
    with pytest.raises(QueryGuardrailError, match="Nested aggregations are not allowed"):
        validate_metric_expression("SUM(AVG(sale_price))", dialect="duckdb")

    with pytest.raises(QueryGuardrailError, match="Nested aggregations are not allowed"):
        validate_metric_expression("AVG(SUM(sale_price))", dialect="bigquery")

    # Rule: Unknown columns
    with pytest.raises(QueryGuardrailError, match="Column 'secret_column' is not on the model's table"):
        validate_metric_expression(
            "SUM(secret_column)",
            dialect="duckdb",
            allowed_columns=["sale_price", "order_id"],
        )
