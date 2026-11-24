import sqlite3
from pathlib import Path

from alembic.config import Config

from alembic import command
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


def run_migrations(db_path_or_url: str | None = None) -> None:
    """Programmatically runs Alembic migrations up to head."""
    backend_dir = Path(__file__).resolve().parent.parent
    alembic_ini_path = backend_dir / "alembic.ini"
    alembic_cfg = Config(str(alembic_ini_path))
    alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))

    if db_path_or_url is None:
        settings = get_settings()
        url = settings.DATABASE_URL
    elif "://" in db_path_or_url:
        url = db_path_or_url
    else:
        url = f"sqlite:///{db_path_or_url}"

    alembic_cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(alembic_cfg, "head")


def init_db(db_path: str | None = None) -> None:
    """Initializes tables for connections, models, and semantic sources via Alembic migrations."""
    run_migrations(db_path)


def get_connection_db() -> sqlite3.Connection:
    path = get_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn
