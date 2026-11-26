import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GuidedMetricBuilder } from "@/components/semantic/GuidedMetricBuilder";
import { DimensionBuilderModal } from "@/components/semantic/DimensionBuilderModal";
import { AddChartModal } from "@/components/dashboard/AddChartModal";
import { api, ModelPublic, DashboardChartPublic } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getModel: vi.fn(),
      createMetric: vi.fn(),
      updateMetric: vi.fn(),
      validateMetricFormula: vi.fn(),
      previewMetricTrend: vi.fn(),
      listMetricVersions: vi.fn(),
      getModelDependents: vi.fn(),
      previewDimension: vi.fn(),
      createDimension: vi.fn(),
      updateDimension: vi.fn(),
      addDashboardChart: vi.fn(),
    },
  };
});

// Mock react-chartjs-2 Line
vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="mock-line-chart">Line Chart</div>,
}));

const mockModel: ModelPublic = {
  id: "mod-test-1",
  connection_id: "conn-1",
  name: "Orders Analytical Model",
  project_id: "test-proj",
  dataset_id: "analytics",
  table_name: "orders",
  primary_time_column: "order_timestamp",
  description: "Ecommerce orders data",
  dimensions: [
    {
      id: "dim-cat",
      model_id: "mod-test-1",
      name: "category",
      column_expression: "category",
      dimension_type: "categorical",
      label: "Category",
      is_identifier: false,
      exclude_from_explanation: false,
      created_at: 1000,
      updated_at: 1000,
    },
    {
      id: "dim-state",
      model_id: "mod-test-1",
      name: "customer_state",
      column_expression: "customer_state",
      dimension_type: "categorical",
      label: "Customer State",
      is_identifier: false,
      exclude_from_explanation: false,
      created_at: 1000,
      updated_at: 1000,
    },
    {
      id: "dim-price",
      model_id: "mod-test-1",
      name: "sale_price",
      column_expression: "sale_price",
      dimension_type: "numeric_bucket",
      label: "Sale Price",
      is_identifier: false,
      exclude_from_explanation: false,
      created_at: 1000,
      updated_at: 1000,
    },
  ],
  metrics: [
    {
      id: "met-rev",
      model_id: "mod-test-1",
      name: "revenue",
      description: "Total revenue",
      metric_type: "additive",
      numerator_expr: "SUM(sale_price)",
      denominator_expr: null,
      fixed_filter: null,
      display_format: "currency",
      higher_is_better: true,
      version: 1,
      created_at: 1000,
      updated_at: 1000,
    },
    {
      id: "met-orders",
      model_id: "mod-test-1",
      name: "orders_count",
      description: "Total orders",
      metric_type: "additive",
      numerator_expr: "COUNT(DISTINCT order_id)",
      denominator_expr: null,
      fixed_filter: null,
      display_format: "integer",
      higher_is_better: true,
      version: 1,
      created_at: 1000,
      updated_at: 1000,
    },
  ],
  created_at: 1000,
  updated_at: 1000,
};

describe("Ticket 002: Custom Metrics, Custom Dimensions and Dashboard Chart Controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GuidedMetricBuilder Component", () => {
    it("renders guided aggregation mode by default with function and column selectors", () => {
      render(
        <GuidedMetricBuilder
          open={true}
          onOpenChange={vi.fn()}
          model={mockModel}
          onSaveSuccess={vi.fn()}
        />
      );

      expect(screen.getByText("Guided metric builder")).toBeInTheDocument();
      expect(screen.getByTestId("radio-aggregation-mode")).toBeChecked();
      expect(screen.getByTestId("select-agg-func")).toHaveValue("SUM");
      expect(screen.getByTestId("select-target-column")).toBeInTheDocument();
      expect(screen.getByText("sale_price")).toBeInTheDocument();
    });

    it("switches to ratio mode and generates ratio formula", () => {
      render(
        <GuidedMetricBuilder
          open={true}
          onOpenChange={vi.fn()}
          model={mockModel}
          onSaveSuccess={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId("radio-ratio-mode"));
      expect(screen.getByTestId("radio-ratio-mode")).toBeChecked();
      expect(screen.getByText(/Ratio of two measures/i)).toBeInTheDocument();
      expect(screen.getByText(/Generated SQL:/i)).toBeInTheDocument();
    });

    it("toggles Advanced SQL mode and validates formula", async () => {
      vi.mocked(api.validateMetricFormula).mockResolvedValueOnce({
        valid: true,
        dialect: "duckdb",
        normalized_expression: "SUM(sale_price)",
      });

      render(
        <GuidedMetricBuilder
          open={true}
          onOpenChange={vi.fn()}
          model={mockModel}
          onSaveSuccess={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId("toggle-advanced-mode"));
      expect(screen.getByTestId("metric-numerator-input")).toBeInTheDocument();

      fireEvent.change(screen.getByTestId("metric-numerator-input"), {
        target: { value: "SUM(sale_price)" },
      });

      fireEvent.click(screen.getByTestId("validate-formula-button"));

      await waitFor(() => {
        expect(api.validateMetricFormula).toHaveBeenCalledWith({
          numerator_expr: "SUM(sale_price)",
          denominator_expr: undefined,
        });
        expect(screen.getByTestId("validation-feedback")).toHaveTextContent(
          "Valid formula syntax and AST (duckdb dialect verified)"
        );
      });
    });

    it("displays dependency warning banner when editing a metric with dependent charts", async () => {
      vi.mocked(api.getModelDependents).mockResolvedValueOnce({
        dashboard_count: 1,
        dashboards: [{ id: "dash-1", name: "Executive Dashboard" }],
        chart_count: 2,
        charts: [
          {
            id: "chart-1",
            dashboard_id: "dash-1",
            dashboard_name: "Executive Dashboard",
            title: "Revenue by category",
          },
        ],
      });

      render(
        <GuidedMetricBuilder
          open={true}
          onOpenChange={vi.fn()}
          model={mockModel}
          metricToEdit={mockModel.metrics[0]}
          onSaveSuccess={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("metric-dependents-warning")).toBeInTheDocument();
        expect(screen.getByText(/Used by 2 charts/i)).toBeInTheDocument();
      });
    });
  });

  describe("DimensionBuilderModal Component", () => {
    it("runs dry-run check and renders estimated bytes with distinct values preview", async () => {
      vi.mocked(api.previewDimension).mockResolvedValueOnce({
        valid: true,
        estimated_bytes: 1048576,
        formatted_bytes: "1.00 MB",
        total_distinct_values: 3,
        values: [
          { value: "Electronics", row_count: 450 },
          { value: "Clothing", row_count: 320 },
          { value: "Furniture", row_count: 120 },
        ],
      });

      render(
        <DimensionBuilderModal
          open={true}
          onOpenChange={vi.fn()}
          model={mockModel}
          onSaveSuccess={vi.fn()}
        />
      );

      expect(screen.getByText("Custom dimension builder")).toBeInTheDocument();

      fireEvent.change(screen.getByTestId("dimension-name-input"), {
        target: { value: "clean_category" },
      });
      fireEvent.change(screen.getByTestId("dimension-expression-input"), {
        target: { value: "UPPER(category)" },
      });

      fireEvent.click(screen.getByTestId("btn-preview-dimension"));

      await waitFor(() => {
        expect(api.previewDimension).toHaveBeenCalledWith({
          connection_id: "conn-1",
          model_id: "mod-test-1",
          expression: "UPPER(category)",
          dimension_type: "categorical",
        });
        expect(screen.getByTestId("dim-preview-result")).toBeInTheDocument();
        expect(screen.getByTestId("preview-estimated-bytes")).toHaveTextContent("1.00 MB");
        expect(screen.getByText("Electronics")).toBeInTheDocument();
        expect(screen.getByText("Clothing")).toBeInTheDocument();
      });
    });

    it("applies expression presets (CASE, bucketing, date parts, safe string functions)", () => {
      render(
        <DimensionBuilderModal
          open={true}
          onOpenChange={vi.fn()}
          model={mockModel}
          onSaveSuccess={vi.fn()}
        />
      );

      // Click CASE Preset
      fireEvent.click(screen.getByTestId("preset-btn-case"));
      const textarea = screen.getByTestId("dimension-expression-input") as HTMLTextAreaElement;
      expect(textarea.value).toContain("CASE WHEN");

      // Click Date Part Preset
      fireEvent.click(screen.getByTestId("preset-btn-date_part"));
      expect(textarea.value).toContain("DATE_TRUNC");

      // Click String Clean Preset
      fireEvent.click(screen.getByTestId("preset-btn-string_clean"));
      expect(textarea.value).toContain("UPPER(TRIM");
    });
  });

  describe("Dashboard AddChartModal Component", () => {
    it("submits new chart creation and invokes onChartAdded callback", async () => {
      const mockChart: DashboardChartPublic = {
        id: "chart-new-123",
        dashboard_id: "dash-123",
        title: "Revenue by category",
        chart_type: "bar",
        chart_spec: {
          model_id: "mod-test-1",
          chart_type: "bar",
          title: "Revenue by category",
          metric: "revenue",
          dimensions: ["category"],
        },
        position: 2,
        created_at: 2000,
      };

      vi.mocked(api.addDashboardChart).mockResolvedValueOnce(mockChart);

      const handleChartAdded = vi.fn();
      const handleOpenChange = vi.fn();

      render(
        <AddChartModal
          open={true}
          onOpenChange={handleOpenChange}
          dashboardId="dash-123"
          model={mockModel}
          onChartAdded={handleChartAdded}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId("add-chart-modal")).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId("select-chart-metric"), {
        target: { value: "revenue" },
      });
      fireEvent.change(screen.getByTestId("select-chart-dimension"), {
        target: { value: "category" },
      });

      fireEvent.click(screen.getByTestId("btn-submit-add-chart"));

      await waitFor(() => {
        expect(api.addDashboardChart).toHaveBeenCalledWith("dash-123", {
          metric: "revenue",
          breakdown_dimension: "category",
          chart_type: "bar",
          date_range: "last_30_days",
          title: undefined,
        });
        expect(handleChartAdded).toHaveBeenCalledWith(mockChart);
        expect(handleOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
