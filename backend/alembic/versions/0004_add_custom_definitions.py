"""add_custom_definitions

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-26 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    metric_cols = [col["name"] for col in inspector.get_columns("metrics")]
    if "guided_config" not in metric_cols:
        with op.batch_alter_table("metrics") as batch_op:
            batch_op.add_column(sa.Column("guided_config", sa.Text(), nullable=True))

    dim_cols = [col["name"] for col in inspector.get_columns("dimensions")]
    with op.batch_alter_table("dimensions") as batch_op:
        if "is_custom" not in dim_cols:
            batch_op.add_column(
                sa.Column("is_custom", sa.Integer(), server_default="0", nullable=True)
            )
        if "expression" not in dim_cols:
            batch_op.add_column(sa.Column("expression", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    metric_cols = [col["name"] for col in inspector.get_columns("metrics")]
    if "guided_config" in metric_cols:
        with op.batch_alter_table("metrics") as batch_op:
            batch_op.drop_column("guided_config")

    dim_cols = [col["name"] for col in inspector.get_columns("dimensions")]
    with op.batch_alter_table("dimensions") as batch_op:
        if "is_custom" in dim_cols:
            batch_op.drop_column("is_custom")
        if "expression" in dim_cols:
            batch_op.drop_column("expression")
