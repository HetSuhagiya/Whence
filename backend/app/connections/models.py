from typing import Any

from pydantic import BaseModel, Field


class ConnectionCreateRequest(BaseModel):
    name: str = Field(
        ..., min_length=1, max_length=100, description="Name for the warehouse connection"
    )
    warehouse_type: str = Field(default="bigquery", description="'bigquery' or 'duckdb'")
    key_json: str | None = Field(default=None, description="Raw service-account JSON key text")
    billing_project: str | None = Field(
        default=None, description="Project that will run queries and bear billing"
    )


class ConnectionUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    billing_project: str | None = None
    location: str | None = None


class ConnectionKeyUpdateRequest(BaseModel):
    key_json: str = Field(
        ..., min_length=1, description="Replacement service-account JSON key text"
    )


class TableColumnInfo(BaseModel):
    name: str
    data_type: str
    is_nullable: bool = True
    description: str | None = None


class TableDetail(BaseModel):
    project_id: str
    dataset_id: str
    table_name: str
    table_type: str = "TABLE"  # TABLE or VIEW
    row_count: int = 0
    size_bytes: int = 0
    formatted_size: str = "0 B"
    partition_field: str | None = None
    partition_type: str | None = None
    require_partition_filter: bool = False
    clustering_fields: list[str] = Field(default_factory=list)
    columns: list[TableColumnInfo] = Field(default_factory=list)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)


class TablePreviewResponse(BaseModel):
    project_id: str
    dataset_id: str
    table_name: str
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int
    zero_query_cost: bool = True


class SaveSourcesRequest(BaseModel):
    tables: list[TableDetail] = Field(
        ..., min_length=1, description="List of chosen tables to store as sources"
    )


class CheckItem(BaseModel):
    id: str
    title: str
    status: str = "passed"  # "passed", "failed", "skipped"
    message: str
    error_detail: str | None = None
    remediation: str | None = None


class ConnectionTestResult(BaseModel):
    connection_id: str
    overall_status: str  # "passed" or "failed"
    checks: list[CheckItem]


class ConnectionPublic(BaseModel):
    """
    Public connection summary.
    SECURITY CONTRACT: NEVER includes private_key, key_json, or encrypted_credentials.
    """

    id: str
    name: str
    warehouse_type: str
    client_email: str | None = None
    project_id: str | None = None
    billing_project: str | None = None
    location: str | None = None
    selected_tables_count: int = 0
    created_at: float
    updated_at: float


def format_table_size(size_bytes: int) -> str:
    val = float(size_bytes)
    for unit in ["B", "KB", "MB", "GB", "TB", "PB"]:
        if abs(val) < 1024.0:
            return f"{val:3.1f} {unit}"
        val /= 1024.0
    return f"{val:.1f} EB"


def map_bigquery_error(
    error: Exception,
    project_id: str | None = None,
    dataset_id: str | None = None,
    client_email: str | None = None,
) -> tuple[str, str]:
    """
    Maps Google Cloud BigQuery API exceptions to clear human-friendly explanations and remediations.
    Returns: (friendly_message, remediation_step)
    """
    err_str = str(error)
    err_lower = err_str.lower()
    email_str = client_email or "your service account"
    proj_str = project_id or "the query project"
    dataset_str = dataset_id or "the target dataset"

    # BigQuery API Disabled
    if (
        "disabled" in err_lower
        or "access not configured" in err_lower
        or "accessnotconfigured" in err_lower
        or "service_disabled" in err_lower
        or "has not used bigquery" in err_lower
    ):
        return (
            f"BigQuery API is disabled in project '{proj_str}'.",
            f"Enable the BigQuery API for project '{proj_str}' in Google Cloud Console: "
            f"https://console.cloud.google.com/apis/library/bigquery.googleapis.com?project={proj_str}",
        )

    # 403 Forbidden / Access Denied
    if "403" in err_str or "accessdenied" in err_lower or "permission" in err_lower:
        if "job" in err_lower:
            return (
                f"Permission denied creating query job in project '{proj_str}'.",
                f"Grant role 'BigQuery Job User' (roles/bigquery.jobUser) to {email_str} "
                f"on project '{proj_str}'.",
            )
        return (
            f"Permission denied accessing data in dataset '{dataset_str}'.",
            f"Grant role 'BigQuery Data Viewer' (roles/bigquery.dataViewer) to {email_str} "
            f"on dataset '{dataset_str}' in project '{proj_str}'.",
        )

    # 404 Not Found
    if "404" in err_str or "notfound" in err_lower or "does not exist" in err_lower:
        return (
            f"Resource not found: project '{proj_str}' or dataset '{dataset_str}' does not exist "
            "or location is mismatched.",
            "Verify the project ID and dataset name spelling, and verify the dataset location.",
        )

    # Byte cap exceeded
    if "bytes" in err_lower and "limit" in err_lower:
        return (
            "Query scan exceeds the configured byte cap limit.",
            "Narrow the time/partition filter or increase MAX_BYTES_SCANNED_PER_QUERY in Settings.",
        )

    # Generic
    return (
        f"BigQuery operation failed: {err_str[:200]}",
        "Check network access, GCP quotas, and service account key validity.",
    )
