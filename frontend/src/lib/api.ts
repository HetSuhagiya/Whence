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

export interface DimensionPublic {
  id: string;
  model_id: string;
  name: string;
  column_expression: string;
  dimension_type: "categorical" | "time" | "numeric_bucket";
  label?: string | null;
  is_identifier: boolean;
  exclude_from_explanation: boolean;
  created_at: number;
  updated_at: number;
}

export interface MetricPublic {
  id: string;
  model_id: string;
  name: string;
  description?: string | null;
  metric_type: "additive" | "ratio";
  numerator_expr: string;
  denominator_expr?: string | null;
  fixed_filter?: string | null;
  display_format: "currency" | "percent" | "integer" | "decimal";
  higher_is_better: boolean;
  version: number;
  created_at: number;
  updated_at: number;
}

export interface MetricVersionPublic {
  id: string;
  metric_id: string;
  version: number;
  numerator_expr: string;
  denominator_expr?: string | null;
  fixed_filter?: string | null;
  changed_by?: string | null;
  change_summary?: string | null;
  created_at: number;
}

export interface ModelPublic {
  id: string;
  connection_id: string;
  name: string;
  project_id: string;
  dataset_id: string;
  table_name: string;
  primary_time_column: string;
  description?: string | null;
  anchor_date?: string | null;
  dimensions: DimensionPublic[];
  metrics: MetricPublic[];
  created_at: number;
  updated_at: number;
}

export interface MetricValidateResponse {
  valid: boolean;
  dialect: string;
  error?: string | null;
  normalized_expression?: string | null;
}

export interface MetricPreviewPoint {
  period: string;
  value: number;
}

export interface MetricPreviewResponse {
  metric_name: string;
  series: MetricPreviewPoint[];
  total_periods: number;
  dialect: string;
}

export interface ChartSpec {
  model_id: string;
  metric: string;
  dimensions?: string[];
  time_grain?: "day" | "week" | "month" | "quarter" | "year" | null;
  date_range?: string;
  start_date?: string | null;
  end_date?: string | null;
  filters?: { dimension: string; operator: string; value: string | number | string[] }[];
  chart_type: "line" | "bar" | "stacked_bar" | "area" | "kpi" | "table" | "scatter";
  title: string;
  limit?: number;
}

export interface CompiledQuery {
  sql: string;
  dialect: string;
  metric_name: string;
  chart_type: string;
  estimated_cost_bytes?: number | null;
  param_values: Record<string, unknown>;
}

export interface ChartExecutionResult {
  spec: ChartSpec;
  compiled_sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  execution_time_ms: number;
  bytes_scanned?: number | null;
}

export interface DashboardChartPublic {
  id: string;
  dashboard_id: string;
  title: string;
  chart_type: "line" | "bar" | "stacked_bar" | "area" | "kpi" | "table" | "scatter";
  chart_spec: ChartSpec;
  position: number;
  created_at: number;
}

export interface SkippedChartNote {
  title: string;
  reason: string;
  suggestion: string;
}

export interface DashboardPublic {
  id: string;
  name: string;
  connection_id: string;
  connection_name: string;
  warehouse_type: string;
  model_id: string;
  model_name?: string | null;
  model_description?: string | null;
  primary_time_column?: string | null;
  charts: DashboardChartPublic[];
  skipped_charts?: SkippedChartNote[];
  created_at: number;
  updated_at: number;
}

export interface ChartRunResult {
  chart_id: string;
  title: string;
  metric: string;
  chart_type: string;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  compiled_sql: string;
  param_values: Record<string, unknown>;
  estimated_bytes?: number | null;
  execution_time_ms: number;
  bytes_scanned: number;
  time_grain?: string | null;
  dimensions?: string[];
  date_range?: string | Record<string, string>;
}

export interface ExplainProgressEvent {
  event: "step_start" | "step_complete" | "completed" | "error";
  step?: number;
  name?: string;
  title?: string;
  detail?: string;
  message?: string;
  evidence?: Record<string, unknown>;
  narrative?: Record<string, unknown>;
  chart?: Record<string, unknown>;
}

export function extractErrorMessage(errData: unknown, fallback: string): string {
  if (!errData) return fallback;
  if (typeof errData === "string") {
    try {
      const parsed = JSON.parse(errData);
      return extractErrorMessage(parsed, errData);
    } catch {
      return errData;
    }
  }
  if (Array.isArray(errData)) {
    return errData
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const rec = item as { loc?: (string | number)[]; msg?: string };
          const loc = Array.isArray(rec.loc)
            ? rec.loc.filter((x) => x !== "body").join(".")
            : "";
          const msg = rec.msg || JSON.stringify(item);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return String(item);
      })
      .join("; ");
  }
  if (typeof errData === "object") {
    const detail = (errData as { detail?: unknown }).detail;
    if (detail !== undefined) {
      return extractErrorMessage(detail, fallback);
    }
    const message = (errData as { message?: unknown }).message;
    if (typeof message === "string") return message;
    return JSON.stringify(errData);
  }
  return String(errData);
}

export async function parseApiError(res: Response, fallback: string): Promise<Error> {
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return new Error(extractErrorMessage(json, fallback));
    } catch {
      return new Error(text || fallback);
    }
  } catch {
    return new Error(fallback);
  }
}

export const api = {
  async listConnections(): Promise<ConnectionPublic[]> {
    const res = await fetch(`${API_BASE}/connections`);
    if (!res.ok) throw await parseApiError(res, "Failed to list connections");
    return res.json();
  },

  async getConnection(id: string): Promise<ConnectionPublic> {
    const res = await fetch(`${API_BASE}/connections/${id}`);
    if (!res.ok) throw await parseApiError(res, "Failed to list connections");
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
      throw new Error(extractErrorMessage(errData, "Failed to create connection"));
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
      throw new Error(extractErrorMessage(errData, "Failed to update key"));
    }
    return res.json();
  },

  async deleteConnection(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/connections/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw await parseApiError(res, "Failed to list connections");
  },

  async testConnection(id: string): Promise<ConnectionTestResult> {
    const res = await fetch(`${API_BASE}/connections/${id}/test`, {
      method: "POST",
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(extractErrorMessage(errData, "Failed to run connection tests"));
    }
    return res.json();
  },

  async listProjects(connId: string): Promise<string[]> {
    const res = await fetch(`${API_BASE}/connections/${connId}/projects`);
    if (!res.ok) throw await parseApiError(res, "Failed to list connections");
    return res.json();
  },

  async listDatasets(connId: string, projectId: string): Promise<{ dataset_id: string; location: string }[]> {
    const res = await fetch(`${API_BASE}/connections/${connId}/projects/${encodeURIComponent(projectId)}/datasets`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(extractErrorMessage(errData, "Failed to list datasets"));
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
      throw new Error(extractErrorMessage(errData, "Failed to list tables"));
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
      throw new Error(extractErrorMessage(errData, "Failed to fetch table details"));
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
      throw new Error(extractErrorMessage(errData, "Failed to fetch table preview"));
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
      throw new Error(extractErrorMessage(errData, "Failed to save sources"));
    }
    return res.json();
  },

  async getSources(connId: string): Promise<TableDetail[]> {
    const res = await fetch(`${API_BASE}/connections/${connId}/sources`);
    if (!res.ok) throw await parseApiError(res, "Failed to list connections");
    return res.json();
  },

  // Semantic Layer APIs
  async listModels(connectionId?: string): Promise<ModelPublic[]> {
    const url = connectionId
      ? `${API_BASE}/semantic/models?connection_id=${encodeURIComponent(connectionId)}`
      : `${API_BASE}/semantic/models`;
    const res = await fetch(url);
    if (!res.ok) throw await parseApiError(res, "Failed to list connections");
    return res.json();
  },

  async getModel(modelId: string): Promise<ModelPublic> {
    const res = await fetch(`${API_BASE}/semantic/models/${modelId}`);
    if (!res.ok) throw await parseApiError(res, "Failed to list connections");
    return res.json();
  },

  async refreshModelAnchor(modelId: string): Promise<ModelPublic> {
    const res = await fetch(`${API_BASE}/semantic/models/${modelId}/refresh-anchor`, {
      method: "POST",
    });
    if (!res.ok) throw await parseApiError(res, "Failed to refresh model anchor date");
    return res.json();
  },

  async seedDefaultEcommerce(req: {
    connection_id: string;
    project_id?: string;
    dataset_id?: string;
    table_name?: string;
  }): Promise<ModelPublic> {
    const res = await fetch(`${API_BASE}/semantic/models/default-ecommerce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(extractErrorMessage(errData, "Failed to seed default ecommerce semantic model"));
    }
    return res.json();
  },

  async updateDimension(
    dimId: string,
    req: {
      label?: string;
      column_expression?: string;
      dimension_type?: "categorical" | "time" | "numeric_bucket";
      is_identifier?: boolean;
      exclude_from_explanation?: boolean;
    }
  ): Promise<DimensionPublic> {
    const res = await fetch(`${API_BASE}/semantic/dimensions/${dimId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(extractErrorMessage(errData, "Failed to update dimension"));
    }
    return res.json();
  },

  async createMetric(
    modelId: string,
    req: {
      name: string;
      description?: string;
      metric_type: "additive" | "ratio";
      numerator_expr: string;
      denominator_expr?: string;
      fixed_filter?: string;
      display_format: "currency" | "percent" | "integer" | "decimal";
      higher_is_better?: boolean;
    }
  ): Promise<MetricPublic> {
    const res = await fetch(`${API_BASE}/semantic/models/${modelId}/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(extractErrorMessage(errData, "Failed to create metric"));
    }
    return res.json();
  },

  async updateMetric(
    metricId: string,
    req: {
      name?: string;
      description?: string;
      numerator_expr?: string;
      denominator_expr?: string;
      fixed_filter?: string;
      display_format?: "currency" | "percent" | "integer" | "decimal";
      higher_is_better?: boolean;
    }
  ): Promise<MetricPublic> {
    const res = await fetch(`${API_BASE}/semantic/metrics/${metricId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(extractErrorMessage(errData, "Failed to update metric"));
    }
    return res.json();
  },

  async listMetricVersions(metricId: string): Promise<MetricVersionPublic[]> {
    const res = await fetch(`${API_BASE}/semantic/metrics/${metricId}/versions`);
    if (!res.ok) throw await parseApiError(res, "Failed to list connections");
    return res.json();
  },

  async validateMetricFormula(req: {
    numerator_expr: string;
    denominator_expr?: string;
    dialect?: string;
  }): Promise<MetricValidateResponse> {
    const res = await fetch(`${API_BASE}/semantic/metrics/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(extractErrorMessage(errData, "Failed to validate metric formula"));
    }
    return res.json();
  },

  async previewMetricTrend(req: {
    model_id: string;
    numerator_expr: string;
    denominator_expr?: string;
    fixed_filter?: string;
  }): Promise<MetricPreviewResponse> {
    const res = await fetch(`${API_BASE}/semantic/metrics/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(extractErrorMessage(errData, "Failed to generate metric preview"));
    }
    return res.json();
  },

  // Query Compiler APIs
  async compileChart(spec: ChartSpec, dialect: string = "duckdb"): Promise<CompiledQuery> {
    const res = await fetch(`${API_BASE}/compiler/compile?dialect=${encodeURIComponent(dialect)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(spec),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(extractErrorMessage(errData, "Failed to compile chart query"));
    }
    return res.json();
  },

  async executeChart(spec: ChartSpec): Promise<ChartExecutionResult> {
    const res = await fetch(`${API_BASE}/compiler/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(spec),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(extractErrorMessage(errData, "Failed to execute chart query"));
    }
    return res.json();
  },

  async getDemoChartSpecs(modelId: string): Promise<ChartSpec[]> {
    const res = await fetch(`${API_BASE}/compiler/demo-specs/${modelId}`);
    if (!res.ok) throw await parseApiError(res, "Failed to load demo chart specs");
    return res.json();
  },

  // Dashboard APIs (Item 7)
  async listDashboards(): Promise<DashboardPublic[]> {
    const res = await fetch(`${API_BASE}/dashboards`);
    if (!res.ok) throw await parseApiError(res, "Failed to list dashboards");
    return res.json();
  },

  async getDashboard(dashboardId: string): Promise<DashboardPublic> {
    const res = await fetch(`${API_BASE}/dashboards/${dashboardId}`);
    if (!res.ok) throw await parseApiError(res, "Failed to load dashboard");
    return res.json();
  },

  async createDashboard(req: { connection_id: string; name?: string }): Promise<DashboardPublic> {
    const res = await fetch(`${API_BASE}/dashboards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw await parseApiError(res, "Failed to create dashboard");
    return res.json();
  },

  async deleteDashboard(dashboardId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/dashboards/${dashboardId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw await parseApiError(res, "Failed to delete dashboard");
  },

  async runDashboardChart(
    dashboardId: string,
    chartId: string,
    req?: { date_range?: string | Record<string, string>; start_date?: string; end_date?: string; filters?: Record<string, unknown>[] }
  ): Promise<ChartRunResult> {
    const res = await fetch(`${API_BASE}/dashboards/${dashboardId}/charts/${chartId}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req || {}),
    });
    if (!res.ok) throw await parseApiError(res, "Failed to execute dashboard chart");
    return res.json();
  },
};
