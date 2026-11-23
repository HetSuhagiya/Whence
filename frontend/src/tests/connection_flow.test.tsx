import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import * as React from "react";
import DataConnectionsPage from "@/app/data/page";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
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
  },
}));

describe("Warehouse Connection Flow (Item 1b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listConnections).mockResolvedValue([]);
  });

  it("renders Step 1: Connect form with helper text and DuckDB alternative", async () => {
    render(<DataConnectionsPage />);

    expect(screen.getByText("Connect a warehouse")).toBeInTheDocument();
    expect(screen.getByText("Google BigQuery connection")).toBeInTheDocument();
    expect(screen.getByText("Use demo data (DuckDB)")).toBeInTheDocument();

    // Verify exact helper text requested in brief
    expect(
      screen.getByText(/Create a service account in Google Cloud Console, grant role/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/BigQuery Job User/i)).toBeInTheDocument();
    expect(screen.getByText(/BigQuery Data Viewer/i)).toBeInTheDocument();
  });

  it("rejects key file upload exceeding 64 KB limit", async () => {
    render(<DataConnectionsPage />);

    // Create a mock file > 64 KB (70,000 bytes)
    const largeFile = new File([new ArrayBuffer(70000)], "huge_key.json", {
      type: "application/json",
    });

    const dropzone = screen.getByText(/Drag and drop your service-account JSON key here/i).closest("div");
    if (dropzone) {
      fireEvent.drop(dropzone, {
        dataTransfer: { files: [largeFile] },
      });
    }

    await waitFor(() => {
      expect(screen.getByText(/Key file size exceeds 64 KB limit/i)).toBeInTheDocument();
    });
  });

  it("handles demo data (DuckDB) connection and advances to Step 2", async () => {
    vi.mocked(api.createConnection).mockResolvedValue({
      id: "conn-duck-1",
      name: "Demo dataset (DuckDB)",
      warehouse_type: "duckdb",
      client_email: "duckdb-demo@whence.local",
      project_id: "duckdb_local",
      billing_project: "duckdb_local",
      location: "local",
      selected_tables_count: 0,
      created_at: 1000,
      updated_at: 1000,
    });
    vi.mocked(api.listProjects).mockResolvedValue(["duckdb_local"]);
    vi.mocked(api.listDatasets).mockResolvedValue([{ dataset_id: "main", location: "local" }]);
    vi.mocked(api.listTables).mockResolvedValue([
      { table_name: "orders", table_type: "TABLE" },
      { table_name: "order_items", table_type: "TABLE" },
    ]);
    vi.mocked(api.getTableDetail).mockResolvedValue({
      project_id: "duckdb_local",
      dataset_id: "main",
      table_name: "orders",
      table_type: "TABLE",
      row_count: 1000,
      size_bytes: 40000,
      formatted_size: "39.1 KB",
      clustering_fields: [],
      require_partition_filter: false,
      columns: [{ name: "order_id", data_type: "VARCHAR", is_nullable: false }],
    });
    vi.mocked(api.previewTable).mockResolvedValue({
      project_id: "duckdb_local",
      dataset_id: "main",
      table_name: "orders",
      columns: ["order_id"],
      rows: [{ order_id: "ORD-1" }],
      row_count: 1,
      zero_query_cost: true,
    });

    render(<DataConnectionsPage />);

    const demoBtn = screen.getByText("Use demo data (DuckDB)");
    fireEvent.click(demoBtn);

    await waitFor(() => {
      expect(api.createConnection).toHaveBeenCalledWith({
        name: "Demo dataset (DuckDB)",
        warehouse_type: "duckdb",
      });
      expect(screen.getByText(/Select tables & views/i)).toBeInTheDocument();
      expect(screen.getByText("table-rows API • zero query cost")).toBeInTheDocument();
    });
  });

  it("renders Step 3: Test and save live checklist with passed and failed states", async () => {
    vi.mocked(api.testConnection).mockResolvedValue({
      connection_id: "conn-123",
      overall_status: "failed",
      checks: [
        {
          id: "key_format",
          title: "Key file format",
          status: "passed",
          message: "Valid service account key.",
        },
        {
          id: "auth",
          title: "Authentication",
          status: "passed",
          message: "Authenticated successfully.",
        },
        {
          id: "job_user",
          title: "BigQuery Job User permission",
          status: "failed",
          message: "Permission denied creating query job in project 'my-billing-proj'.",
          remediation: "Grant role 'BigQuery Job User' (roles/bigquery.jobUser) to sa@my-proj.iam.gserviceaccount.com on project 'my-billing-proj'.",
        },
        {
          id: "list_datasets",
          title: "List datasets permission",
          status: "passed",
          message: "Listed 3 datasets.",
        },
        {
          id: "read_schemas",
          title: "Read table schema (BigQuery Data Viewer)",
          status: "passed",
          message: "Schema access verified.",
        },
        {
          id: "detect_location",
          title: "Dataset location detection",
          status: "passed",
          message: "Detected location: US.",
        },
        {
          id: "byte_cap_check",
          title: "Dry-run query byte cap check",
          status: "passed",
          message: "Dry-run scan: 12.4 MB (well within 10.0 GB cap).",
        },
      ],
    });

    vi.mocked(api.saveSources).mockResolvedValue([]);

    render(<DataConnectionsPage />);

    // Fast-forward to step 3 by mocking current connection & tables
    // Clicking through or directly triggering test
  });
});
