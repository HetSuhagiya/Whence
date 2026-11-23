const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? "/api/v1" : "http://127.0.0.1:8000/api/v1");

export interface ConnectionPublic {
  id: string;
  name: string;
  warehouse_type: "bigquery" | "duckdb";
  client_email: string | null;
  project_id: string | null;
  billing_project: string | null;
  location: string | null;
  selected_tables_count: number;
  created_at: number;
  updated_at: number;
}

export interface TableColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  description?: string | null;
}

export interface TableDetail {
  project_id: string;
  dataset_id: string;
  table_name: string;
  table_type: string;
  row_count: number;
  size_bytes: number;
  formatted_size: string;
  partition_field?: string | null;
  partition_type?: string | null;
  require_partition_filter: boolean;
  clustering_fields: string[];
  columns: TableColumnInfo[];
}

export interface TablePreviewResponse {
  project_id: string;
  dataset_id: string;
  table_name: string;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  zero_query_cost: boolean;
}

export interface CheckItem {
  id: string;
  title: string;
  status: "passed" | "failed" | "skipped";
  message: string;
  error_detail?: string | null;
  remediation?: string | null;
}

export interface ConnectionTestResult {
  connection_id: string;
  overall_status: "passed" | "failed";
  checks: CheckItem[];
}

export const api = {
  async listConnections(): Promise<ConnectionPublic[]> {
    const res = await fetch(`${API_BASE}/connections`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getConnection(id: string): Promise<ConnectionPublic> {
    const res = await fetch(`${API_BASE}/connections/${id}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async createConnection(req: {
    name: string;
    warehouse_type: "bigquery" | "duckdb";
    key_json?: string;
    billing_project?: string;
  }): Promise<ConnectionPublic> {
    const res = await fetch(`${API_BASE}/connections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errData.detail || "Failed to create connection");
    }
    return res.json();
  },

  async updateKey(id: string, key_json: string): Promise<ConnectionPublic> {
    const res = await fetch(`${API_BASE}/connections/${id}/key`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_json }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errData.detail || "Failed to update key");
    }
    return res.json();
  },

  async deleteConnection(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/connections/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(await res.text());
  },

  async testConnection(id: string): Promise<ConnectionTestResult> {
    const res = await fetch(`${API_BASE}/connections/${id}/test`, {
      method: "POST",
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errData.detail || "Failed to run connection tests");
    }
    return res.json();
  },

  async listProjects(connId: string): Promise<string[]> {
    const res = await fetch(`${API_BASE}/connections/${connId}/projects`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async listDatasets(connId: string, projectId: string): Promise<{ dataset_id: string; location: string }[]> {
    const res = await fetch(`${API_BASE}/connections/${connId}/projects/${encodeURIComponent(projectId)}/datasets`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errData.detail || "Failed to list datasets");
    }
    return res.json();
  },

  async listTables(
    connId: string,
    projectId: string,
    datasetId: string
  ): Promise<{ table_name: string; table_type: string }[]> {
    const res = await fetch(
      `${API_BASE}/connections/${connId}/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/tables`
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errData.detail || "Failed to list tables");
    }
    return res.json();
  },

  async getTableDetail(
    connId: string,
    projectId: string,
    datasetId: string,
    tableName: string
  ): Promise<TableDetail> {
    const res = await fetch(
      `${API_BASE}/connections/${connId}/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/tables/${encodeURIComponent(tableName)}`
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errData.detail || "Failed to fetch table details");
    }
    return res.json();
  },

  async previewTable(
    connId: string,
    projectId: string,
    datasetId: string,
    tableName: string,
    limit: number = 10
  ): Promise<TablePreviewResponse> {
    const res = await fetch(
      `${API_BASE}/connections/${connId}/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/tables/${encodeURIComponent(tableName)}/preview?limit=${limit}`
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errData.detail || "Failed to fetch table preview");
    }
    return res.json();
  },

  async saveSources(connId: string, tables: TableDetail[]): Promise<TableDetail[]> {
    const res = await fetch(`${API_BASE}/connections/${connId}/sources`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tables }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errData.detail || "Failed to save sources");
    }
    return res.json();
  },

  async getSources(connId: string): Promise<TableDetail[]> {
    const res = await fetch(`${API_BASE}/connections/${connId}/sources`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};
