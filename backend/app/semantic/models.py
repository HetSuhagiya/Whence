from typing import Literal

from pydantic import BaseModel, Field

DimensionType = Literal["categorical", "time", "numeric_bucket"]
MetricType = Literal["additive", "ratio"]
DisplayFormat = Literal["currency", "percent", "integer", "decimal"]


class ModelJoin(BaseModel):
    name: str = Field(..., description="Unique join alias / name, e.g. products, users")
    target_table: str = Field(..., description="Target table to join")
    left_on: str = Field(..., description="Foreign key on base table, e.g. product_id")
    right_on: str = Field(..., description="Primary key on target table, e.g. id")
    join_type: Literal["LEFT", "INNER"] = Field(
        default="LEFT",
        description="Join type. Many-to-one joins must not multiply rows; compiled as LEFT JOIN.",
    )
    relationship: Literal["many_to_one", "one_to_one"] = Field(
        default="many_to_one",
        description="Relationship cardinality. Must be many-to-one or one-to-one to guarantee zero row multiplication.",
    )
    description: str | None = None


class DimensionBase(BaseModel):
    name: str = Field(..., description="Unique dimension identifier, e.g. category, status")
    column_expression: str = Field(..., description="SQL expression or column name")
    dimension_type: DimensionType = Field(default="categorical")
    label: str | None = None
    is_identifier: bool = False
    exclude_from_explanation: bool = False


class DimensionCreate(DimensionBase):
    pass


class DimensionUpdate(BaseModel):
    label: str | None = None
    column_expression: str | None = None
    dimension_type: DimensionType | None = None
    is_identifier: bool | None = None
    exclude_from_explanation: bool | None = None


class DimensionPublic(DimensionBase):
    id: str
    model_id: str
    created_at: float
    updated_at: float


class MetricBase(BaseModel):
    name: str = Field(..., description="Metric identifier, e.g. revenue, orders, aov")
    description: str | None = Field(default=None)
    metric_type: MetricType = Field(default="additive")
    numerator_expr: str = Field(..., description="Numerator SQL expression, e.g. SUM(sale_price)")
    denominator_expr: str | None = Field(
        default=None,
        description="Denominator expression for ratio metrics, e.g. COUNT(DISTINCT order_id)",
    )
    fixed_filter: str | None = Field(
        default=None, description="Optional fixed WHERE filter, e.g. status = 'Complete'"
    )
    display_format: DisplayFormat = Field(default="currency")
    higher_is_better: bool = True


class MetricCreate(MetricBase):
    pass


class MetricUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    metric_type: MetricType | None = None
    numerator_expr: str | None = None
    denominator_expr: str | None = None
    fixed_filter: str | None = None
    display_format: DisplayFormat | None = None
    higher_is_better: bool | None = None


class MetricVersionPublic(BaseModel):
    id: str
    metric_id: str
    version: int
    numerator_expr: str
    denominator_expr: str | None = None
    fixed_filter: str | None = None
    display_format: DisplayFormat
    higher_is_better: bool
    created_at: float


class MetricPublic(MetricBase):
    id: str
    model_id: str
    version: int = 1
    created_at: float
    updated_at: float


class ModelBase(BaseModel):
    connection_id: str
    name: str
    project_id: str
    dataset_id: str
    table_name: str
    primary_time_column: str = Field(default="created_at")
    description: str | None = None
    joins: list[ModelJoin] = Field(default_factory=list)
    require_partition_filter: bool = False
    partition_column: str | None = None


class ModelCreate(ModelBase):
    dimensions: list[DimensionCreate] = Field(default_factory=list)
    metrics: list[MetricCreate] = Field(default_factory=list)


class ModelUpdate(BaseModel):
    name: str | None = None
    primary_time_column: str | None = None
    description: str | None = None


class ModelPublic(ModelBase):
    id: str
    dimensions: list[DimensionPublic] = Field(default_factory=list)
    metrics: list[MetricPublic] = Field(default_factory=list)
    created_at: float
    updated_at: float


class MetricValidateRequest(BaseModel):
    connection_id: str
    numerator_expr: str
    denominator_expr: str | None = None
    fixed_filter: str | None = None


class MetricValidateResponse(BaseModel):
    valid: bool
    formatted_sql: str
    error: str | None = None


class MetricPreviewPoint(BaseModel):
    date: str
    value: float


class MetricPreviewRequest(BaseModel):
    connection_id: str
    model_id: str
    metric_name_or_expr: str
    days: int = 30


class MetricPreviewResponse(BaseModel):
    metric_name: str
    display_format: DisplayFormat
    points: list[MetricPreviewPoint]
    total_value: float
    unit: str = ""


class AutoSuggestResponse(BaseModel):
    model_name: str
    primary_time_column: str
    dimensions: list[DimensionCreate]
    metrics: list[MetricCreate]


class DefaultEcommerceSetRequest(BaseModel):
    connection_id: str
    project_id: str | None = Field(default=None)
    dataset_id: str | None = Field(default=None)
    table_name: str | None = Field(default=None)
