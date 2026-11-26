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
import {
  api,
  MetricPublic,
  ModelDependentsResponse,
  ModelPublic,
} from "@/lib/api";
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  History,
  Sliders,
  TrendingUp,
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

export type AggregationFunction =
  | "SUM"
  | "AVG"
  | "COUNT"
  | "COUNT_DISTINCT"
  | "MIN"
  | "MAX";

export interface GuidedMetricBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ModelPublic;
  metricToEdit?: MetricPublic | null;
  onSaveSuccess: (metric: MetricPublic) => void;
  onViewVersions?: (metric: MetricPublic) => void;
}

export function GuidedMetricBuilder({
  open,
  onOpenChange,
  model,
  metricToEdit,
  onSaveSuccess,
  onViewVersions,
}: GuidedMetricBuilderProps) {
  const isEditing = Boolean(metricToEdit);

  // High-level mode: "guided" vs "advanced" (SQL)
  const [isAdvanced, setIsAdvanced] = React.useState(false);

  // Guided builder settings
  const [builderMode, setBuilderMode] = React.useState<"aggregation" | "ratio">("aggregation");
  const [aggFunc, setAggFunc] = React.useState<AggregationFunction>("SUM");
  const [columnName, setColumnName] = React.useState<string>("");
  const [ratioNumeratorMeasure, setRatioNumeratorMeasure] = React.useState<string>("");
  const [ratioDenominatorMeasure, setRatioDenominatorMeasure] = React.useState<string>("");

  // Base fields
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [numeratorExpr, setNumeratorExpr] = React.useState("");
  const [denominatorExpr, setDenominatorExpr] = React.useState("");
  const [fixedFilter, setFixedFilter] = React.useState("");
  const [displayFormat, setDisplayFormat] = React.useState<
    "currency" | "percent" | "integer" | "decimal"
  >("currency");
  const [higherIsBetter, setHigherIsBetter] = React.useState(true);

  // Dependents awareness
  const [dependents, setDependents] = React.useState<ModelDependentsResponse | null>(null);

  // Validation & preview
  const [isValidating, setIsValidating] = React.useState(false);
  const [validationResult, setValidationResult] = React.useState<{
    valid: boolean;
    message: string;
  } | null>(null);
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [previewSeries, setPreviewSeries] = React.useState<{ period: string; value: number }[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Discover candidate columns from model dimensions
  const candidateColumns = React.useMemo(() => {
    return model.dimensions
      .filter((d) => !d.is_identifier)
      .map((d) => d.column_expression);
  }, [model]);

  // Load dependents if editing
  React.useEffect(() => {
    if (open && metricToEdit) {
      api
        .getModelDependents(model.id, { metric_name: metricToEdit.name })
        .then(setDependents)
        .catch(() => {});
    } else {
      setDependents(null);
    }
  }, [open, metricToEdit, model.id]);

  // Initialize form state
  React.useEffect(() => {
    if (open) {
      if (metricToEdit) {
        setName(metricToEdit.name);
        setDescription(metricToEdit.description || "");
        setNumeratorExpr(metricToEdit.numerator_expr);
        setDenominatorExpr(metricToEdit.denominator_expr || "");
        setFixedFilter(metricToEdit.fixed_filter || "");
        setDisplayFormat(metricToEdit.display_format);
        setHigherIsBetter(metricToEdit.higher_is_better);

        const guided = metricToEdit.guided_config as
          | {
              agg_func?: AggregationFunction;
              source_column?: string;
              mode?: "aggregation" | "ratio";
              numerator_measure?: string;
              denominator_measure?: string;
            }
          | undefined;

        if (guided?.mode === "ratio" || metricToEdit.metric_type === "ratio") {
          setBuilderMode("ratio");
          setRatioNumeratorMeasure(guided?.numerator_measure || metricToEdit.numerator_expr);
          setRatioDenominatorMeasure(guided?.denominator_measure || metricToEdit.denominator_expr || "");
          setIsAdvanced(false);
        } else if (guided?.agg_func && guided?.source_column) {
          setBuilderMode("aggregation");
          setAggFunc(guided.agg_func);
          setColumnName(guided.source_column);
          setIsAdvanced(false);
        } else {
          setIsAdvanced(true);
        }
      } else {
        setName("");
        setDescription("");
        setBuilderMode("aggregation");
        setAggFunc("SUM");
        setColumnName(candidateColumns[0] || "sale_price");
        setRatioNumeratorMeasure("SUM(sale_price)");
        setRatioDenominatorMeasure("COUNT(DISTINCT order_id)");
        setNumeratorExpr("SUM(sale_price)");
        setDenominatorExpr("");
        setFixedFilter("");
        setDisplayFormat("currency");
        setHigherIsBetter(true);
        setIsAdvanced(false);
      }
      setValidationResult(null);
      setPreviewSeries([]);
      setError(null);
    }
  }, [open, metricToEdit, candidateColumns]);

  // Sync guided inputs to SQL expressions when in guided mode
  React.useEffect(() => {
    if (!isAdvanced) {
      if (builderMode === "aggregation") {
        const col = columnName || "sale_price";
        let expr = "";
        switch (aggFunc) {
          case "SUM":
            expr = `SUM(${col})`;
            break;
          case "AVG":
            expr = `AVG(${col})`;
            break;
          case "COUNT":
            expr = `COUNT(${col})`;
            break;
          case "COUNT_DISTINCT":
            expr = `COUNT(DISTINCT ${col})`;
            break;
          case "MIN":
            expr = `MIN(${col})`;
            break;
          case "MAX":
            expr = `MAX(${col})`;
            break;
        }
        setNumeratorExpr(expr);
        setDenominatorExpr("");
      } else {
        setNumeratorExpr(ratioNumeratorMeasure || "SUM(sale_price)");
        setDenominatorExpr(ratioDenominatorMeasure || "COUNT(DISTINCT order_id)");
      }
    }
  }, [isAdvanced, builderMode, aggFunc, columnName, ratioNumeratorMeasure, ratioDenominatorMeasure]);

  const handleValidateFormula = async () => {
    if (!numeratorExpr.trim()) {
      setValidationResult({ valid: false, message: "Numerator expression cannot be empty." });
      return;
    }
    setIsValidating(true);
    setValidationResult(null);
    try {
      const res = await api.validateMetricFormula({
        numerator_expr: numeratorExpr.trim(),
        denominator_expr:
          builderMode === "ratio" || isAdvanced ? denominatorExpr.trim() || undefined : undefined,
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

  const handlePreviewTrend = async () => {
    if (!numeratorExpr.trim()) return;
    setIsPreviewing(true);
    setPreviewSeries([]);
    try {
      const res = await api.previewMetricTrend({
        model_id: model.id,
        numerator_expr: numeratorExpr.trim(),
        denominator_expr:
          builderMode === "ratio" || isAdvanced ? denominatorExpr.trim() || undefined : undefined,
        fixed_filter: fixedFilter.trim() || undefined,
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

  const handleSave = async () => {
    if (!name.trim() || !numeratorExpr.trim()) {
      setError("Please specify metric identifier and formula.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const guidedConfig = !isAdvanced
      ? {
          mode: builderMode,
          agg_func: builderMode === "aggregation" ? aggFunc : undefined,
          source_column: builderMode === "aggregation" ? columnName : undefined,
          numerator_measure: builderMode === "ratio" ? ratioNumeratorMeasure : undefined,
          denominator_measure: builderMode === "ratio" ? ratioDenominatorMeasure : undefined,
        }
      : null;

    const metricType: "additive" | "ratio" =
      builderMode === "ratio" || Boolean(denominatorExpr.trim()) ? "ratio" : "additive";

    try {
      let savedMetric: MetricPublic;
      if (metricToEdit) {
        savedMetric = await api.updateMetric(metricToEdit.id, {
          name: name.trim().toLowerCase().replace(/\s+/g, "_"),
          description: description.trim() || undefined,
          numerator_expr: numeratorExpr.trim(),
          denominator_expr: metricType === "ratio" ? denominatorExpr.trim() : undefined,
          fixed_filter: fixedFilter.trim() || undefined,
          display_format: displayFormat,
          higher_is_better: higherIsBetter,
          guided_config: guidedConfig,
        });
      } else {
        savedMetric = await api.createMetric(model.id, {
          name: name.trim().toLowerCase().replace(/\s+/g, "_"),
          description: description.trim() || undefined,
          metric_type: metricType,
          numerator_expr: numeratorExpr.trim(),
          denominator_expr: metricType === "ratio" ? denominatorExpr.trim() : undefined,
          fixed_filter: fixedFilter.trim() || undefined,
          display_format: displayFormat,
          higher_is_better: higherIsBetter,
          guided_config: guidedConfig,
        });
      }

      onSaveSuccess(savedMetric);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save metric");
    } finally {
      setIsSaving(false);
    }
  };

  // Preview chart data
  const chartData = {
    labels: previewSeries.map((p) => p.period.slice(5)),
    datasets: [
      {
        label: name || "Preview",
        data: previewSeries.map((p) => p.value),
        borderColor: "#111827",
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="guided-metric-builder-modal">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>{isEditing ? "Edit metric" : "Guided metric builder"}</DialogTitle>
            <div className="flex items-center gap-1.5 bg-[var(--bg-subtle)] p-0.5 rounded-[4px] border border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => setIsAdvanced(false)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-subtle cursor-pointer ${
                  !isAdvanced
                    ? "bg-[var(--bg-surface)] text-[var(--text-main)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
                data-testid="toggle-guided-mode"
              >
                <Sliders className="h-3 w-3 inline-block mr-1" />
                Guided
              </button>
              <button
                type="button"
                onClick={() => setIsAdvanced(true)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded transition-subtle cursor-pointer ${
                  isAdvanced
                    ? "bg-[var(--bg-surface)] text-[var(--text-main)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
                data-testid="toggle-advanced-mode"
              >
                <Code2 className="h-3 w-3 inline-block mr-1" />
                Advanced SQL
              </button>
            </div>
          </div>
          <DialogDescription>
            {isAdvanced
              ? "Directly author or refine raw SQL metric formulas with sqlglot AST verification."
              : "Construct metrics visually using standard aggregations or measure ratios without writing SQL."}
          </DialogDescription>
        </DialogHeader>

        {dependents && dependents.chart_count > 0 && (
          <div
            className="p-3 text-[12px] rounded-[4px] border border-amber-300 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300 flex items-start gap-2"
            role="alert"
            data-testid="metric-dependents-warning"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">Used by {dependents.chart_count} charts:</span>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px]">
                {dependents.charts.map((c) => (
                  <li key={c.id}>
                    {c.title} ({c.dashboard_name || "Dashboard"})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 text-[12px] rounded-[4px] border border-[var(--trend-down)] bg-[var(--trend-down-subtle)] text-[var(--trend-down)] flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col gap-4 py-2">
          {/* Identity & Format */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                Metric identifier
              </label>
              <Input
                placeholder="e.g. total_revenue, aov"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-[13px] font-mono"
                data-testid="metric-name-input"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                Display format
              </label>
              <select
                value={displayFormat}
                onChange={(e) =>
                  setDisplayFormat(
                    e.target.value as "currency" | "percent" | "integer" | "decimal"
                  )
                }
                className="w-full h-8 px-2 text-[13px] rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
                data-testid="metric-format-select"
              >
                <option value="currency">Currency ($)</option>
                <option value="percent">Percentage (%)</option>
                <option value="integer">Integer count</option>
                <option value="decimal">Decimal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
              Description (optional)
            </label>
            <Input
              placeholder="e.g. Gross sale price before discounts"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-8 text-[13px]"
              data-testid="metric-description-input"
            />
          </div>

          {/* Guided Mode Form */}
          {!isAdvanced ? (
            <div className="p-3.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)] flex flex-col gap-3">
              <div className="flex items-center gap-4 text-[12px] font-medium text-[var(--text-main)]">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="builderMode"
                    checked={builderMode === "aggregation"}
                    onChange={() => setBuilderMode("aggregation")}
                    className="cursor-pointer"
                    data-testid="radio-aggregation-mode"
                  />
                  <span>Standard aggregation</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="builderMode"
                    checked={builderMode === "ratio"}
                    onChange={() => setBuilderMode("ratio")}
                    className="cursor-pointer"
                    data-testid="radio-ratio-mode"
                  />
                  <span>Ratio of two measures</span>
                </label>
              </div>

              {builderMode === "aggregation" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                      Aggregation function
                    </label>
                    <select
                      value={aggFunc}
                      onChange={(e) => setAggFunc(e.target.value as AggregationFunction)}
                      className="w-full h-8 px-2 text-[13px] rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-main)] focus:outline-none"
                      data-testid="select-agg-func"
                    >
                      <option value="SUM">SUM</option>
                      <option value="AVG">AVG</option>
                      <option value="COUNT">COUNT</option>
                      <option value="COUNT_DISTINCT">COUNT DISTINCT</option>
                      <option value="MIN">MIN</option>
                      <option value="MAX">MAX</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                      Target column
                    </label>
                    <select
                      value={columnName}
                      onChange={(e) => setColumnName(e.target.value)}
                      className="w-full h-8 px-2 text-[13px] rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-main)] font-mono focus:outline-none"
                      data-testid="select-target-column"
                    >
                      {candidateColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                      {!candidateColumns.includes(columnName) && columnName && (
                        <option value={columnName}>{columnName}</option>
                      )}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                      Numerator measure
                    </label>
                    <Input
                      placeholder="e.g. SUM(sale_price)"
                      value={ratioNumeratorMeasure}
                      onChange={(e) => setRatioNumeratorMeasure(e.target.value)}
                      className="h-8 text-[12px] font-mono"
                      data-testid="input-ratio-numerator"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                      Denominator measure
                    </label>
                    <Input
                      placeholder="e.g. COUNT(DISTINCT order_id)"
                      value={ratioDenominatorMeasure}
                      onChange={(e) => setRatioDenominatorMeasure(e.target.value)}
                      className="h-8 text-[12px] font-mono"
                      data-testid="input-ratio-denominator"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                  Optional filter condition (WHERE)
                </label>
                <Input
                  placeholder="e.g. status = 'Complete'"
                  value={fixedFilter}
                  onChange={(e) => setFixedFilter(e.target.value)}
                  className="h-8 text-[12px] font-mono"
                  data-testid="input-fixed-filter"
                />
              </div>

              <div className="text-[11px] font-mono text-[var(--text-muted)] pt-1 flex items-center gap-1.5">
                <span className="font-semibold text-[var(--text-main)]">Generated SQL:</span>
                <code>
                  {builderMode === "ratio"
                    ? `(${numeratorExpr}) / NULLIF(${denominatorExpr}, 0)`
                    : numeratorExpr}
                  {fixedFilter ? ` WHERE ${fixedFilter}` : ""}
                </code>
              </div>
            </div>
          ) : (
            /* Advanced Raw SQL Mode */
            <div className="p-3.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)] flex flex-col gap-3">
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                  Numerator SQL expression
                </label>
                <Input
                  placeholder="e.g. SUM(sale_price)"
                  value={numeratorExpr}
                  onChange={(e) => setNumeratorExpr(e.target.value)}
                  className="h-8 text-[12px] font-mono"
                  data-testid="metric-numerator-input"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                  Denominator SQL expression (optional for ratios)
                </label>
                <Input
                  placeholder="e.g. COUNT(DISTINCT order_id)"
                  value={denominatorExpr}
                  onChange={(e) => setDenominatorExpr(e.target.value)}
                  className="h-8 text-[12px] font-mono"
                  data-testid="input-advanced-denominator"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                  Fixed filter expression (WHERE)
                </label>
                <Input
                  placeholder="e.g. status = 'Complete'"
                  value={fixedFilter}
                  onChange={(e) => setFixedFilter(e.target.value)}
                  className="h-8 text-[12px] font-mono"
                  data-testid="input-advanced-filter"
                />
              </div>
            </div>
          )}

          {/* Validation & Preview Controls */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleValidateFormula}
              isLoading={isValidating}
              className="cursor-pointer"
              data-testid="validate-formula-button"
            >
              Check formula syntax
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePreviewTrend}
              isLoading={isPreviewing}
              className="cursor-pointer"
              data-testid="btn-preview-trend"
            >
              <TrendingUp className="h-3.5 w-3.5 mr-1 text-[var(--text-muted)]" />
              Preview 30-day trend
            </Button>
            {metricToEdit && onViewVersions && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onViewVersions(metricToEdit)}
                className="text-[var(--text-muted)] hover:text-[var(--text-main)] ml-auto cursor-pointer"
                data-testid="btn-view-versions"
              >
                <History className="h-3.5 w-3.5 mr-1" />
                Version history (v{metricToEdit.version})
              </Button>
            )}
          </div>

          {validationResult && (
            <div
              className={`p-2.5 rounded-[4px] text-[12px] flex items-center gap-2 ${
                validationResult.valid
                  ? "bg-[var(--trend-up-subtle)] text-[var(--trend-up)] border border-[var(--trend-up)]/40"
                  : "bg-[var(--trend-down-subtle)] text-[var(--trend-down)] border border-[var(--trend-down)]/40"
              }`}
              data-testid="validation-feedback"
            >
              {validationResult.valid ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--trend-up)]" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-[var(--trend-down)]" />
              )}
              <span>{validationResult.message}</span>
            </div>
          )}

          {/* Preview Chart */}
          {previewSeries.length > 0 && (
            <div className="p-3 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] flex flex-col gap-2">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                30-day historical trend preview
              </span>
              <div className="h-40 w-full" data-testid="metric-preview-chart">
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={isSaving}
            disabled={isSaving || !name.trim()}
            className="cursor-pointer"
            data-testid="btn-save-metric"
          >
            {isEditing ? "Save changes" : "Create metric"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
