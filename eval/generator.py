import random
from typing import Any


def generate_scenario_data(scenario: dict[str, Any], seed: int) -> dict[str, Any]:
    """
    Generates synthetic evaluation data for a given scenario and random seed.
    Produces:
      - baseline_value and current_value
      - dimension_data for: category, state, traffic_source
      - 26 historical deltas for median/MAD noise check
      - flags: is_partial, partial_reason, weekday_effect_share, two_way_data
    """
    rng = random.Random(seed)
    planted = scenario["planted_change"]
    sc_type = planted.get("type")

    # Base categories and baseline volumes
    categories = ["Electronics", "Apparel", "Home", "Books", "Accessories"]
    base_category_rev = {
        "Electronics": 5000.0 + rng.uniform(-100, 100),
        "Apparel": 4000.0 + rng.uniform(-100, 100),
        "Home": 2500.0 + rng.uniform(-50, 50),
        "Books": 1500.0 + rng.uniform(-50, 50),
        "Accessories": 1000.0 + rng.uniform(-30, 30),
    }
    base_category_orders = {
        "Electronics": 100 + rng.randint(-5, 5),
        "Apparel": 200 + rng.randint(-10, 10),
        "Home": 100 + rng.randint(-5, 5),
        "Books": 150 + rng.randint(-5, 5),
        "Accessories": 250 + rng.randint(-10, 10),
    }

    # States
    states = ["California", "New York", "Texas", "Florida", "Illinois"]
    base_state_orders = {s: 150 + rng.randint(-15, 15) for s in states}
    base_state_rev = {s: base_state_orders[s] * 20.0 + rng.uniform(-50, 50) for s in states}

    # Traffic sources
    sources = ["Google Organic", "Paid Search", "Direct", "Email", "Social"]
    base_source_orders = {
        "Google Organic": 300 + rng.randint(-15, 15),
        "Paid Search": 200 + rng.randint(-10, 10),
        "Direct": 150 + rng.randint(-10, 10),
        "Email": 100 + rng.randint(-5, 5),
        "Social": 50 + rng.randint(-5, 5),
    }
    base_source_rev = {s: base_source_orders[s] * 18.0 + rng.uniform(-30, 30) for s in sources}

    # History deltas (26 weekly deltas with small steady-state noise ~ N(0, 150))
    history_rev_deltas = [rng.gauss(0.0, 120.0) for _ in range(26)]
    history_order_deltas = [rng.gauss(0.0, 15.0) for _ in range(26)]
    history_aov_deltas = [rng.gauss(0.0, 0.45) for _ in range(26)]

    # Defaults for current
    curr_category_rev = dict(base_category_rev)
    curr_category_orders = dict(base_category_orders)
    curr_state_orders = dict(base_state_orders)
    curr_state_rev = dict(base_state_rev)
    curr_source_orders = dict(base_source_orders)
    curr_source_rev = dict(base_source_rev)

    is_partial = False
    partial_reason = None
    weekday_effect = 0.0

    # Apply planted change
    if sc_type == "category_drop":
        # 1. Category drop 40%
        target = planted["target_segment"]
        drop = planted["drop_factor"]
        curr_category_rev[target] *= (1.0 - drop)
        curr_category_orders[target] = int(curr_category_orders[target] * (1.0 - drop))

    elif sc_type == "state_spike":
        # 2. State spike
        target = planted["target_segment"]
        spike = planted["spike_factor"]
        curr_state_orders[target] = int(curr_state_orders[target] * (1.0 + spike))
        curr_state_rev[target] *= (1.0 + spike)

    elif sc_type == "site_discount":
        # 3. Discount day
        disc = planted["discount_factor"]
        for cat in categories:
            curr_category_rev[cat] *= (1.0 - disc)
            curr_category_orders[cat] = int(curr_category_orders[cat] * 1.15)  # units rise, price drops

    elif sc_type == "tracking_break":
        # 4. Tracking break sends target source to 0
        target = planted["target_segment"]
        curr_source_orders[target] = 0
        curr_source_rev[target] = 0.0

    elif sc_type == "mix_shift":
        # 5. Mix shift to cheaper category
        to_cat = planted["shift_to"]
        from_cat = planted["shift_from"]
        vol = planted["shift_volume"]
        curr_category_orders[to_cat] += vol
        curr_category_orders[from_cat] = max(10, curr_category_orders[from_cat] - vol)
        # Average item prices stay constant
        price_to = base_category_rev[to_cat] / base_category_orders[to_cat]
        price_from = base_category_rev[from_cat] / base_category_orders[from_cat]
        curr_category_rev[to_cat] = curr_category_orders[to_cat] * price_to
        curr_category_rev[from_cat] = curr_category_orders[from_cat] * price_from

    elif sc_type == "price_fall":
        # 6. Universal price drop inside every category
        p_drop = planted["price_drop_pct"]
        for cat in categories:
            curr_category_rev[cat] *= (1.0 - p_drop)

    elif sc_type == "overlapping":
        # 7. Two overlapping causes
        prim = planted["primary_segment"]
        p_drop = planted["primary_drop"]
        sec = planted["secondary_segment"]
        s_drop = planted["secondary_drop"]
        curr_category_rev[prim] = max(100.0, curr_category_rev[prim] - p_drop)
        curr_category_rev[sec] = max(100.0, curr_category_rev[sec] - s_drop)

    elif sc_type == "weekday_dip":
        # 8. Normal weekday dip (15% across all categories, matched by seasonal cycle)
        w_drop = planted["weekday_drop_pct"]
        for cat in categories:
            curr_category_rev[cat] *= (1.0 - w_drop)
        weekday_effect = 0.85  # Seasonality explains 85% of movement

    elif sc_type == "partial_day":
        # 9. Partial day: only 25% of hours ingested
        frac = planted["fraction_of_day"]
        for cat in categories:
            curr_category_rev[cat] *= frac
        is_partial = True
        partial_reason = "Partial day: 6 hours of data ingested against 24-hour baseline."

    elif sc_type == "noise_only":
        # 10. Control period with only normal noise (changes within ±1 standard error)
        for cat in categories:
            curr_category_rev[cat] += rng.gauss(0.0, 30.0)

    elif sc_type == "low_support":
        # 11. Low support segment spike
        target = planted["target_segment"]
        b_ord = planted["baseline_orders"]
        c_ord = planted["current_orders"]
        base_category_orders[target] = b_ord
        base_category_rev[target] = b_ord * 50.0
        curr_category_orders[target] = c_ord
        curr_category_rev[target] = c_ord * 50.0

    elif sc_type == "offsetting":
        # 12. Offsetting gains and losses
        pos = planted["positive_segment"]
        pos_amt = planted["positive_amount"]
        neg = planted["negative_segment"]
        neg_amt = planted["negative_amount"]
        curr_category_rev[pos] += pos_amt
        curr_category_rev[neg] += neg_amt

    # --- Part C Blind Scenarios (N1 - N7) ---
    two_way_data: dict[tuple[str, str], dict[str, Any]] | None = None
    dimension_summaries: dict[str, dict[str, Any]] | None = None

    if sc_type == "small_category_fall":
        # N1 Small effect: category falls 10%
        target = planted["target_segment"]
        drop = planted["drop_factor"]
        curr_category_rev[target] *= (1.0 - drop)
        curr_category_orders[target] = int(curr_category_orders[target] * (1.0 - drop))
        # Historical noise has higher variance so a 10% drop ($500) is within normal volatility
        history_rev_deltas = [rng.gauss(0.0, 320.0) for _ in range(26)]

    elif sc_type == "two_way_drop":
        # N2 Two-way segment: orders fall only where state=California AND source=Paid Search
        target_state = planted["state_segment"]
        target_source = planted["source_segment"]
        drop_cnt = planted["drop_count"]

        curr_state_orders[target_state] -= drop_cnt
        curr_source_orders[target_source] -= drop_cnt

        # Construct 2-way grid
        b_grid = {}
        c_grid = {}
        cnt_grid = {}
        for s in states:
            for src in sources:
                key = (s, src)
                base_o = (base_state_orders[s] * base_source_orders[src]) // 800
                if s == target_state and src == target_source:
                    base_o = drop_cnt + 25  # Ensure baseline has sufficient volume
                    curr_o = 25
                else:
                    curr_o = base_o
                b_grid[key] = float(base_o)
                c_grid[key] = float(curr_o)
                cnt_grid[key] = curr_o

        two_way_data = {
            ("state", "traffic_source"): {
                "baseline": b_grid,
                "current": c_grid,
                "counts": cnt_grid,
            }
        }

    elif sc_type == "mix_up_rate_down":
        # N3 Mix up, rate down: overall AOV rises, category prices fall 5%
        p_drop = planted["price_drop_pct"]
        shift_cat = planted["shift_to_pricier"]
        shift_orders = planted["shift_orders"]

        # Shift volume to expensive Electronics
        curr_category_orders[shift_cat] += shift_orders
        curr_category_orders["Accessories"] = max(20, curr_category_orders["Accessories"] - shift_orders // 2)
        curr_category_orders["Books"] = max(20, curr_category_orders["Books"] - shift_orders // 2)

        # Apply 5% price markdown inside every category
        for cat in categories:
            orig_price = base_category_rev[cat] / base_category_orders[cat]
            new_price = orig_price * (1.0 - p_drop)
            curr_category_rev[cat] = curr_category_orders[cat] * new_price

    elif sc_type == "duplicate_load":
        # N4 Duplicate load: all rows for one day are loaded twice (+14.3% across all segments)
        dimension_summaries = {"_meta": {"is_duplicate_load": True}}
        for cat in categories:
            curr_category_orders[cat] = int(curr_category_orders[cat] * 1.143)
            curr_category_rev[cat] *= 1.143
        for s in states:
            curr_state_orders[s] = int(curr_state_orders[s] * 1.143)
            curr_state_rev[s] *= 1.143
        for src in sources:
            curr_source_orders[src] = int(curr_source_orders[src] * 1.143)
            curr_source_rev[src] *= 1.143

    elif sc_type == "null_spike":
        # N5 Null spike: 30% of state values become NULL
        null_dim = planted["null_dimension"]
        null_p = planted["null_pct"]
        dimension_summaries = {
            null_dim: {
                "baseline_null_pct": 0.0,
                "current_null_pct": null_p,
            }
        }
        # In current_state_orders, distribute nulls
        for s in states:
            curr_state_orders[s] = int(curr_state_orders[s] * (1.0 - null_p))
            curr_state_rev[s] *= (1.0 - null_p)
        curr_state_orders["NULL"] = int(sum(base_state_orders.values()) * null_p)
        curr_state_rev["NULL"] = sum(base_state_rev.values()) * null_p

    elif sc_type == "broad_decline":
        # N6 Broad decline: revenue falls 8% uniformly across all categories, states, sources
        d_pct = planted["drop_pct"]
        for cat in categories:
            curr_category_rev[cat] *= (1.0 - d_pct)
            curr_category_orders[cat] = int(curr_category_orders[cat] * (1.0 - d_pct))
        for s in states:
            curr_state_rev[s] *= (1.0 - d_pct)
            curr_state_orders[s] = int(curr_state_orders[s] * (1.0 - d_pct))
        for src in sources:
            curr_source_rev[src] *= (1.0 - d_pct)
            curr_source_orders[src] = int(curr_source_orders[src] * (1.0 - d_pct))

    elif sc_type == "new_segment":
        # N7 New segment: category with 0 baseline orders appears
        new_cat = planted["new_category"]
        new_o = planted["current_orders"]
        curr_category_orders[new_cat] = new_o
        curr_category_rev[new_cat] = new_o * 45.0
        # Baseline has 0
        base_category_orders[new_cat] = 0
        base_category_rev[new_cat] = 0.0

    metric = scenario["metric"]
    metric_type = scenario["metric_type"]

    if metric == "revenue":
        baseline_val = sum(base_category_rev.values())
        current_val = sum(curr_category_rev.values())
        h_deltas = history_rev_deltas
    elif metric == "orders":
        if sc_type in ("state_spike", "two_way_drop", "null_spike"):
            baseline_val = sum(base_state_orders.values())
            current_val = sum(curr_state_orders.values())
        elif sc_type == "tracking_break":
            baseline_val = sum(base_source_orders.values())
            current_val = sum(curr_source_orders.values())
        else:
            baseline_val = sum(base_category_orders.values())
            current_val = sum(curr_category_orders.values())
        h_deltas = history_order_deltas
    else:  # aov = revenue / orders
        base_r = sum(base_category_rev.values())
        base_o = sum(base_category_orders.values())
        curr_r = sum(curr_category_rev.values())
        curr_o = sum(curr_category_orders.values())
        baseline_val = base_r / base_o if base_o > 0 else 0.0
        current_val = curr_r / curr_o if curr_o > 0 else 0.0
        h_deltas = history_aov_deltas

    # Format dimension_data
    dimension_data: dict[str, dict[str, Any]] = {}

    if metric_type == "additive":
        dimension_data["category"] = {
            "baseline_values": base_category_rev if metric == "revenue" else {k: float(v) for k, v in base_category_orders.items()},
            "current_values": curr_category_rev if metric == "revenue" else {k: float(v) for k, v in curr_category_orders.items()},
            "baseline_counts": base_category_orders,
            "current_counts": curr_category_orders,
        }
        dimension_data["state"] = {
            "baseline_values": base_state_rev if metric == "revenue" else {k: float(v) for k, v in base_state_orders.items()},
            "current_values": curr_state_rev if metric == "revenue" else {k: float(v) for k, v in curr_state_orders.items()},
            "baseline_counts": base_state_orders,
            "current_counts": curr_state_orders,
        }
        dimension_data["traffic_source"] = {
            "baseline_values": base_source_rev if metric == "revenue" else {k: float(v) for k, v in base_source_orders.items()},
            "current_values": curr_source_rev if metric == "revenue" else {k: float(v) for k, v in curr_source_orders.items()},
            "baseline_counts": base_source_orders,
            "current_counts": curr_source_orders,
        }
    else:  # ratio metric: aov
        dimension_data["category"] = {
            "baseline_num": base_category_rev,
            "baseline_den": {k: float(v) for k, v in base_category_orders.items()},
            "current_num": curr_category_rev,
            "current_den": {k: float(v) for k, v in curr_category_orders.items()},
            "baseline_counts": base_category_orders,
            "current_counts": curr_category_orders,
        }

    return {
        "baseline_val": baseline_val,
        "current_val": current_val,
        "dimension_data": dimension_data,
        "history_deltas": h_deltas,
        "is_partial": is_partial,
        "partial_reason": partial_reason,
        "weekday_effect_share": weekday_effect,
        "two_way_data": two_way_data,
        "dimension_summaries": dimension_summaries,
    }
