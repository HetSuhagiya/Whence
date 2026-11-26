/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExplainDialog, type ExplainCompletedPayload } from "@/components/dashboard/ExplainDialog";
import { TimingDistributionStrip } from "@/components/dashboard/TimingDistributionStrip";
import { SegmentComparisonTable } from "@/components/dashboard/SegmentComparisonTable";
import { RatioDecompositionPanel } from "@/components/dashboard/RatioDecompositionPanel";
import { ConfidenceScorecard } from "@/components/dashboard/ConfidenceScorecard";
import { NextInquiriesList } from "@/components/dashboard/NextInquiriesList";
import { DimensionSelectorWaterfall } from "@/components/dashboard/DimensionSelectorWaterfall";

// Mock Chart.js
vi.mock("react-chartjs-2", () => ({
  Bar: ({ data }: any) => (
    <div data-testid="mock-waterfall-bar-chart">
      <div data-testid="bar-labels">{data.labels?.join(",")}</div>
      <div data-testid="bar-data">{data.datasets?.[0]?.data?.join(",")}</div>
    </div>
  ),
  Line: () => <div data-testid="mock-line-chart">Line Chart</div>,
}));

describe("Ticket 004: Explain Detail v2 UI Components", () => {
  const dummyProps = {
    dashboardId: "dash-123",
    chartId: "chart-123",
    baselineMode: "previous_period" as const,
    onBaselineModeChange: vi.fn(),
    onClose: vi.fn(),
  };

  const sampleCompletedPayload: ExplainCompletedPayload = {
    evidence: {
      metric_name: "revenue",
      baseline_window: { start: "2017-11-13", end: "2017-11-19" },
      current_window: { start: "2017-11-20", end: "2017-11-26" },
      baseline_value: 175819.69,
      current_value: 407169.06,
      delta: 231349.37,
      percent_change: 131.6,
      confidence: "High",
      confidence_reason: "Top drivers explain 69.9% of change with high significance.",
      drivers: [
        {
          id: "d1",
          dimension: "state",
          segment_value: "SP",
          contribution_amount: 74330.94,
          share_of_change: 0.338,
          baseline_value: 65000.0,
          current_value: 139330.94,
        },
        {
          id: "d2",
          dimension: "state",
          segment_value: "MG",
          contribution_amount: 45256.14,
          share_of_change: 0.206,
          baseline_value: 25000.0,
          current_value: 70256.14,
        },
      ],
      dimension_waterfalls: {
        state: [
          {
            id: "d1",
            dimension: "state",
            segment_value: "SP",
            contribution_amount: 74330.94,
            share_of_change: 0.338,
            baseline_value: 65000.0,
            current_value: 139330.94,
          },
          {
            id: "d2",
            dimension: "state",
            segment_value: "MG",
            contribution_amount: 45256.14,
            share_of_change: 0.206,
            baseline_value: 25000.0,
            current_value: 70256.14,
          },
        ],
        category: [
          {
            id: "d3",
            dimension: "category",
            segment_value: "watches_gifts",
            contribution_amount: 32000.0,
            share_of_change: 0.145,
            baseline_value: 15000.0,
            current_value: 47000.0,
          },
        ],
      },
      dimension_shares: {
        state: 0.699,
        category: 0.452,
        channel: 0.08,
      },
      segment_lift: {
        state: { SP: 1.82, MG: 1.45 },
        category: { watches_gifts: 2.15 },
      },
      ruled_out_dimensions: ["channel"],
      timing_strip: [
        { date: "2017-11-20", label: "Mon 20 Nov", current_value: 25000, baseline_value: 20000, delta: 5000, share_of_change: 0.02 },
        { date: "2017-11-24", label: "Fri 24 Nov", current_value: 165000, baseline_value: 25000, delta: 140000, share_of_change: 0.605 },
        { date: "2017-11-26", label: "Sun 26 Nov", current_value: 45000, baseline_value: 20000, delta: 25000, share_of_change: 0.108 },
      ],
      timing_summary: "61% of the change was concentrated on Fri 24 Nov",
      segment_comparison_table: [
        {
          dimension: "state",
          segment: "SP",
          baseline_value: 65000.0,
          current_value: 139330.94,
          delta: 74330.94,
          percent_change: 114.4,
          share_of_change: 33.8,
          lift: 1.82,
        },
        {
          dimension: "state",
          segment: "MG",
          baseline_value: 25000.0,
          current_value: 70256.14,
          delta: 45256.14,
          percent_change: 181.0,
          share_of_change: 20.6,
          lift: 1.45,
        },
      ],
      ratio_decomposition: {
        volume_effect: 18.5,
        mix_effect: 1240.5,
        rate_effect: 3500.2,
        mix_share: 26.2,
        rate_share: 73.8,
        plain_language: "Volume effect: order volume shifted by +18.5%. Mix effect (26.2% of ratio change): shift in composition. Rate effect (73.8% of ratio change): changes in price.",
      },
      confidence_breakdown: [
        {
          name: "Reporting Completeness",
          category: "completeness",
          status: "pass",
          score: 100,
          description: "Current period data is complete with no reporting lag detected.",
        },
        {
          name: "Volatility & Noise",
          category: "volatility",
          status: "pass",
          score: 100,
          description: "Delta is outside normal historical volatility (z=4.20).",
        },
        {
          name: "Seasonality & Cycles",
          category: "seasonality",
          status: "pass",
          score: 100,
          description: "Movement is not explained by routine weekday cycles.",
        },
        {
          name: "Data Quality Anomalies",
          category: "data_quality",
          status: "pass",
          score: 100,
          description: "No zero drops, null spikes, or duplicate loads detected.",
        },
      ],
      next_inquiries: [
        "Did marketing promotions or discount campaigns run for 'SP' in state during this period?",
        "What operational campaigns or scheduled releases occurred on Fri 24 Nov?",
      ],
    },
    narrative: {
      headline: "Revenue increased by +131.6% driven primarily by SP in state.",
      supporting_sentences: [
        "State SP contributed $74,330.94 (33.8% of the change).",
        "State MG contributed $45,256.14 (20.6% of the change).",
      ],
      caveats: [],
      is_fallback: false,
    },
  };

  it("1. renders DimensionSelectorWaterfall with dimension pills, lift badges, and ruled out banner", () => {
    render(
      <DimensionSelectorWaterfall
        dimensionWaterfalls={sampleCompletedPayload.evidence.dimension_waterfalls!}
        dimensionShares={sampleCompletedPayload.evidence.dimension_shares!}
        segmentLift={sampleCompletedPayload.evidence.segment_lift!}
        ruledOutDimensions={sampleCompletedPayload.evidence.ruled_out_dimensions!}
      />
    );

    expect(screen.getByTestId("dimension-selector-waterfall")).toBeInTheDocument();
    expect(screen.getByTestId("dimension-btn-state")).toHaveTextContent("state");
    expect(screen.getByTestId("dimension-btn-state")).toHaveTextContent("70%");
    expect(screen.getByTestId("dimension-btn-category")).toHaveTextContent("category");
    expect(screen.getByTestId("dimension-btn-category")).toHaveTextContent("45%");

    // Ruled out badge
    expect(screen.getByTestId("ruled-out-dimensions-badge")).toHaveTextContent("channel");

    // Segment lift badges
    expect(screen.getByTestId("segment-lift-badge-SP")).toHaveTextContent("1.82x");
    expect(screen.getByTestId("segment-lift-badge-MG")).toHaveTextContent("1.45x");

    // Switch to category dimension
    fireEvent.click(screen.getByTestId("dimension-btn-category"));
    expect(screen.getAllByText("watches_gifts")[0]).toBeInTheDocument();
    expect(screen.getByTestId("segment-lift-badge-watches_gifts")).toHaveTextContent("2.15x");
  });

  it("2. renders TimingDistributionStrip with mini bars and factual summary sentence", () => {
    render(
      <TimingDistributionStrip
        timingStrip={sampleCompletedPayload.evidence.timing_strip!}
        timingSummary={sampleCompletedPayload.evidence.timing_summary!}
      />
    );

    expect(screen.getByTestId("timing-distribution-strip")).toBeInTheDocument();
    expect(screen.getByTestId("timing-summary-sentence")).toHaveTextContent(
      "61% of the change was concentrated on Fri 24 Nov"
    );
    expect(screen.getByTestId("timing-bar-1")).toBeInTheDocument();
  });

  it("3. renders SegmentComparisonTable with baseline, current, delta, percent change, and lift", () => {
    render(
      <SegmentComparisonTable
        rows={sampleCompletedPayload.evidence.segment_comparison_table!}
      />
    );

    expect(screen.getByTestId("segment-comparison-table")).toBeInTheDocument();
    expect(screen.getByTestId("segment-row-0")).toHaveTextContent("SP");
    expect(screen.getByTestId("segment-row-0")).toHaveTextContent("114.4%");
    expect(screen.getByTestId("segment-row-0")).toHaveTextContent("33.8%");
    expect(screen.getByTestId("segment-lift-0")).toHaveTextContent("1.82x");

    expect(screen.getByTestId("segment-row-1")).toHaveTextContent("MG");
    expect(screen.getByTestId("segment-lift-1")).toHaveTextContent("1.45x");
  });

  it("4. renders RatioDecompositionPanel with Volume, Mix, and Rate cards", () => {
    render(
      <RatioDecompositionPanel
        decomposition={sampleCompletedPayload.evidence.ratio_decomposition!}
      />
    );

    expect(screen.getByTestId("ratio-decomposition-panel")).toBeInTheDocument();
    expect(screen.getByText("Volume Effect")).toBeInTheDocument();
    expect(screen.getByText("+18.5%")).toBeInTheDocument();
    expect(screen.getByText("Mix Effect")).toBeInTheDocument();
    expect(screen.getByText("26.2%")).toBeInTheDocument();
    expect(screen.getByText("Rate Effect")).toBeInTheDocument();
    expect(screen.getByText("73.8%")).toBeInTheDocument();
    expect(screen.getByTestId("ratio-plain-words")).toHaveTextContent("shift in composition");
  });

  it("5. renders ConfidenceScorecard with itemized status pills and descriptions", () => {
    render(
      <ConfidenceScorecard
        breakdown={sampleCompletedPayload.evidence.confidence_breakdown!}
        overallConfidence="High"
        confidenceReason="Strong statistical significance"
      />
    );

    expect(screen.getByTestId("confidence-scorecard")).toBeInTheDocument();
    expect(screen.getByTestId("scorecard-overall-badge")).toHaveTextContent("High Confidence");
    expect(screen.getByText("Reporting Completeness")).toBeInTheDocument();
    expect(screen.getByText("Volatility & Noise")).toBeInTheDocument();
    expect(screen.getByText("Seasonality & Cycles")).toBeInTheDocument();
    expect(screen.getByText("Data Quality Anomalies")).toBeInTheDocument();
  });

  it("6. renders NextInquiriesList with inquiry-only questions", () => {
    render(
      <NextInquiriesList
        inquiries={sampleCompletedPayload.evidence.next_inquiries!}
      />
    );

    expect(screen.getByTestId("next-inquiries-container")).toBeInTheDocument();
    expect(screen.getByTestId("next-inquiry-0")).toHaveTextContent(
      "Did marketing promotions or discount campaigns run for 'SP'"
    );
    expect(screen.getByTestId("next-inquiry-1")).toHaveTextContent(
      "What operational campaigns or scheduled releases occurred on Fri 24 Nov?"
    );
  });

  it("7. renders complete ExplainDialog v2 integrating all sections seamlessly", () => {
    render(
      <ExplainDialog
        {...dummyProps}
        isOpen={true}
        initialCompletedData={sampleCompletedPayload}
      />
    );

    // Dimension Waterfall
    expect(screen.getByTestId("dimension-selector-waterfall")).toBeInTheDocument();
    // Timing strip
    expect(screen.getByTestId("timing-distribution-strip")).toBeInTheDocument();
    // Ratio decomposition
    expect(screen.getByTestId("ratio-decomposition-panel")).toBeInTheDocument();

    // Summary Tab inquiries
    expect(screen.getByTestId("next-inquiries-container")).toBeInTheDocument();

    // Click Evidence Tab
    fireEvent.click(screen.getByRole("button", { name: "Evidence" }));
    expect(screen.getByTestId("segment-comparison-table")).toBeInTheDocument();

    // Click Data Checks Tab
    fireEvent.click(screen.getByRole("button", { name: "Data checks" }));
    expect(screen.getByTestId("confidence-scorecard")).toBeInTheDocument();
  });
});
