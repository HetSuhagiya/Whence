from typing import Any, Literal

from pydantic import BaseModel, Field

from app.compiler.spec import ChartSpec


class DashboardCreate(BaseModel):
    connection_id: str
    name: str | None = None


class SkippedChartNote(BaseModel):
    title: str
    reason: str
    suggestion: str


class DashboardChartCreate(BaseModel):
    title: str | None = None
    chart_type: str = "line"
    metric: str
    breakdown_dimension: str | None = None
    time_grain: str | None = None
    date_range: str | dict[str, str] | None = "last_30_days"
    chart_spec: ChartSpec | None = None


class DashboardChartPublic(BaseModel):
    id: str
    dashboard_id: str
    title: str
    chart_type: str
    chart_spec: ChartSpec
    position: int = 0
    created_at: float


class DashboardPublic(BaseModel):
    id: str
    name: str
    connection_id: str
    connection_name: str
    warehouse_type: str
    model_id: str
    model_name: str | None = None
    model_description: str | None = None
    primary_time_column: str | None = None
    charts: list[DashboardChartPublic] = Field(default_factory=list)
    skipped_charts: list[SkippedChartNote] = Field(default_factory=list)
    created_at: float
    updated_at: float


class ChartRunRequest(BaseModel):
    date_range: str | dict[str, str] | None = None
    start_date: str | None = None
    end_date: str | None = None
    filters: list[dict[str, Any]] | None = None


class ExplainRequest(BaseModel):
    target_point: str | None = None
    baseline_mode: Literal[
        "previous_period",
        "same_weekday_last_week",
        "same_period_last_year",
        "trailing_average",
    ] = "previous_period"
    date_range: str | dict[str, str] | None = None
    start_date: str | None = None
    end_date: str | None = None
