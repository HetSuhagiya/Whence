import pytest

from app.explain.models import (
    DataQualityIssue,
    DriverContribution,
    Evidence,
    NoiseCheckResult,
    PipelineCheckRecord,
    SeasonalityResult,
)
from app.narrative.checker import NumberChecker
from app.narrative.client import FakeLLMClient
from app.narrative.fallback import DeterministicFallbackGenerator
from app.narrative.models import NarrativeOutput
from app.narrative.service import NarrativeService


@pytest.fixture
def sample_evidence() -> Evidence:
    return Evidence(
        id="ev_test_123",
        metric_name="revenue",
        metric_type="additive",
        time_grain="week",
        baseline_window={"start": "2017-11-13", "end": "2017-11-19"},
        current_window={"start": "2017-11-20", "end": "2017-11-26"},
        baseline_value=175819.69,
        current_value=407169.06,
        delta=231349.37,
        percent_change=131.6,
        confidence="Medium",
        confidence_reason="Top 3 drivers explain 69.9% of change across multiple segments.",
        drivers=[
            DriverContribution(
                id="d1",
                dimension="state",
                segment_value="SP",
                contribution_amount=74330.94,
                share_of_change=0.338,
                baseline_value=50000.0,
                current_value=124330.94,
                direction="positive",
            ),
            DriverContribution(
                id="d2",
                dimension="state",
                segment_value="MG",
                contribution_amount=45256.14,
                share_of_change=0.206,
                baseline_value=30000.0,
                current_value=75256.14,
                direction="positive",
            ),
            DriverContribution(
                id="d3",
                dimension="state",
                segment_value="RJ",
                contribution_amount=33970.39,
                share_of_change=0.155,
                baseline_value=20000.0,
                current_value=53970.39,
                direction="positive",
            ),
        ],
        has_offsetting_effects=False,
        checks_run=[
            PipelineCheckRecord(name="duplicate_load", status="pass", message="No duplicates"),
            PipelineCheckRecord(name="null_spike", status="pass", message="No null spikes"),
        ],
        noise_check=NoiseCheckResult(
            is_outside_normal_range=True,
            median_delta=5000.0,
            mad_delta=2000.0,
            z_score=4.5,
            rank_summary="Largest change in 26 weeks",
            history_periods_count=26,
        ),
        seasonality_check=SeasonalityResult(
            has_seasonality_pattern=False,
            seasonality_explains_change=False,
            note="Spike is non-seasonal",
        ),
    )


def test_number_checker_accepts_valid_figures_and_rounding(sample_evidence: Evidence):
    checker = NumberChecker(tolerance_pct=0.02)
    # Valid text mentioning real numbers with formatting/rounding
    text = (
        "Revenue increased by +131.6% ($231.3k) between 2017-11-13 and 2017-11-26. "
        "The state of SP was the top contributor with $74,330.94, representing 33.8% of the increase. "
        "MG contributed $45.3k (20.6%)."
    )
    valid, errors = checker.check(text, sample_evidence)
    assert valid, f"Expected valid but got errors: {errors}"
    assert len(errors) == 0


def test_number_checker_rejects_invented_figures(sample_evidence: Evidence):
    checker = NumberChecker(tolerance_pct=0.02)
    text = (
        "Revenue increased by 131.6% with an extra $999,999.00 from an unexpected influx. "
        "Segment SP accounted for 85.0% of the movement."
    )
    valid, errors = checker.check(text, sample_evidence)
    assert not valid
    assert any("999,999" in err or "85.0" in err for err in errors)


def test_number_checker_rejects_exclamation_marks_and_hype_words(sample_evidence: Evidence):
    checker = NumberChecker()
    text1 = "Revenue increased by 131.6% across the country!"
    valid1, errors1 = checker.check(text1, sample_evidence)
    assert not valid1
    assert any("exclamation mark" in err for err in errors1)

    text2 = "Revenue skyrocketed by 131.6% with massive growth in SP."
    valid2, errors2 = checker.check(text2, sample_evidence)
    assert not valid2
    assert any("hype words" in err for err in errors2)


def test_deterministic_fallback_generator(sample_evidence: Evidence):
    fallback = DeterministicFallbackGenerator.generate(sample_evidence, reason="No key")
    assert fallback.is_fallback is True
    assert fallback.fallback_reason == "No key"
    assert "Revenue increased by +131.6%" in fallback.headline
    assert len(fallback.supporting_sentences) >= 2
    assert any("SP" in s for s in fallback.supporting_sentences)


def test_deterministic_fallback_at_low_confidence(sample_evidence: Evidence):
    sample_evidence.confidence = "Low"
    sample_evidence.confidence_reason = "Movement is within normal noise range."
    fallback = DeterministicFallbackGenerator.generate(sample_evidence)
    assert fallback.is_fallback is True
    assert "No single cause stands out" in fallback.headline
    assert len(fallback.supporting_sentences) >= 2


def test_deterministic_fallback_on_data_quality_issue(sample_evidence: Evidence):
    sample_evidence.data_quality_issues = [
        DataQualityIssue(
            id="dq1",
            issue_type="duplicate_jump",
            dimension="overall",
            description="Duplicate rows detected on 2017-11-24",
            severity="high",
        ),
    ]
    fallback = DeterministicFallbackGenerator.generate(sample_evidence)
    assert fallback.is_fallback is True
    assert "Data quality irregularity" in fallback.headline
    assert any("duplicate" in s.lower() for s in fallback.supporting_sentences)


@pytest.mark.asyncio
async def test_narrative_service_with_fake_llm_client(sample_evidence: Evidence):
    canned = NarrativeOutput(
        headline="Revenue increased by +131.6% from 2017-11-13 to 2017-11-26.",
        supporting_sentences=[
            "State SP accounted for 33.8% ($74.3k) of the increase.",
            "State MG accounted for 20.6% ($45.3k) of the increase.",
        ],
        caveats=["Growth may be partially attributed to promotional activity."],
    )
    fake_client = FakeLLMClient(canned_response=canned)
    service = NarrativeService(client=fake_client)

    result = await service.generate_narrative(sample_evidence, metric_description="Total net sales")
    assert result.is_fallback is False
    assert result.headline == canned.headline
    assert len(fake_client.raw_payload_spy) == 1


@pytest.mark.asyncio
async def test_raw_rows_never_appear_in_prompt_payload(sample_evidence: Evidence):
    fake_client = FakeLLMClient()
    spy_payloads: list[dict] = []
    fake_client.raw_payload_spy = spy_payloads
    service = NarrativeService(client=fake_client)

    await service.generate_narrative(sample_evidence, metric_description="Total net sales")

    assert len(spy_payloads) >= 1
    sent_prompt = spy_payloads[0]["user_prompt"]

    # Verify prompt contains only Evidence aggregates
    assert "Baseline value: 175,819.69" in sent_prompt
    assert "SP" in sent_prompt
    # Verify no raw tabular rows or row records exist in prompt
    assert "SELECT " not in sent_prompt
    assert "order_id" not in sent_prompt
    assert "customer_id" not in sent_prompt


@pytest.mark.asyncio
async def test_product_works_with_llm_api_key_empty(
    sample_evidence: Evidence, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("LLM_API_KEY", "")
    from app.config import get_settings

    get_settings.cache_clear()
    service = NarrativeService(client=None)
    result = await service.generate_narrative(sample_evidence)
    assert result.is_fallback is True
    assert "No language model API key configured" in (result.fallback_reason or "")
    get_settings.cache_clear()
    assert "Revenue increased by +131.6%" in result.headline
