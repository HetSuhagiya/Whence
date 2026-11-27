from collections.abc import Generator
from pathlib import Path

import pytest

from app.config import get_settings
from app.db import run_migrations


@pytest.fixture(autouse=True)
def isolate_test_database(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Generator[None, None, None]:
    """Ensures every pytest test runs in an isolated temporary SQLite database,
    preventing any test records from polluting the active dev database (whence_local.db)."""
    test_db = tmp_path / "pytest_isolated.db"
    run_migrations(str(test_db))
    monkeypatch.setattr(get_settings(), "DATABASE_URL", f"sqlite:///{test_db}")
    yield
