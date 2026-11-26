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
import { api, DashboardChartPublic, ModelPublic } from "@/lib/api";
import { AlertCircle } from "lucide-react";

export interface AddChartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  model: ModelPublic | null;
  onChartAdded: (chart: DashboardChartPublic) => void;
}

export function AddChartModal({
  open,
  onOpenChange,
  dashboardId,
  model,
  onChartAdded,
}: AddChartModalProps) {
  const [selectedMetric, setSelectedMetric] = React.useState<string>("");
  const [selectedDimension, setSelectedDimension] = React.useState<string>("");
  const [chartType, setChartType] = React.useState<"line" | "bar" | "area" | "stacked_bar">("bar");
  const [dateRange, setDateRange] = React.useState<string>("last_30_days");
  const [customTitle, setCustomTitle] = React.useState<string>("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      if (model && model.metrics.length > 0) {
        setSelectedMetric(model.metrics[0].name);
      }
      setSelectedDimension("");
      setChartType("bar");
      setDateRange("last_30_days");
      setCustomTitle("");
      setError(null);
    }
  }, [open, model]);

  // Adjust default chart type if no breakdown selected (line for time series)
  const handleDimensionChange = (dim: string) => {
    setSelectedDimension(dim);
    if (!dim) {
      setChartType("line");
    } else {
      setChartType("bar");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMetric) {
      setError("Please select a metric for the chart.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const created = await api.addDashboardChart(dashboardId, {
        metric: selectedMetric,
        breakdown_dimension: selectedDimension || undefined,
        chart_type: chartType,
        date_range: dateRange,
        title: customTitle.trim() || undefined,
      });

      onChartAdded(created);
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add chart");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="add-chart-modal">
        <DialogHeader>
          <DialogTitle>Add chart to dashboard</DialogTitle>
          <DialogDescription>
            Configure an analytical chart with any standard or custom metrics and dimensions.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 text-[12px] rounded-[4px] border border-[var(--trend-down)] bg-[var(--trend-down-subtle)] text-[var(--trend-down)] flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          {/* Metric Selector */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
              Metric
            </label>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="w-full px-3 py-1.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)] text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--accent)] cursor-pointer"
              data-testid="select-chart-metric"
            >
              {model?.metrics.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name.replace(/_/g, " ")} ({m.metric_type})
                </option>
              ))}
            </select>
          </div>

          {/* Dimension Breakdown */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
              Breakdown dimension (or Time Series)
            </label>
            <select
              value={selectedDimension}
              onChange={(e) => handleDimensionChange(e.target.value)}
              className="w-full px-3 py-1.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)] text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--accent)] cursor-pointer"
              data-testid="select-chart-dimension"
            >
              <option value="">Time Series (No breakdown)</option>
              {model?.dimensions
                .filter((d) => !d.is_identifier)
                .map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.label || d.name} {d.is_custom ? "(custom)" : ""}
                  </option>
                ))}
            </select>
          </div>

          {/* Chart Type & Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                Chart type
              </label>
              <select
                value={chartType}
                onChange={(e) =>
                  setChartType(e.target.value as "line" | "bar" | "area" | "stacked_bar")
                }
                className="w-full px-3 py-1.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)] text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--accent)] cursor-pointer"
                data-testid="select-chart-type"
              >
                <option value="bar">Bar chart</option>
                <option value="line">Line chart</option>
                <option value="area">Area chart</option>
                <option value="stacked_bar">Stacked Bar</option>
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
                Date range
              </label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="w-full px-3 py-1.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)] text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--accent)] cursor-pointer"
                data-testid="select-chart-date-range"
              >
                <option value="last_7_days">Last 7 days</option>
                <option value="last_30_days">Last 30 days</option>
                <option value="last_90_days">Last 90 days</option>
                <option value="last_12_months">Last 12 months</option>
              </select>
            </div>
          </div>

          {/* Optional Title */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
              Custom title (optional)
            </label>
            <Input
              placeholder="e.g. Revenue by Customer Tier"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="h-8 text-[13px]"
              data-testid="input-chart-title"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
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
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              disabled={isSubmitting || !selectedMetric}
              className="cursor-pointer"
              data-testid="btn-submit-add-chart"
            >
              Add to dashboard
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
