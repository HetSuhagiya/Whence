import json
from pathlib import Path
from app.explain.engine import ExplainEngine
from eval.generator import generate_scenario_data

def run_first_run():
    scenarios_path = Path(__file__).parent / "scenarios.json"
    with open(scenarios_path, encoding="utf-8") as f:
        all_scenarios = json.load(f)

    blind_scenarios = [s for s in all_scenarios if s["id"].startswith("scenario_N")]
    engine = ExplainEngine()
    seed = 42  # Single blind run seed

    print("=" * 80)
    print("PART C: FIRST-RUN OF BLIND SCENARIOS (BEFORE ANY ENGINE CHANGES)")
    print("=" * 80)

    first_run_results = []

    for sc in blind_scenarios:
        sc_id = sc["id"]
        sc_name = sc["name"]
        data = generate_scenario_data(sc, seed=seed)

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
            two_way_data=data.get("two_way_data"),
            dimension_summaries=data.get("dimension_summaries"),
            min_rows=20,
        )

        top_driver = ev.drivers[0].segment_value if ev.drivers else None
        top_driver_share = ev.drivers[0].share_of_change if ev.drivers else 0.0
        top_drill = ev.top_drill.segment_values if ev.top_drill else None
        dq_flags = [i.issue_type for i in ev.data_quality_issues]

        res = {
            "id": sc_id,
            "name": sc_name,
            "confidence": ev.confidence,
            "confidence_reason": ev.confidence_reason,
            "top_driver": top_driver,
            "top_driver_share": round(top_driver_share, 3),
            "top_drill": top_drill,
            "dq_flags": dq_flags,
            "rate_effects": [{d.segment_value: (d.rate_effect, d.mix_effect)} for d in ev.drivers[:3]] if sc["metric_type"] == "ratio" else None,
            "is_complete": ev.is_complete,
            "expected_confidence": sc["expected_confidence"],
            "expected_top_drivers": sc["expected_top_drivers"],
            "expected_flags": sc["expected_flags"],
        }
        first_run_results.append(res)

        print(f"\nScenario: {sc_name}")
        print(f"  Confidence: {ev.confidence} (Expected: {sc['expected_confidence']})")
        print(f"  Top Driver: {top_driver} ({top_driver_share*100:.1f}%)")
        print(f"  Top Drill: {top_drill}")
        print(f"  DQ Flags: {dq_flags}")
        print(f"  Reason: {ev.confidence_reason}")

    # Save to JSON
    out_path = Path(__file__).parent / "results" / "first_run_blind_results.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(first_run_results, f, indent=2)

    print(f"\nSaved first-run blind results to {out_path}")

if __name__ == "__main__":
    run_first_run()
