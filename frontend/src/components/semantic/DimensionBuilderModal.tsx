"use client";

import * as React from "react";
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
  DimensionPreviewResponse,
  DimensionPublic,
  ModelDependentsResponse,
  ModelPublic,
} from "@/lib/api";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
} from "lucide-react";

export interface DimensionBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ModelPublic;
  dimensionToEdit?: DimensionPublic | null;
  onSaveSuccess: (dim: DimensionPublic) => void;
}

export function DimensionBuilderModal({
  open,
  onOpenChange,
  model,
  dimensionToEdit,
  onSaveSuccess,
}: DimensionBuilderModalProps) {
  const isEditing = Boolean(dimensionToEdit);

  const [name, setName] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [dimensionType, setDimensionType] = React.useState<
    "categorical" | "time" | "numeric_bucket"
  >("categorical");
  const [expression, setExpression] = React.useState("");
  const [excludeFromExplanation, setExcludeFromExplanation] = React.useState(false);

  // Dependents awareness
  const [dependents, setDependents] = React.useState<ModelDependentsResponse | null>(null);

  // Preview & dry-run state
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [previewResult, setPreviewResult] = React.useState<DimensionPreviewResponse | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load dependents if editing
  React.useEffect(() => {
    if (open && dimensionToEdit) {
      api
        .getModelDependents(model.id, { dimension_name: dimensionToEdit.name })
        .then(setDependents)
        .catch(() => {});
    } else {
      setDependents(null);
    }
  }, [open, dimensionToEdit, model.id]);

  React.useEffect(() => {
    if (open) {
      if (dimensionToEdit) {
        setName(dimensionToEdit.name);
        setLabel(dimensionToEdit.label || dimensionToEdit.name);
        setDimensionType(dimensionToEdit.dimension_type);
        setExpression(dimensionToEdit.expression || dimensionToEdit.column_expression);
        setExcludeFromExplanation(dimensionToEdit.exclude_from_explanation);
      } else {
        setName("");
        setLabel("");
        setDimensionType("categorical");
        setExpression("CASE WHEN sale_price >= 100 THEN 'High Value' ELSE 'Regular' END");
        setExcludeFromExplanation(false);
      }
      setPreviewResult(null);
      setError(null);
    }
  }, [open, dimensionToEdit]);

  const handleApplyPreset = (snippet: string, type: "categorical" | "time" | "numeric_bucket") => {
    setExpression(snippet);
    setDimensionType(type);
  };

  const handleRunPreview = async () => {
    if (!expression.trim()) {
      setError("Please specify an expression to preview.");
      return;
    }

    setIsPreviewing(true);
    setError(null);
    setPreviewResult(null);

    try {
      const res = await api.previewDimension({
        connection_id: model.connection_id,
        model_id: model.id,
        expression: expression.trim(),
        dimension_type: dimensionType,
      });
      setPreviewResult(res);
      if (!res.valid && res.error) {
        setError(res.error);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to preview expression");
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !expression.trim()) {
      setError("Please specify dimension identifier and expression.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let savedDim: DimensionPublic;
      if (dimensionToEdit) {
        savedDim = await api.updateDimension(dimensionToEdit.id, {
          name: name.trim().toLowerCase().replace(/\s+/g, "_"),
          label: label.trim() || name.trim(),
          column_expression: expression.trim(),
          dimension_type: dimensionType,
          is_custom: true,
          expression: expression.trim(),
          exclude_from_explanation: excludeFromExplanation,
        });
      } else {
        savedDim = await api.createDimension(model.id, {
          name: name.trim().toLowerCase().replace(/\s+/g, "_"),
          label: label.trim() || name.trim(),
          column_expression: expression.trim(),
          dimension_type: dimensionType,
          is_custom: true,
          expression: expression.trim(),
          exclude_from_explanation: excludeFromExplanation,
        });
      }

      onSaveSuccess(savedDim);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save dimension");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dimension-builder-modal">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit custom dimension" : "Custom dimension builder"}</DialogTitle>
          <DialogDescription>
            Derive dimensions using CASE expressions, date extractions, or safe string transformations.
            Dry-run verifies warehouse safety and previews top 20 distinct values with frequency counts.
          </DialogDescription>
        </DialogHeader>

        {dependents && dependents.chart_count > 0 && (
          <div
            className="p-3 text-[12px] rounded-[4px] border border-amber-300 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300 flex items-start gap-2"
            role="alert"
            data-testid="dimension-dependents-warning"
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
          {/* Identity & Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                Identifier name
              </label>
              <Input
                placeholder="e.g. price_tier, order_month"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-[13px] font-mono"
                data-testid="dimension-name-input"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                Display label
              </label>
              <Input
                placeholder="e.g. Price Tier"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-8 text-[13px]"
                data-testid="dimension-label-input"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                Dimension type
              </label>
              <select
                value={dimensionType}
                onChange={(e) =>
                  setDimensionType(
                    e.target.value as "categorical" | "time" | "numeric_bucket"
                  )
                }
                className="w-full h-8 px-2 text-[13px] rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)]"
                data-testid="dimension-type-select"
              >
                <option value="categorical">Categorical</option>
                <option value="numeric_bucket">Numeric Bucket</option>
                <option value="time">Time grain / Date</option>
              </select>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span className="font-medium mr-1">Presets:</span>
            <button
              type="button"
              onClick={() =>
                handleApplyPreset(
                  "CASE WHEN sale_price >= 100 THEN 'High Value' ELSE 'Regular' END",
                  "categorical"
                )
              }
              className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-hairline)] hover:bg-[var(--bg-surface-hover)] transition-subtle cursor-pointer"
              data-testid="preset-btn-case"
            >
              CASE Tiering
            </button>
            <button
              type="button"
              onClick={() =>
                handleApplyPreset("DATE_TRUNC('month', order_timestamp)", "time")
              }
              className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-hairline)] hover:bg-[var(--bg-surface-hover)] transition-subtle cursor-pointer"
              data-testid="preset-btn-date_part"
            >
              DATE_TRUNC Month
            </button>
            <button
              type="button"
              onClick={() =>
                handleApplyPreset("UPPER(TRIM(customer_state))", "categorical")
              }
              className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-hairline)] hover:bg-[var(--bg-surface-hover)] transition-subtle cursor-pointer"
              data-testid="preset-btn-string_clean"
            >
              UPPER / TRIM
            </button>
          </div>

          {/* SQL Expression */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[12px] font-medium text-[var(--text-main)]">
                SQL Expression
              </label>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                SELECT expression allowed functions only
              </span>
            </div>
            <textarea
              rows={3}
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder="e.g. CASE WHEN delivery_days <= 3 THEN 'Fast' ELSE 'Standard' END"
              className="w-full p-2.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)] text-[12px] font-mono text-[var(--text-main)] outline-none focus:border-[var(--accent)] resize-y"
              data-testid="dimension-expression-input"
            />
          </div>

          {/* Exclude from automated explanation toggle */}
          <div className="p-3 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)] flex items-center justify-between">
            <div>
              <span className="text-[12px] font-medium text-[var(--text-main)] block">
                Exclude from automated explanation
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                Disable this dimension from 10-step driver search when high cardinality or unsegmented.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={excludeFromExplanation}
                onChange={(e) => setExcludeFromExplanation(e.target.checked)}
                className="sr-only peer"
                data-testid="checkbox-exclude-explanation"
              />
              <div className="w-9 h-5 bg-[var(--border-hairline)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent)]"></div>
            </label>
          </div>

          {/* Dry Run & Live Preview Button */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRunPreview}
              isLoading={isPreviewing}
              className="cursor-pointer"
              data-testid="btn-preview-dimension"
            >
              <Eye className="h-3.5 w-3.5 mr-1 text-[var(--text-muted)]" />
              Dry-run check & preview values
            </Button>
            {previewResult?.valid && (
              <span
                className="text-[11px] font-mono text-[var(--trend-up)] flex items-center gap-1"
                data-testid="preview-estimated-bytes"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Dry-run valid · Estimated: {previewResult.formatted_bytes}
              </span>
            )}
          </div>

          {/* Top 20 Distinct Values Preview Table */}
          {previewResult?.valid && previewResult.values && (
            <div className="rounded-[4px] border border-[var(--border-hairline)] overflow-hidden bg-[var(--bg-surface)]" data-testid="dim-preview-result">
              <div className="px-3 py-2 bg-[var(--bg-app)] border-b border-[var(--border-hairline)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                <span className="font-medium text-[var(--text-main)]">
                  Top 20 distinct values ({previewResult.total_distinct_values} found)
                </span>
                <span>Dry-run verified</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-app)]/50 text-[11px] text-[var(--text-muted)]">
                      <th className="py-1.5 px-3 font-medium">Evaluated value</th>
                      <th className="py-1.5 px-3 font-medium text-right">Row count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)] font-mono">
                    {previewResult.values.map((v, i) => (
                      <tr key={i} className="hover:bg-[var(--bg-surface-hover)]">
                        <td className="py-1.5 px-3 text-[var(--text-main)]">
                          {String(v.value)}
                        </td>
                        <td className="py-1.5 px-3 text-right text-[var(--text-muted)]">
                          {v.row_count.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            data-testid="btn-save-dimension"
          >
            {isEditing ? "Save changes" : "Create dimension"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
