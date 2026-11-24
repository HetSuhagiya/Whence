from pydantic import BaseModel, Field

from app.compiler.spec import ChartSpec
from app.dashboards.models import SkippedChartNote
from app.semantic.models import DimensionPublic, MetricPublic, ModelPublic


class DashboardPlan(BaseModel):
    charts: list[ChartSpec] = Field(default_factory=list)
    skipped_charts: list[SkippedChartNote] = Field(default_factory=list)


def _format_metric_title(metric: MetricPublic) -> str:
    return metric.name.replace("_", " ").capitalize()


def _format_dimension_name(dim: DimensionPublic) -> str:
    return dim.name.replace("_", " ")


def _get_eligible_dimensions(model: ModelPublic) -> list[DimensionPublic]:
    # 1. Prefer categorical non-identifiers not excluded from explanation
    dims = [
        d
        for d in model.dimensions
        if d.dimension_type == "categorical"
        and not d.is_identifier
        and not d.exclude_from_explanation
    ]
    if not dims:
        # 2. Fallback to any categorical non-identifier
        dims = [
            d
            for d in model.dimensions
            if d.dimension_type == "categorical" and not d.is_identifier
        ]
    return dims


def _get_primary_metric(model: ModelPublic) -> MetricPublic | None:
    if not model.metrics:
        return None
    # 1. Additive with currency format
    for m in model.metrics:
        if m.metric_type == "additive" and m.display_format == "currency":
            return m
    # 2. Additive with decimal format
    for m in model.metrics:
        if m.metric_type == "additive" and m.display_format == "decimal":
            return m
    # 3. Any additive metric
    for m in model.metrics:
        if m.metric_type == "additive":
            return m
    # 4. Fallback to first metric
    return model.metrics[0]


def _get_ratio_metric(model: ModelPublic) -> MetricPublic | None:
    for m in model.metrics:
        if m.metric_type == "ratio":
            return m
    return None


def _get_count_metric(model: ModelPublic) -> MetricPublic | None:
    for m in model.metrics:
        if m.metric_type == "additive" and "count(" in m.numerator_expr.lower():
            return m
    for m in model.metrics:
        if m.metric_type == "additive" and m.display_format == "integer":
            return m
    return None


class DashboardPlanner:
    """Plans up to 5 deterministic dashboard charts dynamically from a semantic model.
    Unsupported charts are recorded in skipped_charts with clear plain notes."""

    @classmethod
    def plan(cls, model: ModelPublic) -> DashboardPlan:
        charts: list[ChartSpec] = []
        skipped_charts: list[SkippedChartNote] = []

        eligible_dims = _get_eligible_dimensions(model)
        primary_metric = _get_primary_metric(model)
        ratio_metric = _get_ratio_metric(model)
        count_metric = _get_count_metric(model)
        has_time_col = bool(model.primary_time_column)

        # 1. Primary metric over time (if time column + metric)
        if primary_metric and has_time_col:
            charts.append(
                ChartSpec(
                    model_id=model.id,
                    metric=primary_metric.name,
                    time_grain="day",
                    date_range="last_30_days",
                    chart_type="line",
                    title=f"{_format_metric_title(primary_metric)} over time",
                )
            )
        elif not primary_metric:
            skipped_charts.append(
                SkippedChartNote(
                    title="Primary metric over time",
                    reason="No metric defined on this model.",
                    suggestion="Add at least one metric to visualize performance over time.",
                )
            )
        else:
            skipped_charts.append(
                SkippedChartNote(
                    title=f"{_format_metric_title(primary_metric)} over time",
                    reason="No primary time column defined on this model.",
                    suggestion="Set a primary time column on the model to enable time-series analysis.",
                )
            )

        # 2. Primary metric by top eligible dimension (if dimension exists)
        if primary_metric and eligible_dims:
            top_dim = eligible_dims[0]
            charts.append(
                ChartSpec(
                    model_id=model.id,
                    metric=primary_metric.name,
                    dimensions=[top_dim.name],
                    date_range="last_30_days",
                    chart_type="bar",
                    title=f"{_format_metric_title(primary_metric)} by {_format_dimension_name(top_dim)}",
                    limit=10,
                )
            )
        elif not primary_metric:
            skipped_charts.append(
                SkippedChartNote(
                    title="Primary metric breakdown",
                    reason="No metric defined on this model.",
                    suggestion="Add a metric to enable dimensional breakdown charts.",
                )
            )
        else:
            skipped_charts.append(
                SkippedChartNote(
                    title=f"{_format_metric_title(primary_metric)} by dimension",
                    reason="No eligible categorical dimension on this model.",
                    suggestion="Add an eligible categorical dimension or join to a table that has it.",
                )
            )

        # 3. Primary metric by second eligible dimension (or count by top dimension)
        if primary_metric and len(eligible_dims) >= 2:
            second_dim = eligible_dims[1]
            charts.append(
                ChartSpec(
                    model_id=model.id,
                    metric=primary_metric.name,
                    dimensions=[second_dim.name],
                    date_range="last_30_days",
                    chart_type="bar",
                    title=f"{_format_metric_title(primary_metric)} by {_format_dimension_name(second_dim)}",
                    limit=10,
                )
            )
        elif (
            count_metric
            and eligible_dims
            and (primary_metric is None or count_metric.name != primary_metric.name)
        ):
            top_dim = eligible_dims[0]
            charts.append(
                ChartSpec(
                    model_id=model.id,
                    metric=count_metric.name,
                    dimensions=[top_dim.name],
                    date_range="last_30_days",
                    chart_type="bar",
                    title=f"{_format_metric_title(count_metric)} by {_format_dimension_name(top_dim)}",
                    limit=10,
                )
            )
        else:
            skipped_charts.append(
                SkippedChartNote(
                    title="Secondary dimensional breakdown",
                    reason="No eligible second dimension or distinct count metric available on this model.",
                    suggestion="Add another categorical dimension or join to a dimension table to compare segments.",
                )
            )

        # 4. Ratio metric over time (if ratio metric exists)
        if ratio_metric and has_time_col:
            charts.append(
                ChartSpec(
                    model_id=model.id,
                    metric=ratio_metric.name,
                    time_grain="day",
                    date_range="last_30_days",
                    chart_type="line",
                    title=f"{_format_metric_title(ratio_metric)} over time",
                )
            )
        elif not ratio_metric:
            skipped_charts.append(
                SkippedChartNote(
                    title="Ratio metric over time",
                    reason="No ratio metric defined on this model.",
                    suggestion="Define a ratio metric (such as conversion rate, average value, or margin percentage) to track efficiency over time.",
                )
            )
        else:
            skipped_charts.append(
                SkippedChartNote(
                    title=f"{_format_metric_title(ratio_metric)} over time",
                    reason="No primary time column defined on this model.",
                    suggestion="Set a primary time column on the model to enable ratio trend analysis.",
                )
            )

        # 5. Count / volume by top dimension
        if count_metric and eligible_dims:
            top_dim = eligible_dims[0]
            # Verify if (count_metric, top_dim) was already placed by chart 3
            already_charted = any(
                c.metric == count_metric.name and c.dimensions == [top_dim.name]
                for c in charts
            )
            if already_charted:
                if len(eligible_dims) >= 2:
                    second_dim = eligible_dims[1]
                    charts.append(
                        ChartSpec(
                            model_id=model.id,
                            metric=count_metric.name,
                            dimensions=[second_dim.name],
                            date_range="last_30_days",
                            chart_type="bar",
                            title=f"{_format_metric_title(count_metric)} by {_format_dimension_name(second_dim)}",
                            limit=10,
                        )
                    )
                else:
                    skipped_charts.append(
                        SkippedChartNote(
                            title=f"{_format_metric_title(count_metric)} by dimension",
                            reason="Volume breakdown by top dimension is already included on the dashboard.",
                            suggestion="Add another categorical dimension to display volume across multiple segments.",
                        )
                    )
            else:
                charts.append(
                    ChartSpec(
                        model_id=model.id,
                        metric=count_metric.name,
                        dimensions=[top_dim.name],
                        date_range="last_30_days",
                        chart_type="bar",
                        title=f"{_format_metric_title(count_metric)} by {_format_dimension_name(top_dim)}",
                        limit=10,
                    )
                )
        elif not count_metric:
            skipped_charts.append(
                SkippedChartNote(
                    title="Volume breakdown by dimension",
                    reason="No count or volume metric defined on this model.",
                    suggestion="Add a count metric (such as COUNT(*)) to track record volume across dimensions.",
                )
            )
        else:
            skipped_charts.append(
                SkippedChartNote(
                    title=f"{_format_metric_title(count_metric)} by dimension",
                    reason="No eligible categorical dimension on this model.",
                    suggestion="Add an eligible categorical dimension or join to a table that has it.",
                )
            )

        return DashboardPlan(charts=charts, skipped_charts=skipped_charts)
