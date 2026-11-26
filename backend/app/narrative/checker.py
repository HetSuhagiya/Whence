import re
from typing import Any

from app.explain.models import Evidence

HYPE_WORDS = {
    "skyrocketed",
    "plummeted",
    "massive",
    "impressive",
    "shocking",
    "insane",
    "crazy",
    "unbelievable",
    "huge",
    "miraculous",
}


class NumberChecker:
    """
    Validates that every figure and named segment in the narrative output
    is verified by the deterministic Evidence object.
    """

    def __init__(self, tolerance_pct: float = 0.02):
        self.tolerance_pct = tolerance_pct

    def parse_numeric_token(self, token: str) -> float | None:
        clean = token.replace("$", "").replace(",", "").replace("%", "").strip()
        mult = 1.0
        if clean.lower().endswith("k"):
            mult = 1_000.0
            clean = clean[:-1]
        elif clean.lower().endswith("m"):
            mult = 1_000_000.0
            clean = clean[:-1]
        elif clean.lower().endswith("b"):
            mult = 1_000_000_000.0
            clean = clean[:-1]

        try:
            return float(clean) * mult
        except ValueError:
            return None

    def collect_evidence_numbers(self, evidence: Evidence) -> set[float]:
        numbers: set[float] = set()

        def add_num(val: Any) -> None:
            if val is None:
                return
            if isinstance(val, (int, float)):
                fval = float(val)
                numbers.add(fval)
                numbers.add(abs(fval))
                # If it's a percentage ratio (e.g. 0.338), also add 33.8
                if 0.0 <= abs(fval) <= 10.0:
                    numbers.add(round(fval * 100.0, 2))
                    numbers.add(round(abs(fval) * 100.0, 2))
                # If it's a percentage point (e.g. 33.8), also add 0.338
                if 0.0 <= abs(fval) <= 1000.0:
                    numbers.add(round(fval / 100.0, 4))
                    numbers.add(round(abs(fval) / 100.0, 4))
            elif isinstance(val, str):
                parsed = self.parse_numeric_token(val)
                if parsed is not None:
                    numbers.add(parsed)
                    numbers.add(abs(parsed))

        # Baseline & Current metrics
        add_num(evidence.baseline_value)
        add_num(evidence.current_value)
        add_num(evidence.delta)
        add_num(evidence.percent_change)

        # Driver values
        all_drivers = (evidence.drivers or []) + (evidence.offsetting_effects or [])
        for d in all_drivers:
            add_num(d.contribution_amount)
            add_num(d.share_of_change)
            add_num(d.baseline_value)
            add_num(d.current_value)
            if d.rate_effect is not None:
                add_num(d.rate_effect)
            if d.mix_effect is not None:
                add_num(d.mix_effect)

        # Window dates and counts (extract years, days, counts)
        date_pattern = r"\b(\d{4}|\d{1,2})\b"
        for w_dict in [evidence.baseline_window, evidence.current_window]:
            for val_str in w_dict.values():
                for match in re.finditer(date_pattern, str(val_str)):
                    parsed = self.parse_numeric_token(match.group(1))
                    if parsed is not None:
                        numbers.add(parsed)

        # Numbers present in diagnostic reasoning, noise checks, and data quality issues
        general_num_pattern = r"(?:\$|£|€)?\s*([+-]?\d+(?:,\d{3})*(?:\.\d+)?(?:\s*[kKmMbB%])?)"
        if evidence.confidence_reason:
            for m in re.finditer(general_num_pattern, evidence.confidence_reason):
                parsed = self.parse_numeric_token(m.group(1))
                if parsed is not None:
                    add_num(parsed)

        if evidence.noise_check:
            add_num(evidence.noise_check.median_delta)
            add_num(evidence.noise_check.mad_delta)
            add_num(evidence.noise_check.z_score)

        for issue in evidence.data_quality_issues or []:
            for m in re.finditer(general_num_pattern, issue.description):
                parsed = self.parse_numeric_token(m.group(1))
                if parsed is not None:
                    add_num(parsed)

        for ev in evidence.context_events or []:
            if ev.correlation_note:
                for m in re.finditer(general_num_pattern, ev.correlation_note):
                    parsed = self.parse_numeric_token(m.group(1))
                    if parsed is not None:
                        add_num(parsed)

        # Explain Detail v2 fields
        for share_val in (evidence.dimension_shares or {}).values():
            add_num(share_val)

        for dim_lifts in (evidence.segment_lift or {}).values():
            for l_val in dim_lifts.values():
                add_num(l_val)

        for t_item in evidence.timing_strip or []:
            add_num(t_item.get("current_value"))
            add_num(t_item.get("baseline_value"))
            add_num(t_item.get("delta"))
            add_num(t_item.get("share_of_change"))

        if evidence.timing_summary:
            for m in re.finditer(general_num_pattern, evidence.timing_summary):
                parsed = self.parse_numeric_token(m.group(1))
                if parsed is not None:
                    add_num(parsed)

        for row in evidence.segment_comparison_table or []:
            add_num(row.get("baseline_value"))
            add_num(row.get("current_value"))
            add_num(row.get("delta"))
            add_num(row.get("percent_change"))
            add_num(row.get("share_of_change"))
            add_num(row.get("lift"))

        if evidence.ratio_decomposition:
            rd = evidence.ratio_decomposition
            add_num(rd.get("volume_effect"))
            add_num(rd.get("mix_effect"))
            add_num(rd.get("rate_effect"))
            add_num(rd.get("mix_share"))
            add_num(rd.get("rate_share"))
            if rd.get("plain_language"):
                for m in re.finditer(general_num_pattern, str(rd["plain_language"])):
                    parsed = self.parse_numeric_token(m.group(1))
                    if parsed is not None:
                        add_num(parsed)

        for cb in evidence.confidence_breakdown or []:
            add_num(cb.get("score"))

        # Standard descriptive counts commonly used (1, 2, 3, 4, 5, 100)
        for c in [1.0, 2.0, 3.0, 4.0, 5.0, 100.0]:
            numbers.add(c)

        return numbers

    def collect_evidence_segments(self, evidence: Evidence) -> set[str]:
        segments: set[str] = set()
        all_drivers = (evidence.drivers or []) + (evidence.offsetting_effects or [])
        for d in all_drivers:
            if d.segment_value:
                segments.add(str(d.segment_value).strip().lower())
                # If two-way segment "CA & Search", add components
                for part in re.split(r"[+&/]| AND ", str(d.segment_value), flags=re.IGNORECASE):
                    if part.strip():
                        segments.add(part.strip().lower())
        return segments

    def check(self, text: str, evidence: Evidence) -> tuple[bool, list[str]]:
        errors: list[str] = []

        # 1. Hype words & Exclamation marks
        if "!" in text:
            errors.append("Narrative contains exclamation mark (!), violating plain style rule.")

        words = re.findall(r"\b[a-zA-Z]+\b", text.lower())
        found_hype = set(words).intersection(HYPE_WORDS)
        if found_hype:
            errors.append(f"Narrative contains hype words: {sorted(found_hype)}")

        # 2. Number extraction and verification
        evidence_numbers = self.collect_evidence_numbers(evidence)

        # Remove dates like YYYY-MM-DD or YYYY/MM/DD before matching negative numbers
        # so hyphens in dates (e.g. 2017-11-13) are not parsed as negative numbers (-11, -13)
        sanitized_text = re.sub(r"\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b", " DATE_TOKEN ", text)

        # Match numbers with optional $, %, k/m/b
        # Use word boundary after suffix so '4500 between' is not treated as 4500 billion
        num_pattern = r"(?:\$|£|€)?\s*([+-]?\d+(?:,\d{3})*(?:\.\d+)?(?:%|(?:\s*[kKmMbB]\b))?)"
        extracted_tokens = re.findall(num_pattern, sanitized_text)

        for raw_tok in extracted_tokens:
            val = self.parse_numeric_token(raw_tok)
            if val is None:
                continue

            # Check if val matches any number in evidence within relative or absolute tolerance
            matched = False
            for ev_num in evidence_numbers:
                if abs(ev_num) < 1e-6:
                    if abs(val) < 1e-4:
                        matched = True
                        break
                else:
                    rel_diff = abs(val - ev_num) / abs(ev_num)
                    abs_diff = abs(val - ev_num)
                    # Allow up to 2% relative tolerance or up to 1.0 absolute difference (for rounding)
                    if rel_diff <= self.tolerance_pct or abs_diff <= 1.5:
                        matched = True
                        break

            if not matched:
                errors.append(
                    f"Extracted figure '{raw_tok}' ({val}) does not match any number in Evidence."
                )

        # 3. Directional consistency check
        pos_words = {"rose", "increased", "grew", "surged", "jumped", "higher"}
        neg_words = {"fell", "decreased", "dropped", "declined", "plunged", "lower"}

        sentences = [s.strip() for s in re.split(r"[.\n]", text) if s.strip()]
        lead_sentence = sentences[0].lower() if sentences else text.lower()
        lead_words = set(re.findall(r"\b[a-zA-Z]+\b", lead_sentence))
        metric_word = evidence.metric_name.lower()

        if evidence.delta < -1e-6:
            if (lead_words & pos_words) and not (lead_words & neg_words):
                errors.append(
                    f"Directional mismatch: narrative claims {evidence.metric_name} rose/increased, but Evidence delta is negative ({evidence.delta})."
                )
            else:
                for sent in sentences:
                    sw = set(re.findall(r"\b[a-zA-Z]+\b", sent.lower()))
                    if (metric_word in sent.lower() or "overall" in sent.lower() or "total" in sent.lower()) and (sw & pos_words) and not (sw & neg_words):
                        errors.append(
                            f"Directional mismatch: narrative claims {evidence.metric_name} rose/increased, but Evidence delta is negative ({evidence.delta})."
                        )
                        break
        elif evidence.delta > 1e-6:
            if (lead_words & neg_words) and not (lead_words & pos_words):
                errors.append(
                    f"Directional mismatch: narrative claims {evidence.metric_name} fell/decreased, but Evidence delta is positive ({evidence.delta})."
                )
            else:
                for sent in sentences:
                    sw = set(re.findall(r"\b[a-zA-Z]+\b", sent.lower()))
                    if (metric_word in sent.lower() or "overall" in sent.lower() or "total" in sent.lower()) and (sw & neg_words) and not (sw & pos_words):
                        errors.append(
                            f"Directional mismatch: narrative claims {evidence.metric_name} fell/decreased, but Evidence delta is positive ({evidence.delta})."
                        )
                        break

        return (len(errors) == 0, errors)
