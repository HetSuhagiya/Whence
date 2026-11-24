import uuid
from typing import Any, Literal

from app.explain.models import DriverContribution


def compute_additive_contributions(
    baseline_segments: dict[str, float],
    current_segments: dict[str, float],
    baseline_counts: dict[str, int] | None = None,
    current_counts: dict[str, int] | None = None,
    dimension_name: str = "dimension",
    min_rows: int = 20,
) -> tuple[list[DriverContribution], list[DriverContribution], bool]:
    """
    Computes segment contributions for additive metrics (revenue, orders, units) per Section 8.3.
    Contribution of segment i is current value minus baseline value.
    Share of change is contribution divided by total change.
    When total change is small relative to gross movements, reports offsetting effects.
    """
    all_keys = set(baseline_segments.keys()) | set(current_segments.keys())
    b_counts = baseline_counts or {}
    c_counts = current_counts or {}

    total_baseline = sum(baseline_segments.values())
    total_current = sum(current_segments.values())
    total_delta = total_current - total_baseline

    gross_delta = 0.0
    items: list[dict[str, Any]] = []

    for k in all_keys:
        b_val = baseline_segments.get(k, 0.0)
        c_val = current_segments.get(k, 0.0)
        delta_i = c_val - b_val
        gross_delta += abs(delta_i)

        b_cnt = b_counts.get(k, 0)
        c_cnt = c_counts.get(k, 0)
        is_low_support = (b_cnt + c_cnt > 0) and (max(b_cnt, c_cnt) < min_rows)

        items.append(
            {
                "key": k,
                "b_val": b_val,
                "c_val": c_val,
                "delta": delta_i,
                "b_cnt": b_cnt,
                "c_cnt": c_cnt,
                "low_support": is_low_support,
            }
        )

    # Detect offsetting effects: gross absolute movement is much larger than net change
    has_offsetting = False
    if gross_delta > 0:
        if abs(total_delta) < 1e-9 or (gross_delta / (abs(total_delta) + 1e-9) > 2.5):
            has_offsetting = True

    # Build contributions
    contributions: list[DriverContribution] = []
    offsetting_contributions: list[DriverContribution] = []

    for item in items:
        k = item["key"]
        # Never present NULL / None as a business driver (per Section 8.2 & N5)
        if k is None or str(k).upper() in ("NULL", "NONE", ""):
            continue

        delta_i = item["delta"]
        if abs(total_delta) > 1e-9:
            share = delta_i / total_delta
        else:
            share = (delta_i / gross_delta) if gross_delta > 0 else 0.0

        direction: Literal["positive", "negative"] = "positive" if delta_i >= 0 else "negative"

        contrib = DriverContribution(
            id=str(uuid.uuid4()),
            dimension=dimension_name,
            segment_value=str(k),
            current_value=round(item["c_val"], 4),
            baseline_value=round(item["b_val"], 4),
            contribution_amount=round(delta_i, 4),
            share_of_change=round(share, 4),
            direction=direction,
            row_count_current=item["c_cnt"],
            row_count_baseline=item["b_cnt"],
            low_support=item["low_support"],
        )
        contributions.append(contrib)
        if has_offsetting and abs(delta_i) > 0.05 * gross_delta:
            offsetting_contributions.append(contrib)

    # Sort contributions by absolute impact descending
    contributions.sort(key=lambda c: abs(c.contribution_amount), reverse=True)
    offsetting_contributions.sort(key=lambda c: abs(c.contribution_amount), reverse=True)

    return contributions, offsetting_contributions, has_offsetting


def compute_ratio_rate_mix_split(
    baseline_num: dict[str, float],
    baseline_den: dict[str, float],
    current_num: dict[str, float],
    current_den: dict[str, float],
    baseline_counts: dict[str, int] | None = None,
    current_counts: dict[str, int] | None = None,
    dimension_name: str = "dimension",
    min_rows: int = 20,
) -> tuple[list[DriverContribution], list[DriverContribution], bool]:
    """
    Computes exact two-point rate/mix decomposition for ratio metrics per Section 8.3.
    w_i = denominator share (weight)
    r_i = numerator / denominator (rate)
    Rate effect = average weight * change in rate
    Mix effect = change in weight * (average segment rate - average overall rate)
    Exact identity: sum(Rate effect + Mix effect) == delta R identically.
    """
    all_keys = set(baseline_den.keys()) | set(current_den.keys())
    b_counts = baseline_counts or {}
    c_counts = current_counts or {}

    total_b_num = sum(baseline_num.values())
    total_b_den = sum(baseline_den.values())
    total_c_num = sum(current_num.values())
    total_c_den = sum(current_den.values())

    R0 = (total_b_num / total_b_den) if total_b_den > 0 else 0.0
    R1 = (total_c_num / total_c_den) if total_c_den > 0 else 0.0
    total_delta_R = R1 - R0
    R_bar = (R0 + R1) / 2.0

    contributions: list[DriverContribution] = []
    gross_impact = 0.0

    for k in all_keys:
        # Never present NULL / None as a business driver
        if k is None or str(k).upper() in ("NULL", "NONE", ""):
            continue

        n0 = baseline_num.get(k, 0.0)
        d0 = baseline_den.get(k, 0.0)
        n1 = current_num.get(k, 0.0)
        d1 = current_den.get(k, 0.0)

        w0 = (d0 / total_b_den) if total_b_den > 0 else 0.0
        w1 = (d1 / total_c_den) if total_c_den > 0 else 0.0
        w_bar = (w0 + w1) / 2.0
        delta_w = w1 - w0

        r0 = (n0 / d0) if d0 > 0 else 0.0
        r1 = (n1 / d1) if d1 > 0 else 0.0
        r_bar = (r0 + r1) / 2.0
        delta_r = r1 - r0

        rate_effect = w_bar * delta_r
        mix_effect = delta_w * (r_bar - R_bar)
        total_contrib = rate_effect + mix_effect
        gross_impact += abs(total_contrib)

        b_cnt = b_counts.get(k, int(d0))
        c_cnt = c_counts.get(k, int(d1))
        is_low_support = (b_cnt + c_cnt > 0) and (max(b_cnt, c_cnt) < min_rows)

        share = (total_contrib / total_delta_R) if abs(total_delta_R) > 1e-9 else 0.0
        direction: Literal["positive", "negative"] = (
            "positive" if total_contrib >= 0 else "negative"
        )

        contrib = DriverContribution(
            id=str(uuid.uuid4()),
            dimension=dimension_name,
            segment_value=str(k),
            current_value=round(r1, 4),
            baseline_value=round(r0, 4),
            contribution_amount=round(total_contrib, 4),
            share_of_change=round(share, 4),
            direction=direction,
            rate_effect=round(rate_effect, 4),
            mix_effect=round(mix_effect, 4),
            row_count_current=c_cnt,
            row_count_baseline=b_cnt,
            low_support=is_low_support,
        )
        contributions.append(contrib)

    has_offsetting = False
    if gross_impact > 0 and (
        abs(total_delta_R) < 1e-9 or (gross_impact / (abs(total_delta_R) + 1e-9) > 2.5)
    ):
        has_offsetting = True

    offsetting_contributions = (
        [c for c in contributions if abs(c.contribution_amount) > 0.05 * gross_impact]
        if has_offsetting
        else []
    )

    contributions.sort(key=lambda c: abs(c.contribution_amount), reverse=True)
    offsetting_contributions.sort(key=lambda c: abs(c.contribution_amount), reverse=True)

    return contributions, offsetting_contributions, has_offsetting
