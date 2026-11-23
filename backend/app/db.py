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

    conn.commit()
    conn.close()


def get_connection_db() -> sqlite3.Connection:
    path = get_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn
