import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import { StepIndicator, StepItem } from "@/components/navigation/StepIndicator";
import { SemanticLayerManager } from "@/components/semantic/SemanticLayerManager";
import DataConnectionsPage from "@/app/data/page";
import DashboardsPage from "@/app/page";
import { api, ConnectionPublic, ModelPublic, ModelDependentsResponse } from "@/lib/api";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useParams: () => ({ id: "dash-123" }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/data",
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      listConnections: vi.fn(),
      getConnection: vi.fn(),
      createConnection: vi.fn(),
      updateKey: vi.fn(),
      deleteConnection: vi.fn(),
      testConnection: vi.fn(),
      listProjects: vi.fn(),
      listDatasets: vi.fn(),
      listTables: vi.fn(),
      getTableDetail: vi.fn(),
      previewTable: vi.fn(),
      saveSources: vi.fn(),
      getSources: vi.fn(),
      listModels: vi.fn(),
      seedDefaultEcommerce: vi.fn(),
      updateDimension: vi.fn(),
      createMetric: vi.fn(),
      validateMetricFormula: vi.fn(),
      previewMetricTrend: vi.fn(),
      listMetricVersions: vi.fn(),
      getModelDependents: vi.fn(),
      deleteModel: vi.fn(),
      deleteDimension: vi.fn(),
      deleteMetric: vi.fn(),
      listDashboards: vi.fn(),
      getDashboard: vi.fn(),
      createDashboard: vi.fn(),
      deleteDashboard: vi.fn(),
      runDashboardChart: vi.fn(),
    },
  };
});

// Mock react-chartjs-2 Line component
vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="mock-preview-line-chart">Line Chart</div>,
}));

const mockConnections: ConnectionPublic[] = [
  {
    id: "conn-1",
    name: "BigQuery Prod",
    warehouse_type: "bigquery",
    client_email: "bq@google.com",
    project_id: "bq-proj",
    billing_project: "bq-proj",
    location: "US",
    selected_tables_count: 3,
    created_at: 1000,
    updated_at: 1000,
  },
  {
    id: "conn-empty",
    name: "Empty Warehouse",
    warehouse_type: "duckdb",
    client_email: null,
    project_id: "duck",
    billing_project: "duck",
    location: "local",
    selected_tables_count: 0,
    created_at: 1000,
    updated_at: 1000,
  },
];

const mockModel: ModelPublic = {
  id: "model-1",
  connection_id: "conn-1",
  name: "Ecommerce Overview",
  project_id: "bq-proj",
  dataset_id: "thelook",
  table_name: "orders",
  primary_time_column: "created_at",
  dimensions: [
    {
      id: "dim-1",
      model_id: "model-1",
      name: "status",
      column_expression: "status",
      dimension_type: "categorical",
      label: "Order Status",
      is_identifier: false,
      exclude_from_explanation: false,
      created_at: 1000,
      updated_at: 1000,
    },
  ],
  metrics: [
    {
      id: "met-1",
      model_id: "model-1",
      name: "revenue",
      description: "Total revenue",
      metric_type: "additive",
      numerator_expr: "SUM(price)",
      denominator_expr: null,
      fixed_filter: null,
      display_format: "currency",
      higher_is_better: true,
      version: 1,
      created_at: 1000,
      updated_at: 1000,
    },
  ],
  created_at: 1000,
  updated_at: 1000,
};

describe("Navigation and Flow (Ticket 001 / Spec 002 AC 1.1 - 1.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockReset();
    vi.mocked(api.listConnections).mockResolvedValue(mockConnections);
    vi.mocked(api.listModels).mockResolvedValue([mockModel]);
    vi.mocked(api.listDashboards).mockResolvedValue([]);
  });

  describe("StepIndicator Component (AC 1.1)", () => {
    it("renders 4 steps with done, current, blocked states and plain-language reasons", () => {
      const steps: StepItem[] = [
        { id: "connect", name: "Connect", status: "done", reason: "Connected: BigQuery" },
        { id: "choose_data", name: "Choose data", status: "done", reason: "3 tables selected" },
        { id: "model", name: "Model", status: "current", reason: "Confirm metrics and dimensions" },
        { id: "dashboard", name: "Dashboard", status: "blocked", reason: "Confirm model first" },
      ];

      const onStepClick = vi.fn();
      render(<StepIndicator steps={steps} onStepClick={onStepClick} />);

      expect(screen.getByTestId("workflow-step-indicator")).toBeInTheDocument();
      expect(screen.getByText("Connect")).toBeInTheDocument();
      expect(screen.getByText("Choose data")).toBeInTheDocument();
      expect(screen.getByText("Model")).toBeInTheDocument();
      expect(screen.getByText("Dashboard")).toBeInTheDocument();

      expect(screen.getByText("Connected: BigQuery")).toBeInTheDocument();
      expect(screen.getByText("3 tables selected")).toBeInTheDocument();
      expect(screen.getByText("Confirm metrics and dimensions")).toBeInTheDocument();
      expect(screen.getByText("Confirm model first")).toBeInTheDocument();

      // Check clickability: unblocked steps trigger click, blocked do not
      fireEvent.click(screen.getByTestId("step-connect"));
      expect(onStepClick).toHaveBeenCalledWith("connect", 0);

      fireEvent.click(screen.getByTestId("step-dashboard"));
      expect(onStepClick).not.toHaveBeenCalledWith("dashboard", 3);
    });
  });

  describe("Contextual Action Buttons (AC 1.4)", () => {
    it("renders 'Choose tables' when connection has 0 tables, and 'Define model' when tables > 0", async () => {
      render(<DataConnectionsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("action-choose-tables-conn-empty")).toBeInTheDocument();
        expect(screen.getByTestId("action-define-model-conn-1")).toBeInTheDocument();
      });

      expect(screen.getByTestId("action-choose-tables-conn-empty")).toHaveTextContent("Choose tables");
      expect(screen.getByTestId("action-define-model-conn-1")).toHaveTextContent("Define model");
    });

    it("renders 'Connect your warehouse' empty state button on Home page when 0 dashboards and 0 connections", async () => {
      vi.mocked(api.listConnections).mockResolvedValue([]);
      vi.mocked(api.listDashboards).mockResolvedValue([]);

      render(<DashboardsPage />);

      await waitFor(() => {
        expect(screen.getByTestId("btn-connect-warehouse")).toBeInTheDocument();
      });
      expect(screen.getByTestId("btn-connect-warehouse")).toHaveTextContent("Connect your warehouse");
    });
  });

  describe("Primary Action on Model: Create Dashboard (AC 1.3)", () => {
    it("disables 'Create dashboard from this data' with tooltip when no model is confirmed", async () => {
      vi.mocked(api.listModels).mockResolvedValue([]);

      render(<SemanticLayerManager connections={mockConnections} selectedConnectionId="conn-1" />);

      await waitFor(() => {
        const btn = screen.getByTestId("btn-create-dashboard-from-model");
        expect(btn).toBeDisabled();
      });

      expect(screen.getByTestId("tooltip-disabled-create-dashboard")).toHaveTextContent(
        "Confirm a semantic model before creating a dashboard"
      );
    });

    it("enables 'Create dashboard from this data' when model is confirmed, opens dialog, and creates dashboard", async () => {
      vi.mocked(api.listModels).mockResolvedValue([mockModel]);
      vi.mocked(api.createDashboard).mockResolvedValue({
        id: "dash-new-1",
        name: "BigQuery Prod Overview",
        connection_id: "conn-1",
        connection_name: "BigQuery Prod",
        warehouse_type: "bigquery",
        model_id: "model-1",
        charts: [],
        created_at: 2000,
        updated_at: 2000,
      });

      render(<SemanticLayerManager connections={mockConnections} selectedConnectionId="conn-1" />);

      await waitFor(() => {
        const btn = screen.getByTestId("btn-create-dashboard-from-model");
        expect(btn).toBeEnabled();
      });

      fireEvent.click(screen.getByTestId("btn-create-dashboard-from-model"));

      expect(screen.getByTestId("create-dashboard-dialog")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("btn-submit-create-dashboard"));

      await waitFor(() => {
        expect(api.createDashboard).toHaveBeenCalledWith({
          connection_id: "conn-1",
          name: undefined,
        });
        expect(mockPush).toHaveBeenCalledWith("/dashboards/dash-new-1");
      });
    });
  });

  describe("Dependency Warnings on Deletion (AC 1.5)", () => {
    const mockDependents: ModelDependentsResponse = {
      dashboard_count: 2,
      dashboards: [
        { id: "dash-1", name: "Executive KPI Dashboard" },
        { id: "dash-2", name: "Marketing Overview" },
      ],
      chart_count: 3,
      charts: [
        {
          id: "chart-1",
          dashboard_id: "dash-1",
          dashboard_name: "Executive KPI Dashboard",
          title: "Revenue over time",
          chart_type: "line",
        },
        {
          id: "chart-2",
          dashboard_id: "dash-1",
          dashboard_name: "Executive KPI Dashboard",
          title: "Revenue by status",
          chart_type: "bar",
        },
        {
          id: "chart-3",
          dashboard_id: "dash-2",
          dashboard_name: "Marketing Overview",
          title: "Weekly Revenue Growth",
          chart_type: "line",
        },
      ],
    };

    it("prompts with warning modal listing affected charts by title when deleting a model with dependents", async () => {
      vi.mocked(api.listModels).mockResolvedValue([mockModel]);
      vi.mocked(api.getModelDependents).mockResolvedValue(mockDependents);
      vi.mocked(api.deleteModel).mockResolvedValue();

      render(<SemanticLayerManager connections={mockConnections} selectedConnectionId="conn-1" />);

      await waitFor(() => {
        expect(screen.getByTestId("btn-delete-model")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("btn-delete-model"));

      await waitFor(() => {
        expect(api.getModelDependents).toHaveBeenCalledWith("model-1");
        expect(screen.getByTestId("dependency-warning-dialog")).toBeInTheDocument();
      });

      expect(screen.getByText("Dependent charts will be affected")).toBeInTheDocument();
      expect(screen.getByText("Revenue over time")).toBeInTheDocument();
      expect(screen.getByText("Revenue by status")).toBeInTheDocument();
      expect(screen.getByText("Weekly Revenue Growth")).toBeInTheDocument();
      expect(screen.getByTestId("btn-confirm-delete-anyway")).toHaveTextContent("Delete anyway");

      fireEvent.click(screen.getByTestId("btn-confirm-delete-anyway"));

      await waitFor(() => {
        expect(api.deleteModel).toHaveBeenCalledWith("model-1");
      });
    });

    it("prompts with warning modal when deleting a metric that has dependent charts", async () => {
      vi.mocked(api.listModels).mockResolvedValue([mockModel]);
      vi.mocked(api.getModelDependents).mockResolvedValue(mockDependents);
      vi.mocked(api.deleteMetric).mockResolvedValue();

      render(<SemanticLayerManager connections={mockConnections} selectedConnectionId="conn-1" />);

      await waitFor(() => {
        expect(screen.getByTestId("btn-delete-metric-revenue")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId("btn-delete-metric-revenue"));

      await waitFor(() => {
        expect(api.getModelDependents).toHaveBeenCalledWith("model-1", {
          metric_name: "revenue",
        });
        expect(screen.getByTestId("dependency-warning-dialog")).toBeInTheDocument();
      });

      expect(screen.getByText("Revenue over time")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("btn-confirm-delete-anyway"));

      await waitFor(() => {
        expect(api.deleteMetric).toHaveBeenCalledWith("met-1");
      });
    });
  });
});
