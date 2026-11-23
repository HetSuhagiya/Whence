from typing import Any, Literal

from app.explain.interface import QueryRunnerProtocol
from app.explain.models import ContextEvent, Evidence
from app.explain.pipeline import (
    step_assemble_evidence,
    step_completeness_check,
    step_compute_confidence,
    step_context_events,
    step_data_quality_scan,
    step_driver_search,
    step_resolve,
    step_seasonality_check,
    step_size_and_noise_check,
    step_two_way_drill,
)


class ExplainEngine:
    """
    Deterministic Explain Engine for Whence.
    Implements the 8.2 pipeline and 8.3 contribution maths as a standalone package.
    Has zero web and zero LLM dependencies.
    """

    def __init__(self, query_runner: QueryRunnerProtocol | None = None) -> None:
        self.query_runner = query_runner

    def run_from_data(
        self,
        metric_name: str,
        metric_type: Literal["additive", "ratio"],
        time_grain: str,
        baseline_start: str,
        baseline_end: str,
        current_start: str,
        current_end: str,
        baseline_value: float,
        current_value: float,
        dimension_data: dict[str, dict[str, Any]],
        history_deltas: list[float] | None = None,
        is_partial: bool = False,
        partial_reason: str | None = None,
        weekday_effect_share: float = 0.0,
        two_way_data: dict[tuple[str, str], dict[str, Any]] | None = None,
        dimension_summaries: dict[str, dict[str, Any]] | None = None,
        events: list[ContextEvent] | None = None,
        min_rows: int = 20,
    ) -> Evidence:
        """
        Runs the 10-step pipeline from supplied in-memory dataset.
        Zero warehouse or web dependencies.
        """
        checks_run = []
        warning_messages = []

        # 1. Resolve
        c_win, b_win, c_resolve = step_resolve(
            metric_name=metric_name,
            metric_type=metric_type,
            time_grain=time_grain,
            current_start=current_start,
            current_end=current_end,
            baseline_start=baseline_start,
            baseline_end=baseline_end,
        )
        checks_run.append(c_resolve)

        # 2. Completeness
        is_complete, c_comp = step_completeness_check(is_partial=is_partial, reason=partial_reason)
        checks_run.append(c_comp)
        if not is_complete:
            warning_messages.append(c_comp.message)

        # 3. Size and Noise Check (with Bonferroni multiplicity correction across dimensions)
        total_delta = current_value - baseline_value
        h_deltas = history_deltas if history_deltas is not None else [total_delta * 0.1] * 12
        num_dims = len(dimension_data) if dimension_data else 1
        noise_res, c_noise = step_size_and_noise_check(
            current_delta=total_delta,
            history_deltas=h_deltas,
            num_dimensions_searched=num_dims,
        )
        checks_run.append(c_noise)

        # 4. Seasonality
        season_res, c_season = step_seasonality_check(
            is_same_weekday=True, weekday_effect_share=weekday_effect_share
        )
        checks_run.append(c_season)

        # 5. Driver Search
        drivers, offsetting, has_offsetting, c_drivers = step_driver_search(
            metric_type=metric_type,
            dimension_data=dimension_data,
            min_rows=min_rows,
            dimension_summaries=dimension_summaries,
        )
        checks_run.append(c_drivers)

        # 6. Two-way Drill
        top_drill, c_drill = step_two_way_drill(
            two_way_data=two_way_data, total_delta=total_delta, min_rows=min_rows
        )
        checks_run.append(c_drill)

        # If a 2-way segment isolates >= 60% of change, prioritize it as lead driver
        if top_drill and top_drill.share_of_change >= 0.60:
            two_way_label = ":".join(top_drill.segment_values.values())
            from app.explain.models import DriverContribution
            drill_driver = DriverContribution(
                id=top_drill.id,
                dimension=" & ".join(top_drill.dimensions),
                segment_value=two_way_label,
                current_value=top_drill.current_value,
                baseline_value=top_drill.baseline_value,
                contribution_amount=top_drill.contribution_amount,
                share_of_change=top_drill.share_of_change,
                direction="positive" if top_drill.contribution_amount >= 0 else "negative",
                row_count_current=top_drill.row_count,
                row_count_baseline=top_drill.row_count,
                low_support=False,
            )
            drivers.insert(0, drill_driver)

        # 7. Data Quality Scan
        dq_issues, c_dq = step_data_quality_scan(
            drivers=drivers,
            dimension_summaries=dimension_summaries,
        )
        checks_run.append(c_dq)
        for issue in dq_issues:
            if issue.severity == "high":
                warning_messages.append(issue.description)

        # If duplicate jump or severe pipeline break occurs, no business driver is attributed (per N4 & N5)
        if any(i.issue_type == "duplicate_jump" for i in dq_issues):
            drivers = []
        elif any(i.issue_type == "null_spike" for i in dq_issues) and (
            not drivers or abs(drivers[0].contribution_amount) < 1e-4
        ):
            drivers = []

        # 8. Context Events
        matched_events, c_events = step_context_events(events=events or [], current_window=c_win)
        checks_run.append(c_events)

        # Detect broad-based decline (no single driver stands out across >= 4 segments)
        is_broad = False
        if len(drivers) >= 4 and total_delta < 0 and not (top_drill and top_drill.share_of_change >= 0.60):
            neg_shares = [d.share_of_change for d in drivers if d.direction == "negative"]
            if len(neg_shares) >= 4 and all(s < 0.38 for s in neg_shares):
                is_broad = True

        # 9. Confidence
        top_driver = drivers[0] if drivers else None
        top_3 = drivers[:3]
        confidence, conf_reason = step_compute_confidence(
            top_driver=top_driver,
            top_3_drivers=top_3,
            top_drill=top_drill,
            noise_result=noise_res,
            is_complete=is_complete,
            dq_issues=dq_issues,
            has_offsetting=has_offsetting,
            seasonality_result=season_res,
            is_broad_based=is_broad,
        )

        # 10. Assemble Evidence
        evidence = step_assemble_evidence(
            metric_name=metric_name,
            metric_type=metric_type,
            time_grain=time_grain,
            baseline_window=b_win,
            current_window=c_win,
            baseline_value=baseline_value,
            current_value=current_value,
            drivers=drivers,
            offsetting=offsetting,
            has_offsetting=has_offsetting,
            top_drill=top_drill,
            checks_run=checks_run,
            noise_result=noise_res,
            seasonality_result=season_res,
            dq_issues=dq_issues,
            context_events=matched_events,
            confidence=confidence,
            confidence_reason=conf_reason,
            is_complete=is_complete,
            warning_messages=warning_messages,
        )
        return evidence
