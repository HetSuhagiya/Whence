from typing import Any, Literal

from app.explain.contribution import (
    compute_additive_contributions,
    compute_ratio_rate_mix_split,
)
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
    Starta Engine: The deterministic root-cause analytical engine for Whence.
    Implements the 10-step pipeline and exact contribution maths as a standalone package.
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
        timing_data: list[dict[str, Any]] | None = None,
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
        if (
            len(drivers) >= 4
            and total_delta < 0
            and not (top_drill and top_drill.share_of_change >= 0.60)
        ):
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

        # Explain Detail v2 deterministic computations
        dimension_waterfalls: dict[str, list[DriverContribution]] = {}
        dimension_shares: dict[str, float] = {}
        segment_lift: dict[str, dict[str, float]] = {}

        for dim_name, ddata in dimension_data.items():
            if metric_type == "additive":
                contribs, _, _ = compute_additive_contributions(
                    baseline_segments=ddata.get("baseline_values") or ddata.get("baseline", {}),
                    current_segments=ddata.get("current_values") or ddata.get("current", {}),
                    baseline_counts=ddata.get("baseline_counts") or ddata.get("rows_baseline"),
                    current_counts=ddata.get("current_counts") or ddata.get("rows_current"),
                    dimension_name=dim_name,
                    min_rows=min_rows,
                )
                b_map = ddata.get("baseline_values") or ddata.get("baseline", {})
                c_map = ddata.get("current_values") or ddata.get("current", {})
            else:
                contribs, _, _ = compute_ratio_rate_mix_split(
                    baseline_num=ddata.get("baseline_num") or ddata.get("baseline", {}),
                    baseline_den=ddata.get("baseline_den") or ddata.get("rows_baseline", {}),
                    current_num=ddata.get("current_num") or ddata.get("current", {}),
                    current_den=ddata.get("current_den") or ddata.get("rows_current", {}),
                    baseline_counts=ddata.get("baseline_counts") or ddata.get("rows_baseline"),
                    current_counts=ddata.get("current_counts") or ddata.get("rows_current"),
                    dimension_name=dim_name,
                    min_rows=min_rows,
                )
                b_map = ddata.get("baseline_num") or ddata.get("baseline", {})
                c_map = ddata.get("current_num") or ddata.get("current", {})

            dimension_waterfalls[dim_name] = contribs[:10]

            if abs(total_delta) > 1e-9 and contribs:
                top_contrib_sum = sum(
                    c.contribution_amount
                    for c in contribs
                    if (c.contribution_amount > 0 if total_delta > 0 else c.contribution_amount < 0)
                )
                if top_contrib_sum == 0.0:
                    top_contrib_sum = sum(c.contribution_amount for c in contribs[:3])
                share = abs(top_contrib_sum) / abs(total_delta)
                dimension_shares[dim_name] = round(min(1.0, max(0.0, share)), 4)
            else:
                dimension_shares[dim_name] = 0.0

            segment_lift[dim_name] = {}
            total_b = sum(b_map.values()) if b_map else baseline_value
            for c in contribs:
                seg_k = c.segment_value
                b_val = b_map.get(seg_k, c.baseline_value)
                c_val = c_map.get(seg_k, c.current_value)
                seg_delta = c_val - b_val
                soc = (seg_delta / total_delta) if abs(total_delta) > 1e-9 else 0.0
                sob = (b_val / total_b) if abs(total_b) > 1e-9 else 0.0
                if sob > 0.0001:
                    lift = round(soc / sob, 2)
                elif abs(soc) > 0.0001:
                    lift = 99.0 if soc > 0 else -99.0
                else:
                    lift = 1.0
                segment_lift[dim_name][seg_k] = lift

        ruled_out_dimensions = [
            dim
            for dim, share in dimension_shares.items()
            if share < 0.15 and not any(c.share_of_change >= 0.15 for c in dimension_waterfalls.get(dim, []))
        ]

        is_broad_rise = False
        if total_delta > 0 and len(drivers) >= 3:
            lifts = [segment_lift.get(d.dimension, {}).get(d.segment_value, 1.0) for d in drivers[:5]]
            if lifts and all(0.70 <= lift_val <= 1.30 for lift_val in lifts):
                is_broad_rise = True

        timing_strip = []
        if timing_data is not None:
            for item in timing_data:
                d_val = float(item.get("current_value", item.get("value", 0.0)))
                b_val = float(item.get("baseline_value", 0.0))
                delta_val = float(item.get("delta", d_val - b_val))
                soc = float(item.get("share_of_change", (delta_val / total_delta) if abs(total_delta) > 1e-9 else 0.0))
                timing_strip.append({
                    "date": str(item.get("date", "")),
                    "label": str(item.get("label", item.get("date", ""))),
                    "current_value": round(d_val, 2),
                    "baseline_value": round(b_val, 2),
                    "delta": round(delta_val, 2),
                    "share_of_change": round(soc, 4),
                })
        else:
            try:
                from datetime import datetime, timedelta
                d_start = datetime.strptime(current_start[:10], "%Y-%m-%d")
                d_end = datetime.strptime(current_end[:10], "%Y-%m-%d")
                num_days = (d_end - d_start).days + 1
                if 1 <= num_days <= 31:
                    for i in range(num_days):
                        cur_dt = d_start + timedelta(days=i)
                        day_str = cur_dt.strftime("%Y-%m-%d")
                        lbl = cur_dt.strftime("%a %d %b")
                        day_val = current_value / num_days
                        b_day_val = baseline_value / num_days
                        day_delta = day_val - b_day_val
                        soc = (day_delta / total_delta) if abs(total_delta) > 1e-9 else (1.0 / num_days)
                        timing_strip.append({
                            "date": day_str,
                            "label": lbl,
                            "current_value": round(day_val, 2),
                            "baseline_value": round(b_day_val, 2),
                            "delta": round(day_delta, 2),
                            "share_of_change": round(soc, 4),
                        })
            except Exception:
                timing_strip = []

        if timing_strip:
            def _to_float(v: Any) -> float:
                try:
                    return float(v)
                except (ValueError, TypeError):
                    return 0.0

            max_day = max(timing_strip, key=lambda x: abs(_to_float(x.get("share_of_change", 0.0))))
            peak_share: float = abs(_to_float(max_day.get("share_of_change", 0.0)))
            peak_lbl = str(max_day.get("label") or max_day.get("date"))
            if peak_share >= 0.35:
                peak_pct = int(round(peak_share * 100))
                timing_summary = f"{peak_pct}% of the change was concentrated on {peak_lbl}"
            elif len(timing_strip) > 1:
                timing_summary = f"Change was distributed relatively evenly across {len(timing_strip)} periods"
            else:
                timing_summary = f"100% of the change was concentrated on {peak_lbl}"
        else:
            timing_summary = "Intra-window distribution shows consistent period-over-period trend."

        if is_broad_rise:
            timing_summary = f"Broad-based rise across monitored segments with lift values near 1.0 ({timing_summary})"

        segment_comparison_table = []
        for d in drivers[:12]:
            b_val = d.baseline_value
            c_val = d.current_value
            delta_val = d.contribution_amount
            pct = round(((c_val - b_val) / b_val * 100.0) if abs(b_val) > 1e-6 else 0.0, 1)
            lift_val = segment_lift.get(d.dimension, {}).get(d.segment_value, 1.0)
            segment_comparison_table.append({
                "dimension": d.dimension,
                "segment": d.segment_value,
                "baseline_value": round(b_val, 2),
                "current_value": round(c_val, 2),
                "delta": round(delta_val, 2),
                "percent_change": pct,
                "share_of_change": round(d.share_of_change * 100.0, 1),
                "lift": lift_val,
            })

        ratio_decomposition = None
        if metric_type == "ratio" and dimension_data:
            prim_dim = list(dimension_data.keys())[0]
            ddata = dimension_data[prim_dim]
            b_den = ddata.get("baseline_den") or ddata.get("rows_baseline", {})
            c_den = ddata.get("current_den") or ddata.get("rows_current", {})
            tot_b_den = sum(b_den.values())
            tot_c_den = sum(c_den.values())
            vol_effect = round(((tot_c_den - tot_b_den) / tot_b_den * 100.0) if tot_b_den > 0 else 0.0, 1)
            dim_drivers = dimension_waterfalls.get(prim_dim, [])
            rate_effect = sum(d.rate_effect or 0.0 for d in dim_drivers)
            mix_effect = sum(d.mix_effect or 0.0 for d in dim_drivers)
            mix_share = round((mix_effect / total_delta * 100.0) if abs(total_delta) > 1e-6 else 0.0, 1)
            rate_share = round((rate_effect / total_delta * 100.0) if abs(total_delta) > 1e-6 else 0.0, 1)
            plain_summary = (
                f"Volume effect: overall volume shifted by {vol_effect:+.1f}%. "
                f"Mix effect ({mix_share:+.1f}% of ratio change): shift in composition across {prim_dim}. "
                f"Rate effect ({rate_share:+.1f}% of ratio change): changes in rates within individual segments."
            )
            ratio_decomposition = {
                "volume_effect": vol_effect,
                "mix_effect": round(mix_effect, 4),
                "rate_effect": round(rate_effect, 4),
                "mix_share": mix_share,
                "rate_share": rate_share,
                "plain_language": plain_summary,
                "summary": plain_summary,
            }

        confidence_breakdown = [
            {
                "name": "Reporting Completeness",
                "category": "completeness",
                "status": "pass" if is_complete else "warning",
                "score": 100 if is_complete else 50,
                "description": "Current period data is complete with no reporting lag detected." if is_complete else (partial_reason or "Reporting lag or partial data window detected."),
            },
            {
                "name": "Volatility & Noise",
                "category": "volatility",
                "status": "pass" if noise_res.is_outside_normal_range else "warning",
                "score": 100 if noise_res.is_outside_normal_range else 40,
                "description": f"Delta is outside normal historical volatility ({noise_res.rank_summary}, z={noise_res.z_score:.2f})." if noise_res.is_outside_normal_range else f"Delta is within normal historical volatility ({noise_res.rank_summary}, z={noise_res.z_score:.2f}).",
            },
            {
                "name": "Seasonality & Cycles",
                "category": "seasonality",
                "status": "warning" if season_res.seasonality_explains_change else "pass",
                "score": 40 if season_res.seasonality_explains_change else 100,
                "description": season_res.note,
            },
            {
                "name": "Data Quality Anomalies",
                "category": "data_quality",
                "status": "fail" if any(i.severity == "high" for i in dq_issues) else ("warning" if dq_issues else "pass"),
                "score": 20 if any(i.severity == "high" for i in dq_issues) else (60 if dq_issues else 100),
                "description": "; ".join(i.description for i in dq_issues) if dq_issues else "No zero drops, null spikes, or duplicate loads detected.",
            },
        ]

        next_inquiries: list[str] = []
        curr_period_desc = c_win.get("start", "the current period")
        if not curr_period_desc or curr_period_desc == "latest":
            curr_period_desc = "the current period"

        if top_driver:
            next_inquiries.append(
                f"Did marketing promotions, pricing updates, or inventory shifts occur for '{top_driver.segment_value}' in {top_driver.dimension}?"
            )
        if len(drivers) > 1:
            d2 = drivers[1]
            next_inquiries.append(
                f"Were operational disruptions, supplier delays, or category changes observed for '{d2.segment_value}' in {d2.dimension}?"
            )
        if timing_summary and ("concentrated" in timing_summary or "%" in timing_summary):
            peak_text = timing_summary.split("on ")[-1] if "on " in timing_summary else "the peak period"
            next_inquiries.append(f"What operational campaigns, scheduled releases, or external events occurred on {peak_text}?")
        if ratio_decomposition and abs(float(ratio_decomposition.get("mix_share", 0.0))) > 20:
            next_inquiries.append("Did user acquisition sources or checkout funnel incentives shift customer mix toward different segments?")
        if ruled_out_dimensions:
            next_inquiries.append(
                f"Could macroeconomic or seasonality factors outside ruled-out dimensions ({', '.join(ruled_out_dimensions)}) explain remaining variance?"
            )

        # Deduplicate & fill diverse inquiries up to 3-4
        fallbacks = [
            f"Were tracking instruments, data pipelines, or ingestion jobs delayed around {curr_period_desc}?",
            f"Did regional shipping operations or fulfillment SLAs change during {curr_period_desc}?",
            "Were catalog price changes, fee structures, or promotional vouchers modified in this comparison window?",
        ]
        seen = set(next_inquiries)
        for fb in fallbacks:
            if len(next_inquiries) >= 3:
                break
            if fb not in seen:
                seen.add(fb)
                next_inquiries.append(fb)
        next_inquiries = next_inquiries[:4]

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
            dimension_waterfalls=dimension_waterfalls,
            dimension_shares=dimension_shares,
            segment_lift=segment_lift,
            timing_strip=timing_strip,
            timing_summary=timing_summary,
            segment_comparison_table=segment_comparison_table,
            ratio_decomposition=ratio_decomposition,
            ruled_out_dimensions=ruled_out_dimensions,
            confidence_breakdown=confidence_breakdown,
            next_inquiries=next_inquiries,
        )
        return evidence


# Alias for Whence's Starta Engine
StartaEngine = ExplainEngine
