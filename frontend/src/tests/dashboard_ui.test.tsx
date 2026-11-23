import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { ExplainDialog, type ExplainCompletedPayload } from "@/components/dashboard/ExplainDialog";

// Mock Chart.js components
vi.mock("react-chartjs-2", () => ({
  Bar: () => <div data-testid="mock-waterfall-bar-chart">Waterfall Chart</div>,
  Line: () => <div data-testid="mock-line-chart">Line Chart</div>,
}));

describe("ExplainDialog Component States (Item 7)", () => {
  const dummyProps = {
    dashboardId: "dash-123",
    chartId: "chart-123",
    baselineMode: "previous_period" as const,
    onBaselineModeChange: vi.fn(),
    onClose: vi.fn(),
  };

  it("1. renders Progress State (SSE streaming checklist)", () => {
    render(
      <ExplainDialog
        {...dummyProps}
        isOpen={true}
        // No initialCompletedData -> triggers progress/loading
      />
    );

    expect(screen.getByText(/Running 10-step explain pipeline/i)).toBeInTheDocument();
    expect(screen.getByText("Resolve comparison windows")).toBeInTheDocument();
    expect(screen.getByText("Evaluate normal volatility (Median / MAD)")).toBeInTheDocument();
    expect(screen.getByText("Generate & verify plain narrative")).toBeInTheDocument();
  });

  it("2. renders High Confidence Result with driver waterfall and ranked list", () => {
    const highPayload: ExplainCompletedPayload = {
      evidence: {
        metric_name: "revenue",
        baseline_window: { start: "2017-11-13", end: "2017-11-19" },
        current_window: { start: "2017-11-20", end: "2017-11-26" },
        baseline_value: 175819.69,
        current_value: 407169.06,
        delta: 231349.37,
        percent_change: 131.6,
        confidence: "High",
        confidence_reason: "SP and MG account for 54.4% of change with high statistical significance.",
        drivers: [
          {
            id: "d1",
            dimension: "state",
            segment_value: "SP",
            contribution_amount: 74330.94,
            share_of_change: 0.338,
          },
          {
            id: "d2",
            dimension: "state",
            segment_value: "MG",
            contribution_amount: 45256.14,
            share_of_change: 0.206,
          },
        ],
        data_quality_issues: [],
      },
      narrative: {
        headline: "Revenue increased by +131.6% driven primarily by SP.",
        supporting_sentences: [
          "State SP contributed $74,330.94 (33.8% of the change).",
          "State MG contributed $45,256.14 (20.6% of the change).",
        ],
        caveats: [],
        is_fallback: false,
      },
    };

    render(
      <ExplainDialog
        {...dummyProps}
        isOpen={true}
        initialCompletedData={highPayload}
      />
    );

    expect(screen.getByTestId("confidence-badge-high")).toHaveTextContent("High Confidence");
    expect(screen.getByTestId("explain-headline")).toHaveTextContent("Revenue increased by +131.6% driven primarily by SP.");
    expect(screen.getByTestId("mock-waterfall-bar-chart")).toBeInTheDocument();
    expect(screen.getByText("SP")).toBeInTheDocument();
    expect(screen.getByText("MG")).toBeInTheDocument();
  });

  it("3. renders Low Confidence Result with calm 'no single cause stands out' message", () => {
    const lowPayload: ExplainCompletedPayload = {
      evidence: {
        metric_name: "revenue",
        baseline_window: { start: "2017-05-08", end: "2017-05-14" },
        current_window: { start: "2017-05-15", end: "2017-05-21" },
        baseline_value: 113051.56,
        current_value: 122182.25,
        delta: 9130.69,
        percent_change: 8.1,
        confidence: "Low",
        confidence_reason: "Change is within normal historical volatility; no single cause stands out.",
        drivers: [],
        data_quality_issues: [],
      },
      narrative: {
        headline: "No single cause stands out for the +8.1% change in revenue.",
        supporting_sentences: [
          "Revenue moved from $113,051.56 to $122,182.25.",
          "Change is within normal historical volatility.",
        ],
        caveats: ["Movement is within normal noise range."],
        is_fallback: false,
      },
    };

    render(
      <ExplainDialog
        {...dummyProps}
        isOpen={true}
        initialCompletedData={lowPayload}
      />
    );

    expect(screen.getByTestId("confidence-badge-low")).toHaveTextContent("Low Confidence");
    expect(screen.getByTestId("no-single-cause-notice")).toBeInTheDocument();
    expect(screen.getByText("No single cause stands out")).toBeInTheDocument();
  });

  it("4. renders prominent Data Issue Flag banner when DQ scan triggers", () => {
    const dqPayload: ExplainCompletedPayload = {
      evidence: {
        metric_name: "orders",
        baseline_window: { start: "2017-03-06", end: "2017-03-12" },
        current_window: { start: "2017-03-13", end: "2017-03-19" },
        baseline_value: 1000,
        current_value: 2000,
        delta: 1000,
        percent_change: 100.0,
        confidence: "Low",
        confidence_reason: "Severe data quality issue dominates movement.",
        drivers: [],
        data_quality_issues: [
          {
            issue_type: "duplicate_jump",
            dimension: "overall",
            description: "Duplicate rows loaded on 2017-03-15",
            severity: "high",
          },
        ],
      },
      narrative: {
        headline: "Data quality irregularity detected during comparison.",
        supporting_sentences: [
          "Orders shifted by +100.0%, but movement is dominated by duplicate rows.",
        ],
        caveats: [],
        is_fallback: true,
        fallback_reason: "Data quality irregularity",
      },
    };

    render(
      <ExplainDialog
        {...dummyProps}
        isOpen={true}
        initialCompletedData={dqPayload}
      />
    );

    expect(screen.getByTestId("data-issue-banner")).toBeInTheDocument();
    expect(screen.getByText(/Duplicate rows loaded on 2017-03-15/i)).toBeInTheDocument();
  });

  it("5. renders fallback note when summary was generated without language model", () => {
    const fallbackPayload: ExplainCompletedPayload = {
      evidence: {
        metric_name: "revenue",
        baseline_window: { start: "2017-10-01", end: "2017-10-07" },
        current_window: { start: "2017-10-08", end: "2017-10-14" },
        baseline_value: 10000,
        current_value: 12000,
        delta: 2000,
        percent_change: 20.0,
        confidence: "Medium",
        confidence_reason: "Standard weekly movement",
        drivers: [],
        data_quality_issues: [],
      },
      narrative: {
        headline: "Revenue increased by +20.0% from 2017-10-01 to 2017-10-14.",
        supporting_sentences: [
          "Contributions were distributed across multiple categories.",
          "Results are verified against deterministic warehouse evidence.",
        ],
        caveats: [],
        is_fallback: true,
        fallback_reason: "No language model API key configured",
      },
    };

    render(
      <ExplainDialog
        {...dummyProps}
        isOpen={true}
        initialCompletedData={fallbackPayload}
      />
    );

    expect(screen.getByTestId("fallback-note")).toHaveTextContent("Summary written without a language model");
  });
});
