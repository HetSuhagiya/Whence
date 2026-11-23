import uuid
from typing import Any, Literal

from app.explain.contribution import (
    compute_additive_contributions,
    compute_ratio_rate_mix_split,
)
from app.explain.models import (
    CheckStatus,
    ConfidenceLevel,
    ContextEvent,
    DataQualityIssue,
    DrillFinding,
    DriverContribution,
    Evidence,
    NoiseCheckResult,
    PipelineCheckRecord,
    SeasonalityResult,
)


def step_resolve(
    metric_name: str,
    metric_type: Literal["additive", "ratio"],
    time_grain: str,
    current_start: str,
    current_end: str,
    baseline_start: str,
    baseline_end: str,
) -> tuple[dict[str, str], dict[str, str], PipelineCheckRecord]:
    """Step 1: Resolve metric, time grain, and windows aligned by weekday where daily."""
    current_window = {"start": current_start, "end": current_end}
    baseline_window = {"start": baseline_start, "end": baseline_end}

    check = PipelineCheckRecord(
        name="resolve",
        status="pass",
        message=f"Resolved {metric_name} ({metric_type}) across {time_grain} windows.",
        details={"current": current_window, "baseline": baseline_window},
    )
    return current_window, baseline_window, check


def step_completeness_check(
    is_partial: bool,
    reason: str | None = None,
) -> tuple[bool, PipelineCheckRecord]:
    """Step 2: Flag partial current periods (today, missing hours/days, late-arriving data)."""
    if is_partial:
        check = PipelineCheckRecord(
            name="completeness",
            status="warning",
            message=reason or "Current period is incomplete. Comparing like with like or flagging partial data.",
            details={"is_complete": False},
        )
        return False, check

    check = PipelineCheckRecord(
        name="completeness",
        status="pass",
        message="Window data is complete and comparable.",
        details={"is_complete": True},
    )
    return True, check


def step_size_and_noise_check(
    current_delta: float,
    history_deltas: list[float],
    num_dimensions_searched: int = 1,
) -> tuple[NoiseCheckResult, PipelineCheckRecord]:
    """
    Step 3: Size and noise check using median and MAD (Median Absolute Deviation).
    Compares current change with the last 8 to 26 comparable periods.
    Includes Bonferroni multiplicity correction across candidate dimensions.
    Generates plain-language comparison string, e.g. 'larger than 24 of the last 26 weekly changes'.
    """
    n = len(history_deltas)
    if n < 3:
        # Insufficient history
        res = NoiseCheckResult(
            is_outside_normal_range=True,
            median_delta=round(current_delta, 4),
            mad_delta=0.0,
            z_score=2.0,
            rank_summary=f"Insufficient history ({n} periods available).",
            history_periods_count=n,
        )
        check = PipelineCheckRecord(
            name="size_and_noise",
            status="warning",
            message="Insufficient history to establish median/MAD baseline (< 8 periods).",
            details=res.model_dump(),
        )
        return res, check

    sorted_deltas = sorted(history_deltas)
    mid = n // 2
    if n % 2 == 1:
        median_val = sorted_deltas[mid]
    else:
        median_val = (sorted_deltas[mid - 1] + sorted_deltas[mid]) / 2.0

    # MAD = median(|x_i - median|)
    abs_deviations = sorted(abs(x - median_val) for x in history_deltas)
    if n % 2 == 1:
        mad = abs_deviations[mid]
    else:
        mad = (abs_deviations[mid - 1] + abs_deviations[mid]) / 2.0

    # Robust z-score using 1.4826 scale factor for normal consistency
    if mad > 1e-9:
        z_score = abs(current_delta - median_val) / (1.4826 * mad)
    else:
        z_score = 0.0 if abs(current_delta - median_val) < 1e-9 else 3.0

    # Rank count: how many historical absolute deltas are strictly smaller than current absolute delta
    smaller_count = sum(1 for d in history_deltas if abs(d) < abs(current_delta))
    rank_summary = f"larger than {smaller_count} of the last {n} comparable period changes"

    # Multiplicity correction: Bonferroni-adjusted critical z across dimensions
    num_dims = max(1, num_dimensions_searched)
    if num_dims == 1:
        z_crit = 1.96
    elif num_dims == 2:
        z_crit = 2.24
    elif num_dims == 3:
        z_crit = 2.39
    elif num_dims == 4:
        z_crit = 2.50
    else:
        z_crit = 2.58

    is_outside = (z_score >= z_crit) and (n < 8 or smaller_count >= int(0.90 * n))

    res = NoiseCheckResult(
        is_outside_normal_range=is_outside,
        median_delta=round(median_val, 4),
        mad_delta=round(mad, 4),
        z_score=round(z_score, 2),
        rank_summary=rank_summary,
        history_periods_count=n,
    )
    check = PipelineCheckRecord(
        name="size_and_noise",
        status="pass" if is_outside else "warning",
        message=(
            f"Change is outside normal range ({rank_summary}, z={z_score:.2f})."
            if is_outside
            else f"Change is within normal volatility ({rank_summary}, z={z_score:.2f})."
        ),
        details=res.model_dump(),
    )
    return res, check


def step_seasonality_check(
    is_same_weekday: bool = True,
    weekday_effect_share: float = 0.0,
) -> tuple[SeasonalityResult, PipelineCheckRecord]:
    """Step 4: Check weekday and seasonal patterns. If baseline choice explains change, flag it."""
    explains = weekday_effect_share >= 0.75
    has_pattern = weekday_effect_share >= 0.40

    if explains:
        note = "Baseline weekday pattern accounts for the majority of observed movement."
    elif has_pattern:
        note = "Moderate weekday seasonality present, but does not fully explain movement."
    else:
        note = "Movement is not explained by routine weekday or seasonal cycles."

    res = SeasonalityResult(
        has_seasonality_pattern=has_pattern,
        seasonality_explains_change=explains,
        note=note,
    )
    check = PipelineCheckRecord(
        name="seasonality",
        status="warning" if explains else "pass",
        message=note,
        details=res.model_dump(),
    )
    return res, check


def step_driver_search(
    metric_type: Literal["additive", "ratio"],
    dimension_data: dict[str, dict[str, Any]],
    min_rows: int = 20,
    dimension_summaries: dict[str, dict[str, Any]] | None = None,
) -> tuple[list[DriverContribution], list[DriverContribution], bool, PipelineCheckRecord]:
    """
    Step 5: Driver search across all eligible dimensions.
    Computes segment contributions, ranks by impact, and isolates offsetting effects.
    Bars dimensions corrupted by null spikes from blaming real segments (per N5).
    """
    all_drivers: list[DriverContribution] = []
    all_offsetting: list[DriverContribution] = []
    any_offsetting = False

    for dim_name, ddata in dimension_data.items():
        # If dimension experienced a severe null spike, exclude its segments from being blamed (per N5)
        if dimension_summaries:
            s = dimension_summaries.get(dim_name, {})
            null_increase = s.get("current_null_pct", 0.0) - s.get("baseline_null_pct", 0.0)
            if null_increase > 0.15:
                continue
        if metric_type == "additive":
            contribs, offsets, has_off = compute_additive_contributions(
                baseline_segments=ddata.get("baseline_values", {}),
                current_segments=ddata.get("current_values", {}),
                baseline_counts=ddata.get("baseline_counts"),
                current_counts=ddata.get("current_counts"),
                dimension_name=dim_name,
                min_rows=min_rows,
            )
        else:
            contribs, offsets, has_off = compute_ratio_rate_mix_split(
                baseline_num=ddata.get("baseline_num", {}),
                baseline_den=ddata.get("baseline_den", {}),
                current_num=ddata.get("current_num", {}),
                current_den=ddata.get("current_den", {}),
                baseline_counts=ddata.get("baseline_counts"),
                current_counts=ddata.get("current_counts"),
                dimension_name=dim_name,
                min_rows=min_rows,
            )

        all_drivers.extend(contribs)
        all_offsetting.extend(offsets)
        if has_off:
            any_offsetting = True

    # Global ranking by absolute impact
    all_drivers.sort(key=lambda c: abs(c.contribution_amount), reverse=True)
    all_offsetting.sort(key=lambda c: abs(c.contribution_amount), reverse=True)

    check = PipelineCheckRecord(
        name="driver_search",
        status="pass" if all_drivers else "warning",
        message=f"Evaluated {len(dimension_data)} dimensions; found {len(all_drivers)} segment drivers.",
        details={"dimensions_evaluated": list(dimension_data.keys()), "has_offsetting": any_offsetting},
    )
    return all_drivers, all_offsetting, any_offsetting, check


def step_two_way_drill(
    two_way_data: dict[tuple[str, str], dict[str, Any]] | None,
    total_delta: float,
    min_rows: int = 20,
    target_share: float = 0.60,
) -> tuple[DrillFinding | None, PipelineCheckRecord]:
    """
    Step 6: Greedy search over two-way combinations of top dimensions to find
    the smallest segment explaining at least target_share (default 60%) of the change.
    """
    if not two_way_data or abs(total_delta) < 1e-9:
        check = PipelineCheckRecord(
            name="two_way_drill",
            status="pass",
            message="No two-way drill required or data unavailable.",
        )
        return None, check

    best_finding: DrillFinding | None = None

    for (dim_a, dim_b), grid in two_way_data.items():
        # grid contains cross-segments: key=(val_a, val_b)
        base_vals = grid.get("baseline", {})
        curr_vals = grid.get("current", {})
        counts = grid.get("counts", {})

        for combo_key, curr_val in curr_vals.items():
            base_val = base_vals.get(combo_key, 0.0)
            delta = curr_val - base_val
            share = delta / total_delta
            curr_cnt = counts.get(combo_key, 0)
            base_cnt = int(base_val)

            if max(curr_cnt, base_cnt) >= min_rows and share >= target_share:
                val_a, val_b = combo_key if isinstance(combo_key, tuple) else (str(combo_key), "")
                finding = DrillFinding(
                    id=str(uuid.uuid4()),
                    dimensions=[dim_a, dim_b],
                    segment_values={dim_a: str(val_a), dim_b: str(val_b)},
                    current_value=round(curr_val, 4),
                    baseline_value=round(base_val, 4),
                    contribution_amount=round(delta, 4),
                    share_of_change=round(share, 4),
                    depth=2,
                    row_count=max(curr_cnt, base_cnt),
                )
                if best_finding is None or abs(finding.share_of_change) > abs(best_finding.share_of_change):
                    best_finding = finding

    if best_finding:
        check = PipelineCheckRecord(
            name="two_way_drill",
            status="pass",
            message=f"Two-way drill found segment {best_finding.segment_values} explaining {best_finding.share_of_change * 100:.1f}% of change.",
            details=best_finding.model_dump(),
        )
    else:
        check = PipelineCheckRecord(
            name="two_way_drill",
            status="pass",
            message="No two-way segment reached the 60% concentration threshold.",
        )

    return best_finding, check


def step_data_quality_scan(
    drivers: list[DriverContribution],
    dimension_summaries: dict[str, dict[str, Any]] | None = None,
) -> tuple[list[DataQualityIssue], PipelineCheckRecord]:
    """
    Step 7: Data quality scan.
    Flags segments that fell to zero or appeared from nothing, null spikes, and duplicate-row jumps.
    """
    issues: list[DataQualityIssue] = []

    # 1. Check for zero drops (fell to 0 from significant volume)
    for d in drivers:
        if d.baseline_value > 0 and d.current_value == 0 and d.row_count_baseline >= 30:
            issues.append(
                DataQualityIssue(
                    id=str(uuid.uuid4()),
                    issue_type="zero_drop",
                    dimension=d.dimension,
                    segment_value=d.segment_value,
                    description=f"Segment '{d.segment_value}' dropped to 0 from baseline of {d.baseline_value} (possible tracking or pipeline break).",
                    severity="high",
                )
            )
        elif d.baseline_value == 0 and d.current_value > 0 and d.row_count_current >= 30:
            issues.append(
                DataQualityIssue(
                    id=str(uuid.uuid4()),
                    issue_type="appearance_from_nothing",
                    dimension=d.dimension,
                    segment_value=d.segment_value,
                    description=f"Segment '{d.segment_value}' appeared from 0 to {d.current_value} in current period.",
                    severity="medium",
                )
            )

    # 2. Check null spikes from dimension summaries
    if dimension_summaries:
        for dim, s in dimension_summaries.items():
            if dim in ("_meta", "all"):
                continue
            base_null_pct = s.get("baseline_null_pct", 0.0)
            curr_null_pct = s.get("current_null_pct", 0.0)
            if curr_null_pct - base_null_pct > 0.15:
                issues.append(
                    DataQualityIssue(
                        id=str(uuid.uuid4()),
                        issue_type="null_spike",
                        dimension=dim,
                        description=f"Null values in dimension '{dim}' spiked from {base_null_pct * 100:.1f}% to {curr_null_pct * 100:.1f}%.",
                        severity="high",
                    )
                )

        if dimension_summaries.get("_meta", {}).get("is_duplicate_load") or dimension_summaries.get("all", {}).get("duplicate_jump"):
            issues.append(
                DataQualityIssue(
                    id=str(uuid.uuid4()),
                    issue_type="duplicate_jump",
                    dimension="all",
                    description="Duplicate load detected: all rows for one period were loaded twice.",
                    severity="high",
                )
            )

    status: CheckStatus = "fail" if any(i.severity == "high" for i in issues) else ("warning" if issues else "pass")
    check = PipelineCheckRecord(
        name="data_quality_scan",
        status=status,
        message=f"Scan complete: {len(issues)} data quality issue(s) detected.",
        details={"issues_count": len(issues)},
    )
    return issues, check


def step_context_events(
    events: list[ContextEvent],
    current_window: dict[str, str],
) -> tuple[list[ContextEvent], PipelineCheckRecord]:
    """Step 8: Correlate overlapping context events with the change window."""
    overlapping: list[ContextEvent] = []
    c_start = current_window.get("start", "")
    c_end = current_window.get("end", "")

    for ev in events:
        if ev.start_time <= c_end and (ev.end_time is None or ev.end_time >= c_start):
            overlapping.append(ev)

    check = PipelineCheckRecord(
        name="context_events",
        status="pass",
        message=f"Found {len(overlapping)} overlapping business event(s).",
        details={"events": [e.title for e in overlapping]},
    )
    return overlapping, check


def step_compute_confidence(
    top_driver: DriverContribution | None,
    top_3_drivers: list[DriverContribution],
    top_drill: DrillFinding | None,
    noise_result: NoiseCheckResult,
    is_complete: bool,
    dq_issues: list[DataQualityIssue],
    has_offsetting: bool,
    seasonality_result: SeasonalityResult | None = None,
    is_broad_based: bool = False,
) -> tuple[ConfidenceLevel, str]:
    """
    Step 9: Confidence assessment per Section 8.2 & 8.3:
    High: One driver or drill segment explains >= 50% (drill >= 60%),
          change is outside normal range (z >= z_crit), data complete, segments exceed minimum size.
    Medium: Top 3 drivers explain >= 60%, or one condition above fails.
    Low: Anything else, partial data, change within normal volatility, low support segment,
         broad-based decline, seasonality explains change, or severe data quality issues.
    """
    # Low triggers
    if not is_complete:
        return "Low", "Data is incomplete or contains partial time periods."

    if any(i.severity == "high" for i in dq_issues):
        return "Low", "Severe data quality issue (e.g. tracking zero drop, null spike, or duplicate load) dominates movement."

    if is_broad_based:
        return "Low", "Decline is broad-based across all categories and channels; no single driver accounts for the movement."

    if seasonality_result and seasonality_result.seasonality_explains_change:
        return "Low", "Movement is accounted for by routine weekday or seasonal cycles; no anomalous cause found."

    if not noise_result.is_outside_normal_range:
        return "Low", "Change is within normal historical volatility; no single cause stands out."

    if top_driver and top_driver.low_support:
        return "Low", f"Top segment '{top_driver.segment_value}' has low sample support (< min rows)."

    # High triggers
    top_share = top_driver.share_of_change if top_driver else 0.0
    drill_share = top_drill.share_of_change if top_drill else 0.0

    if (top_share >= 0.50 or drill_share >= 0.60) and not has_offsetting:
        lead = top_driver.segment_value if (top_share >= 0.50 and top_driver) else (str(top_drill.segment_values) if top_drill else "")
        share_val = top_share if top_share >= 0.50 else drill_share
        return (
            "High",
            f"Segment '{lead}' explains {share_val * 100:.1f}% of change, movement exceeds normal volatility ({noise_result.rank_summary}), and data is complete.",
        )

    # Medium triggers
    top_3_sum = sum(d.share_of_change for d in top_3_drivers)
    if top_3_sum >= 0.60 or has_offsetting or top_share >= 0.35:
        if has_offsetting:
            return "Medium", "Offsetting effects detected: large positive and negative segment movements largely balance out."
        return "Medium", f"Top 3 drivers explain {top_3_sum * 100:.1f}% of change across multiple segments."

    return "Low", "No single driver or combination explains at least 50% of the movement."


def step_assemble_evidence(
    metric_name: str,
    metric_type: Literal["additive", "ratio"],
    time_grain: str,
    baseline_window: dict[str, str],
    current_window: dict[str, str],
    baseline_value: float,
    current_value: float,
    drivers: list[DriverContribution],
    offsetting: list[DriverContribution],
    has_offsetting: bool,
    top_drill: DrillFinding | None,
    checks_run: list[PipelineCheckRecord],
    noise_result: NoiseCheckResult,
    seasonality_result: SeasonalityResult,
    dq_issues: list[DataQualityIssue],
    context_events: list[ContextEvent],
    confidence: ConfidenceLevel,
    confidence_reason: str,
    is_complete: bool,
    warning_messages: list[str] | None = None,
) -> Evidence:
    """Step 10: Assembles complete Evidence object."""
    delta = current_value - baseline_value
    pct_change = (delta / baseline_value * 100.0) if abs(baseline_value) > 1e-9 else 0.0

    return Evidence(
        id=str(uuid.uuid4()),
        metric_name=metric_name,
        metric_type=metric_type,
        time_grain=time_grain,
        baseline_window=baseline_window,
        current_window=current_window,
        baseline_value=round(baseline_value, 4),
        current_value=round(current_value, 4),
        delta=round(delta, 4),
        percent_change=round(pct_change, 2),
        drivers=drivers[:15],
        offsetting_effects=offsetting[:10],
        has_offsetting_effects=has_offsetting,
        top_drill=top_drill,
        checks_run=checks_run,
        noise_check=noise_result,
        seasonality_check=seasonality_result,
        data_quality_issues=dq_issues,
        context_events=context_events,
        confidence=confidence,
        confidence_reason=confidence_reason,
        is_complete=is_complete,
        warning_messages=warning_messages or [],
    )
