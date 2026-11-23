import json
import random
from pathlib import Path
from app.explain.engine import ExplainEngine
from eval.stats_utils import format_rate_with_wilson, wilson_score_interval


def run_noise_sweep(num_seeds: int = 200) -> dict:
    print("=" * 80)
    print(f"PART B1: NOISE-ONLY SWEEP ({num_seeds} SEEDS, NO PLANTED CHANGE)")
    print("=" * 80)

    engine = ExplainEngine()
    categories = ["Electronics", "Apparel", "Home", "Books", "Accessories"]
    states = ["California", "New York", "Texas", "Florida", "Illinois"]
    sources = ["Google Organic", "Paid Search", "Direct", "Email", "Social"]

    # Results tracking for With vs Without Bonferroni correction
    # Without Bonferroni: z_crit = 1.96
    # With Bonferroni: z_crit = 2.39 (for D=3 dimensions)

    runs = num_seeds
    named_driver_uncorrected = 0
    med_or_high_uncorrected = 0
    high_uncorrected = 0

    named_driver_corrected = 0
    med_or_high_corrected = 0
    high_corrected = 0

    for seed in range(10000, 10000 + num_seeds):
        rng = random.Random(seed)

        # Base volumes
        base_cat_rev = {c: 4000.0 + rng.uniform(-100, 100) for c in categories}
        base_state_rev = {s: 4000.0 + rng.uniform(-100, 100) for s in states}
        base_src_rev = {src: 4000.0 + rng.uniform(-100, 100) for src in sources}

        # Current volumes: pure random Gaussian noise ~ N(0, 40)
        curr_cat_rev = {c: base_cat_rev[c] + rng.gauss(0.0, 45.0) for c in categories}
        curr_state_rev = {s: base_state_rev[s] + rng.gauss(0.0, 45.0) for s in states}
        curr_src_rev = {src: base_src_rev[src] + rng.gauss(0.0, 45.0) for src in sources}

        # 26 historical weekly noise deltas ~ N(0, 120)
        history_deltas = [rng.gauss(0.0, 120.0) for _ in range(26)]

        b_val = sum(base_cat_rev.values())
        c_val = sum(curr_cat_rev.values())

        dim_data = {
            "category": {
                "baseline_values": base_cat_rev,
                "current_values": curr_cat_rev,
                "baseline_counts": {c: 100 for c in categories},
                "current_counts": {c: 100 for c in categories},
            },
            "state": {
                "baseline_values": base_state_rev,
                "current_values": curr_state_rev,
                "baseline_counts": {s: 100 for s in states},
                "current_counts": {s: 100 for s in states},
            },
            "traffic_source": {
                "baseline_values": base_src_rev,
                "current_values": curr_src_rev,
                "baseline_counts": {src: 100 for src in sources},
                "current_counts": {src: 100 for src in sources},
            },
        }

        # 1. Run with current Bonferroni-corrected engine
        ev_corr = engine.run_from_data(
            metric_name="revenue",
            metric_type="additive",
            time_grain="week",
            baseline_start="2026-11-01",
            baseline_end="2026-11-07",
            current_start="2026-11-08",
            current_end="2026-11-14",
            baseline_value=b_val,
            current_value=c_val,
            dimension_data=dim_data,
            history_deltas=history_deltas,
            min_rows=20,
        )

        if ev_corr.confidence in ("Medium", "High"):
            med_or_high_corrected += 1
        if ev_corr.confidence == "High":
            high_corrected += 1
        # In noise, naming a driver as a genuine cause occurs if confidence is Medium or High
        if ev_corr.confidence != "Low":
            named_driver_corrected += 1

        # 2. Simulate uncorrected (threshold z_crit = 1.96 without D=3 Bonferroni penalty)
        tot_d = c_val - b_val
        sorted_h = sorted(history_deltas)
        med_h = sorted_h[13]
        mad_h = sorted([abs(x - med_h) for x in history_deltas])[13]
        z_score = abs(tot_d - med_h) / (1.4826 * mad_h) if mad_h > 1e-9 else 0.0

        if z_score >= 1.96:
            med_or_high_uncorrected += 1
            named_driver_uncorrected += 1
            if z_score >= 2.5:
                high_uncorrected += 1

    results = {
        "num_seeds": num_seeds,
        "uncorrected": {
            "z_threshold": 1.96,
            "false_alarms_med_or_high": med_or_high_uncorrected,
            "false_alarms_high": high_uncorrected,
            "false_alarm_rate": round(med_or_high_uncorrected / runs, 4),
            "wilson_med_or_high": wilson_score_interval(med_or_high_uncorrected, runs),
            "wilson_high": wilson_score_interval(high_uncorrected, runs),
        },
        "corrected_bonferroni": {
            "z_threshold": 2.39,
            "dimension_count": 3,
            "false_alarms_med_or_high": med_or_high_corrected,
            "false_alarms_high": high_corrected,
            "false_alarm_rate": round(med_or_high_corrected / runs, 4),
            "wilson_med_or_high": wilson_score_interval(med_or_high_corrected, runs),
            "wilson_high": wilson_score_interval(high_corrected, runs),
        },
    }

    out_file = Path(__file__).parent / "results" / "noise_sweep_200.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\nCompleted {runs} Noise-Only Runs.")
    print(f"Uncorrected (z=1.96):")
    print(f"  False Alarms (Medium or High): {format_rate_with_wilson(med_or_high_uncorrected, runs)}")
    print(f"  High Confidence Alarms:        {format_rate_with_wilson(high_uncorrected, runs)}")
    print(f"Bonferroni-Corrected across D=3 dimensions (z=2.39):")
    print(f"  False Alarms (Medium or High): {format_rate_with_wilson(med_or_high_corrected, runs)}")
    print(f"  High Confidence Alarms:        {format_rate_with_wilson(high_corrected, runs)}")
    print(f"Saved results to {out_file}\n")
    return results


if __name__ == "__main__":
    run_noise_sweep()
