from typing import Any, Literal

from pydantic import BaseModel, Field

ChartType = Literal["line", "bar", "stacked_bar", "area", "kpi", "table", "scatter"]
TimeGrain = Literal["day", "week", "month", "year"]


class FilterCondition(BaseModel):
    dimension: str
    operator: Literal["=", "!=", ">", "<", ">=", "<=", "in", "like"] = "="
    value: Any


class ChartSpec(BaseModel):
    model_id: str
    metric: str
    dimensions: list[str] = Field(default_factory=list)
    time_grain: TimeGrain | None = None
    date_range: str | dict[str, str] | None = Field(default="last_30_days")
    filters: list[FilterCondition] = Field(default_factory=list)
    chart_type: ChartType = Field(default="line")
    title: str = ""
    limit: int | None = None
    sort_direction: Literal["asc", "desc"] = "desc"


class CompiledQuery(BaseModel):
    sql: str
    dialect: str
    params: dict[str, Any] = Field(default_factory=dict)


class ChartExecutionResult(BaseModel):
    spec: ChartSpec
    columns: list[str]
    rows: list[dict[str, Any]]
    sql: str
    duration_ms: float
    bytes_scanned: int
    row_count: int
