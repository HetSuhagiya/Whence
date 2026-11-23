import math


def wilson_score_interval(
    successes: int,
    total: int,
    confidence: float = 0.95,
) -> tuple[float, float]:
    """
    Computes 95% Wilson score interval for binomial proportion p = successes / total.
    Handles boundary cases (0 and total) correctly without collapsing to [0,0] or [1,1].
    """
    if total <= 0:
        return 0.0, 0.0

    p_hat = successes / total
    # z for two-sided 95% confidence is 1.95996
    z = 1.95996 if confidence == 0.95 else (2.57583 if confidence == 0.99 else 1.64485)
    z2 = z * z

    denominator = 1.0 + z2 / total
    center = (p_hat + z2 / (2.0 * total)) / denominator
    spread = (
        z
        * math.sqrt((p_hat * (1.0 - p_hat) + z2 / (4.0 * total)) / total)
        / denominator
    )

    lower = max(0.0, center - spread)
    upper = min(1.0, center + spread)
    return round(lower, 4), round(upper, 4)


def format_rate_with_wilson(successes: int, total: int) -> str:
    """Formats rate as e.g. '95.0% [89.3%, 97.8%] (n=80)'."""
    if total <= 0:
        return "N/A (n=0)"
    p = successes / total
    low, high = wilson_score_interval(successes, total)
    return f"{p * 100:.1f}% [{low * 100:.1f}%, {high * 100:.1f}%] (n={total})"
