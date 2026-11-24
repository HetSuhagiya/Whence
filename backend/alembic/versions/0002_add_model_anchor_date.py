"""add_model_anchor_date

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-24 21:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = [col["name"] for col in inspector.get_columns("models")]

    if "anchor_date" not in existing_columns:
        op.add_column("models", sa.Column("anchor_date", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_columns = [col["name"] for col in inspector.get_columns("models")]

    if "anchor_date" in existing_columns:
        op.drop_column("models", "anchor_date")
