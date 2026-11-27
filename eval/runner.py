import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.explain.engine import ExplainEngine
from eval.baseline import NaiveBaseline
from eval.generator import generate_scenario_data

DEV_SEEDS = [42, 101, 2024]
TEST_SEEDS = [999, 1337, 7777]


def evaluate_seed_set(
    scenarios: list[dict[str, Any]],
    seeds: list[int],
    set_name: str,
) -> dict[str, Any]:
    engine = ExplainEngine()
    baseline_model = NaiveBaseline()

    scenario_results: list[dict[str, Any]] = []

    total_runs = 0
    engine_top1_hits = 0
    engine_top3_hits = 0
    baseline_top1_hits = 0
    baseline_top3_hits = 0

    control_runs = 0
    control_false_positives = 0

    high_conf_runs = 0
    high_conf_correct = 0

    partial_day_correct = 0
    partial_day_total = 0

    low_support_correct = 0
    low_support_total = 0

    offsetting_correct = 0
    offsetting_total = 0

    for sc in scenarios:
        sc_id = sc["id"]
        sc_name = sc["name"]
        expected_drivers = sc.get("expected_top_drivers", [])
        expected_conf = sc.get("expected_confidence", "High")
        expected_flags = sc.get("expected_flags", [])
        is_control = sc.get("is_control", False)

        sc_runs = 0
        sc_eng_top1 = 0
        sc_eng_top3 = 0
        sc_base_top1 = 0

        for seed in seeds:
            total_runs += 1
            sc_runs += 1

            data = generate_scenario_data(sc, seed=seed)

            # 1. Run Explain Engine
            ev = engine.run_from_data(
                metric_name=sc["metric"],
                metric_type=sc["metric_type"],
                time_grain="week",
                baseline_start="2026-11-01",
                baseline_end="2026-11-07",
                current_start="2026-11-08",
                current_end="2026-11-14",
                baseline_value=data["baseline_val"],
                current_value=data["current_val"],
                dimension_data=data["dimension_data"],
                history_deltas=data["history_deltas"],
                is_partial=data["is_partial"],
                partial_reason=data["partial_reason"],
                weekday_effect_share=data["weekday_effect_share"],
                min_rows=20,
            )

            # 2. Run Naive Baseline
            base_ranked = baseline_model.rank(
                dimension_data=data["dimension_data"],
                metric_type=sc["metric_type"],
            )

            # Evaluate Drivers
            top_eng_driver = ev.drivers[0].segment_value if ev.drivers else None
            top_3_eng_drivers = [d.segment_value for d in ev.drivers[:3]]

            # Special checks for ratio rate_effect / mix_effect
            if "rate_effect" in expected_drivers:
                # Rate effect check: rate effect should dominate mix effect
                top_d = ev.drivers[0] if ev.drivers else None
                eng_top1_match = bool(top_d and abs(top_d.rate_effect or 0.0) >= abs(top_d.mix_effect or 0.0))
                eng_top3_match = eng_top1_match
            elif is_control or not expected_drivers:
                # Control: no driver should be falsely crowned as high-confidence cause
                eng_top1_match = ev.confidence == "Low"
                eng_top3_match = ev.confidence == "Low"
            else:
                eng_top1_match = bool(top_eng_driver and top_eng_driver in expected_drivers)
                eng_top3_match = bool(any(d in expected_drivers for d in top_3_eng_drivers))

            base_top1 = base_ranked[0] if base_ranked else None
            base_top3 = base_ranked[:3]
            base_top1_match = bool(base_top1 and base_top1 in expected_drivers) if expected_drivers else False
            base_top3_match = bool(any(d in expected_drivers for d in base_top3)) if expected_drivers else False

            if eng_top1_match:
                engine_top1_hits += 1
                sc_eng_top1 += 1
            if eng_top3_match:
                engine_top3_hits += 1
                sc_eng_top3 += 1

            if base_top1_match:
                baseline_top1_hits += 1
                sc_base_top1 += 1
            if base_top3_match:
                baseline_top3_hits += 1

            # Control false positive tracking
            if is_control:
                control_runs += 1
                if ev.confidence != "Low":
                    control_false_positives += 1

            # Calibration tracking
            if ev.confidence == "High":
                high_conf_runs += 1
                if expected_conf == "High" and not is_control:
                    high_conf_correct += 1

            # Specific scenario mechanics
            if "partial_current_period" in expected_flags:
                partial_day_total += 1
                if not ev.is_complete and ev.confidence == "Low":
                    partial_day_correct += 1

            if "low_support" in expected_flags:
                low_support_total += 1
                if any(d.low_support for d in ev.drivers) and ev.confidence == "Low":
                    low_support_correct += 1

            if "offsetting_effects" in expected_flags:
                offsetting_total += 1
                if ev.has_offsetting_effects:
                    offsetting_correct += 1

        scenario_results.append({
            "id": sc_id,
            "name": sc_name,
            "runs": sc_runs,
            "engine_top1_rate": round(sc_eng_top1 / sc_runs, 3),
            "engine_top3_rate": round(sc_eng_top3 / sc_runs, 3),
            "baseline_top1_rate": round(sc_base_top1 / sc_runs, 3),
            "expected_confidence": expected_conf,
        })

    fp_rate = (control_false_positives / control_runs) if control_runs > 0 else 0.0
    calibration_rate = (high_conf_correct / high_conf_runs) if high_conf_runs > 0 else 1.0
    partial_rate = (partial_day_correct / partial_day_total) if partial_day_total > 0 else 1.0
    low_supp_rate = (low_support_correct / low_support_total) if low_support_total > 0 else 1.0
    offset_rate = (offsetting_correct / offsetting_total) if offsetting_total > 0 else 1.0

    return {
        "set_name": set_name,
        "seeds": seeds,
        "total_runs": total_runs,
        "engine_top1_rate": round(engine_top1_hits / total_runs, 3),
        "engine_top3_rate": round(engine_top3_hits / total_runs, 3),
        "baseline_top1_rate": round(baseline_top1_hits / total_runs, 3),
        "baseline_top3_rate": round(baseline_top3_hits / total_runs, 3),
        "control_false_positive_rate": round(fp_rate, 3),
        "calibration_high_conf_accuracy": round(calibration_rate, 3),
        "partial_day_accuracy": round(partial_rate, 3),
        "low_support_accuracy": round(low_supp_rate, 3),
        "offsetting_effects_accuracy": round(offset_rate, 3),
        "scenario_results": scenario_results,
    }


def run_evaluation() -> dict[str, Any]:
    scenarios_path = Path(__file__).parent / "scenarios.json"
    with open(scenarios_path, encoding="utf-8") as f:
        scenarios = json.load(f)

    print("=" * 80)
    print("WHENCE STARTA ENGINE — EVALUATION HARNESS (SECTION 15)")
    print("=" * 80)

    # 1. Run Development Set
    dev_results = evaluate_seed_set(scenarios, DEV_SEEDS, set_name="Development Set (Tuning)")

    # 2. Run Test Set
    test_results = evaluate_seed_set(scenarios, TEST_SEEDS, set_name="Test Set (Hold-out)")

    # Combine
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    output = {
        "timestamp": timestamp,
        "scenarios_count": len(scenarios),
        "development_set": dev_results,
        "test_set": test_results,
    }

    # Save to dated JSON file
    results_dir = Path(__file__).parent / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    out_file = results_dir / f"eval_{timestamp}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    # Print Table
    print_evaluation_summary(dev_results, test_results, out_file)
    return output


def print_evaluation_summary(dev: dict[str, Any], test: dict[str, Any], out_file: Path) -> None:
    print(f"\nSaved dated evaluation artifact: {out_file}\n")

    print(f"{'Metric':<38} | {'Dev Set (Seeds: 42, 101, 2024)':<30} | {'Test Set (Seeds: 999, 1337, 7777)':<30}")
    print("-" * 105)
    print(f"{'Engine Top-1 Hit Rate':<38} | {dev['engine_top1_rate'] * 100:>6.1f}%{'':<23} | {test['engine_top1_rate'] * 100:>6.1f}%")
    print(f"{'Baseline Top-1 Hit Rate':<38} | {dev['baseline_top1_rate'] * 100:>6.1f}%{'':<23} | {test['baseline_top1_rate'] * 100:>6.1f}%")
    print(f"{'Engine Top-3 Hit Rate':<38} | {dev['engine_top3_rate'] * 100:>6.1f}%{'':<23} | {test['engine_top3_rate'] * 100:>6.1f}%")
    print(f"{'Baseline Top-3 Hit Rate':<38} | {dev['baseline_top3_rate'] * 100:>6.1f}%{'':<23} | {test['baseline_top3_rate'] * 100:>6.1f}%")
    print(f"{'Control False Positive Rate (Noise/Dip)':<38} | {dev['control_false_positive_rate'] * 100:>6.1f}%{'':<23} | {test['control_false_positive_rate'] * 100:>6.1f}%")
    print(f"{'Calibration (High Confidence Accuracy)':<38} | {dev['calibration_high_conf_accuracy'] * 100:>6.1f}%{'':<23} | {test['calibration_high_conf_accuracy'] * 100:>6.1f}%")
    print(f"{'Partial Day Correctly Handled':<38} | {dev['partial_day_accuracy'] * 100:>6.1f}%{'':<23} | {test['partial_day_accuracy'] * 100:>6.1f}%")
    print(f"{'Low Support Correctly Handled':<38} | {dev['low_support_accuracy'] * 100:>6.1f}%{'':<23} | {test['low_support_accuracy'] * 100:>6.1f}%")
    print(f"{'Offsetting Effects Correctly Handled':<38} | {dev['offsetting_effects_accuracy'] * 100:>6.1f}%{'':<23} | {test['offsetting_effects_accuracy'] * 100:>6.1f}%")

    print("\n" + "=" * 105)
    print("DETAILED PER-SCENARIO BREAKDOWN (TEST SET):")
    print("=" * 105)
    print(f"{'Scenario Name':<45} | {'Engine Top-1':<14} | {'Baseline Top-1':<16} | {'Confidence':<10}")
    print("-" * 105)
    for sc in test["scenario_results"]:
        e_top1 = f"{sc['engine_top1_rate'] * 100:.0f}%"
        b_top1 = f"{sc['baseline_top1_rate'] * 100:.0f}%"
        print(f"{sc['name']:<45} | {e_top1:<14} | {b_top1:<16} | {sc['expected_confidence']:<10}")
    print("=" * 105)


if __name__ == "__main__":
    run_evaluation()
