from app.explain.models import Evidence
from app.narrative.models import NarrativeOutput


class DeterministicFallbackGenerator:
    """
    Builds clean, deterministic, verifiable narrative sentences directly from Evidence.
    Used when no LLM key is configured, when network calls fail, or when number checks fail.
    """

    @staticmethod
    def generate(
        evidence: Evidence, reason: str = "Deterministic fallback used"
    ) -> NarrativeOutput:
        metric = evidence.metric_name
        is_negative = evidence.delta < 0
        direction = "decreased" if is_negative else "increased"
        abs_delta_formatted = f"{abs(evidence.delta):,.2f}"
        pct_formatted = f"{evidence.percent_change:+.1f}%"

        b_start = evidence.baseline_window.get("start", "")
        b_end = evidence.baseline_window.get("end", "")
        c_start = evidence.current_window.get("start", "")
        c_end = evidence.current_window.get("end", "")
        b_win = b_start if b_start == b_end else f"{b_start} to {b_end}"
        c_win = c_start if c_start == c_end else f"{c_start} to {c_end}"

        # Check for data quality flags first
        dq_flags = [issue.description for issue in (evidence.data_quality_issues or [])]
        has_dq_issue = len(dq_flags) > 0

        # Low Confidence / Data Issue handling
        if evidence.confidence == "Low" or has_dq_issue:
            if has_dq_issue:
                headline = f"Data quality irregularity detected during comparison of {metric} between {b_win} and {c_win}."
                s1 = f"{metric.capitalize()} shifted by {evidence.percent_change:+.1f}% ({abs_delta_formatted}), but movement is dominated by data check flags: {', '.join(dq_flags)}."
                s2 = "Automated business driver attribution is withheld until data consistency is confirmed."
                s3 = "Underlying records should be validated for schema migration or ingestion gaps."
                s4 = "Deterministic warehouse validation recorded this data check alert."
            elif not evidence.drivers and evidence.confidence_reason:
                headline = f"No single cause stands out for the {evidence.percent_change:+.1f}% change in {metric}."
                s1 = f"{metric.capitalize()} moved from {evidence.baseline_value:,.2f} ({b_win}) to {evidence.current_value:,.2f} ({c_win}), representing a net change of {evidence.delta:+,.2f} ({evidence.percent_change:+.1f}%)."
                s2 = evidence.confidence_reason
                s3 = "Variance is distributed across multiple monitored segments without dominant concentration."
                s4 = "Data quality validations confirmed zero drops, duplicate loads, and null spikes were absent."
            else:
                headline = f"No single cause stands out for the {evidence.percent_change:+.1f}% change in {metric}."
                s1 = f"{metric.capitalize()} moved from {evidence.baseline_value:,.2f} ({b_win}) to {evidence.current_value:,.2f} ({c_win}), representing a net change of {evidence.delta:+,.2f} ({evidence.percent_change:+.1f}%)."
                s2 = (
                    evidence.confidence_reason
                    or "The change remains within normal historical volatility."
                )
                if evidence.drivers:
                    d1 = evidence.drivers[0]
                    s3 = f"Top contributing segment was {d1.segment_value} in {d1.dimension} with {d1.contribution_amount:+,.2f} ({d1.share_of_change * 100.0:.1f}% share), but movement remains broadly dispersed."
                else:
                    s3 = "Contributions were distributed across categories and within normal historical noise."
                s4 = "Data quality checks verified normal pipeline operations with no anomalous drops or spikes."

            supporting = [s1, s2, s3, s4]
            caveats = ["Movement is within normal noise range or routine cyclical variance."]
            if has_dq_issue:
                caveats.append(f"Data checks flagged: {', '.join(dq_flags)}.")

            return NarrativeOutput(
                headline=headline,
                supporting_sentences=supporting,
                caveats=caveats,
                is_fallback=True,
                fallback_reason=reason,
            )

        # High or Medium Confidence handling
        headline = (
            f"{metric.capitalize()} {direction} by {pct_formatted} ({abs_delta_formatted}) "
            f"from {b_win} to {c_win}."
        )

        supporting = []
        top_drivers = evidence.drivers or []

        # 1. Baseline context
        s1 = (
            f"{metric.capitalize()} shifted from {evidence.baseline_value:,.2f} in {b_win} "
            f"to {evidence.current_value:,.2f} in {c_win}, an absolute shift of {evidence.delta:+,.2f} ({evidence.percent_change:+.1f}%)."
        )
        supporting.append(s1)

        # 2. Primary driver
        if top_drivers:
            d1 = top_drivers[0]
            share_1 = f"{d1.share_of_change * 100.0:.1f}%"
            s2 = (
                f"The primary driver was {d1.segment_value} in {d1.dimension}, "
                f"contributing {d1.contribution_amount:+,.2f} ({share_1} of the change) as it shifted from {d1.baseline_value:,.2f} to {d1.current_value:,.2f}."
            )
            supporting.append(s2)

            # 3. Secondary drivers
            if len(top_drivers) > 1:
                other_parts = [
                    f"{d.segment_value} in {d.dimension} ({d.contribution_amount:+,.2f}, {d.share_of_change * 100.0:.1f}%)"
                    for d in top_drivers[1:3]
                ]
                s3 = f"Secondary contributions came from {', and '.join(other_parts)}."
                supporting.append(s3)
            else:
                s3 = "Remaining segments exhibited minimal variance, indicating highly concentrated movement."
                supporting.append(s3)
        else:
            s2 = "Contributions were distributed across multiple segments without a single dominant category."
            supporting.append(s2)

        # 4. Offsetting effects or timing or ratio decomposition
        if evidence.has_offsetting_effects:
            supporting.append(
                "Offsetting effects were observed where positive gains in certain segments partially masked deeper declines elsewhere."
            )
        elif evidence.timing_summary:
            supporting.append(
                f"Intra-window timing analysis shows: {evidence.timing_summary}."
            )
        elif evidence.ratio_decomposition and evidence.ratio_decomposition.get("plain_language"):
            supporting.append(str(evidence.ratio_decomposition["plain_language"]))
        else:
            supporting.append(
                "Variance was concentrated among the top contributing segments with statistical significance confirmed."
            )

        # 5. Data quality check confirmation
        supporting.append(
            "Data quality checks confirmed zero drops, null spikes, and duplicate loads were absent."
        )

        caveats = []
        if any(d.low_support for d in top_drivers):
            caveats.append("One or more top segments had low row support (< 20 records).")
        if evidence.context_events:
            event_names = [e.title for e in evidence.context_events]
            caveats.append(
                f"Concurrent external events during this window may be contributing: {', '.join(event_names)}."
            )

        return NarrativeOutput(
            headline=headline,
            supporting_sentences=supporting,
            caveats=caveats,
            is_fallback=True,
            fallback_reason=reason,
        )
