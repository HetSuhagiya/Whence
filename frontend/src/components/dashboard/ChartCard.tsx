"use client";

import * as React from "react";
import { Bar, Line } from "react-chartjs-2";
import type { ChartOptions, TooltipItem, ChartEvent, ActiveElement } from "chart.js";
import {
  Code2,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Sparkles,
  Table as TableIcon,
} from "lucide-react";
import { ChartRunResult, DashboardChartPublic } from "@/lib/api";
import { CHART_COLORS, formatMetricValue } from "./chartConfig";
import { Skeleton } from "@/components/ui/skeleton";

export function toSentenceCase(str: string): string {
  if (!str) return "";
  const cleaned = str.replace(/[_-]+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function mapChartError(rawError: string): { message: string; fix: string } {
  const lower = rawError.toLowerCase();
  if (lower.includes("byte") || lower.includes("cap") || lower.includes("bytes scanned") || lower.includes("exceeded")) {
    return {
      message: "Query exceeded maximum scanned bytes limit.",
      fix: "Narrow the date range, select a partition filter, or reduce the number of queried dimensions.",
    };
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("deadline")) {
    return {
      message: "Query execution timed out.",
      fix: "Try filtering to a smaller date window or refreshing again in a few moments.",
    };
  }
  if (lower.includes("column") || lower.includes("not found") || lower.includes("does not exist") || lower.includes("no such column")) {
    return {
      message: "Required column or field was not found in the table schema.",
      fix: "Check your semantic model dimensions and metrics on the Data page to verify column expressions.",
    };
  }
  if (lower.includes("syntax") || lower.includes("parse error") || lower.includes("syntax error")) {
    return {
      message: "SQL syntax error occurred during warehouse compilation.",
      fix: "Inspect the compiled SQL below or adjust metric expressions to match warehouse dialect.",
    };
  }
  return {
    message: "Failed to load chart data from warehouse.",
    fix: "Review the technical details below or verify warehouse connectivity.",
  };
}

interface ChartCardProps {
  chart: DashboardChartPublic;
  runResult: ChartRunResult | null;
  loading: boolean;
  error?: string | null;
  showHint?: boolean;
  onExplain: (chart: DashboardChartPublic, point?: string) => void;
}

export function ChartCard({
  chart,
  runResult,
  loading,
  error,
  showHint,
  onExplain,
}: ChartCardProps) {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [showSqlModal, setShowSqlModal] = React.useState(false);
  const [showDataTable, setShowDataTable] = React.useState(false);
  const [copiedSql, setCopiedSql] = React.useState(false);
  const [selectedPointIndex, setSelectedPointIndex] = React.useState<number | null>(null);

  const metricFormat =
    chart.chart_spec.metric === "revenue" || chart.chart_spec.metric === "aov"
      ? "currency"
      : chart.chart_spec.metric === "items_per_order"
      ? "decimal"
      : "integer";

  // Handle SQL copy
  const handleCopySql = () => {
    if (runResult?.compiled_sql) {
      navigator.clipboard.writeText(runResult.compiled_sql);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    }
  };

  // Build Chart.js data
  const chartData = React.useMemo(() => {
    if (!runResult || !runResult.rows || runResult.rows.length === 0) {
      return { labels: [], datasets: [] };
    }

    const rows = runResult.rows;
    const isLine = chart.chart_type === "line" || chart.chart_type === "area";
    const isStacked = chart.chart_type === "stacked_bar";

    if (isStacked && chart.chart_spec.dimensions && chart.chart_spec.dimensions.length > 0) {
      const dimKey = chart.chart_spec.dimensions[0];
      const labels = rows.map((r) => String(r[dimKey] || "Other"));
      const dataValues = rows.map((r) => Number(r["metric_value"] || r[chart.chart_spec.metric] || 0));

      return {
        labels,
        datasets: [
          {
            label: chart.chart_spec.metric,
            data: dataValues,
            backgroundColor: CHART_COLORS.series.slice(0, labels.length),
            borderWidth: 0,
            borderRadius: 2,
          },
        ],
      };
    }

    if (chart.chart_spec.dimensions && chart.chart_spec.dimensions.length > 0) {
      const dimKey = chart.chart_spec.dimensions[0];
      const labels = rows.map((r) => String(r[dimKey] || "Other"));
      const dataValues = rows.map((r) => Number(r["metric_value"] || r[chart.chart_spec.metric] || 0));

      return {
        labels,
        datasets: [
          {
            label: chart.chart_spec.metric,
            data: dataValues,
            backgroundColor: CHART_COLORS.primary,
            borderWidth: 0,
            borderRadius: 2,
          },
        ],
      };
    }

    // Default time-series line
    const labels = rows.map((r) => String(r["period"] || ""));
    const dataValues = rows.map((r) => Number(r["metric_value"] || r[chart.chart_spec.metric] || 0));

    return {
      labels,
      datasets: [
        {
          label: chart.chart_spec.metric,
          data: dataValues,
          borderColor: CHART_COLORS.primary,
          backgroundColor: "rgba(78, 121, 167, 0.08)",
          fill: isLine,
          tension: 0.2,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: CHART_COLORS.primary,
        },
      ],
    };
  }, [runResult, chart]);

  // Chart.js options
  const chartOptions: ChartOptions<"line" | "bar"> = React.useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1c2024",
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          padding: 8,
          cornerRadius: 4,
          callbacks: {
            label: (ctx: TooltipItem<"line" | "bar">) => {
              const val = ctx.parsed.y !== null ? ctx.parsed.y : ctx.parsed;
              return ` ${chart.chart_spec.metric}: ${formatMetricValue(Number(val), metricFormat)}`;
            },
            afterBody: () => ["", "Click point to explain"],
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: CHART_COLORS.textMuted,
            font: { size: 11, family: "Instrument Sans, sans-serif" },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 7,
          },
          border: { color: "var(--border-hairline)" },
        },
        y: {
          grid: {
            color: "rgba(205, 206, 214, 0.2)",
            drawBorder: false,
          },
          beginAtZero: true,
          ticks: {
            color: CHART_COLORS.textMuted,
            font: { size: 11, family: "Instrument Sans, sans-serif" },
            callback: (val: string | number) => formatMetricValue(Number(val), metricFormat),
          },
        },
      },
      onClick: (_event: ChartEvent, elements: ActiveElement[]) => {
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          setSelectedPointIndex(idx);
          const label = chartData.labels[idx];
          onExplain(chart, String(label));
        }
      },
    };
  }, [chart, chartData, metricFormat, onExplain]);

  // Keyboard navigation on chart
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!chartData.labels || chartData.labels.length === 0) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setSelectedPointIndex((prev) =>
        prev === null || prev >= chartData.labels.length - 1 ? 0 : prev + 1
      );
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSelectedPointIndex((prev) =>
        prev === null || prev <= 0 ? chartData.labels.length - 1 : prev - 1
      );
    } else if (e.key === "Enter" && selectedPointIndex !== null) {
      e.preventDefault();
      const label = chartData.labels[selectedPointIndex];
      onExplain(chart, String(label));
    }
  };

  return (
    <div
      className={`group relative flex flex-col p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] transition-all ${
        isFullscreen ? "col-span-full z-20 shadow-lg min-h-[480px]" : "min-h-[300px]"
      }`}
      data-testid={`chart-card-${chart.chart_spec.metric}`}
    >
      {/* Card Header & Hover Toolbar */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="font-heading text-[15px] font-medium text-[var(--text-main)]">
            {toSentenceCase(chart.title)}
          </h3>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            {toSentenceCase(chart.chart_spec.metric)}
            {chart.chart_spec.dimensions?.length ? ` by ${chart.chart_spec.dimensions.map(toSentenceCase).join(", ")}` : " over time"}
            {runResult?.date_range ? ` • ${String(runResult.date_range).replace("_", " ")}` : ""}
          </p>
        </div>

        {/* Action Toolbar on hover & focus */}
        <div
          className="flex items-center gap-1 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity"
          role="toolbar"
          aria-label="Chart actions"
        >
          {/* Explain Toolbar Button */}
          <button
            type="button"
            onClick={() => onExplain(chart)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px] text-[11px] font-medium bg-[var(--accent-subtle)] text-[var(--accent-text)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/20 transition-subtle cursor-pointer"
            title="Explain latest period"
            data-testid={`btn-explain-${chart.chart_spec.metric}`}
          >
            <Sparkles className="h-3 w-3" />
            <span>Explain</span>
          </button>

          {/* SQL Inspector Button */}
          <button
            type="button"
            onClick={() => setShowSqlModal(true)}
            className="p-1 rounded-[4px] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-subtle cursor-pointer"
            title="Inspect compiled SQL"
            data-testid={`btn-sql-${chart.chart_spec.metric}`}
          >
            <Code2 className="h-3.5 w-3.5" />
          </button>

          {/* Toggle Screen Reader Data Table View */}
          <button
            type="button"
            onClick={() => setShowDataTable(!showDataTable)}
            className="p-1 rounded-[4px] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-subtle cursor-pointer"
            title="Toggle data table view"
          >
            <TableIcon className="h-3.5 w-3.5" />
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1 rounded-[4px] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-subtle cursor-pointer"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* One-line hint banner */}
      {showHint && (
        <div className="mb-2 px-2.5 py-1 rounded-[4px] bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[11px] text-[var(--text-muted)] flex items-center justify-between">
          <span>Click any point or bar on a chart to see why it moved.</span>
        </div>
      )}

      {/* Main Chart Canvas or Loading / Error states */}
      <div
        className="flex-1 w-full relative min-h-[200px] outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="region"
        aria-label={`${chart.title} chart. Use arrow keys to navigate points, Enter to explain.`}
      >
        {loading ? (
          <div className="flex flex-col gap-2 h-full justify-center p-4">
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-28 w-full" />
            <div className="flex justify-between mt-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center text-[12px] gap-2">
            <div className="flex flex-col items-center gap-1">
              <p className="font-semibold text-[var(--trend-down)]" data-testid="chart-error-message">
                {mapChartError(error).message}
              </p>
              <p className="text-[12px] text-[var(--text-muted)] max-w-sm" data-testid="chart-error-fix">
                <span className="font-medium text-[var(--text-main)]">Actionable fix: </span>
                {mapChartError(error).fix}
              </p>
            </div>
            <details className="w-full text-left mt-2 border border-[var(--border-hairline)] bg-[var(--bg-subtle)] rounded p-2 text-[11px]">
              <summary className="font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer select-none">
                Show technical details
              </summary>
              <pre className="mt-2 p-2 bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded font-mono text-[11px] text-[var(--trend-down)] whitespace-pre-wrap overflow-x-auto max-h-40">
                {error}
              </pre>
            </details>
          </div>
        ) : showDataTable ? (
          /* Accessible Screen Reader Data Table View */
          <div className="overflow-auto max-h-[240px] text-[12px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[var(--text-muted)]">
                  <th className="py-1.5 px-2">Period / Segment</th>
                  <th className="py-1.5 px-2">{chart.chart_spec.metric}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {runResult?.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-[var(--bg-subtle)]">
                    <td className="py-1 px-2 font-mono">
                      {String(r["period"] || r[chart.chart_spec.dimensions?.[0] || ""] || i)}
                    </td>
                    <td className="py-1 px-2 font-mono">
                      {formatMetricValue(Number(r["metric_value"] || r[chart.chart_spec.metric] || 0), metricFormat)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : chart.chart_type === "line" || chart.chart_type === "area" ? (
          <Line data={chartData} options={chartOptions as ChartOptions<"line">} />
        ) : (
          <Bar data={chartData} options={chartOptions as ChartOptions<"bar">} />
        )}
      </div>

      {/* SQL & Execution Metadata Inspector Dialog */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[6px] shadow-overlay max-w-2xl w-full p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
              <div>
                <h4 className="font-heading text-[16px] font-medium text-[var(--text-main)]">
                  Compiled SQL: {chart.title}
                </h4>
                <div className="flex items-center gap-3 text-[12px] text-[var(--text-muted)] mt-1">
                  <span>Execution: {runResult?.execution_time_ms ? `${runResult.execution_time_ms.toFixed(1)} ms` : "—"}</span>
                  <span>•</span>
                  <span>Bytes scanned: {runResult?.bytes_scanned ? `${(runResult.bytes_scanned / 1024).toFixed(1)} KB` : "0 (dry run verified)"}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="relative">
              <pre className="p-3 bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded-[4px] text-[12px] font-mono text-[var(--text-main)] overflow-x-auto max-h-60 whitespace-pre-wrap">
                {runResult?.compiled_sql || "SELECT 1"}
              </pre>
              <button
                type="button"
                onClick={handleCopySql}
                className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded shadow-sm hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                {copiedSql ? (
                  <>
                    <Check className="h-3 w-3 text-[var(--trend-up)]" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy SQL</span>
                  </>
                )}
              </button>
            </div>

            {runResult?.param_values && Object.keys(runResult.param_values).length > 0 && (
              <div>
                <span className="text-[12px] font-medium text-[var(--text-muted)]">Parameters:</span>
                <pre className="mt-1 p-2 bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded text-[11px] font-mono text-[var(--text-muted)]">
                  {JSON.stringify(runResult.param_values, null, 2)}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="px-3 py-1.5 text-[12px] font-medium rounded-[4px] bg-[var(--bg-subtle)] text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)] cursor-pointer border border-[var(--border-hairline)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
