import sqlite3
import tempfile
from pathlib import Path

from alembic.config import Config

from alembic import command
from app.db import run_migrations


def test_alembic_migrations_up_and_down() -> None:
    """Verifies that Alembic can apply all migrations forward and rollback cleanly."""
    with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
        db_path = tmp.name

    backend_dir = Path(__file__).resolve().parent.parent
    alembic_cfg = Config(str(backend_dir / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")

    # Upgrade to head
    command.upgrade(alembic_cfg, "head")

    # Verify tables exist
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = {row[0] for row in cur.fetchall()}
    conn.close()

    expected_tables = {
        "connections",
        "connection_sources",
        "models",
        "dimensions",
        "metrics",
        "metric_versions",
        "dashboards",
        "dashboard_charts",
        "alembic_version",
    }
    assert expected_tables.issubset(tables)

    # Verify user tables are dropped
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(metrics);")
    metric_cols = {row[1] for row in cur.fetchall()}
    assert "guided_config" in metric_cols

    cur.execute("PRAGMA table_info(dimensions);")
    dim_cols = {row[1] for row in cur.fetchall()}
    assert "is_custom" in dim_cols
    assert "expression" in dim_cols

    # Downgrade to base
    command.downgrade(alembic_cfg, "base")

    # Verify user tables are dropped
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    remaining_tables = {row[0] for row in cur.fetchall()}
    conn.close()

    assert not any(t in remaining_tables for t in expected_tables - {"alembic_version"})


def test_run_migrations_programmatic() -> None:
    """Verifies that run_migrations programmatically migrates a SQLite database."""
    with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
        db_path = tmp.name

    run_migrations(db_path)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = {row[0] for row in cur.fetchall()}
    conn.close()

    assert "dashboards" in tables
    assert "models" in tables
    assert "metrics" in tables
