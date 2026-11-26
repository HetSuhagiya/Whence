/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { CHART_COLORS } from "@/components/dashboard/chartConfig";
import { ExplainWaterfall } from "@/components/dashboard/ExplainWaterfall";
import type { DashboardChartPublic, ChartRunResult } from "@/lib/api";

// Mock Chart.js react-chartjs-2 components
vi.mock("react-chartjs-2", () => ({
  Line: ({ data }: { data: { datasets: Array<{ borderColor?: string; borderDash?: number[] }>; labels: string[] } }) => (
    <div data-testid="mock-line-chart">
      <div data-testid="chart-datasets-count">{data.datasets.length}</div>
      <div data-testid="chart-labels">{data.labels.join(",")}</div>
      <div data-testid="line-primary-color">{data.datasets[1]?.borderColor}</div>
      <div data-testid="line-baseline-dash">{JSON.stringify(data.datasets[0]?.borderDash)}</div>
    </div>
  ),
  Bar: ({ data }: { data: { datasets: Array<{ data: number[]; backgroundColor: string | string[] }>; labels: string[] } }) => (
    <div data-testid="mock-bar-chart">
      <div data-testid="bar-labels">{data.labels.join(",")}</div>
      <div data-testid="bar-data">{data.datasets[0]?.data.join(",")}</div>
      <div data-testid="bar-colors">{JSON.stringify(data.datasets[0]?.backgroundColor)}</div>
    </div>
  ),
}));

describe("Ticket 003: Chart Styling, Palette Tokens, and Accessibility", () => {
  const mockLineChart: any = {
    id: "chart-rev-1",
    dashboard_id: "dash-123",
    title: "Monthly Revenue Trend",
    chart_type: "line",
    position_index: 0,
    created_at: "2026-01-01T00:00:00Z",
    chart_spec: {
      metric: "revenue",
      dimensions: [],
      filters: {},
    },
  };

  const mockBarChart: any = {
    id: "chart-cat-1",
    dashboard_id: "dash-123",
    title: "Revenue by Category",
    chart_type: "bar",
    position_index: 1,
    created_at: "2026-01-01T00:00:00Z",
    chart_spec: {
      metric: "revenue",
      dimensions: ["category"],
      filters: {},
    },
  };

  const mockLineRunResult: any = {
    chart_id: "chart-rev-1",
    date_range: "last_30_days",
    rows: [
      { period: "2026-01-01", metric_value: 10000 },
      { period: "2026-01-02", metric_value: 12500 },
      { period: "2026-01-03", metric_value: 15000 },
    ],
    row_count: 3,
    execution_time_ms: 12.4,
    compiled_sql: "SELECT date, sum(revenue) FROM orders",
  };

  const mockBarRunResult: any = {
    chart_id: "chart-cat-1",
    date_range: "last_30_days",
    rows: [
      { category: "Electronics", metric_value: 5000 },
      { category: "Furniture", metric_value: 15000 },
      { category: "Clothing", metric_value: 8000 },
    ],
    row_count: 3,
    execution_time_ms: 15.2,
    compiled_sql: "SELECT category, sum(revenue) FROM orders",
  };

  it("1. Verifies Paul Tol muted scheme and Ink palette tokens in chartConfig", () => {
    // Paul Tol muted scheme exact 10 colors
    expect(CHART_COLORS.series).toEqual([
      "#332288",
      "#88CCEE",
      "#44AA99",
      "#117733",
      "#999933",
      "#DDCC77",
      "#CC6677",
      "#882255",
      "#AA4499",
      "#DDDDDD",
    ]);

    // Ink series tokens
    expect(CHART_COLORS.inkLight).toBe("#111827");
    expect(CHART_COLORS.inkDark).toBe("#F9FAFB");
    expect(CHART_COLORS.baseline).toBe("#889096");
    expect(CHART_COLORS.highlight).toBe("#0090FF");

    // Waterfall Radix green9 & red9
    expect(CHART_COLORS.waterfallUp).toBe("#30A46C");
    expect(CHART_COLORS.waterfallDown).toBe("#E54D2E");
    expect(CHART_COLORS.waterfallUpDark).toBe("#3DD68C");
    expect(CHART_COLORS.waterfallDownDark).toBe("#F3705A");
  });

  it("2. Renders time-series chart with ink series, previous-period baseline, headline number and delta badge", () => {
    const handleExplain = vi.fn();
    render(
      <ChartCard
        chart={mockLineChart}
        runResult={mockLineRunResult}
        loading={false}
        isHero={true}
        onExplain={handleExplain}
      />
    );

    // Headline metric number: latest value is 15000 -> $15.0k
    expect(screen.getByText("$15.0k")).toBeInTheDocument();

    // Delta badge: (15000 - 12500) / 12500 = +20.0%
    expect(screen.getByText("+20.0%")).toBeInTheDocument();

    // Serif title in Newsreader
    const title = screen.getByText("Monthly Revenue Trend");
    expect(title).toBeInTheDocument();
    expect(title.className).toContain("font-serif");

    // Two datasets: faint dashed previous-period line [4, 4] and main ink series
    expect(screen.getByTestId("chart-datasets-count")).toHaveTextContent("2");
    expect(screen.getByTestId("line-baseline-dash")).toHaveTextContent("[4,4]");
    expect(screen.getByTestId("line-primary-color")).toHaveTextContent(CHART_COLORS.primary);
  });

  it("3. Sorts bar category breakdown descending by metric value", () => {
    const handleExplain = vi.fn();
    render(
      <ChartCard
        chart={mockBarChart}
        runResult={mockBarRunResult}
        loading={false}
        isHero={false}
        onExplain={handleExplain}
      />
    );

    // Bar chart should sort rows descending: Furniture (15000), Clothing (8000), Electronics (5000)
    expect(screen.getByTestId("bar-labels")).toHaveTextContent("Furniture,Clothing,Electronics");
    expect(screen.getByTestId("bar-data")).toHaveTextContent("15000,8000,5000");
  });

  it("4. Supports keyboard point navigation with arrow keys and Enter to explain", () => {
    const handleExplain = vi.fn();
    render(
      <ChartCard
        chart={mockLineChart}
        runResult={mockLineRunResult}
        loading={false}
        isHero={false}
        onExplain={handleExplain}
      />
    );

    const region = screen.getByRole("region");
    expect(region).toBeInTheDocument();

    // Press ArrowRight to select first point
    fireEvent.keyDown(region, { key: "ArrowRight" });
    // Press Enter to trigger explain on selected point
    fireEvent.keyDown(region, { key: "Enter" });

    expect(handleExplain).toHaveBeenCalledWith(mockLineChart, "2026-01-01");
  });

  it("5. Supports screen-reader data table view via Alt+T and toolbar button", () => {
    const handleExplain = vi.fn();
    render(
      <ChartCard
        chart={mockLineChart}
        runResult={mockLineRunResult}
        loading={false}
        onExplain={handleExplain}
      />
    );

    const region = screen.getByRole("region");

    // Press Alt+T to toggle table view
    fireEvent.keyDown(region, { key: "t", altKey: true });

    // Table should now be rendered
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("2026-01-01")).toBeInTheDocument();
    expect(screen.getByText("$10.0k")).toBeInTheDocument();

    // Press Alt+T again to toggle back to chart
    fireEvent.keyDown(region, { key: "t", altKey: true });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("6. ExplainWaterfall renders Radix green9 and red9 colors", () => {
    const items = [
      { name: "Electronics", amount: 2500, isLoss: false },
      { name: "Furniture", amount: -1200, isLoss: true },
    ];

    const { rerender } = render(<ExplainWaterfall items={items} isDark={false} />);
    expect(screen.getByTestId("explain-waterfall")).toBeInTheDocument();
    expect(screen.getByTestId("bar-labels")).toHaveTextContent("Electronics,Furniture");
    expect(screen.getByTestId("bar-colors").textContent).toContain(CHART_COLORS.waterfallUp);
    expect(screen.getByTestId("bar-colors").textContent).toContain(CHART_COLORS.waterfallDown);

    // Dark mode variant
    rerender(<ExplainWaterfall items={items} isDark={true} />);
    expect(screen.getByTestId("bar-colors").textContent).toContain(CHART_COLORS.waterfallUpDark);
    expect(screen.getByTestId("bar-colors").textContent).toContain(CHART_COLORS.waterfallDownDark);
  });
});
