import logging
from pathlib import Path

from app.explain.models import Evidence
from app.narrative.checker import NumberChecker
from app.narrative.client import LLMClient, get_llm_client
from app.narrative.fallback import DeterministicFallbackGenerator
from app.narrative.models import NarrativeOutput

logger = logging.getLogger("whence.narrative")

PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts" / "v1"


class NarrativeService:
    """Orchestrates structured LLM narrative generation, number checks, and deterministic fallback."""

    def __init__(
        self,
        client: LLMClient | None = None,
        max_segments: int = 15,
        tolerance_pct: float = 0.02,
    ) -> None:
        self._injected_client = client
        self.max_segments = max_segments
        self.checker = NumberChecker(tolerance_pct=tolerance_pct)

    def _get_client(self) -> LLMClient | None:
        if self._injected_client is not None:
            return self._injected_client
        return get_llm_client()

    def _load_prompt_templates(self) -> tuple[str, str]:
        system_path = PROMPTS_DIR / "narrative_system.txt"
        user_path = PROMPTS_DIR / "narrative_user.txt"

        if not system_path.exists() or not user_path.exists():
            raise FileNotFoundError(f"Prompt templates missing at {PROMPTS_DIR}")

        system_prompt = system_path.read_text(encoding="utf-8")
        user_prompt = user_path.read_text(encoding="utf-8")
        return system_prompt, user_prompt

    def _build_user_prompt(self, user_template: str, evidence: Evidence, metric_description: str) -> str:
        # Build top drivers text, limited to max_segments
        drivers = (evidence.drivers or [])[: self.max_segments]
        if drivers:
            driver_lines = []
            for d in drivers:
                line = (
                    f"  - [{d.dimension}] {d.segment_value}: "
                    f"contribution = {d.contribution_amount:+,.2f}, "
                    f"share of change = {d.share_of_change * 100.0:.1f}%, "
                    f"baseline = {d.baseline_value:,.2f}, current = {d.current_value:,.2f}"
                )
                if d.rate_effect is not None and d.mix_effect is not None:
                    line += f" (rate effect = {d.rate_effect:+,.2f}, mix effect = {d.mix_effect:+,.2f})"
                driver_lines.append(line)
            top_drivers_text = "\n".join(driver_lines)
        else:
            top_drivers_text = "  - None identified (movement was broad-based or noise)."

        b_win = f"{evidence.baseline_window.get('start', '')} to {evidence.baseline_window.get('end', '')}"
        c_win = f"{evidence.current_window.get('start', '')} to {evidence.current_window.get('end', '')}"

        # Rate / mix text
        rate_mix_text = "N/A (Additive metric)"
        if evidence.metric_type == "ratio":
            # Check if drivers have rate/mix breakdown
            rate_sum = sum(d.rate_effect for d in drivers if d.rate_effect is not None)
            mix_sum = sum(d.mix_effect for d in drivers if d.mix_effect is not None)
            rate_mix_text = f"Total rate effect = {rate_sum:+,.2f}, Total mix effect = {mix_sum:+,.2f}"

        # Data quality flags
        flags = [f"{i.issue_type}: {i.description}" for i in (evidence.data_quality_issues or [])]
        dq_text = ", ".join(flags) if flags else "None"

        # Events text
        if evidence.context_events:
            ev_list = [f"{e.title} ({e.event_type})" for e in evidence.context_events]
            events_text = ", ".join(ev_list)
        else:
            events_text = "None"

        replacements = {
            "{metric_name}": evidence.metric_name,
            "{metric_type}": "Ratio" if evidence.metric_type == "ratio" else "Additive",
            "{metric_description}": metric_description or "Warehouse metric",
            "{baseline_window}": b_win,
            "{current_window}": c_win,
            "{baseline_value}": f"{evidence.baseline_value:,.2f}",
            "{current_value}": f"{evidence.current_value:,.2f}",
            "{delta_value}": f"{evidence.delta:+,.2f}",
            "{percent_change}": f"{evidence.percent_change:+.1f}%",
            "{confidence}": evidence.confidence,
            "{confidence_reason}": evidence.confidence_reason or "Automated engine assessment",
            "{top_drivers_text}": top_drivers_text,
            "{offsetting_effects}": "Yes" if evidence.has_offsetting_effects else "No",
            "{rate_mix_text}": rate_mix_text,
            "{data_quality_flags}": dq_text,
            "{events_text}": events_text,
        }
        rendered = user_template
        for k, v in replacements.items():
            rendered = rendered.replace(k, str(v))
        return rendered

    async def generate_narrative(
        self,
        evidence: Evidence,
        metric_description: str = "",
    ) -> NarrativeOutput:
        client = self._get_client()
        if client is None:
            return DeterministicFallbackGenerator.generate(
                evidence, reason="No language model API key configured"
            )

        try:
            system_prompt, user_template = self._load_prompt_templates()
            user_prompt = self._build_user_prompt(user_template, evidence, metric_description)
        except Exception as e:
            logger.warning("Failed to prepare narrative prompt: %s. Using fallback.", e)
            return DeterministicFallbackGenerator.generate(
                evidence, reason=f"Prompt preparation error: {e}"
            )

        # First generation attempt
        try:
            result, _ = await client.generate_structured(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                schema=NarrativeOutput,
                temperature=0.1,
            )
            full_text = f"{result.headline} {' '.join(result.supporting_sentences)} {' '.join(result.caveats)}"
            valid, errors = self.checker.check(full_text, evidence)
            if valid:
                result.is_fallback = False
                result.fallback_reason = None
                return result

            logger.info("Number check failed on first attempt: %s. Retrying with feedback.", errors)
        except Exception as e:
            logger.warning("LLM first attempt failed: %s. Retrying once.", e)
            errors = [str(e)]

        # Retry once with feedback
        try:
            feedback_prompt = (
                f"{user_prompt}\n\n"
                f"CORRECTION REQUIRED: Your previous attempt failed validation with the following errors:\n"
                + "\n".join(f"- {err}" for err in errors)
                + "\nEnsure every figure and named segment matches the evidence exactly, with no exclamation marks or hype words."
            )
            result, _ = await client.generate_structured(
                system_prompt=system_prompt,
                user_prompt=feedback_prompt,
                schema=NarrativeOutput,
                temperature=0.0,
            )
            full_text = f"{result.headline} {' '.join(result.supporting_sentences)} {' '.join(result.caveats)}"
            valid, retry_errors = self.checker.check(full_text, evidence)
            if valid:
                result.is_fallback = False
                result.fallback_reason = None
                return result

            logger.warning("Number check failed on retry: %s. Falling back to template.", retry_errors)
            return DeterministicFallbackGenerator.generate(
                evidence, reason=f"Number check failed after retry: {retry_errors[0]}"
            )
        except Exception as e:
            logger.warning("LLM retry failed: %s. Falling back to template.", e)
            return DeterministicFallbackGenerator.generate(
                evidence, reason=f"Language model error: {e}"
            )


narrative_service = NarrativeService()
