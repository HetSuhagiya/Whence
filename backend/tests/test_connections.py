import json
import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.audit import audit_logger
from app.connections.models import (
    ConnectionCreateRequest,
    SaveSourcesRequest,
    TableColumnInfo,
    TableDetail,
    map_bigquery_error,
)
from app.connections.service import ConnectionService
from app.db import run_migrations
from app.main import app

DUMMY_PRIVATE_KEY = (
    "-----BEGIN PRIVATE KEY-----\n"
    "MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDabc123\n"
    "-----END PRIVATE KEY-----\n"
)

SAMPLE_SA_KEY = {
    "type": "service_account",
    "project_id": "test-analytics-project",
    "private_key_id": "key123456",
    "private_key": DUMMY_PRIVATE_KEY,
    "client_email": "whence-sa@test-analytics-project.iam.gserviceaccount.com",
    "client_id": "987654321",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
}


@pytest.fixture
def mock_bq_client() -> MagicMock:
    client = MagicMock()

    # Mock list_projects
    proj1 = MagicMock()
    proj1.project_id = "test-analytics-project"
    proj2 = MagicMock()
    proj2.project_id = "bigquery-public-data"
    client.list_projects.return_value = [proj1, proj2]

    # Mock list_datasets
    ds1 = MagicMock()
    ds1.dataset_id = "ecommerce"
    ds1.location = "US"
    client.list_datasets.return_value = [ds1]

    # Mock list_tables
    t1 = MagicMock()
    t1.table_id = "orders"
    t1.table_type = "TABLE"
    t2 = MagicMock()
    t2.table_id = "order_items"
    t2.table_type = "TABLE"
    client.list_tables.return_value = [t1, t2]

    # Mock get_table
    table_obj = MagicMock()
    table_obj.location = "US"
    table_obj.table_type = "TABLE"
    table_obj.num_rows = 1500000
    table_obj.num_bytes = 485000000
    field1 = MagicMock()
    field1.name = "order_id"
    field1.field_type = "STRING"
    field1.mode = "REQUIRED"
    field1.description = "Primary key"
    field2 = MagicMock()
    field2.name = "created_at"
    field2.field_type = "TIMESTAMP"
    field2.mode = "NULLABLE"
    field2.description = "Order placement time"
    table_obj.schema = [field1, field2]
    table_obj.time_partitioning.field = "created_at"
    table_obj.time_partitioning.type_ = "DAY"
    table_obj.require_partition_filter = True
    table_obj.clustering_fields = ["order_id"]
    client.get_table.return_value = table_obj

    # Mock list_rows
    row1 = {"order_id": "ORD-1", "created_at": "2026-11-20T10:00:00Z"}
    row2 = {"order_id": "ORD-2", "created_at": "2026-11-20T11:00:00Z"}
    client.list_rows.return_value = [row1, row2]

    # Mock dry-run query jobs
    job = MagicMock()
    job.total_bytes_processed = 10485760  # 10 MB
    client.query.return_value = job

    return client


@pytest.mark.asyncio
async def test_key_validation_enforcements() -> None:
    service = ConnectionService()

    # 1. Size over 64 KB
    huge_key = "a" * 66000
    with pytest.raises(ValueError, match="exceeds 64 KB limit"):
        service.validate_key_json(huge_key)

    # 2. Invalid JSON
    with pytest.raises(ValueError, match="Invalid JSON"):
        service.validate_key_json("{not valid json")

    # 3. Not a service_account
    bad_type = json.dumps({"type": "authorized_user", "client_email": "x@y.com"})
    with pytest.raises(ValueError, match="Only 'service_account' keys are supported"):
        service.validate_key_json(bad_type)

    # 4. Missing required fields
    missing_fields = json.dumps({"type": "service_account", "project_id": "p"})
    with pytest.raises(ValueError, match="missing required fields"):
        service.validate_key_json(missing_fields)


@pytest.mark.asyncio
async def test_duckdb_connection_flow() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create DuckDB connection
        resp = await client.post(
            "/api/v1/connections",
            json={"name": "Demo DuckDB", "warehouse_type": "duckdb"},
        )
        assert resp.status_code == 201
        conn_data = resp.json()
        conn_id = conn_data["id"]
        assert conn_data["warehouse_type"] == "duckdb"
        assert conn_data["client_email"] == "duckdb-demo@whence.local"

        # List projects
        proj_resp = await client.get(f"/api/v1/connections/{conn_id}/projects")
        assert proj_resp.status_code == 200
        assert "duckdb_local" in proj_resp.json()

        # List datasets
        ds_resp = await client.get(f"/api/v1/connections/{conn_id}/projects/duckdb_local/datasets")
        assert ds_resp.status_code == 200
        assert any(d["dataset_id"] == "main" for d in ds_resp.json())

        # List tables
        tbl_resp = await client.get(
            f"/api/v1/connections/{conn_id}/projects/duckdb_local/datasets/main/tables"
        )
        assert tbl_resp.status_code == 200
        tables = [t["table_name"] for t in tbl_resp.json()]
        assert "orders" in tables

        # Table details
        detail_resp = await client.get(
            f"/api/v1/connections/{conn_id}/projects/duckdb_local/datasets/main/tables/orders"
        )
        assert detail_resp.status_code == 200
        assert detail_resp.json()["table_name"] == "orders"
        assert detail_resp.json()["row_count"] > 0

        # Preview (10 rows, zero query cost)
        prev_resp = await client.get(
            f"/api/v1/connections/{conn_id}/projects/duckdb_local/datasets/main/tables/orders/preview"
        )
        assert prev_resp.status_code == 200
        assert prev_resp.json()["zero_query_cost"] is True
        assert len(prev_resp.json()["rows"]) > 0

        # Save sources
        save_req = SaveSourcesRequest(
            tables=[
                TableDetail(
                    project_id="duckdb_local",
                    dataset_id="main",
                    table_name="orders",
                    table_type="TABLE",
                    row_count=5000,
                    size_bytes=100000,
                    columns=[
                        TableColumnInfo(name="order_id", data_type="VARCHAR", is_nullable=False)
                    ],
                )
            ]
        )
        sources_resp = await client.put(
            f"/api/v1/connections/{conn_id}/sources", json=save_req.model_dump()
        )
        assert sources_resp.status_code == 200
        assert len(sources_resp.json()) == 1

        # Test connection (all 7 checks)
        test_resp = await client.post(f"/api/v1/connections/{conn_id}/test")
        assert test_resp.status_code == 200
        test_data = test_resp.json()
        assert test_data["overall_status"] == "passed"
        assert len(test_data["checks"]) == 7
        assert all(c["status"] == "passed" for c in test_data["checks"])


@pytest.mark.asyncio
async def test_bigquery_connection_security_and_key_redaction() -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create BigQuery connection
        resp = await client.post(
            "/api/v1/connections",
            json={
                "name": "Production BQ",
                "warehouse_type": "bigquery",
                "key_json": json.dumps(SAMPLE_SA_KEY),
                "billing_project": "test-analytics-project",
            },
        )
        assert resp.status_code == 201
        conn_data = resp.json()
        conn_id = conn_data["id"]

        # 1. Assert private_key NEVER appears in API response
        raw_response_text = resp.text
        assert "private_key" not in conn_data
        assert "BEGIN PRIVATE KEY" not in raw_response_text
        assert "key123456" not in raw_response_text
        assert conn_data["client_email"] == SAMPLE_SA_KEY["client_email"]
        assert conn_data["project_id"] == "test-analytics-project"

        # 2. Get connection check
        get_resp = await client.get(f"/api/v1/connections/{conn_id}")
        assert get_resp.status_code == 200
        assert "private_key" not in get_resp.json()
        assert "BEGIN PRIVATE KEY" not in get_resp.text

        # 3. List connections check
        list_resp = await client.get("/api/v1/connections")
        assert list_resp.status_code == 200
        assert "BEGIN PRIVATE KEY" not in list_resp.text

        # 4. Audit logger check: ensure private key never logged
        logs = audit_logger.get_recent(limit=50)
        logs_str = json.dumps(logs)
        assert "BEGIN PRIVATE KEY" not in logs_str
        assert "key123456" not in logs_str

        # 5. Replace key check
        updated_key = dict(SAMPLE_SA_KEY)
        updated_key["client_email"] = "updated-sa@test-analytics-project.iam.gserviceaccount.com"
        update_resp = await client.put(
            f"/api/v1/connections/{conn_id}/key",
            json={"key_json": json.dumps(updated_key)},
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["client_email"] == updated_key["client_email"]
        assert "BEGIN PRIVATE KEY" not in update_resp.text

        # 6. Delete connection
        del_resp = await client.delete(f"/api/v1/connections/{conn_id}")
        assert del_resp.status_code == 204

        # 7. Verify deletion
        get_after_del = await client.get(f"/api/v1/connections/{conn_id}")
        assert get_after_del.status_code == 404


@pytest.mark.asyncio
async def test_bigquery_7_checks_live_checklist_mocked(mock_bq_client: MagicMock) -> None:
    service = ConnectionService()
    # Create connection directly in service
    conn = service.create_connection(
        ConnectionCreateRequest(
            name="Mocked BQ",
            warehouse_type="bigquery",
            key_json=json.dumps(SAMPLE_SA_KEY),
            billing_project="test-analytics-project",
        )
    )

    # Save a source table for checking schemas and byte cap
    service.save_sources(
        conn.id,
        [
            TableDetail(
                project_id="test-analytics-project",
                dataset_id="ecommerce",
                table_name="orders",
                table_type="TABLE",
                row_count=1500000,
                size_bytes=485000000,
                columns=[TableColumnInfo(name="order_id", data_type="STRING")],
            )
        ],
    )

    result = service.test_connection(conn.id, client_override=mock_bq_client)
    assert result.overall_status == "passed"
    assert len(result.checks) == 7

    check_ids = [c.id for c in result.checks]
    assert "key_format" in check_ids
    assert "auth" in check_ids
    assert "job_user" in check_ids
    assert "list_datasets" in check_ids
    assert "read_schemas" in check_ids
    assert "detect_location" in check_ids
    assert "byte_cap_check" in check_ids

    for c in result.checks:
        assert c.status == "passed"
        assert len(c.message) > 0


@pytest.mark.asyncio
async def test_bigquery_error_mappings() -> None:
    # 403 Job User permission
    err_job = Exception("403 Access Denied: User does not have bigquery.jobs.create permission")
    msg, fix = map_bigquery_error(
        err_job, project_id="billing-proj", client_email="sa@proj.iam.gserviceaccount.com"
    )
    assert "Job User" in fix or "Job User" in msg
    assert "billing-proj" in fix or "billing-proj" in msg

    # 403 Data Viewer permission
    err_data = Exception(
        "403 Forbidden: Access Denied: Table test:ecommerce.orders: Permission denied"
    )
    msg, fix = map_bigquery_error(
        err_data,
        project_id="data-proj",
        dataset_id="ecommerce",
        client_email="sa@proj.iam.gserviceaccount.com",
    )
    assert "Data Viewer" in fix or "Data Viewer" in msg
    assert "ecommerce" in fix or "ecommerce" in msg

    # API Disabled
    err_disabled = Exception(
        "403 Access Not Configured. BigQuery API has not been used in project 1234 "
        "before or it is disabled."
    )
    msg, fix = map_bigquery_error(err_disabled, project_id="disabled-proj")
    assert "disabled" in msg.lower()
    assert "Enable the BigQuery API" in fix

    # 404 Not Found
    err_404 = Exception("404 Not found: Dataset my-proj:missing_dataset was not found")
    msg, fix = map_bigquery_error(err_404, project_id="my-proj", dataset_id="missing_dataset")
    assert "not found" in msg.lower()
    assert "spelling" in fix.lower()

    # Byte cap exceeded
    err_bytes = Exception("Query exceeded bytes scanned limit")
    msg, fix = map_bigquery_error(err_bytes)
    assert "byte cap" in msg.lower()
    assert "MAX_BYTES_SCANNED_PER_QUERY" in fix


@pytest.mark.live
@pytest.mark.asyncio
async def test_live_bigquery_connection_opt_in() -> None:
    """
    Opt-in live BigQuery test against bigquery-public-data.thelook_ecommerce.
    Runs ONLY when WHENCE_LIVE_BQ_KEY_PATH is set in environment.
    Reports clearly whether the live test was run or skipped.
    """
    live_key_path = os.environ.get("WHENCE_LIVE_BQ_KEY_PATH")
    if not live_key_path or not os.path.exists(live_key_path):
        pytest.skip(
            "Live BigQuery test skipped: WHENCE_LIVE_BQ_KEY_PATH not set or file does not exist."
        )

    with open(live_key_path) as f:
        key_json = f.read()

    service = ConnectionService()
    conn = service.create_connection(
        ConnectionCreateRequest(
            name="Live BQ Public Data",
            warehouse_type="bigquery",
            key_json=key_json,
        )
    )

    # Browse bigquery-public-data
    datasets = service.list_datasets(conn.id, project_id="bigquery-public-data")
    assert any("thelook_ecommerce" in d["dataset_id"] for d in datasets)

    # Tables in thelook_ecommerce
    tables = service.list_tables(
        conn.id, project_id="bigquery-public-data", dataset_id="thelook_ecommerce"
    )
    table_names = [t["table_name"] for t in tables]
    assert "orders" in table_names

    # Table preview with zero query cost
    preview = service.preview_table(
        conn.id, "bigquery-public-data", "thelook_ecommerce", "orders", limit=5
    )
    assert preview.zero_query_cost is True
    assert len(preview.rows) > 0

    # Live connection test
    test_result = service.test_connection(conn.id)
    assert test_result.overall_status == "passed"


def test_save_sources_and_test_connection_regional_location(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verifies that selecting tables in a regional dataset updates connection location,
    and test_connection uses the detected location for dry-run query jobs."""
    db_file = str(tmp_path / "test_reg_loc.db")
    run_migrations(db_file)
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "DATABASE_URL", f"sqlite:///{db_file}")
    service = ConnectionService()

    conn = service.create_connection(
        ConnectionCreateRequest(
            name="Regional BQ",
            warehouse_type="bigquery",
            key_json=json.dumps(SAMPLE_SA_KEY),
            billing_project="primeval-pixel-407210",
        )
    )
    assert conn.location == "US"

    mock_client = MagicMock()
    mock_table = MagicMock()
    mock_table.location = "europe-west2"
    mock_table.table_type = "TABLE"
    mock_table.schema = [MagicMock()]
    mock_table.num_rows = 100
    mock_table.num_bytes = 1000
    mock_client.get_table.return_value = mock_table

    mock_ds = MagicMock()
    mock_ds.location = "europe-west2"
    mock_client.get_dataset.return_value = mock_ds
    mock_client.list_projects.return_value = [MagicMock(project_id="primeval-pixel-407210")]
    mock_client.list_datasets.return_value = [MagicMock(dataset_id="dbt_project")]

    job = MagicMock()
    job.total_bytes_processed = 10485760
    mock_client.query.return_value = job

    # Saving sources for a regional table must detect and store the location
    service.save_sources(
        conn.id,
        [
            TableDetail(
                project_id="primeval-pixel-407210",
                dataset_id="dbt_project",
                table_name="fct_orders",
                table_type="TABLE",
                row_count=1000,
                size_bytes=50000,
                columns=[],
            )
        ],
        client_override=mock_client,
    )

    updated_conn = service.get_connection(conn.id)
    assert updated_conn.location == "europe-west2"

    result = service.test_connection(conn.id, client_override=mock_client)
    assert result.overall_status == "passed"
    detect_check = next(c for c in result.checks if c.id == "detect_location")
    assert "europe-west2" in detect_check.message

    # client.query for dry-run in test_connection must receive location='europe-west2'
    calls = mock_client.query.call_args_list
    assert len(calls) > 0
    dry_run_call = calls[-1]
    assert dry_run_call.kwargs.get("location") == "europe-west2"


def test_semantic_service_adapter_self_heals_location_from_sources(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verifies that if a connection location was defaulted to 'US', SemanticService
    dynamically discovers the true dataset location from sources, heals the DB,
    and supplies the correct regional location to BigQueryAdapter."""
    db_file = str(tmp_path / "test_heal_loc.db")
    run_migrations(db_file)
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "DATABASE_URL", f"sqlite:///{db_file}")

    from app.connections.service import connection_service
    from app.semantic.service import semantic_service

    conn = connection_service.create_connection(
        ConnectionCreateRequest(
            name="Stale Location BQ",
            warehouse_type="bigquery",
            key_json=json.dumps(SAMPLE_SA_KEY),
            billing_project="primeval-pixel-407210",
        )
    )
    assert conn.location == "US"

    mock_client = MagicMock()
    mock_table = MagicMock()
    mock_table.location = "europe-west2"
    mock_client.get_table.return_value = mock_table

    service = ConnectionService()
    service.save_sources(
        conn.id,
        [
            TableDetail(
                project_id="primeval-pixel-407210",
                dataset_id="dbt_project",
                table_name="fct_orders",
                table_type="TABLE",
                row_count=1000,
                size_bytes=50000,
                columns=[],
            )
        ],
        client_override=mock_client,
    )

    # Artificially set connection location back to 'US' to simulate pre-existing broken connection
    db = service._get_db()
    db.execute("UPDATE connections SET location = 'US' WHERE id = ?", (conn.id,))
    db.commit()
    assert service.get_connection(conn.id).location == "US"

    monkeypatch.setattr(connection_service, "_get_bq_client", lambda *args, **kwargs: mock_client)

    adapter = semantic_service.get_adapter_for_connection(conn.id)
    assert adapter.location == "europe-west2"
    assert service.get_connection(conn.id).location == "europe-west2"


