# Ticket 004: Explain Detail v2 (Deterministic Evidence First)

## Metadata
- **Workstream**: 4 (Explain Detail v2)
- **Size**: Large
- **Dependencies**: Ticket 001, Ticket 002, Ticket 003
- **Spec Reference**: Spec 002 (AC 4.1 - 4.2)

## Problem & Context
The current Explain modal shows a single driver waterfall and high-level checks, but lacks granular deterministic evidence: per-dimension views, segment lift relative to baseline, intra-window timing concentration, baseline vs current comparisons, ratio volume/mix/rate decompositions, ruled-out dimensions, transparent confidence scoring checks, and objective follow-up inquiries.

## Acceptance Criteria
1. **Per-Dimension View**:
   - Selector listing each evaluated dimension alongside the percentage share of change explained by its top segments.
   - Dynamic waterfall visualization updating to show segments for the selected dimension.
2. **Segment Lift**:
   - Displays each segment's share of change side-by-side with its share of baseline ($\text{Share of Change} / \text{Share of Baseline}$).
3. **Timing Distribution Strip**:
   - Intra-window temporal distribution (day-by-day or week-by-week) rendered as a mini bar strip.
   - Factual summary statement: e.g. `"62% of the change was concentrated on Fri 24 Nov"`.
4. **Baseline vs Current Segment Table**:
   - Formatted table per segment showing Baseline Value, Current Value, Absolute Delta, and Percent Change.
5. **Ratio Metric Breakdown**:
   - Plain-language deterministic decomposition into Volume effect, Mix effect, and Rate effect.
6. **Ruled-out Dimensions**:
   - Transparent list of candidate dimensions evaluated whose variations did not explain significant movement.
7. **Confidence Scoring Breakdown**:
   - Transparent itemized scorecard of individual validation checks (completeness, noise/volatility, seasonality, data quality anomalies).
8. **Next Inquiries**:
   - Actionable questions for analysts to explore next, framed strictly as inquiry and never claiming unverified causality.
9. **Narrative & NumberChecker Alignment**:
   - LLM narrative strictly references fields populated in the verified `Evidence` object.
   - Direction-aware `NumberChecker` validates all figures in the narrative before display.
   - Six historical Olist evaluation periods rerun to demonstrate before/after evidence outputs without dataset tuning.

## Technical Tasks
- **Backend**:
  - Extend `Evidence` model in `backend/app/explain/models.py` with:
    - `dimension_shares: dict[str, float]`
    - `lift_by_segment: dict[str, dict[str, float]]`
    - `timing_strip: list[dict[str, Any]]` and `timing_summary: str`
    - `segment_comparison_table: list[dict[str, Any]]`
    - `ratio_decomposition: dict[str, Any] | None`
    - `ruled_out_dimensions: list[str]`
    - `confidence_breakdown: list[dict[str, Any]]`
    - `next_inquiries: list[str]`
  - Extend `ExplainEngine` in `backend/app/explain/engine.py` to compute lift, intra-window daily concentrations, baseline-vs-current tables, and volume/mix/rate effects.
  - Update `NumberChecker` to verify new fields and directional consistency.
- **Frontend**:
  - Update `ExplainDialog.tsx` and create subcomponents:
    - `DimensionSelectorWaterfall.tsx`
    - `TimingDistributionStrip.tsx`
    - `SegmentComparisonTable.tsx`
    - `RatioDecompositionPanel.tsx`
    - `RuledOutDimensionsBadge.tsx`
    - `ConfidenceScorecard.tsx`
    - `NextInquiriesList.tsx`

## Test Plan & Verification
- Pytest tests in `backend/tests/test_explain_v2.py` asserting exact computation of lift ratios, timing concentration percentages, ratio decomposition, and NumberChecker validation.
- Evaluation harness (`npm run eval`) asserting identical or improved calibration.
- Rerun six historical Olist periods through `eval/run_olist_real_data.py` to verify real-data evidence generation.
- Vitest tests in `frontend/src/tests/explain_v2_ui.test.tsx`.
- Light and dark mode screenshots of Explain Detail v2.
