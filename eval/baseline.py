from typing import Any


class NaiveBaseline:
    """
    Naive baseline comparison model per Section 15.
    Ranks segments simply by absolute change in the single largest-variance dimension.
    Does not account for noise baselines, data quality outages, partial periods,
    offsetting effects, or rate/mix splits.
    """

    def rank(
        self,
        dimension_data: dict[str, dict[str, Any]],
        metric_type: str = "additive",
    ) -> list[str]:
        best_dim = None
        max_dim_var = -1.0
        dim_deltas: dict[str, dict[str, float]] = {}

        for dim_name, ddata in dimension_data.items():
            deltas: dict[str, float] = {}
            if metric_type == "additive":
                b_vals = ddata.get("baseline_values", {})
                c_vals = ddata.get("current_values", {})
                all_keys = set(b_vals.keys()) | set(c_vals.keys())
                for k in all_keys:
                    deltas[k] = c_vals.get(k, 0.0) - b_vals.get(k, 0.0)
            else:
                b_num = ddata.get("baseline_num", {})
                b_den = ddata.get("baseline_den", {})
                c_num = ddata.get("current_num", {})
                c_den = ddata.get("current_den", {})
                all_keys = set(b_den.keys()) | set(c_den.keys())
                for k in all_keys:
                    r0 = b_num.get(k, 0.0) / b_den.get(k, 1.0) if b_den.get(k, 0.0) > 0 else 0.0
                    r1 = c_num.get(k, 0.0) / c_den.get(k, 1.0) if c_den.get(k, 0.0) > 0 else 0.0
                    deltas[k] = r1 - r0

            # Compute variance of deltas across segments in this dimension
            if deltas:
                vals = list(deltas.values())
                mean = sum(vals) / len(vals)
                variance = sum((v - mean) ** 2 for v in vals) / len(vals)
                dim_deltas[dim_name] = deltas
                if variance > max_dim_var:
                    max_dim_var = variance
                    best_dim = dim_name

        if not best_dim or best_dim not in dim_deltas:
            return []

        # Rank segments in the single highest-variance dimension by absolute delta
        ranked = sorted(dim_deltas[best_dim].items(), key=lambda kv: abs(kv[1]), reverse=True)
        return [k for k, _ in ranked]
