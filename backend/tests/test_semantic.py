from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.adapters.base import QueryGuardrailError
from app.connections.models import ConnectionCreateRequest, TableColumnInfo, TableDetail
from app.connections.service import connection_service
from app.main import app
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
from app.semantic.service import MAX_CATEGORICAL_CARDINALITY, semantic_service


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


@pytest.mark.asyncio
async def test_discover_and_set_anchor_date_and_refresh_endpoint() -> None:
    conn = connection_service.create_connection(
        ConnectionCreateRequest(name="Anchor Endpoint Test", warehouse_type="duckdb")
    )
    model = semantic_service.seed_default_ecommerce_set(
        connection_id=conn.id,
        project_id="duckdb_local",
        dataset_id="main",
        table_name="thelook_ecommerce_orders",
    )
    # Initially discover_and_set_anchor_date should find MAX(created_at)
    updated_model = await semantic_service.discover_and_set_anchor_date(model.id)
    assert updated_model.anchor_date is not None

    # Test API endpoint POST /api/v1/semantic/models/{id}/refresh-anchor
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(f"/api/v1/semantic/models/{model.id}/refresh-anchor")
        assert res.status_code == 200
        data = res.json()
        assert data["anchor_date"] == updated_model.anchor_date


def test_auto_suggest_olist_fct_orders(test_connection_id: str) -> None:
    """
    Fixture a) Olist fct_orders:
    customer_state, customer_region, review_score, payment_installments,
    freight_total, payment_total, items_revenue, customer_id, order_id, ordered_at, delivered_at.
    """
    olist_columns = [
        TableColumnInfo(name="customer_state", data_type="VARCHAR"),
        TableColumnInfo(name="customer_region", data_type="VARCHAR"),
        TableColumnInfo(name="review_score", data_type="INTEGER"),
        TableColumnInfo(name="payment_installments", data_type="INTEGER"),
        TableColumnInfo(name="freight_total", data_type="FLOAT"),
        TableColumnInfo(name="payment_total", data_type="FLOAT"),
        TableColumnInfo(name="items_revenue", data_type="FLOAT"),
        TableColumnInfo(name="customer_id", data_type="VARCHAR"),
        TableColumnInfo(name="order_id", data_type="VARCHAR"),
        TableColumnInfo(name="ordered_at", data_type="TIMESTAMP"),
        TableColumnInfo(name="delivered_at", data_type="TIMESTAMP"),
    ]
    olist_table = TableDetail(
        project_id="olist_project",
        dataset_id="olist_dataset",
        table_name="fct_orders",
        columns=olist_columns,
    )
    connection_service.save_sources(test_connection_id, [olist_table])

    sample_rows = [
        {
            "customer_state": "SP",
            "customer_region": "Southeast",
            "review_score": 5,
            "payment_installments": 2,
            "freight_total": 12.50,
            "payment_total": 150.00,
            "items_revenue": 137.50,
            "customer_id": "cust_001",
            "order_id": "ord_001",
            "ordered_at": "2023-01-15 10:00:00",
            "delivered_at": "2023-01-18 14:00:00",
        },
        {
            "customer_state": "RJ",
            "customer_region": "Southeast",
            "review_score": 4,
            "payment_installments": 4,
            "freight_total": 18.00,
            "payment_total": 220.00,
            "items_revenue": 202.00,
            "customer_id": "cust_002",
            "order_id": "ord_002",
            "ordered_at": "2023-01-16 11:30:00",
            "delivered_at": "2023-01-20 16:00:00",
        },
    ]

    suggested = semantic_service.auto_suggest_for_table(
        test_connection_id, "fct_orders", sample_rows=sample_rows
    )

    # 1. Primary time column
    assert suggested.primary_time_column == "ordered_at"

    # 2. Small integer columns categorized as dimensions
    dim_map = {d.name: d for d in suggested.dimensions}
    assert "review_score" in dim_map
    assert "payment_installments" in dim_map
    assert dim_map["review_score"].dimension_type == "categorical"
    assert dim_map["review_score"].exclude_from_explanation is False
    assert dim_map["review_score"].is_identifier is False

    assert dim_map["payment_installments"].dimension_type == "categorical"
    assert dim_map["payment_installments"].exclude_from_explanation is False
    assert dim_map["payment_installments"].is_identifier is False

    # 3. Categorical breakdown dimensions
    assert dim_map["customer_state"].dimension_type == "categorical"
    assert dim_map["customer_state"].exclude_from_explanation is False
    assert dim_map["customer_region"].dimension_type == "categorical"
    assert dim_map["customer_region"].exclude_from_explanation is False

    # 4. Numeric measures become candidate metrics with SUM(col), NOT dimensions
    assert "freight_total" not in dim_map
    assert "payment_total" not in dim_map
    assert "items_revenue" not in dim_map

    metric_numerators = {m.numerator_expr for m in suggested.metrics}
    assert "SUM(freight_total)" in metric_numerators
    assert "SUM(payment_total)" in metric_numerators
    assert "SUM(items_revenue)" in metric_numerators

    # 5. IDs and timestamps are NEVER categorical breakdown dimensions
    assert dim_map["customer_id"].is_identifier is True
    assert dim_map["customer_id"].exclude_from_explanation is True

    assert dim_map["order_id"].is_identifier is True
    assert dim_map["order_id"].exclude_from_explanation is True

    if "delivered_at" in dim_map:
        assert dim_map["delivered_at"].dimension_type == "time"
        assert dim_map["delivered_at"].exclude_from_explanation is True
        assert dim_map["delivered_at"].dimension_type != "categorical"


def test_auto_suggest_thelook_ecommerce_fixtures(test_connection_id: str) -> None:
    """
    Fixture b) thelook_ecommerce (order_items, products, users).
    """
    # 1. order_items
    order_items_cols = [
        TableColumnInfo(name="id", data_type="BIGINT"),
        TableColumnInfo(name="order_id", data_type="BIGINT"),
        TableColumnInfo(name="user_id", data_type="BIGINT"),
        TableColumnInfo(name="product_id", data_type="BIGINT"),
        TableColumnInfo(name="status", data_type="VARCHAR"),
        TableColumnInfo(name="created_at", data_type="TIMESTAMP"),
        TableColumnInfo(name="shipped_at", data_type="TIMESTAMP"),
        TableColumnInfo(name="delivered_at", data_type="TIMESTAMP"),
        TableColumnInfo(name="returned_at", data_type="TIMESTAMP"),
        TableColumnInfo(name="sale_price", data_type="FLOAT"),
        TableColumnInfo(name="category", data_type="VARCHAR"),
    ]
    t_order_items = TableDetail(
        project_id="thelook",
        dataset_id="thelook_ecommerce",
        table_name="order_items",
        columns=order_items_cols,
    )

    # 2. products
    products_cols = [
        TableColumnInfo(name="id", data_type="BIGINT"),
        TableColumnInfo(name="cost", data_type="FLOAT"),
        TableColumnInfo(name="category", data_type="VARCHAR"),
        TableColumnInfo(name="name", data_type="VARCHAR"),
        TableColumnInfo(name="brand", data_type="VARCHAR"),
        TableColumnInfo(name="retail_price", data_type="FLOAT"),
        TableColumnInfo(name="department", data_type="VARCHAR"),
        TableColumnInfo(name="sku", data_type="VARCHAR"),
        TableColumnInfo(name="distribution_center_id", data_type="BIGINT"),
    ]
    t_products = TableDetail(
        project_id="thelook",
        dataset_id="thelook_ecommerce",
        table_name="products",
        columns=products_cols,
    )

    # 3. users
    users_cols = [
        TableColumnInfo(name="id", data_type="BIGINT"),
        TableColumnInfo(name="first_name", data_type="VARCHAR"),
        TableColumnInfo(name="last_name", data_type="VARCHAR"),
        TableColumnInfo(name="email", data_type="VARCHAR"),
        TableColumnInfo(name="age", data_type="INTEGER"),
        TableColumnInfo(name="gender", data_type="VARCHAR"),
        TableColumnInfo(name="state", data_type="VARCHAR"),
        TableColumnInfo(name="street_address", data_type="VARCHAR"),
        TableColumnInfo(name="postal_code", data_type="VARCHAR"),
        TableColumnInfo(name="city", data_type="VARCHAR"),
        TableColumnInfo(name="country", data_type="VARCHAR"),
        TableColumnInfo(name="latitude", data_type="FLOAT"),
        TableColumnInfo(name="longitude", data_type="FLOAT"),
        TableColumnInfo(name="traffic_source", data_type="VARCHAR"),
        TableColumnInfo(name="created_at", data_type="TIMESTAMP"),
    ]
    t_users = TableDetail(
        project_id="thelook",
        dataset_id="thelook_ecommerce",
        table_name="users",
        columns=users_cols,
    )

    connection_service.save_sources(test_connection_id, [t_order_items, t_products, t_users])

    # Test order_items
    res_oi = semantic_service.auto_suggest_for_table(test_connection_id, "order_items")
    assert res_oi.primary_time_column == "created_at"
    oi_dims = {d.name: d for d in res_oi.dimensions}
    # sale_price is a numeric measure -> NOT a dimension, candidate metric SUM(sale_price)
    assert "sale_price" not in oi_dims
    assert any("SUM(sale_price)" in m.numerator_expr for m in res_oi.metrics)
    # IDs are identifiers and excluded from explanation
    for id_col in ["id", "order_id", "user_id", "product_id"]:
        assert oi_dims[id_col].is_identifier is True
        assert oi_dims[id_col].exclude_from_explanation is True
    # status and category are categorical dimensions
    assert oi_dims["status"].dimension_type == "categorical"
    assert oi_dims["status"].exclude_from_explanation is False
    assert oi_dims["category"].dimension_type == "categorical"
    assert oi_dims["category"].exclude_from_explanation is False

    # Test products
    res_prod = semantic_service.auto_suggest_for_table(test_connection_id, "products")
    prod_dims = {d.name: d for d in res_prod.dimensions}
    # cost and retail_price are numeric measures
    assert "cost" not in prod_dims
    assert "retail_price" not in prod_dims
    prod_metrics = {m.numerator_expr for m in res_prod.metrics}
    assert "SUM(cost)" in prod_metrics
    assert "SUM(retail_price)" in prod_metrics
    # identifiers
    assert prod_dims["id"].is_identifier is True
    assert prod_dims["sku"].is_identifier is True
    assert prod_dims["distribution_center_id"].is_identifier is True

    # Test users
    res_users = semantic_service.auto_suggest_for_table(test_connection_id, "users")
    users_dims = {d.name: d for d in res_users.dimensions}
    assert users_dims["id"].is_identifier is True
    assert users_dims["email"].exclude_from_explanation is True
    assert users_dims["gender"].dimension_type == "categorical"
    assert users_dims["gender"].exclude_from_explanation is False
    assert users_dims["state"].dimension_type == "categorical"
    assert users_dims["state"].exclude_from_explanation is False
    assert users_dims["country"].dimension_type == "categorical"
    assert users_dims["country"].exclude_from_explanation is False
    assert users_dims["traffic_source"].dimension_type == "categorical"
    assert users_dims["traffic_source"].exclude_from_explanation is False


def test_auto_suggest_demo_ecommerce_live_duckdb(test_connection_id: str) -> None:
    """
    Fixture c) demo ecommerce data (thelook_ecommerce_orders from live DuckDB).
    """
    res = semantic_service.auto_suggest_for_table(test_connection_id, "thelook_ecommerce_orders")
    assert res.primary_time_column == "created_at"
    dim_map = {d.name: d for d in res.dimensions}

    # sale_price is a metric candidate, NOT a dimension
    assert "sale_price" not in dim_map
    assert any("SUM(sale_price)" in m.numerator_expr for m in res.metrics)

    # Key categorical dimensions
    for cat_col in ["category", "status", "traffic_source", "country", "state"]:
        assert cat_col in dim_map
        assert dim_map[cat_col].dimension_type == "categorical"
        assert dim_map[cat_col].exclude_from_explanation is False

    # Key identifier columns
    for id_col in ["order_id", "order_item_id", "user_id"]:
        if id_col in dim_map:
            assert dim_map[id_col].is_identifier is True
            assert dim_map[id_col].exclude_from_explanation is True


def test_auto_suggest_threshold_boundary_cardinality(test_connection_id: str) -> None:
    """
    Test threshold boundary: up to 50 distinct values in the free table-rows sample.
    - Exactly 50 distinct values -> categorical dimension (exclude_from_explanation=False).
    - 51 distinct values -> excluded from categorical breakdown (exclude_from_explanation=True).
    - Small integer columns -> categorized as dimensions.
    - Numeric measures -> candidate metrics with SUM(col), NOT dimensions.
    - IDs and timestamps -> NEVER categorical breakdown dimensions.
    """
    assert MAX_CATEGORICAL_CARDINALITY == 50
    sample_rows = []
    for i in range(60):
        sample_rows.append(
            {
                "id_col": f"ID_{i}",
                "dim_at_threshold_50": f"val_{i % 50}",  # exactly 50 distinct values
                "dim_exceeding_threshold_51": f"val_{i % 51}",  # 51 distinct values
                "review_score": (i % 5) + 1,  # 5 distinct values (small int)
                "continuous_measure": float(10.0 + i * 1.5),  # continuous numeric measure
                "ordered_at": f"2023-01-01 {i:02d}:00:00",
                "delivered_at": f"2023-01-05 {i:02d}:00:00",
            }
        )

    boundary_cols = [
        TableColumnInfo(name="id_col", data_type="VARCHAR"),
        TableColumnInfo(name="dim_at_threshold_50", data_type="VARCHAR"),
        TableColumnInfo(name="dim_exceeding_threshold_51", data_type="VARCHAR"),
        TableColumnInfo(name="review_score", data_type="INTEGER"),
        TableColumnInfo(name="continuous_measure", data_type="FLOAT"),
        TableColumnInfo(name="ordered_at", data_type="TIMESTAMP"),
        TableColumnInfo(name="delivered_at", data_type="TIMESTAMP"),
    ]
    t_boundary = TableDetail(
        project_id="boundary_proj",
        dataset_id="boundary_dataset",
        table_name="boundary_test_table",
        columns=boundary_cols,
    )
    connection_service.save_sources(test_connection_id, [t_boundary])

    suggested = semantic_service.auto_suggest_for_table(
        test_connection_id, "boundary_test_table", sample_rows=sample_rows
    )

    dim_map = {d.name: d for d in suggested.dimensions}

    # 1. Threshold 50: eligible for breakdown
    assert "dim_at_threshold_50" in dim_map
    assert dim_map["dim_at_threshold_50"].dimension_type == "categorical"
    assert dim_map["dim_at_threshold_50"].exclude_from_explanation is False

    # 2. Exceeding threshold 51: excluded from breakdown
    assert "dim_exceeding_threshold_51" in dim_map
    assert dim_map["dim_exceeding_threshold_51"].exclude_from_explanation is True

    # 3. Small integer column review_score: categorized as dimension
    assert "review_score" in dim_map
    assert dim_map["review_score"].dimension_type == "categorical"
    assert dim_map["review_score"].exclude_from_explanation is False
    assert dim_map["review_score"].is_identifier is False

    # 4. Continuous measure: candidate metric with SUM(col), NOT dimension
    assert "continuous_measure" not in dim_map
    assert any("SUM(continuous_measure)" in m.numerator_expr for m in suggested.metrics)

    # 5. ID and timestamps: NEVER categorical breakdown dimensions
    assert dim_map["id_col"].is_identifier is True
    assert dim_map["id_col"].exclude_from_explanation is True

    if "delivered_at" in dim_map:
        assert dim_map["delivered_at"].dimension_type == "time"
        assert dim_map["delivered_at"].exclude_from_explanation is True
        assert dim_map["delivered_at"].dimension_type != "categorical"


def test_auto_suggest_uses_free_sample_never_billed_scan(
    monkeypatch: pytest.MonkeyPatch, test_connection_id: str
) -> None:
    """
    Ensure auto_suggest_for_table uses free table-rows preview and never issues billed SQL query jobs.
    """
    preview_called = False

    def mock_preview_table(
        conn_id: str, project_id: str, dataset_id: str, table_name: str, limit: int = 10
    ) -> Any:
        nonlocal preview_called
        preview_called = True
        from app.connections.models import TablePreviewResponse

        return TablePreviewResponse(
            project_id=project_id,
            dataset_id=dataset_id,
            table_name=table_name,
            columns=["order_id", "status", "sale_price", "created_at"],
            rows=[
                {
                    "order_id": "1",
                    "status": "Complete",
                    "sale_price": "20.0",
                    "created_at": "2023-01-01",
                },
                {
                    "order_id": "2",
                    "status": "Pending",
                    "sale_price": "35.0",
                    "created_at": "2023-01-02",
                },
            ],
            row_count=2,
            zero_query_cost=True,
        )

    monkeypatch.setattr(connection_service, "preview_table", mock_preview_table)

    # Set up source without passing sample_rows
    t_detail = TableDetail(
        project_id="test_p",
        dataset_id="test_d",
        table_name="orders_free_test",
        columns=[
            TableColumnInfo(name="order_id", data_type="VARCHAR"),
            TableColumnInfo(name="status", data_type="VARCHAR"),
            TableColumnInfo(name="sale_price", data_type="FLOAT"),
            TableColumnInfo(name="created_at", data_type="TIMESTAMP"),
        ],
    )
    connection_service.save_sources(test_connection_id, [t_detail])

    suggested = semantic_service.auto_suggest_for_table(test_connection_id, "orders_free_test")
    assert preview_called is True
    assert suggested.primary_time_column == "created_at"
    dim_map = {d.name: d for d in suggested.dimensions}
    assert "sale_price" not in dim_map
    assert any("SUM(sale_price)" in m.numerator_expr for m in suggested.metrics)
