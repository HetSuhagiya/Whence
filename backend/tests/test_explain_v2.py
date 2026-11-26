from app.explain.engine import ExplainEngine
from app.explain.models import Evidence, NoiseCheckResult, SeasonalityResult
from app.explain.narrative import NumberChecker


def test_single_day_spike_timing_concentrated() -> None:
    """Synthetic test: single-day spike where intra-window timing is concentrated on that day."""
    engine = ExplainEngine()

    dim_data = {
        "channel": {
            "baseline_values": {"direct": 1000.0, "organic": 1000.0},
            "current_values": {"direct": 4500.0, "organic": 1500.0},
            "baseline_counts": {"direct": 50, "organic": 50},
            "current_counts": {"direct": 150, "organic": 60},
        }
    }

    timing_data = [
        {"date": "2023-11-20", "label": "Mon 20 Nov", "current_value": 300.0, "baseline_value": 280.0, "delta": 20.0},
        {"date": "2023-11-21", "label": "Tue 21 Nov", "current_value": 310.0, "baseline_value": 290.0, "delta": 20.0},
        {"date": "2023-11-22", "label": "Wed 22 Nov", "current_value": 320.0, "baseline_value": 300.0, "delta": 20.0},
        {"date": "2023-11-23", "label": "Thu 23 Nov", "current_value": 310.0, "baseline_value": 300.0, "delta": 10.0},
        {"date": "2023-11-24", "label": "Fri 24 Nov", "current_value": 4150.0, "baseline_value": 350.0, "delta": 3800.0},
        {"date": "2023-11-25", "label": "Sat 25 Nov", "current_value": 310.0, "baseline_value": 240.0, "delta": 70.0},
        {"date": "2023-11-26", "label": "Sun 26 Nov", "current_value": 300.0, "baseline_value": 240.0, "delta": 60.0},
    ]

    ev = engine.run_from_data(
        metric_name="revenue",
        metric_type="additive",
        time_grain="day",
        baseline_start="2023-11-13",
        baseline_end="2023-11-19",
        current_start="2023-11-20",
        current_end="2023-11-26",
        baseline_value=2000.0,
        current_value=6000.0,
        dimension_data=dim_data,
        timing_data=timing_data,
    )

    assert len(ev.timing_strip) == 7
    # Total delta is 4000. Friday delta is 3800 -> 95% concentration
    assert "Fri 24 Nov" in ev.timing_summary
    assert "95%" in ev.timing_summary or "concentrated" in ev.timing_summary
    assert any("Fri 24 Nov" in q for q in ev.next_inquiries)


def test_broad_rise_lift_near_one() -> None:
    """Synthetic test: broad rise where lift is near 1.0 across all segments (broad-based)."""
    engine = ExplainEngine()

    # Each segment grows by exactly 20%
    dim_data = {
        "category": {
            "baseline_values": {"apparel": 1000.0, "electronics": 2000.0, "home": 3000.0},
            "current_values": {"apparel": 1200.0, "electronics": 2400.0, "home": 3600.0},
            "baseline_counts": {"apparel": 100, "electronics": 200, "home": 300},
            "current_counts": {"apparel": 120, "electronics": 240, "home": 360},
        }
    }

    ev = engine.run_from_data(
        metric_name="revenue",
        metric_type="additive",
        time_grain="day",
        baseline_start="2023-11-01",
        baseline_end="2023-11-07",
        current_start="2023-11-08",
        current_end="2023-11-14",
        baseline_value=6000.0,
        current_value=7200.0,
        dimension_data=dim_data,
    )

    # Segment lift = share of change / share of baseline = (delta_i / 1200) / (baseline_i / 6000)
    # apparel: (200 / 1200) / (1000 / 6000) = (1/6) / (1/6) = 1.00
    # electronics: (400 / 1200) / (2000 / 6000) = (1/3) / (1/3) = 1.00
    # home: (600 / 1200) / (3000 / 6000) = (1/2) / (1/2) = 1.00
    cat_lift = ev.segment_lift["category"]
    assert cat_lift["apparel"] == 1.0
    assert cat_lift["electronics"] == 1.0
    assert cat_lift["home"] == 1.0
    assert "Broad-based rise" in ev.timing_summary


def test_ratio_metric_split_volume_mix_rate() -> None:
    """Synthetic test: ratio metric decomposition into Volume effect, Mix effect, and Rate effect."""
    engine = ExplainEngine()

    # Two categories: A rates rise from 10 to 15, B rate stays 40, weight shifts
    dim_data = {
        "category": {
            "baseline_num": {"A": 1000.0, "B": 4000.0},
            "baseline_den": {"A": 100.0, "B": 100.0},
            "current_num": {"A": 1200.0, "B": 4800.0},
            "current_den": {"A": 80.0, "B": 120.0},
            "baseline_counts": {"A": 100, "B": 100},
            "current_counts": {"A": 80, "B": 120},
        }
    }

    ev = engine.run_from_data(
        metric_name="average_order_value",
        metric_type="ratio",
        time_grain="day",
        baseline_start="2023-10-01",
        baseline_end="2023-10-07",
        current_start="2023-10-08",
        current_end="2023-10-14",
        baseline_value=25.0,
        current_value=30.0,
        dimension_data=dim_data,
    )

    assert ev.ratio_decomposition is not None
    rd = ev.ratio_decomposition
    assert rd["rate_effect"] == 2.25
    assert rd["mix_effect"] == 2.75
    assert rd["volume_effect"] == 0.0  # total denominator is 200 -> 200
    assert rd["rate_share"] == 45.0  # 2.25 / 5.0 * 100
    assert rd["mix_share"] == 55.0  # 2.75 / 5.0 * 100
    assert "Volume effect" in rd["plain_language"]
    assert "Mix effect" in rd["plain_language"]
    assert "Rate effect" in rd["plain_language"]


def test_direction_check_sign_flip() -> None:
    """Synthetic test: NumberChecker verifies directional consistency and catches sign flips."""
    checker = NumberChecker()

    dummy_noise = NoiseCheckResult(
        is_outside_normal_range=True,
        median_delta=10.0,
        mad_delta=2.0,
        z_score=3.5,
        rank_summary="1st of 12",
        history_periods_count=12,
    )
    dummy_season = SeasonalityResult(
        has_seasonality_pattern=False,
        seasonality_explains_change=False,
        note="No pattern",
    )

    # 1. Delta is negative (-500.0), but narrative claims metric rose
    evidence_drop = Evidence(
        id="ev-drop",
        metric_name="revenue",
        metric_type="additive",
        time_grain="day",
        baseline_window={"start": "2023-11-01", "end": "2023-11-07"},
        current_window={"start": "2023-11-08", "end": "2023-11-14"},
        baseline_value=5000.0,
        current_value=4500.0,
        delta=-500.0,
        percent_change=-10.0,
        confidence="High",
        confidence_reason="Driver explains movement",
        noise_check=dummy_noise,
        seasonality_check=dummy_season,
    )

    bad_narrative_1 = "Revenue rose by 10% to 4500 between periods."
    ok, errors = checker.check(bad_narrative_1, evidence_drop)
    assert not ok
    assert any("Directional mismatch" in e for e in errors)

    good_narrative_1 = "Revenue fell by 10% to 4500 between periods."
    ok, errors = checker.check(good_narrative_1, evidence_drop)
    assert ok
    assert len(errors) == 0

    # 2. Delta is positive (+500.0), but narrative claims metric decreased
    evidence_gain = Evidence(
        id="ev-gain",
        metric_name="revenue",
        metric_type="additive",
        time_grain="day",
        baseline_window={"start": "2023-11-01", "end": "2023-11-07"},
        current_window={"start": "2023-11-08", "end": "2023-11-14"},
        baseline_value=4500.0,
        current_value=5000.0,
        delta=500.0,
        percent_change=11.1,
        confidence="High",
        confidence_reason="Driver explains movement",
        noise_check=dummy_noise,
        seasonality_check=dummy_season,
    )

    bad_narrative_2 = "Revenue decreased by 500 across the comparative window."
    ok, errors = checker.check(bad_narrative_2, evidence_gain)
    assert not ok
    assert any("Directional mismatch" in e for e in errors)

    good_narrative_2 = "Revenue increased by 500 across the comparative window."
    ok, errors = checker.check(good_narrative_2, evidence_gain)
    assert ok
    assert len(errors) == 0


def test_evidence_v2_fields_and_scorecard() -> None:
    """Tests that Evidence v2 populated fields, scorecard, and inquiries satisfy schema."""
    engine = ExplainEngine()
    dim_data = {
        "state": {
            "baseline_values": {"SP": 5000.0, "RJ": 3000.0, "MG": 2000.0},
            "current_values": {"SP": 7000.0, "RJ": 3050.0, "MG": 2050.0},
            "baseline_counts": {"SP": 50, "RJ": 30, "MG": 20},
            "current_counts": {"SP": 70, "RJ": 31, "MG": 21},
        },
        "device": {
            "baseline_values": {"mobile": 5000.0, "desktop": 5000.0},
            "current_values": {"mobile": 6050.0, "desktop": 6050.0},
            "baseline_counts": {"mobile": 50, "desktop": 50},
            "current_counts": {"mobile": 60, "desktop": 60},
        },
    }

    ev = engine.run_from_data(
        metric_name="revenue",
        metric_type="additive",
        time_grain="week",
        baseline_start="2023-11-06",
        baseline_end="2023-11-12",
        current_start="2023-11-13",
        current_end="2023-11-19",
        baseline_value=10000.0,
        current_value=12100.0,
        dimension_data=dim_data,
    )

    assert "state" in ev.dimension_waterfalls
    assert "device" in ev.dimension_waterfalls
    assert "state" in ev.dimension_shares
    assert len(ev.segment_comparison_table) > 0
    assert len(ev.confidence_breakdown) == 4
    categories = {cb["category"] for cb in ev.confidence_breakdown}
    assert categories == {"completeness", "volatility", "seasonality", "data_quality"}
    assert all(q.endswith("?") for q in ev.next_inquiries)
