"use client";

import * as React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CreateDashboardDialog } from "@/components/dashboard/CreateDashboardDialog";
import { GuidedMetricBuilder } from "@/components/semantic/GuidedMetricBuilder";
import { DimensionBuilderModal } from "@/components/semantic/DimensionBuilderModal";
import {
  api,
  ConnectionPublic,
  DimensionPublic,
  MetricPublic,
  MetricVersionPublic,
  ModelDependentsResponse,
  ModelPublic,
} from "@/lib/api";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  History,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface SemanticLayerManagerProps {
  connections: ConnectionPublic[];
  selectedConnectionId?: string;
  onConnectionChange?: (connectionId: string) => void;
}

export function SemanticLayerManager({
  connections,
  selectedConnectionId,
  onConnectionChange,
}: SemanticLayerManagerProps) {
  const [activeConnId, setActiveConnId] = React.useState<string>(
    selectedConnectionId || connections[0]?.id || ""
  );
  const [models, setModels] = React.useState<ModelPublic[]>([]);
  const [selectedModel, setSelectedModel] = React.useState<ModelPublic | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Default ecommerce seeding state
  const [isSeeding, setIsSeeding] = React.useState(false);

  // Dimension exclusion toggle in flight
  const [togglingDimId, setTogglingDimId] = React.useState<string | null>(null);

  // Custom modals
  const [isGuidedMetricOpen, setIsGuidedMetricOpen] = React.useState(false);
  const [editingMetric, setEditingMetric] = React.useState<MetricPublic | null>(null);
  const [isDimensionModalOpen, setIsDimensionModalOpen] = React.useState(false);
  const [editingDimension, setEditingDimension] = React.useState<DimensionPublic | null>(null);

  // Metric builder dialog state
  const [isBuilderOpen, setIsBuilderOpen] = React.useState(false);
  const [builderName, setBuilderName] = React.useState("");
  const [builderDescription, setBuilderDescription] = React.useState("");
  const [builderType, setBuilderType] = React.useState<"additive" | "ratio">("additive");
  const [builderNumerator, setBuilderNumerator] = React.useState("");
  const [builderDenominator, setBuilderDenominator] = React.useState("");
  const [builderFilter, setBuilderFilter] = React.useState("");
  const [builderFormat, setBuilderFormat] = React.useState<
    "currency" | "percent" | "integer" | "decimal"
  >("currency");
  const [builderHigherIsBetter, setBuilderHigherIsBetter] = React.useState(true);

  // Metric validation state
  const [isValidating, setIsValidating] = React.useState(false);
  const [validationResult, setValidationResult] = React.useState<{
    valid: boolean;
    message: string;
  } | null>(null);

  // Metric preview state
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [previewSeries, setPreviewSeries] = React.useState<{ period: string; value: number }[]>([]);
  const [isSavingMetric, setIsSavingMetric] = React.useState(false);

  // Metric version history dialog state
  const [versionMetric, setVersionMetric] = React.useState<MetricPublic | null>(null);
  const [versions, setVersions] = React.useState<MetricVersionPublic[]>([]);
  const [loadingVersions, setLoadingVersions] = React.useState(false);

  // Create Dashboard Dialog state
  const [isCreateDashboardOpen, setIsCreateDashboardOpen] = React.useState(false);

  // Deletion and Dependents Warning State
  const [deleteTarget, setDeleteTarget] = React.useState<{
    type: "model" | "dimension" | "metric";
    id: string;
    name: string;
  } | null>(null);
  const [dependentsWarning, setDependentsWarning] =
    React.useState<ModelDependentsResponse | null>(null);
  const [isDeletingItem, setIsDeletingItem] = React.useState(false);

  // Sync prop changes
  React.useEffect(() => {
    if (selectedConnectionId && selectedConnectionId !== activeConnId) {
      setActiveConnId(selectedConnectionId);
    }
  }, [selectedConnectionId, activeConnId]);

  // Load models for active connection
  const loadModels = React.useCallback(async (connId: string) => {
    if (!connId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.listModels(connId);
      setModels(list || []);
      setSelectedModel((list && list[0]) || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load models");
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (activeConnId) {
      loadModels(activeConnId);
    }
  }, [activeConnId, loadModels]);

  // Seed default ecommerce set
  const handleSeedDefaultEcommerce = async () => {
    if (!activeConnId) return;
    setIsSeeding(true);
    setError(null);
    try {
      const model = await api.seedDefaultEcommerce({ connection_id: activeConnId });
      await loadModels(activeConnId);
      setSelectedModel(model);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to seed default ecommerce model");
    } finally {
      setIsSeeding(false);
    }
  };

  // Toggle dimension exclusion from explanation
  const handleToggleExclude = async (dim: DimensionPublic) => {
    setTogglingDimId(dim.id);
    try {
      const updated = await api.updateDimension(dim.id, {
        exclude_from_explanation: !dim.exclude_from_explanation,
      });
      if (selectedModel) {
        setSelectedModel({
          ...selectedModel,
          dimensions: selectedModel.dimensions.map((d) => (d.id === updated.id ? updated : d)),
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update dimension");
    } finally {
      setTogglingDimId(null);
    }
  };

  // Model & Definition Deletion Handlers with Dependency Awareness
  const handlePromptDeleteModel = async (model: ModelPublic) => {
    try {
      const deps = await api.getModelDependents(model.id);
      setDependentsWarning(deps);
      setDeleteTarget({ type: "model", id: model.id, name: model.name });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to check dependents");
    }
  };

  const handlePromptDeleteDimension = async (dim: DimensionPublic) => {
    if (!selectedModel) return;
    try {
      const deps = await api.getModelDependents(selectedModel.id, {
        dimension_name: dim.name,
      });
      setDependentsWarning(deps);
      setDeleteTarget({
        type: "dimension",
        id: dim.id,
        name: dim.label || dim.name,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to check dependents");
    }
  };

  const handlePromptDeleteMetric = async (metric: MetricPublic) => {
    if (!selectedModel) return;
    try {
      const deps = await api.getModelDependents(selectedModel.id, {
        metric_name: metric.name,
      });
      setDependentsWarning(deps);
      setDeleteTarget({
        type: "metric",
        id: metric.id,
        name: metric.name,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to check dependents");
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeletingItem(true);
    try {
      if (deleteTarget.type === "model") {
        await api.deleteModel(deleteTarget.id);
        await loadModels(activeConnId);
      } else if (deleteTarget.type === "dimension") {
        await api.deleteDimension(deleteTarget.id);
        await loadModels(activeConnId);
      } else if (deleteTarget.type === "metric") {
        await api.deleteMetric(deleteTarget.id);
        await loadModels(activeConnId);
      }
      setDeleteTarget(null);
      setDependentsWarning(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete item");
    } finally {
      setIsDeletingItem(false);
    }
  };

  // Validate formula using sqlglot AST verification
  const handleValidateFormula = async () => {
    if (!builderNumerator.trim()) {
      setValidationResult({ valid: false, message: "Numerator expression cannot be empty." });
      return;
    }
    setIsValidating(true);
    setValidationResult(null);
    try {
      const res = await api.validateMetricFormula({
        numerator_expr: builderNumerator,
        denominator_expr: builderType === "ratio" ? builderDenominator : undefined,
      });
      if (res.valid) {
        setValidationResult({
          valid: true,
          message: `Valid formula syntax and AST (${res.dialect} dialect verified)`,
        });
      } else {
        setValidationResult({
          valid: false,
          message: res.error || "Formula failed SQL guardrail validation",
        });
      }
    } catch (err: unknown) {
      setValidationResult({
        valid: false,
        message: err instanceof Error ? err.message : "Validation failed",
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Preview 30-day trend
  const handlePreviewTrend = async () => {
    if (!selectedModel || !builderNumerator.trim()) return;
    setIsPreviewing(true);
    setPreviewSeries([]);
    try {
      const res = await api.previewMetricTrend({
        model_id: selectedModel.id,
        numerator_expr: builderNumerator,
        denominator_expr: builderType === "ratio" ? builderDenominator : undefined,
        fixed_filter: builderFilter.trim() || undefined,
      });
      setPreviewSeries(res.series);
    } catch (err: unknown) {
      setValidationResult({
        valid: false,
        message: err instanceof Error ? err.message : "Preview calculation failed",
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  // Save new metric
  const handleSaveMetric = async () => {
    if (!selectedModel || !builderName.trim() || !builderNumerator.trim()) return;
    setIsSavingMetric(true);
    setError(null);
    try {
      const created = await api.createMetric(selectedModel.id, {
        name: builderName.trim().toLowerCase().replace(/\s+/g, "_"),
        description: builderDescription.trim() || undefined,
        metric_type: builderType,
        numerator_expr: builderNumerator.trim(),
        denominator_expr: builderType === "ratio" ? builderDenominator.trim() : undefined,
        fixed_filter: builderFilter.trim() || undefined,
        display_format: builderFormat,
        higher_is_better: builderHigherIsBetter,
      });
      setSelectedModel({
        ...selectedModel,
        metrics: [...selectedModel.metrics, created],
      });
      setIsBuilderOpen(false);
      resetBuilderForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create metric");
    } finally {
      setIsSavingMetric(false);
    }
  };

  // View metric versions
  const handleViewVersions = async (metric: MetricPublic) => {
    setVersionMetric(metric);
    setLoadingVersions(true);
    try {
      const list = await api.listMetricVersions(metric.id);
      setVersions(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load metric versions");
    } finally {
      setLoadingVersions(false);
    }
  };

  const resetBuilderForm = () => {
    setBuilderName("");
    setBuilderDescription("");
    setBuilderType("additive");
    setBuilderNumerator("");
    setBuilderDenominator("");
    setBuilderFilter("");
    setBuilderFormat("currency");
    setBuilderHigherIsBetter(true);
    setValidationResult(null);
    setPreviewSeries([]);
  };

  // Chart data for 30-day preview
  const chartData = {
    labels: previewSeries.map((p) => p.period.slice(5)), // MM-DD
    datasets: [
      {
        label: builderName || "Preview",
        data: previewSeries.map((p) => p.value),
        borderColor: "#111827", // Ink series primary
        backgroundColor: "rgba(78, 121, 167, 0.08)",
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
        fill: true,
        tension: 0.15,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: { parsed: { y: number | null } }) =>
            context.parsed.y !== null ? ` ${context.parsed.y.toLocaleString()}` : "",
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, maxTicksLimit: 7 },
      },
      y: {
        grid: { color: "rgba(100, 116, 139, 0.12)" },
        ticks: { font: { size: 10 } },
      },
    },
  };

  return (
    <div className="flex flex-col gap-6" data-testid="semantic-layer-manager">
      {/* Header & Connection Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-hairline)]">
        <div>
          <h2 className="font-heading text-[20px] text-[var(--text-main)] font-medium">
            Semantic layer
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] mt-1">
            Centralized business definitions, metrics, and dimensions used across dashboards and
            deterministic explanations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {connections.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[var(--text-muted)]">Connection:</span>
              <select
                value={activeConnId}
                onChange={(e) => {
                  setActiveConnId(e.target.value);
                  onConnectionChange?.(e.target.value);
                }}
                className="h-8 px-2.5 text-[13px] rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-blue-11)]"
                data-testid="select-semantic-connection"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.warehouse_type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Primary Create Dashboard Action with Disabled Tooltip */}
          <div className="relative group">
            <Button
              variant="primary"
              size="sm"
              disabled={!selectedModel}
              onClick={() => setIsCreateDashboardOpen(true)}
              className="cursor-pointer"
              data-testid="btn-create-dashboard-from-model"
              title={!selectedModel ? "Confirm a semantic model before creating a dashboard" : undefined}
            >
              <LayoutDashboard className="h-4 w-4 mr-1.5" />
              <span>Create dashboard from this data</span>
            </Button>
            {!selectedModel && (
              <div
                role="tooltip"
                className="absolute right-0 top-full mt-1.5 hidden group-hover:block z-50 px-2.5 py-1 text-[11px] rounded bg-[var(--bg-overlay)] border border-[var(--border-hairline)] text-[var(--text-muted)] shadow-md whitespace-nowrap"
                data-testid="tooltip-disabled-create-dashboard"
              >
                Confirm a semantic model before creating a dashboard
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 text-[13px] rounded-[4px] border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty State / Seed Prompt */}
      {(!models || models.length === 0) && !loading && (
        <div className="p-8 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-center flex flex-col items-center max-w-xl mx-auto my-6">
          <div className="h-10 w-10 rounded-full bg-[var(--accent-blue-11)]/10 text-[var(--accent-blue-11)] flex items-center justify-center mb-3">
            <Sparkles className="h-5 w-5" />
          </div>
          <h3 className="font-heading text-[16px] text-[var(--text-main)] font-medium">
            No semantic model configured yet
          </h3>
          <p className="text-[13px] text-[var(--text-muted)] mt-1.5 max-w-md">
            Confirm the default ecommerce definitions to immediately unlock revenue, orders, AOV,
            items per order, and customer breakdown dimensions on this connection.
          </p>
          <div className="mt-5 flex gap-3">
            <Button
              variant="primary"
              onClick={handleSeedDefaultEcommerce}
              disabled={isSeeding || !activeConnId}
              isLoading={isSeeding}
              aria-busy={isSeeding}
              data-testid="seed-ecommerce-button"
            >
              Confirm default ecommerce set
            </Button>
          </div>
        </div>
      )}

      {/* Active Model View */}
      {selectedModel && (
        <div className="flex flex-col gap-6">
          {/* Model Card Bar */}
          <div className="p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-[14px] text-[var(--text-main)]">
                  {selectedModel.name}
                </span>
                <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-[var(--accent-subtle)] text-[var(--accent-text)] border border-[var(--accent)]/30 font-medium">
                  {selectedModel.table_name}
                </span>
              </div>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                Primary time column:{" "}
                <code className="font-mono text-[11px] text-[var(--text-main)]">
                  {selectedModel.primary_time_column}
                </code>{" "}
                · {selectedModel.dimensions.length} dimensions · {selectedModel.metrics.length} metrics
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePromptDeleteModel(selectedModel)}
                className="text-[var(--text-muted)] hover:text-[var(--trend-down)] cursor-pointer"
                title="Delete model"
                data-testid="btn-delete-model"
              >
                <Trash2 className="h-4 w-4 text-[var(--trend-down)] mr-1" />
                <span>Delete model</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingMetric(null);
                  setIsGuidedMetricOpen(true);
                }}
                data-testid="add-metric-button"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                New custom metric
              </Button>
            </div>
          </div>

          {/* Dimensions Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-[14px] text-[var(--text-main)]">Dimensions</h3>
                <p className="text-[12px] text-[var(--text-muted)]">
                  Attributes used for segment breakdowns. Toggle off identifiers and high-cardinality
                  columns to exclude them from automated explanation scans.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingDimension(null);
                  setIsDimensionModalOpen(true);
                }}
                data-testid="add-dimension-button"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add dimension
              </Button>
            </div>

            <div className="rounded-[4px] border border-[var(--border-hairline)] overflow-hidden bg-[var(--bg-surface)]">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-app)] text-[var(--text-muted)] text-[12px]">
                    <th className="py-2 px-3 font-medium">Dimension</th>
                    <th className="py-2 px-3 font-medium">SQL expression</th>
                    <th className="py-2 px-3 font-medium">Type</th>
                    <th className="py-2 px-3 font-medium">Explanation eligibility</th>
                    <th className="py-2 px-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {selectedModel.dimensions.map((dim) => (
                    <tr
                      key={dim.id}
                      className="hover:bg-[var(--bg-surface-hover)] transition-subtle"
                      data-testid={`dimension-row-${dim.name}`}
                    >
                      <td className="py-2 px-3">
                        <div className="font-medium text-[var(--text-main)]">
                          {dim.label || dim.name}
                        </div>
                        {dim.label && dim.label !== dim.name && (
                          <div className="text-[11px] font-mono text-[var(--text-muted)]">
                            {dim.name}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono text-[12px] text-[var(--text-muted)]">
                        {dim.column_expression}
                      </td>
                      <td className="py-2 px-3">
                        <span className="inline-block px-2 py-0.5 text-[11px] font-mono rounded bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-main)]">
                          {dim.dimension_type}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <button
                          type="button"
                          onClick={() => handleToggleExclude(dim)}
                          disabled={togglingDimId === dim.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] text-[12px] font-medium border transition-subtle cursor-pointer ${
                            dim.exclude_from_explanation
                              ? "bg-[var(--bg-subtle)] text-[var(--text-main)] border-[var(--border-hairline)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-strong)]"
                              : "bg-[var(--trend-up-subtle)] text-[var(--trend-up)] border-[var(--trend-up)]/40 hover:bg-[var(--trend-up-subtle)]/80"
                          }`}
                          data-testid={`toggle-exclude-${dim.name}`}
                        >
                          {dim.exclude_from_explanation ? (
                            <>
                              <X className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                              <span className="text-[var(--text-main)] font-semibold">Excluded</span>
                              <span className="text-[11px] font-mono text-[var(--text-muted)] font-normal">
                                {dim.is_identifier ? "(identifier)" : "(high cardinality)"}
                              </span>
                            </>
                          ) : (
                            <>
                              <Check className="h-3.5 w-3.5 text-[var(--trend-up)]" />
                              <span className="font-semibold text-[var(--trend-up)]">Eligible for explain</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handlePromptDeleteDimension(dim)}
                          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--trend-down)] transition-colors cursor-pointer"
                          title={`Delete dimension ${dim.name}`}
                          data-testid={`btn-delete-dimension-${dim.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[var(--trend-down)]" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Metrics Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-[14px] text-[var(--text-main)]">Metrics</h3>
                <p className="text-[12px] text-[var(--text-muted)]">
                  Additive metrics (revenue, orders) and ratio metrics (AOV, conversion rate) with
                  rigorous rate/mix contribution split.
                </p>
              </div>
            </div>

            <div className="rounded-[4px] border border-[var(--border-hairline)] overflow-hidden bg-[var(--bg-surface)]">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-app)] text-[var(--text-muted)] text-[12px]">
                    <th className="py-2 px-3 font-medium">Metric</th>
                    <th className="py-2 px-3 font-medium">Type</th>
                    <th className="py-2 px-3 font-medium">Formula</th>
                    <th className="py-2 px-3 font-medium">Format</th>
                    <th className="py-2 px-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {selectedModel.metrics.map((m) => (
                    <tr
                      key={m.id}
                      className="hover:bg-[var(--bg-surface-hover)] transition-subtle"
                      data-testid={`metric-row-${m.name}`}
                    >
                      <td className="py-2 px-3">
                        <div className="font-medium text-[var(--text-main)]">{m.name}</div>
                        {m.description && (
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {m.description}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded border ${
                            m.metric_type === "ratio"
                              ? "bg-[var(--bg-subtle)] text-[var(--text-main)] border-[var(--border-hairline)]"
                              : "bg-[var(--accent-subtle)] text-[var(--accent-text)] border border-[var(--accent)]/30 font-medium"
                          }`}
                        >
                          {m.metric_type}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-[12px] text-[var(--text-muted)]">
                        {m.metric_type === "ratio" ? (
                          <span>
                            ({m.numerator_expr}) / ({m.denominator_expr})
                          </span>
                        ) : (
                          <span>{m.numerator_expr}</span>
                        )}
                        {m.fixed_filter && (
                          <span className="block text-[11px] text-[var(--text-muted)]/75">
                            WHERE {m.fixed_filter}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-[12px] text-[var(--text-muted)]">
                        {m.display_format}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleViewVersions(m)}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--accent-blue-11)] hover:underline"
                            title="View version history"
                          >
                            <History className="h-3 w-3" />
                            v{m.version}
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePromptDeleteMetric(m)}
                            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--trend-down)] transition-colors cursor-pointer"
                            title={`Delete metric ${m.name}`}
                            data-testid={`btn-delete-metric-${m.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-[var(--trend-down)]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Custom Metric Builder Dialog */}
      <Dialog open={isBuilderOpen} onOpenChange={setIsBuilderOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Define custom metric</DialogTitle>
            <DialogDescription>
              Write SQL expressions for the numerator and optional denominator. Formats and
              expressions are validated by AST parser and tested with live 30-day preview.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                  Metric identifier
                </label>
                <Input
                  placeholder="e.g. gross_profit"
                  value={builderName}
                  onChange={(e) => setBuilderName(e.target.value)}
                  className="h-8 text-[13px] font-mono"
                  data-testid="metric-name-input"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                  Metric type
                </label>
                <select
                  value={builderType}
                  onChange={(e) => setBuilderType(e.target.value as "additive" | "ratio")}
                  className="w-full h-8 px-2.5 text-[13px] rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-blue-11)]"
                  data-testid="metric-type-select"
                >
                  <option value="additive">Additive (SUM, COUNT)</option>
                  <option value="ratio">Ratio (Rate / Share split)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                Description
              </label>
              <Input
                placeholder="Plain-text description of this business metric"
                value={builderDescription}
                onChange={(e) => setBuilderDescription(e.target.value)}
                className="h-8 text-[13px]"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                Numerator SQL expression
              </label>
              <Input
                placeholder="e.g. SUM(sale_price - cost) or COUNT(order_item_id)"
                value={builderNumerator}
                onChange={(e) => setBuilderNumerator(e.target.value)}
                className="h-8 text-[13px] font-mono"
                data-testid="metric-numerator-input"
              />
            </div>

            {builderType === "ratio" && (
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                  Denominator SQL expression
                </label>
                <Input
                  placeholder="e.g. COUNT(DISTINCT order_id) or SUM(sessions)"
                  value={builderDenominator}
                  onChange={(e) => setBuilderDenominator(e.target.value)}
                  className="h-8 text-[13px] font-mono"
                  data-testid="metric-denominator-input"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                  Display format
                </label>
                <select
                  value={builderFormat}
                  onChange={(e) =>
                    setBuilderFormat(
                      e.target.value as "currency" | "percent" | "integer" | "decimal"
                    )
                  }
                  className="w-full h-8 px-2.5 text-[13px] rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent-blue-11)]"
                >
                  <option value="currency">Currency ($)</option>
                  <option value="integer">Integer (1,234)</option>
                  <option value="decimal">Decimal (1.23)</option>
                  <option value="percent">Percent (%)</option>
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                  Fixed filter (optional)
                </label>
                <Input
                  placeholder="e.g. status = 'Complete'"
                  value={builderFilter}
                  onChange={(e) => setBuilderFilter(e.target.value)}
                  className="h-8 text-[13px] font-mono"
                />
              </div>
            </div>

            {/* Validation & Preview Actions */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleValidateFormula}
                disabled={isValidating || !builderNumerator}
                isLoading={isValidating}
                data-testid="validate-formula-button"
              >
                Validate formula
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handlePreviewTrend}
                disabled={isPreviewing || !builderNumerator || !selectedModel}
                isLoading={isPreviewing}
                data-testid="preview-trend-button"
              >
                Preview last 30 days
              </Button>
            </div>

            {/* Validation Feedback */}
            {validationResult && (
              <div
                className={`p-2.5 text-[12px] rounded-[4px] border flex items-center gap-2 ${
                  validationResult.valid
                    ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30"
                    : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/30"
                }`}
                data-testid="validation-feedback"
              >
                {validationResult.valid ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{validationResult.message}</span>
              </div>
            )}

            {/* 30-Day Trend Preview Chart */}
            {previewSeries.length > 0 && (
              <div className="border border-[var(--border-hairline)] rounded-[4px] p-3 bg-[var(--bg-app)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-[var(--text-main)]">
                    30-day preview trend ({previewSeries.length} points)
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] font-mono">
                    latest:{" "}
                    {previewSeries[previewSeries.length - 1]?.value.toLocaleString()}
                  </span>
                </div>
                <div className="h-32 w-full">
                  <Line data={chartData} options={chartOptions} />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
              <Button variant="secondary" onClick={() => setIsBuilderOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveMetric}
                disabled={!builderName.trim() || !builderNumerator.trim() || isSavingMetric}
                isLoading={isSavingMetric}
                data-testid="save-metric-button"
              >
                Save metric
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={!!versionMetric} onOpenChange={(open) => !open && setVersionMetric(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Metric version history: {versionMetric?.name}</DialogTitle>
            <DialogDescription>
              All edits and formula revisions are tracked with audit timestamps.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            {loadingVersions ? (
              <div className="py-6 text-center text-[13px] text-[var(--text-muted)] flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Loading version history...</span>
              </div>
            ) : versions.length === 0 ? (
              <div className="text-[13px] text-[var(--text-muted)] py-4 text-center">
                No past revisions recorded.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)] max-h-72 overflow-y-auto">
                {versions.map((v) => (
                  <div key={v.id} className="py-2.5 text-[12px] flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium text-[var(--text-main)]">
                        Version {v.version}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(v.created_at * 1000).toLocaleString()}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-[var(--text-muted)] bg-[var(--bg-app)] p-1.5 rounded">
                      Numerator: {v.numerator_expr}
                      {v.denominator_expr && <div>Denominator: {v.denominator_expr}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Prominent Create Dashboard Dialog */}
      <CreateDashboardDialog
        open={isCreateDashboardOpen}
        onOpenChange={setIsCreateDashboardOpen}
        connections={connections}
        defaultConnectionId={activeConnId}
      />

      {/* Dependency Warning Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDependentsWarning(null);
          }
        }}
      >
        <DialogContent className="max-w-lg" data-testid="dependency-warning-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--trend-down)]">
              <AlertCircle className="h-5 w-5 text-[var(--trend-down)] shrink-0" />
              <span>
                {dependentsWarning && dependentsWarning.chart_count > 0
                  ? "Dependent charts will be affected"
                  : `Delete ${deleteTarget?.type}`}
              </span>
            </DialogTitle>
            <DialogDescription>
              {dependentsWarning && dependentsWarning.chart_count > 0 ? (
                <span>
                  Deleting {deleteTarget?.type} <strong>&quot;{deleteTarget?.name}&quot;</strong> will break{" "}
                  <strong>{dependentsWarning.chart_count}</strong> chart{dependentsWarning.chart_count === 1 ? "" : "s"}{" "}
                  across <strong>{dependentsWarning.dashboard_count}</strong> dashboard{dependentsWarning.dashboard_count === 1 ? "" : "s"}.
                </span>
              ) : (
                <span>
                  Are you sure you want to delete this {deleteTarget?.type} <strong>&quot;{deleteTarget?.name}&quot;</strong>? This action cannot be undone.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {dependentsWarning && dependentsWarning.charts.length > 0 && (
            <div className="my-2 flex flex-col gap-2">
              <div className="text-[12px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                Affected charts by title ({dependentsWarning.chart_count}):
              </div>
              <div className="max-h-48 overflow-y-auto rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)] divide-y divide-[var(--border-hairline)]">
                {dependentsWarning.charts.map((chart) => (
                  <div
                    key={chart.id}
                    className="p-2.5 flex items-center justify-between text-[12px]"
                    data-testid={`affected-chart-${chart.id}`}
                  >
                    <div>
                      <span className="font-medium text-[var(--text-main)] block">
                        {chart.title}
                      </span>
                      {chart.dashboard_name && (
                        <span className="text-[11px] text-[var(--text-muted)]">
                          Dashboard: {chart.dashboard_name}
                        </span>
                      )}
                    </div>
                    {chart.chart_type && (
                      <span className="px-1.5 py-0.5 font-mono text-[10px] rounded bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)]">
                        {chart.chart_type}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-2.5 rounded-[4px] border border-[var(--trend-down)]/40 bg-[var(--trend-down-subtle)]/30 text-[12px] text-[var(--trend-down)]">
                Warning: These dashboards and charts depend on this definition and may fail to query or display error banners if deleted.
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteTarget(null);
                setDependentsWarning(null);
              }}
              disabled={isDeletingItem}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmDelete}
              isLoading={isDeletingItem}
              disabled={isDeletingItem}
              className="bg-[var(--trend-down)] hover:bg-[var(--trend-down)]/90 text-white border-transparent"
              data-testid="btn-confirm-delete-anyway"
            >
              {dependentsWarning && dependentsWarning.chart_count > 0 ? "Delete anyway" : "Confirm delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Guided Metric Builder Modal */}
      {selectedModel && (
        <GuidedMetricBuilder
          open={isGuidedMetricOpen}
          onOpenChange={setIsGuidedMetricOpen}
          model={selectedModel}
          metricToEdit={editingMetric}
          onSaveSuccess={() => {
            loadModels(activeConnId);
            setIsGuidedMetricOpen(false);
          }}
        />
      )}

      {/* Custom Dimension Builder Modal */}
      {selectedModel && (
        <DimensionBuilderModal
          open={isDimensionModalOpen}
          onOpenChange={setIsDimensionModalOpen}
          model={selectedModel}
          dimensionToEdit={editingDimension}
          onSaveSuccess={() => {
            loadModels(activeConnId);
            setIsDimensionModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
