"""initial_schema

Revision ID: 0001
Revises:
Create Date: 2026-11-24 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy import inspect

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "connections" not in existing_tables:
        op.create_table(
            "connections",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("warehouse_type", sa.String(), nullable=False),
            sa.Column("encrypted_credentials", sa.String(), nullable=True),
            sa.Column("client_email", sa.String(), nullable=True),
            sa.Column("project_id", sa.String(), nullable=True),
            sa.Column("billing_project", sa.String(), nullable=True),
            sa.Column("location", sa.String(), nullable=True),
            sa.Column("selected_tables", sa.String(), server_default="[]", nullable=True),
            sa.Column("created_at", sa.Float(), nullable=False),
            sa.Column("updated_at", sa.Float(), nullable=False),
        )

    if "connection_sources" not in existing_tables:
        op.create_table(
            "connection_sources",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "connection_id",
                sa.String(),
                sa.ForeignKey("connections.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("project_id", sa.String(), nullable=False),
            sa.Column("dataset_id", sa.String(), nullable=False),
            sa.Column("table_name", sa.String(), nullable=False),
            sa.Column("table_type", sa.String(), nullable=False),
            sa.Column("row_count", sa.Integer(), server_default="0", nullable=True),
            sa.Column("size_bytes", sa.Integer(), server_default="0", nullable=True),
            sa.Column("partition_field", sa.String(), nullable=True),
            sa.Column("partition_type", sa.String(), nullable=True),
            sa.Column("require_partition_filter", sa.Integer(), server_default="0", nullable=True),
            sa.Column("clustering_fields", sa.String(), server_default="[]", nullable=True),
            sa.Column("columns_schema", sa.Text(), nullable=False),
            sa.Column("created_at", sa.Float(), nullable=False),
        )

    if "models" not in existing_tables:
        op.create_table(
            "models",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "connection_id",
                sa.String(),
                sa.ForeignKey("connections.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("project_id", sa.String(), nullable=False),
            sa.Column("dataset_id", sa.String(), nullable=False),
            sa.Column("table_name", sa.String(), nullable=False),
            sa.Column("primary_time_column", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("joins", sa.Text(), server_default="[]", nullable=True),
            sa.Column("require_partition_filter", sa.Integer(), server_default="0", nullable=True),
            sa.Column("partition_column", sa.String(), nullable=True),
            sa.Column("created_at", sa.Float(), nullable=False),
            sa.Column("updated_at", sa.Float(), nullable=False),
        )

    if "dimensions" not in existing_tables:
        op.create_table(
            "dimensions",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "model_id",
                sa.String(),
                sa.ForeignKey("models.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("column_expression", sa.String(), nullable=False),
            sa.Column("dimension_type", sa.String(), nullable=False),
            sa.Column("label", sa.String(), nullable=True),
            sa.Column("is_identifier", sa.Integer(), server_default="0", nullable=True),
            sa.Column("exclude_from_explanation", sa.Integer(), server_default="0", nullable=True),
            sa.Column("created_at", sa.Float(), nullable=False),
            sa.Column("updated_at", sa.Float(), nullable=False),
        )

    if "metrics" not in existing_tables:
        op.create_table(
            "metrics",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "model_id",
                sa.String(),
                sa.ForeignKey("models.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("metric_type", sa.String(), nullable=False),
            sa.Column("numerator_expr", sa.Text(), nullable=False),
            sa.Column("denominator_expr", sa.Text(), nullable=True),
            sa.Column("fixed_filter", sa.Text(), nullable=True),
            sa.Column("display_format", sa.String(), nullable=False),
            sa.Column("higher_is_better", sa.Integer(), server_default="1", nullable=True),
            sa.Column("version", sa.Integer(), server_default="1", nullable=True),
            sa.Column("created_at", sa.Float(), nullable=False),
            sa.Column("updated_at", sa.Float(), nullable=False),
        )

    if "metric_versions" not in existing_tables:
        op.create_table(
            "metric_versions",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "metric_id",
                sa.String(),
                sa.ForeignKey("metrics.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("version", sa.Integer(), nullable=False),
            sa.Column("numerator_expr", sa.Text(), nullable=False),
            sa.Column("denominator_expr", sa.Text(), nullable=True),
            sa.Column("fixed_filter", sa.Text(), nullable=True),
            sa.Column("display_format", sa.String(), nullable=False),
            sa.Column("higher_is_better", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.Float(), nullable=False),
        )

    if "dashboards" not in existing_tables:
        op.create_table(
            "dashboards",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column(
                "connection_id",
                sa.String(),
                sa.ForeignKey("connections.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "model_id",
                sa.String(),
                sa.ForeignKey("models.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("created_at", sa.Float(), nullable=False),
            sa.Column("updated_at", sa.Float(), nullable=False),
        )

    if "dashboard_charts" not in existing_tables:
        op.create_table(
            "dashboard_charts",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column(
                "dashboard_id",
                sa.String(),
                sa.ForeignKey("dashboards.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("chart_type", sa.String(), nullable=False),
            sa.Column("chart_spec", sa.Text(), nullable=False),
            sa.Column("position", sa.Integer(), server_default="0", nullable=False),
            sa.Column("created_at", sa.Float(), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    for table in [
        "dashboard_charts",
        "dashboards",
        "metric_versions",
        "metrics",
        "dimensions",
        "models",
        "connection_sources",
        "connections",
    ]:
        if table in existing_tables:
            op.drop_table(table)
