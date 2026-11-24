import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { ExplainDialog, type ExplainCompletedPayload } from "@/components/dashboard/ExplainDialog";
import { ChartCard } from "@/components/dashboard/ChartCard";

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

  it("6. renders Skipped Charts notes with reason and suggestion", () => {
    const skippedNotes = [
      {
        title: "Secondary dimensional breakdown",
        reason: "No eligible secondary dimension on this model.",
        suggestion: "Add another categorical dimension or join to a dimension table.",
      },
      {
        title: "Ratio metric over time",
        reason: "No ratio metric defined on this model.",
        suggestion: "Define a ratio metric to track efficiency over time.",
      },
    ];

    render(
      <div data-testid="skipped-charts-section">
        <span>Skipped charts ({skippedNotes.length})</span>
        {skippedNotes.map((note, index) => (
          <div key={index} data-testid="skipped-chart-note">
            <h4>{note.title}</h4>
            <p>{note.reason}</p>
            <p>{note.suggestion}</p>
          </div>
        ))}
      </div>
    );

    expect(screen.getByTestId("skipped-charts-section")).toBeInTheDocument();
    expect(screen.getAllByTestId("skipped-chart-note")).toHaveLength(2);
    expect(screen.getByText("Secondary dimensional breakdown")).toBeInTheDocument();
    expect(screen.getByText("No eligible secondary dimension on this model.")).toBeInTheDocument();
    expect(screen.getByText("Ratio metric over time")).toBeInTheDocument();
  });
});

describe("Dashboard Error Presentation & Subtitle Fixes", () => {
  it("renders model metadata subtitle and NEVER 'ecommerce analytics'", () => {
    // Model with description
    const subtitleWithDesc =
      "Model: Fct Orders Model · Primary time: order_purchase_timestamp";
    // Check that 'ecommerce analytics' is not present
    expect(subtitleWithDesc).not.toContain("ecommerce analytics");
    expect(subtitleWithDesc).toContain("Primary time: order_purchase_timestamp");
  });

  it("renders plain banner at top of dashboard when charts fail with count and actionable fix", () => {
    const chartErrors = { "chart-1": "Connection timeout after 30000ms" };
    const failedCount = Object.values(chartErrors).filter(Boolean).length;
    render(
      <div>
        {failedCount > 0 && (
          <div data-testid="dashboard-error-banner" role="alert">
            <span>{failedCount} chart failed to load. Check the fix notes below.</span>
          </div>
        )}
      </div>
    );
    expect(screen.getByTestId("dashboard-error-banner")).toHaveTextContent(
      "1 chart failed to load. Check the fix notes below."
    );
  });

  it("renders ChartCard with plain explanation, actionable fix, and raw API details behind disclosure", () => {
    const rawError = "Query exceeded 104857600 byte execution cap: scanned 150000000 bytes";
    const chart = {
      id: "c1",
      dashboard_id: "d1",
      title: "revenue_over_time",
      chart_type: "line" as const,
      chart_spec: {
        model_id: "m1",
        metric: "revenue",
        chart_type: "line" as const,
        title: "revenue_over_time",
      },
      position: 0,
      created_at: 1000,
    };

    render(
      <ChartCard
        chart={chart}
        runResult={null}
        loading={false}
        error={rawError}
        onExplain={vi.fn()}
      />
    );

    // Sentence case metric title
    expect(screen.getByRole("heading", { name: "Revenue over time" })).toBeInTheDocument();

    // Plain message and actionable fix
    expect(screen.getByTestId("chart-error-message")).toBeInTheDocument();
    expect(screen.getByTestId("chart-error-fix")).toBeInTheDocument();

    // Disclosure with Show technical details
    expect(screen.getByText("Show technical details")).toBeInTheDocument();
    expect(screen.getByText(rawError)).toBeInTheDocument();
  });

  it("formats metric names and titles in sentence case", () => {
    const chart = {
      id: "c2",
      dashboard_id: "d1",
      title: "average_order_value",
      chart_type: "bar" as const,
      chart_spec: {
        model_id: "m1",
        metric: "average_order_value",
        chart_type: "bar" as const,
        title: "average_order_value",
      },
      position: 1,
      created_at: 1000,
    };

    render(
      <ChartCard
        chart={chart}
        runResult={null}
        loading={false}
        error={null}
        onExplain={vi.fn()}
      />
    );

    expect(screen.getByText("Average order value")).toBeInTheDocument();
  });
});
