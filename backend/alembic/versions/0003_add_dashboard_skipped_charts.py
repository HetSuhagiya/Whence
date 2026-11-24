"""add_dashboard_skipped_charts

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-24 21:15:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = [col["name"] for col in inspector.get_columns("dashboards")]

    if "skipped_charts" not in existing_columns:
        op.add_column(
            "dashboards",
            sa.Column("skipped_charts", sa.Text(), server_default="[]", nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = [col["name"] for col in inspector.get_columns("dashboards")]

    if "skipped_charts" in existing_columns:
        op.drop_column("dashboards", "skipped_charts")
