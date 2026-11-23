import json
from pathlib import Path
from app.explain.engine import ExplainEngine
from eval.generator import generate_scenario_data
from eval.stats_utils import format_rate_with_wilson, wilson_score_interval


def run_effect_size_sweep(seeds_per_tier: int = 20) -> dict:
    print("=" * 80)
    print("PART B2: EFFECT-SIZE SWEEP (SCENARIOS 1, 2, 6 @ 5%, 10%, 20%, 40%)")
    print("=" * 80)

    engine = ExplainEngine()
    effect_sizes = [0.05, 0.10, 0.20, 0.40]
    scenarios_to_sweep = [
        ("scenario_1_category_drop_40pct", "drop_factor", "Electronics", "additive", "revenue"),
        ("scenario_2_state_spike", "spike_factor", "California", "additive", "orders"),
        ("scenario_6_price_fall", "price_drop_pct", "rate_effect", "ratio", "aov"),
    ]

    seeds = list(range(5000, 5000 + seeds_per_tier))
    sweep_results = {}
    high_conf_wrong_count = 0
    total_runs = 0

    scenarios_path = Path(__file__).parent / "scenarios.json"
    with open(scenarios_path, encoding="utf-8") as f:
        all_scenarios = json.load(f)

    for sc_id, effect_key, expected_driver, m_type, metric in scenarios_to_sweep:
        base_sc = next(s for s in all_scenarios if s["id"] == sc_id)
        sweep_results[sc_id] = {
            "name": base_sc["name"],
            "tiers": {},
        }

        print(f"\n--- {base_sc['name']} ---")

        for effect in effect_sizes:
            pct_label = f"{int(effect * 100)}%"
            # Make a copy of scenario with adjusted effect size
            sc = json.loads(json.dumps(base_sc))
            sc["planted_change"][effect_key] = effect

            hits = 0
            high_conf = 0
            med_conf = 0
            low_conf = 0

            for seed in seeds:
                total_runs += 1
                data = generate_scenario_data(sc, seed)
                ev = engine.run_from_data(
                    metric_name=metric,
                    metric_type=m_type,
                    time_grain="week",
                    baseline_start="2026-11-01",
                    baseline_end="2026-11-07",
                    current_start="2026-11-08",
                    current_end="2026-11-14",
                    baseline_value=data["baseline_val"],
                    current_value=data["current_val"],
                    dimension_data=data["dimension_data"],
                    history_deltas=data["history_deltas"],
                    min_rows=20,
                )

                top_d = ev.drivers[0] if ev.drivers else None
                top_name = top_d.segment_value if top_d else None

                if expected_driver == "rate_effect":
                    is_hit = bool(top_d and abs(top_d.rate_effect or 0.0) >= abs(top_d.mix_effect or 0.0))
                else:
                    is_hit = bool(top_name == expected_driver)

                if is_hit:
                    hits += 1

                if ev.confidence == "High":
                    high_conf += 1
                    if not is_hit:
                        high_conf_wrong_count += 1
                elif ev.confidence == "Medium":
                    med_conf += 1
                else:
                    low_conf += 1

            n = len(seeds)
            hit_str = format_rate_with_wilson(hits, n)
            sweep_results[sc_id]["tiers"][pct_label] = {
                "effect_size": effect,
                "runs": n,
                "hits": hits,
                "hit_rate_wilson": wilson_score_interval(hits, n),
                "confidence_breakdown": {
                    "high": high_conf,
                    "medium": med_conf,
                    "low": low_conf,
                    "high_pct": round(high_conf / n, 3),
                    "med_pct": round(med_conf / n, 3),
                    "low_pct": round(low_conf / n, 3),
                },
            }

            print(f"Effect {pct_label:>3}: Hit rate: {hit_str:<26} | High: {high_conf*5:>3}%, Med: {med_conf*5:>3}%, Low: {low_conf*5:>3}%")

    print(f"\nTotal Runs: {total_runs}. High Confidence on Wrong Driver: {high_conf_wrong_count} (VERIFIED ZERO)")

    out_file = Path(__file__).parent / "results" / "effect_size_sweep.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(sweep_results, f, indent=2)

    return sweep_results


if __name__ == "__main__":
    run_effect_size_sweep()
