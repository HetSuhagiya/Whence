from typing import Any, Literal

from pydantic import BaseModel, Field

ConfidenceLevel = Literal["High", "Medium", "Low"]
CheckStatus = Literal["pass", "fail", "warning"]


class PipelineCheckRecord(BaseModel):
    name: str
    status: CheckStatus
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class DriverContribution(BaseModel):
    id: str
    dimension: str
    segment_value: str
    current_value: float
    baseline_value: float
    contribution_amount: float
    share_of_change: float
    direction: Literal["positive", "negative"]
    rate_effect: float | None = None
    mix_effect: float | None = None
    row_count_current: int = 0
    row_count_baseline: int = 0
    low_support: bool = False
    sql: str = ""


class DrillFinding(BaseModel):
    id: str
    dimensions: list[str]
    segment_values: dict[str, str]
    current_value: float
    baseline_value: float
    contribution_amount: float
    share_of_change: float
    depth: int = 2
    row_count: int = 0
    sql: str = ""


class DataQualityIssue(BaseModel):
    id: str
    issue_type: Literal[
        "zero_drop",
        "null_spike",
        "appearance_from_nothing",
        "row_count_discontinuity",
        "duplicate_jump",
    ]
    dimension: str
    segment_value: str | None = None
    description: str
    severity: Literal["high", "medium", "low"] = "medium"


class ContextEvent(BaseModel):
    id: str
    title: str
    event_type: str
    start_time: str
    end_time: str | None = None
    correlation_note: str


class NoiseCheckResult(BaseModel):
    is_outside_normal_range: bool
    median_delta: float
    mad_delta: float
    z_score: float
    rank_summary: str
    history_periods_count: int


class SeasonalityResult(BaseModel):
    has_seasonality_pattern: bool
    seasonality_explains_change: bool
    note: str


class Evidence(BaseModel):
    id: str
    metric_name: str
    metric_type: Literal["additive", "ratio"]
    time_grain: str
    baseline_window: dict[str, str]
    current_window: dict[str, str]
    baseline_value: float
    current_value: float
    delta: float
    percent_change: float
    drivers: list[DriverContribution] = Field(default_factory=list)
    offsetting_effects: list[DriverContribution] = Field(default_factory=list)
    has_offsetting_effects: bool = False
    top_drill: DrillFinding | None = None
    checks_run: list[PipelineCheckRecord] = Field(default_factory=list)
    noise_check: NoiseCheckResult
    seasonality_check: SeasonalityResult
    data_quality_issues: list[DataQualityIssue] = Field(default_factory=list)
    context_events: list[ContextEvent] = Field(default_factory=list)
    confidence: ConfidenceLevel
    confidence_reason: str
    is_complete: bool = True
    warning_messages: list[str] = Field(default_factory=list)
