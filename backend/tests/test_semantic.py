import pytest

from app.adapters.base import QueryGuardrailError
from app.connections.models import ConnectionCreateRequest
from app.connections.service import connection_service
from app.semantic.models import (
    DimensionCreate,
    DimensionUpdate,
    MetricCreate,
    MetricPreviewRequest,
    MetricUpdate,
    MetricValidateRequest,
    ModelCreate,
    ModelUpdate,
)
from app.semantic.service import semantic_service


@pytest.fixture
def test_connection_id() -> str:
    conn = connection_service.create_connection(
        ConnectionCreateRequest(name="Semantic Test DuckDB", warehouse_type="duckdb")
    )
    return conn.id


def test_semantic_model_crud(test_connection_id: str) -> None:
    # 1. Create Model
    model = semantic_service.create_model(
        ModelCreate(
            connection_id=test_connection_id,
            name="Orders Model",
            project_id="duckdb_local",
            dataset_id="main",
            table_name="thelook_ecommerce_orders",
            primary_time_column="created_at",
            description="Ecommerce orders table",
            dimensions=[
                DimensionCreate(
                    name="category",
                    column_expression="category",
                    dimension_type="categorical",
                    label="Category",
                ),
                DimensionCreate(
                    name="order_id",
                    column_expression="order_id",
                    dimension_type="categorical",
                    label="Order ID",
                    is_identifier=True,
                    exclude_from_explanation=True,
                ),
            ],
            metrics=[
                MetricCreate(
                    name="revenue",
                    numerator_expr="SUM(sale_price)",
                    display_format="currency",
                    higher_is_better=True,
                )
            ],
        )
    )

    assert model.name == "Orders Model"
    assert len(model.dimensions) == 2
    assert len(model.metrics) == 1
    assert model.dimensions[1].exclude_from_explanation is True

    # 2. Get Model
    fetched = semantic_service.get_model(model.id)
    assert fetched.id == model.id
    assert fetched.primary_time_column == "created_at"

    # 3. Update Model
    updated = semantic_service.update_model(
        model.id, ModelUpdate(name="Renamed Orders Model", description="Updated description")
    )
    assert updated.name == "Renamed Orders Model"
    assert updated.description == "Updated description"

    # 4. List Models
    models = semantic_service.list_models(test_connection_id)
    assert any(m.id == model.id for m in models)


def test_dimension_crud_and_explanation_toggle(test_connection_id: str) -> None:
    model = semantic_service.create_model(
        ModelCreate(
            connection_id=test_connection_id,
            name="Dim Test Model",
            project_id="duckdb_local",
            dataset_id="main",
            table_name="thelook_ecommerce_orders",
            primary_time_column="created_at",
        )
    )

    # Create dimension
    dim = semantic_service.create_dimension(
        model.id,
        DimensionCreate(
            name="traffic_source",
            column_expression="traffic_source",
            dimension_type="categorical",
            label="Channel",
            exclude_from_explanation=False,
        ),
    )
    assert dim.name == "traffic_source"
    assert dim.exclude_from_explanation is False

    # Toggle exclude_from_explanation
    updated_dim = semantic_service.update_dimension(
        dim.id, DimensionUpdate(exclude_from_explanation=True, label="Acquisition Channel")
    )
    assert updated_dim.exclude_from_explanation is True
    assert updated_dim.label == "Acquisition Channel"

    # Delete dimension
    semantic_service.delete_dimension(dim.id)
    with pytest.raises(KeyError):
        semantic_service.get_dimension(dim.id)


def test_metric_crud_and_versioning(test_connection_id: str) -> None:
    model = semantic_service.create_model(
        ModelCreate(
            connection_id=test_connection_id,
            name="Metric Test Model",
            project_id="duckdb_local",
            dataset_id="main",
            table_name="thelook_ecommerce_orders",
            primary_time_column="created_at",
        )
    )

    # 1. Additive Metric
    rev = semantic_service.create_metric(
        model.id,
        MetricCreate(
            name="revenue",
            description="Gross revenue",
            metric_type="additive",
            numerator_expr="SUM(sale_price)",
            display_format="currency",
            higher_is_better=True,
        ),
    )
    assert rev.version == 1

    # 2. Ratio Metric (e.g. AOV)
    aov = semantic_service.create_metric(
        model.id,
        MetricCreate(
            name="aov",
            description="Average Order Value",
            metric_type="ratio",
            numerator_expr="SUM(sale_price)",
            denominator_expr="COUNT(DISTINCT order_id)",
            display_format="currency",
            higher_is_better=True,
        ),
    )
    assert aov.version == 1
    assert aov.denominator_expr == "COUNT(DISTINCT order_id)"

    # 3. Update Metric and verify version history
    updated_rev = semantic_service.update_metric(
        rev.id,
        MetricUpdate(
            description="Net revenue with filter",
            fixed_filter="status = 'Complete'",
        ),
    )
    assert updated_rev.version == 2
    assert updated_rev.fixed_filter == "status = 'Complete'"

    versions = semantic_service.list_metric_versions(rev.id)
    assert len(versions) == 2
    assert versions[0].version == 2
    assert versions[1].version == 1

    # 4. Reject invalid metric formula (SQL guardrail integration)
    with pytest.raises(QueryGuardrailError):
        semantic_service.create_metric(
            model.id,
            MetricCreate(
                name="injected_metric",
                numerator_expr="SUM(sale_price); DROP TABLE users",
            ),
        )


def test_metric_formula_validation(test_connection_id: str) -> None:
    # Valid
    val = semantic_service.validate_metric_formula(
        MetricValidateRequest(
            connection_id=test_connection_id,
            numerator_expr="SUM(sale_price)",
            denominator_expr="COUNT(DISTINCT order_id)",
        )
    )
    assert val.valid is True
    assert "SUM(sale_price)" in val.formatted_sql

    # Invalid (mutating keyword)
    bad = semantic_service.validate_metric_formula(
        MetricValidateRequest(
            connection_id=test_connection_id,
            numerator_expr="SUM(sale_price); DROP TABLE orders",
        )
    )
    assert bad.valid is False
    assert bad.error is not None


@pytest.mark.asyncio
async def test_metric_preview_trend(test_connection_id: str) -> None:
    model = semantic_service.seed_default_ecommerce_set(
        connection_id=test_connection_id,
        project_id="duckdb_local",
        dataset_id="main",
        table_name="thelook_ecommerce_orders",
    )

    preview = await semantic_service.preview_metric_trend(
        MetricPreviewRequest(
            connection_id=test_connection_id,
            model_id=model.id,
            metric_name_or_expr="revenue",
            days=30,
        )
    )
    assert preview.metric_name == "revenue"
    assert preview.display_format == "currency"
    assert len(preview.points) > 0
    assert preview.total_value > 0.0


def test_seed_default_ecommerce_set(test_connection_id: str) -> None:
    model = semantic_service.seed_default_ecommerce_set(
        connection_id=test_connection_id,
        project_id="duckdb_local",
        dataset_id="main",
        table_name="thelook_ecommerce_orders",
    )
    assert model.name == "TheLook Ecommerce Orders"
    dim_names = {d.name for d in model.dimensions}
    metric_names = {m.name for m in model.metrics}

    # Verify standard ecommerce dimensions
    assert {"category", "status", "traffic_source", "country", "state", "order_id"}.issubset(
        dim_names
    )
    # Verify standard ecommerce metrics
    assert {"revenue", "orders", "items_sold", "aov", "items_per_order"}.issubset(metric_names)

    # Verify order_id is flagged as identifier and excluded from explanation
    order_id_dim = next(d for d in model.dimensions if d.name == "order_id")
    assert order_id_dim.is_identifier is True
    assert order_id_dim.exclude_from_explanation is True
