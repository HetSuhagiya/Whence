from app.explain.contribution import (
    compute_additive_contributions,
    compute_ratio_rate_mix_split,
)
from app.explain.engine import ExplainEngine
from app.explain.pipeline import (
    step_completeness_check,
    step_data_quality_scan,
    step_size_and_noise_check,
)


def test_rate_mix_split_hand_calculated_exact_decomposition() -> None:
    """
    Hand-calculated unit test for the exact two-point rate/mix decomposition (Section 8.3).
    Cat A:
      Baseline: Num=$1000, Den=100 -> Rate=10.0, Weight=0.5
      Current:  Num=$1200, Den=80  -> Rate=15.0, Weight=0.4
      Avg Weight=0.45, Delta Rate=+5.0 -> Rate effect = +2.25
      Delta Weight=-0.1, Avg Rate=12.5, Overall Avg Rate=27.5 -> Mix effect = -0.1*(12.5 - 27.5) = +1.50
      Total Cat A = +3.75
    Cat B:
      Baseline: Num=$4000, Den=100 -> Rate=40.0, Weight=0.5
      Current:  Num=$4800, Den=120 -> Rate=40.0, Weight=0.6
      Avg Weight=0.55, Delta Rate=0.0 -> Rate effect = 0.0
      Delta Weight=+0.1, Avg Rate=40.0, Overall Avg Rate=27.5 -> Mix effect = +0.1*(40.0 - 27.5) = +1.25
      Total Cat B = +1.25
    Overall Rate: R0 = $5000/200 = 25.0, R1 = $6000/200 = 30.0 -> Delta R = +5.00
    Rate sum (+2.25) + Mix sum (+2.75) = +5.00.
    """
    baseline_num = {"A": 1000.0, "B": 4000.0}
    baseline_den = {"A": 100.0, "B": 100.0}
    current_num = {"A": 1200.0, "B": 4800.0}
    current_den = {"A": 80.0, "B": 120.0}

    contribs, offsets, has_off = compute_ratio_rate_mix_split(
        baseline_num=baseline_num,
        baseline_den=baseline_den,
        current_num=current_num,
        current_den=current_den,
        dimension_name="category",
        min_rows=10,
    )

    by_key = {c.segment_value: c for c in contribs}

    assert "A" in by_key
    assert "B" in by_key

    assert by_key["A"].rate_effect == 2.25
    assert by_key["A"].mix_effect == 1.50
    assert by_key["A"].contribution_amount == 3.75

    assert by_key["B"].rate_effect == 0.0
    assert by_key["B"].mix_effect == 1.25
    assert by_key["B"].contribution_amount == 1.25

    total_contrib = sum(c.contribution_amount for c in contribs)
    assert abs(total_contrib - 5.0) < 1e-6
    assert not has_off


def test_additive_contribution_and_offsetting_effects() -> None:
    """Tests additive contribution calculation and offsetting effects detection."""
    # Scenario: Net change is small (-10), but large offsetting movements (+500 vs -510)
    baseline = {"electronics": 1000.0, "apparel": 2000.0, "home": 500.0}
    current = {"electronics": 1500.0, "apparel": 1490.0, "home": 500.0}

    contribs, offsets, has_off = compute_additive_contributions(
        baseline_segments=baseline,
        current_segments=current,
        dimension_name="category",
        min_rows=10,
    )

    assert has_off is True
    assert len(offsets) >= 2
    by_key = {c.segment_value: c for c in contribs}
    assert by_key["electronics"].contribution_amount == 500.0
    assert by_key["electronics"].direction == "positive"
    assert by_key["apparel"].contribution_amount == -510.0
    assert by_key["apparel"].direction == "negative"


def test_step_size_and_noise_median_mad() -> None:
    """Tests median and MAD noise check and rank summary generation."""
    # 26 historical weekly deltas centered around 10
    history = [10.0, 12.0, 9.0, 11.0, 10.0, 13.0, 8.0, 10.0, 14.0, 9.0,
               10.0, 11.0, 12.0, 10.0, 9.0, 11.0, 10.0, 8.0, 13.0, 10.0,
               9.0, 12.0, 11.0, 10.0, 9.0, 10.0]

    # Current delta of 45 is a huge spike
    noise_res, check = step_size_and_noise_check(current_delta=45.0, history_deltas=history)
    assert noise_res.is_outside_normal_range is True
    assert noise_res.z_score > 3.0
    assert "larger than 26 of the last 26" in noise_res.rank_summary

    # Current delta of 10.5 is within normal noise
    noise_res_normal, check_normal = step_size_and_noise_check(current_delta=10.5, history_deltas=history)
    assert noise_res_normal.is_outside_normal_range is False
    assert noise_res_normal.z_score < 1.0


def test_step_completeness_flagging() -> None:
    """Tests that incomplete/partial data is flagged and drops confidence."""
    complete, check = step_completeness_check(is_partial=True, reason="Partial day: only 6 hours of data")
    assert complete is False
    assert check.status == "warning"
    assert "Partial day" in check.message


def test_step_data_quality_scan_zero_drop() -> None:
    """Tests detection of zero drop (tracking / pipeline break)."""
    from app.explain.models import DriverContribution
    drivers = [
        DriverContribution(
            id="1",
            dimension="traffic_source",
            segment_value="Google Organic",
            current_value=0.0,
            baseline_value=1200.0,
            contribution_amount=-1200.0,
            share_of_change=1.0,
            direction="negative",
            row_count_baseline=450,
            row_count_current=0,
        )
    ]

    issues, check = step_data_quality_scan(drivers=drivers)
    assert len(issues) == 1
    assert issues[0].issue_type == "zero_drop"
    assert issues[0].severity == "high"


def test_explain_engine_end_to_end_high_confidence() -> None:
    """Tests full ExplainEngine run_from_data produces High confidence when one driver dominates."""
    engine = ExplainEngine()
    ev = engine.run_from_data(
        metric_name="revenue",
        metric_type="additive",
        time_grain="week",
        baseline_start="2026-11-01",
        baseline_end="2026-11-07",
        current_start="2026-11-08",
        current_end="2026-11-14",
        baseline_value=10000.0,
        current_value=6000.0,
        dimension_data={
            "category": {
                "baseline_values": {"Electronics": 6000.0, "Apparel": 4000.0},
                "current_values": {"Electronics": 2000.0, "Apparel": 4000.0},
                "baseline_counts": {"Electronics": 300, "Apparel": 200},
                "current_counts": {"Electronics": 100, "Apparel": 200},
            }
        },
        history_deltas=[100.0, -150.0, 200.0, -50.0, 80.0, -120.0, 90.0, -70.0, 110.0, -90.0],
        is_partial=False,
    )

    assert ev.confidence == "High"
    assert len(ev.drivers) >= 1
    assert ev.drivers[0].segment_value == "Electronics"
    assert ev.drivers[0].share_of_change == 1.0  # Explains 100% of the drop
    assert ev.is_complete is True
    assert ev.delta == -4000.0
