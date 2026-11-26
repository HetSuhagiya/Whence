import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

describe("Connection Flow Loading States", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listConnections).mockResolvedValue([
      {
        id: "conn-bq-1",
        name: "BigQuery Prod",
        warehouse_type: "bigquery",
        client_email: "sa@prod.iam.gserviceaccount.com",
        project_id: "prod-project",
        billing_project: "prod-project",
        location: "US",
        selected_tables_count: 0,
        created_at: 1000,
        updated_at: 1000,
      },
    ]);
  });

  it("sets loading state (disabled, aria-busy, inline spinner) on 'Continue to choose data' button during upload", async () => {
    let resolveCreate: (value: unknown) => void;
    const createPromise = new Promise((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(api.createConnection).mockReturnValue(createPromise as never);

    render(<DataConnectionsPage />);

    // Upload mock key
    const validKey = JSON.stringify({
      type: "service_account",
      project_id: "test-proj",
      private_key_id: "key123",
      private_key: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n",
      client_email: "sa@test-proj.iam.gserviceaccount.com",
    });
    const file = new File([validKey], "key.json", { type: "application/json" });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("key.json")).toBeInTheDocument();
    });

    const continueBtn = screen.getByText(/Continue to choose data/i).closest("button")!;
    expect(continueBtn).not.toBeDisabled();

    fireEvent.click(continueBtn);

    // In loading state
    expect(continueBtn).toBeDisabled();
    expect(continueBtn).toHaveAttribute("aria-busy", "true");
    expect(continueBtn.querySelector("svg.animate-spin")).toBeInTheDocument();

    // Screen reader announcement updated
    expect(screen.getByText(/Uploading and validating service account JSON key/i)).toBeInTheDocument();

    // Resolve promise
    await act(async () => {
      resolveCreate!({
        id: "conn-123",
        name: "BigQuery production",
        warehouse_type: "bigquery",
        client_email: "sa@test-proj.iam.gserviceaccount.com",
        project_id: "test-proj",
        billing_project: "test-proj",
        location: "US",
        selected_tables_count: 0,
        created_at: 1000,
        updated_at: 1000,
      });
    });
  });

  it("sets loading state on Remove Connection button with aria-busy and spinner", async () => {
    let resolveDelete: (value: unknown) => void;
    const deletePromise = new Promise((resolve) => {
      resolveDelete = resolve;
    });
    vi.mocked(api.deleteConnection).mockReturnValue(deletePromise as never);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<DataConnectionsPage />);

    await waitFor(() => {
      expect(screen.getByText("BigQuery Prod")).toBeInTheDocument();
    });

    const removeBtn = screen.getByLabelText(/Remove connection BigQuery Prod/i);
    expect(removeBtn).not.toBeDisabled();

    fireEvent.click(removeBtn);

    // Loading state active on delete button
    expect(removeBtn).toBeDisabled();
    expect(removeBtn).toHaveAttribute("aria-busy", "true");
    expect(removeBtn.querySelector("svg.animate-spin")).toBeInTheDocument();

    await act(async () => {
      resolveDelete!(undefined);
    });
  });

  it("sets loading state on Replace Key button in dialog with aria-busy and spinner", async () => {
    let resolveUpdate: (value: unknown) => void;
    const updatePromise = new Promise((resolve) => {
      resolveUpdate = resolve;
    });
    vi.mocked(api.updateKey).mockReturnValue(updatePromise as never);

    render(<DataConnectionsPage />);

    await waitFor(() => {
      expect(screen.getByText("BigQuery Prod")).toBeInTheDocument();
    });

    const keyBtn = screen.getByTitle("Replace key");
    fireEvent.click(keyBtn);

    expect(screen.getByText("Replace service account key")).toBeInTheDocument();

    // Upload replacement key
    const repKey = JSON.stringify({
      type: "service_account",
      project_id: "new-proj",
      private_key: "...",
      client_email: "sa-new@new-proj.iam.gserviceaccount.com",
    });
    const file = new File([repKey], "new_key.json", { type: "application/json" });
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const dialogFileInput = fileInputs[fileInputs.length - 1] as HTMLInputElement;

    fireEvent.change(dialogFileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("new_key.json")).toBeInTheDocument();
    });

    const submitReplaceBtn = screen.getByRole("button", { name: "Replace key" });
    expect(submitReplaceBtn).not.toBeDisabled();

    fireEvent.click(submitReplaceBtn);

    // Loading state active
    expect(submitReplaceBtn).toBeDisabled();
    expect(submitReplaceBtn).toHaveAttribute("aria-busy", "true");
    expect(submitReplaceBtn.querySelector("svg.animate-spin")).toBeInTheDocument();

    await act(async () => {
      resolveUpdate!({
        id: "conn-bq-1",
        name: "BigQuery Prod",
        warehouse_type: "bigquery",
        client_email: "sa-new@new-proj.iam.gserviceaccount.com",
        project_id: "new-proj",
      });
    });
  });

  it("sets loading state on Add project by ID button", async () => {
    vi.mocked(api.listProjects).mockResolvedValue(["prod-project"]);
    vi.mocked(api.listDatasets).mockImplementation((_connId, proj) => {
      if (proj === "bigquery-public-data") {
        return new Promise(() => {}); // Intentionally pending
      }
      return Promise.resolve([{ dataset_id: "analytics", location: "US" }]);
    });
    vi.mocked(api.listTables).mockResolvedValue([]);

    render(<DataConnectionsPage />);

    await waitFor(() => {
      expect(screen.getByText("BigQuery Prod")).toBeInTheDocument();
    });
    const openBtn = screen.getByTitle("Open connection");
    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(screen.getByTitle(/Add project by ID/i)).toBeInTheDocument();
    });

    const addProjToggle = screen.getByTitle(/Add project by ID/i);
    fireEvent.click(addProjToggle);

    const input = screen.getByPlaceholderText("e.g. bigquery-public-data");
    fireEvent.change(input, { target: { value: "bigquery-public-data" } });

    const addBtn = screen.getByRole("button", { name: "Add" });
    expect(addBtn).not.toBeDisabled();

    fireEvent.click(addBtn);

    // Loading state active
    expect(addBtn).toBeDisabled();
    expect(addBtn).toHaveAttribute("aria-busy", "true");
    expect(addBtn.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("renders layout-matching skeletons when table loading wait exceeds 200ms", async () => {
    vi.mocked(api.listProjects).mockResolvedValue(["prod-project"]);
    vi.mocked(api.listDatasets).mockResolvedValue([{ dataset_id: "analytics", location: "US" }]);
    // Table loading wait that takes 350ms
    vi.mocked(api.listTables).mockReturnValue(
      new Promise((resolve) => setTimeout(() => resolve([]), 350)) as never
    );

    render(<DataConnectionsPage />);

    await waitFor(() => {
      expect(screen.getByText("BigQuery Prod")).toBeInTheDocument();
    });
    const openBtn = screen.getByTitle("Open connection");
    fireEvent.click(openBtn);

    // Wait until 200ms threshold triggers the skeleton display
    await waitFor(
      () => {
        expect(screen.getByRole("status", { name: "Loading tables list" })).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it("renders distinct check states (pending, running, passed, failed) in Step 3", async () => {
    vi.mocked(api.listProjects).mockResolvedValue(["prod-project"]);
    vi.mocked(api.listDatasets).mockResolvedValue([{ dataset_id: "analytics", location: "US" }]);
    vi.mocked(api.listTables).mockResolvedValue([
      { table_name: "orders", table_type: "TABLE" },
    ]);
    vi.mocked(api.getTableDetail).mockResolvedValue({
      project_id: "prod-project",
      dataset_id: "analytics",
      table_name: "orders",
      table_type: "TABLE",
      row_count: 500,
      size_bytes: 20000,
      formatted_size: "19.5 KB",
      clustering_fields: [],
      require_partition_filter: false,
      columns: [{ name: "order_id", data_type: "STRING", is_nullable: false }],
    });
    vi.mocked(api.previewTable).mockResolvedValue({
      project_id: "prod-project",
      dataset_id: "analytics",
      table_name: "orders",
      columns: ["order_id"],
      rows: [{ order_id: "ORD-1" }],
      row_count: 1,
      zero_query_cost: true,
    });
    vi.mocked(api.saveSources).mockResolvedValue([]);

    let resolveTest: (value: unknown) => void;
    const testPromise = new Promise((resolve) => {
      resolveTest = resolve;
    });
    vi.mocked(api.testConnection).mockReturnValue(testPromise as never);

    render(<DataConnectionsPage />);

    await waitFor(() => {
      expect(screen.getByText("BigQuery Prod")).toBeInTheDocument();
    });

    const openBtn = screen.getByTitle("Open connection");
    fireEvent.click(openBtn);

    // Wait for Step 2 tables to load
    await waitFor(() => {
      expect(screen.getAllByText("orders").length).toBeGreaterThan(0);
    });

    // Check that table checkbox is selected or select it
    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    if (!checkbox.checked) {
      fireEvent.click(checkbox);
    }

    // Proceed to Step 3
    const proceedBtn = screen.getByText(/Proceed to test & save/i);
    await waitFor(() => {
      expect(proceedBtn).not.toBeDisabled();
    });
    fireEvent.click(proceedBtn);

    await waitFor(() => {
      expect(screen.getByText("Connection verification checklist")).toBeInTheDocument();
    });

    // While test is running, check 1 is 'running' (with spinner) and others are 'pending'
    expect(screen.getByLabelText("Key file format: running")).toBeInTheDocument();
    expect(screen.getByLabelText("Authentication: pending")).toBeInTheDocument();

    // Re-run button has loading state
    const rerunBtn = screen.getByRole("button", { name: /Re-run checks/i });
    expect(rerunBtn).toBeDisabled();
    expect(rerunBtn).toHaveAttribute("aria-busy", "true");

    // Resolve test with passed and failed checks
    await act(async () => {
      resolveTest!({
        connection_id: "conn-bq-1",
        overall_status: "failed",
        checks: [
          { id: "key_format", title: "Key file format", status: "passed", message: "Valid JSON service account." },
          { id: "auth", title: "Authentication", status: "passed", message: "Token acquired." },
          {
            id: "job_user",
            title: "BigQuery Job User permission",
            status: "failed",
            message: "Denied creating query job.",
            remediation: "Grant role 'BigQuery Job User' on project 'prod-project'.",
          },
          { id: "list_datasets", title: "List datasets permission", status: "passed", message: "Listed 3 datasets." },
          { id: "read_schemas", title: "Read table schema (BigQuery Data Viewer)", status: "passed", message: "Schema read." },
          { id: "detect_location", title: "Dataset location detection", status: "passed", message: "US detected." },
          { id: "byte_cap_check", title: "Dry-run query byte cap check", status: "passed", message: "Scan within limit." },
        ],
      });
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Key file format: passed")).toBeInTheDocument();
      expect(screen.getByLabelText("BigQuery Job User permission: failed")).toBeInTheDocument();
      expect(screen.getByText(/Grant role 'BigQuery Job User' on project 'prod-project'/i)).toBeInTheDocument();
    });
  });
});
