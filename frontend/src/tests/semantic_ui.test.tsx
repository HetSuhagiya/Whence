import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { SemanticLayerManager } from "@/components/semantic/SemanticLayerManager";
import { api, ConnectionPublic, ModelPublic } from "@/lib/api";

// Mock API
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      listModels: vi.fn(),
      seedDefaultEcommerce: vi.fn(),
      updateDimension: vi.fn(),
      createMetric: vi.fn(),
      validateMetricFormula: vi.fn(),
      previewMetricTrend: vi.fn(),
      listMetricVersions: vi.fn(),
    },
  };
});

// Mock react-chartjs-2 Line component
vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="mock-preview-line-chart">Line Chart</div>,
}));

const mockConnections: ConnectionPublic[] = [
  {
    id: "conn-123",
    name: "Production BigQuery",
    warehouse_type: "bigquery",
    client_email: "test@project.iam.gserviceaccount.com",
    project_id: "test-proj",
    billing_project: "test-proj",
    location: "US",
    selected_tables_count: 3,
    created_at: 1700000000,
    updated_at: 1700000000,
  },
];

const mockModel: ModelPublic = {
  id: "model-1",
  connection_id: "conn-123",
  name: "TheLook Ecommerce Analytical Model",
  project_id: "test-proj",
  dataset_id: "thelook_ecommerce",
  table_name: "orders",
  primary_time_column: "created_at",
  description: "Standard model",
  dimensions: [
    {
      id: "dim-1",
      model_id: "model-1",
      name: "category",
      column_expression: "category",
      dimension_type: "categorical",
      label: "Category",
      is_identifier: false,
      exclude_from_explanation: false,
      created_at: 1700000000,
      updated_at: 1700000000,
    },
    {
      id: "dim-2",
      model_id: "model-1",
      name: "order_id",
      column_expression: "order_id",
      dimension_type: "categorical",
      label: "Order ID",
      is_identifier: true,
      exclude_from_explanation: true,
      created_at: 1700000000,
      updated_at: 1700000000,
    },
  ],
  metrics: [
    {
      id: "metric-1",
      model_id: "model-1",
      name: "revenue",
      description: "Total revenue",
      metric_type: "additive",
      numerator_expr: "SUM(sale_price)",
      denominator_expr: null,
      fixed_filter: null,
      display_format: "currency",
      higher_is_better: true,
      version: 1,
      created_at: 1700000000,
      updated_at: 1700000000,
    },
    {
      id: "metric-2",
      model_id: "model-1",
      name: "aov",
      description: "Average order value",
      metric_type: "ratio",
      numerator_expr: "SUM(sale_price)",
      denominator_expr: "COUNT(DISTINCT order_id)",
      fixed_filter: null,
      display_format: "currency",
      higher_is_better: true,
      version: 2,
      created_at: 1700000000,
      updated_at: 1700000000,
    },
  ],
  created_at: 1700000000,
  updated_at: 1700000000,
};

describe("SemanticLayerManager Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state with 'Confirm default ecommerce set' button when no models exist", async () => {
    vi.mocked(api.listModels).mockResolvedValueOnce([]);

    render(
      <SemanticLayerManager
        connections={mockConnections}
        selectedConnectionId="conn-123"
      />
    );

    await waitFor(() => {
      expect(screen.getByText("No semantic model configured yet")).toBeInTheDocument();
      expect(screen.getByTestId("seed-ecommerce-button")).toBeInTheDocument();
    });
  });

  it("seeds default ecommerce model when button is clicked", async () => {
    vi.mocked(api.listModels)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mockModel]);
    vi.mocked(api.seedDefaultEcommerce).mockResolvedValueOnce(mockModel);

    render(
      <SemanticLayerManager
        connections={mockConnections}
        selectedConnectionId="conn-123"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("seed-ecommerce-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("seed-ecommerce-button"));

    await waitFor(() => {
      expect(api.seedDefaultEcommerce).toHaveBeenCalledWith({
        connection_id: "conn-123",
      });
      expect(screen.getByText("TheLook Ecommerce Analytical Model")).toBeInTheDocument();
      expect(screen.getByTestId("dimension-row-category")).toBeInTheDocument();
      expect(screen.getByTestId("metric-row-revenue")).toBeInTheDocument();
    });
  });

  it("toggles dimension exclusion from explanation", async () => {
    vi.mocked(api.listModels).mockResolvedValueOnce([mockModel]);
    vi.mocked(api.updateDimension).mockResolvedValueOnce({
      ...mockModel.dimensions[0],
      exclude_from_explanation: true,
    });

    render(
      <SemanticLayerManager
        connections={mockConnections}
        selectedConnectionId="conn-123"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("toggle-exclude-category")).toBeInTheDocument();
    });

    // Currently eligible
    expect(screen.getByTestId("toggle-exclude-category")).toHaveTextContent("Eligible for explain");

    // Click toggle
    fireEvent.click(screen.getByTestId("toggle-exclude-category"));

    await waitFor(() => {
      expect(api.updateDimension).toHaveBeenCalledWith("dim-1", {
        exclude_from_explanation: true,
      });
      expect(screen.getByTestId("toggle-exclude-category")).toHaveTextContent("Excluded");
    });
  });

  it("validates formula with AST parser and shows feedback", async () => {
    vi.mocked(api.listModels).mockResolvedValueOnce([mockModel]);
    vi.mocked(api.validateMetricFormula).mockResolvedValueOnce({
      valid: true,
      dialect: "bigquery",
      normalized_expression: "SUM(sale_price)",
    });

    render(
      <SemanticLayerManager
        connections={mockConnections}
        selectedConnectionId="conn-123"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("add-metric-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("add-metric-button"));

    await waitFor(() => {
      expect(screen.getByTestId("metric-name-input")).toBeInTheDocument();
    });

    const toggleAdv = screen.queryByTestId("toggle-advanced-mode");
    if (toggleAdv) {
      fireEvent.click(toggleAdv);
    }

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
        "Valid formula syntax and AST (bigquery dialect verified)"
      );
    });
  });
});
