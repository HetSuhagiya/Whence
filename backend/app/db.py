import sqlite3
from pathlib import Path

from app.config import get_settings


def get_db_path() -> str:
    settings = get_settings()
    db_url = settings.DATABASE_URL
    if db_url.startswith("sqlite:///"):
        path = db_url.replace("sqlite:///", "")
        if path == ":memory:":
            return ":memory:"
        # Ensure parent directory exists
        db_path = Path(path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        return str(db_path)
    return "whence_local.db"


def init_db(db_path: str | None = None) -> None:
    """Initializes tables for connections, models, and semantic sources."""
    path = db_path or get_db_path()
    conn = sqlite3.connect(path)
    cur = conn.cursor()

    # Connections table: stores encrypted credentials and connection metadata
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS connections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            warehouse_type TEXT NOT NULL,
            encrypted_credentials TEXT,
            client_email TEXT,
            project_id TEXT,
            billing_project TEXT,
            location TEXT,
            selected_tables TEXT DEFAULT '[]',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        );
        """
    )

    # Sources / Tables metadata table (stores chosen tables for semantic layer)
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS connection_sources (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            project_id TEXT NOT NULL,
            dataset_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            table_type TEXT NOT NULL,
            row_count INTEGER DEFAULT 0,
            size_bytes INTEGER DEFAULT 0,
            partition_field TEXT,
            partition_type TEXT,
            require_partition_filter INTEGER DEFAULT 0,
            clustering_fields TEXT DEFAULT '[]',
            columns_schema TEXT NOT NULL,
            created_at REAL NOT NULL,
            FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
        );
        """
    )

    # Models table: points to a table/view, declares primary time column
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS models (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            name TEXT NOT NULL,
            project_id TEXT NOT NULL,
            dataset_id TEXT NOT NULL,
            table_name TEXT NOT NULL,
            primary_time_column TEXT NOT NULL,
            description TEXT,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
        );
        """
    )

    # Dimensions table: categorical, time, numeric bucket, with explanation exclusion toggle
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS dimensions (
            id TEXT PRIMARY KEY,
            model_id TEXT NOT NULL,
            name TEXT NOT NULL,
            column_expression TEXT NOT NULL,
            dimension_type TEXT NOT NULL,
            label TEXT,
            is_identifier INTEGER DEFAULT 0,
            exclude_from_explanation INTEGER DEFAULT 0,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
        );
        """
    )

    # Metrics table: additive and ratio metrics, formulas, display formats
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS metrics (
            id TEXT PRIMARY KEY,
            model_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            metric_type TEXT NOT NULL,
            numerator_expr TEXT NOT NULL,
            denominator_expr TEXT,
            fixed_filter TEXT,
            display_format TEXT NOT NULL,
            higher_is_better INTEGER DEFAULT 1,
            version INTEGER DEFAULT 1,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
        );
        """
    )

    # Metric Versions table: version history for audits & traceability
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS metric_versions (
            id TEXT PRIMARY KEY,
            metric_id TEXT NOT NULL,
            version INTEGER NOT NULL,
            numerator_expr TEXT NOT NULL,
            denominator_expr TEXT,
            fixed_filter TEXT,
            display_format TEXT NOT NULL,
            higher_is_better INTEGER NOT NULL,
            created_at REAL NOT NULL,
            FOREIGN KEY (metric_id) REFERENCES metrics(id) ON DELETE CASCADE
        );
        """
    )

    # Dashboards table: persistent dashboards linked to connection and semantic model
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS dashboards (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            connection_id TEXT NOT NULL,
            model_id TEXT NOT NULL,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE,
            FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
        );
        """
    )

    # Dashboard Charts table: chart cards and specs for each dashboard
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS dashboard_charts (
            id TEXT PRIMARY KEY,
            dashboard_id TEXT NOT NULL,
            title TEXT NOT NULL,
            chart_type TEXT NOT NULL,
            chart_spec TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL,
            FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
        );
        """
    )

    # Migrations for existing local databases
    for alter_sql in [
        "ALTER TABLE models ADD COLUMN joins TEXT DEFAULT '[]'",
        "ALTER TABLE models ADD COLUMN require_partition_filter INTEGER DEFAULT 0",
        "ALTER TABLE models ADD COLUMN partition_column TEXT",
    ]:
        try:
            cur.execute(alter_sql)
        except Exception:
            pass

    conn.commit()
    conn.close()


def get_connection_db() -> sqlite3.Connection:
    path = get_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn
