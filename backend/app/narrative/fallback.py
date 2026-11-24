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
        direction = "increased" if evidence.delta > 0 else "decreased"
        abs_delta_formatted = f"{abs(evidence.delta):,.2f}"
        pct_formatted = f"{evidence.percent_change:+.1f}%"

        b_win = f"{evidence.baseline_window.get('start', '')} to {evidence.baseline_window.get('end', '')}"
        c_win = f"{evidence.current_window.get('start', '')} to {evidence.current_window.get('end', '')}"

        # Check for data quality flags first
        dq_flags = [issue.description for issue in (evidence.data_quality_issues or [])]
        has_dq_issue = len(dq_flags) > 0

        # Low Confidence / Data Issue handling
        if evidence.confidence == "Low" or has_dq_issue:
            if has_dq_issue:
                headline = f"Data quality irregularity detected during comparison of {metric} between {b_win} and {c_win}."
                s1 = f"{metric.capitalize()} shifted by {pct_formatted} ({abs_delta_formatted}), but movement is dominated by data check flags: {', '.join(dq_flags)}."
                s2 = "Automated business driver attribution is withheld until data consistency is confirmed."
            elif not evidence.drivers and evidence.confidence_reason:
                headline = f"No single cause stands out for the {pct_formatted} change in {metric}."
                s1 = f"{metric.capitalize()} moved by {pct_formatted} ({abs_delta_formatted}) between {b_win} and {c_win}."
                s2 = evidence.confidence_reason
            else:
                headline = f"No single cause stands out for the {pct_formatted} change in {metric}."
                s1 = f"{metric.capitalize()} moved by {pct_formatted} ({abs_delta_formatted}) between {b_win} and {c_win}."
                s2 = (
                    evidence.confidence_reason
                    or "The change remains within normal historical volatility."
                )

            supporting = [s1, s2]
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

        if top_drivers:
            d1 = top_drivers[0]
            share_1 = f"{d1.share_of_change * 100.0:.1f}%"
            s1 = (
                f"The primary driver was {d1.segment_value} in {d1.dimension}, "
                f"contributing {d1.contribution_amount:+,.2f} ({share_1} of the change)."
            )
            supporting.append(s1)

            if len(top_drivers) > 1:
                other_parts = [
                    f"{d.segment_value} ({d.share_of_change * 100.0:.1f}%)"
                    for d in top_drivers[1:3]
                ]
                s2 = f"Additional significant contributions came from {', and '.join(other_parts)}."
                supporting.append(s2)
            else:
                s2 = "No other single segment accounted for a significant share of the movement."
                supporting.append(s2)
        else:
            supporting.append(
                f"{metric.capitalize()} moved from {evidence.baseline_value:,.2f} to {evidence.current_value:,.2f}."
            )
            supporting.append("Contributions were distributed across multiple segments.")

        if evidence.has_offsetting_effects:
            supporting.append(
                "Offsetting effects were observed where gains in some segments were partially masked by declines elsewhere."
            )

        # Ensure between 2 and 4 supporting sentences
        while len(supporting) < 2:
            supporting.append("Results are verified against the deterministic warehouse evidence.")
        if len(supporting) > 4:
            supporting = supporting[:4]

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
