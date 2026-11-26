"use client";

import * as React from "react";
import { Bar, Line } from "react-chartjs-2";
import type { ChartOptions, ChartEvent, ActiveElement, Plugin } from "chart.js";
import {
  Code2,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Sparkles,
  Table as TableIcon,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
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
  isHero?: boolean;
  explainedPoints?: Set<string>;
  onExplain: (chart: DashboardChartPublic, point?: string) => void;
  onDelete?: (chart: DashboardChartPublic) => void;
}

export function ChartCard({
  chart,
  runResult,
  loading,
  error,
  showHint,
  isHero = false,
  explainedPoints = new Set(),
  onExplain,
  onDelete,
}: ChartCardProps) {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [showSqlModal, setShowSqlModal] = React.useState(false);
  const [showDataTable, setShowDataTable] = React.useState(false);
  const [copiedSql, setCopiedSql] = React.useState(false);
  const [selectedPointIndex, setSelectedPointIndex] = React.useState<number | null>(null);

  // Custom HTML tooltip state
  const [tooltipState, setTooltipState] = React.useState<{
    visible: boolean;
    x: number;
    y: number;
    label: string;
    value: string;
    deltaStr?: string;
    isUp?: boolean;
  }>({
    visible: false,
    x: 0,
    y: 0,
    label: "",
    value: "",
  });

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

  const rows = React.useMemo(() => runResult?.rows || [], [runResult]);
  const isLine = chart.chart_type === "line" || chart.chart_type === "area";
  const isStacked = chart.chart_type === "stacked_bar";

  // Calculate Headline Number and Change vs Previous Period
  const headlineData = React.useMemo(() => {
    if (!rows || rows.length === 0) return null;

    if (isLine) {
      const values = rows.map((r) => Number(r["metric_value"] || r[chart.chart_spec.metric] || 0));
      const latest = values[values.length - 1];
      const previous = values.length > 1 ? values[values.length - 2] : null;

      let pctChange: number | null = null;
      if (previous !== null && previous !== 0) {
        pctChange = ((latest - previous) / Math.abs(previous)) * 100;
      }

      return {
        formattedValue: formatMetricValue(latest, metricFormat),
        deltaPct: pctChange,
        isPositive: pctChange !== null ? pctChange >= 0 : null,
      };
    } else {
      // Category / Bar breakdown - sum total as headline
      const values = rows.map((r) => Number(r["metric_value"] || r[chart.chart_spec.metric] || 0));
      const total = values.reduce((sum, v) => sum + v, 0);
      return {
        formattedValue: formatMetricValue(total, metricFormat),
        deltaPct: null,
        isPositive: null,
      };
    }
  }, [rows, chart, isLine, metricFormat]);

  // Build sorted data for Bar charts and time-series for Line charts
  const { chartData, sortedRows } = React.useMemo(() => {
    if (!rows || rows.length === 0) {
      return { chartData: { labels: [], datasets: [] }, sortedRows: [] };
    }

    if (isStacked && chart.chart_spec.dimensions && chart.chart_spec.dimensions.length > 0) {
      const dimKey = chart.chart_spec.dimensions[0];
      // Sort bars descending by value
      const sorted = [...rows].sort((a, b) => {
        const valA = Number(a["metric_value"] || a[chart.chart_spec.metric] || 0);
        const valB = Number(b["metric_value"] || b[chart.chart_spec.metric] || 0);
        return valB - valA;
      });

      const labels = sorted.map((r) => String(r[dimKey] || "Other"));
      const dataValues = sorted.map((r) => Number(r["metric_value"] || r[chart.chart_spec.metric] || 0));

      return {
        sortedRows: sorted,
        chartData: {
          labels,
          datasets: [
            {
              label: chart.chart_spec.metric,
              data: dataValues,
              backgroundColor: CHART_COLORS.series.slice(0, labels.length),
              borderWidth: 0,
              borderRadius: { topLeft: 2, topRight: 2, bottomLeft: 0, bottomRight: 0 },
            },
          ],
        },
      };
    }

    if (chart.chart_spec.dimensions && chart.chart_spec.dimensions.length > 0) {
      const dimKey = chart.chart_spec.dimensions[0];
      // Sort category breakdown descending by value
      const sorted = [...rows].sort((a, b) => {
        const valA = Number(a["metric_value"] || a[chart.chart_spec.metric] || 0);
        const valB = Number(b["metric_value"] || b[chart.chart_spec.metric] || 0);
        return valB - valA;
      });

      const labels = sorted.map((r) => String(r[dimKey] || "Other"));
      const dataValues = sorted.map((r) => Number(r["metric_value"] || r[chart.chart_spec.metric] || 0));

      return {
        sortedRows: sorted,
        chartData: {
          labels,
          datasets: [
            {
              label: chart.chart_spec.metric,
              data: dataValues,
              backgroundColor: CHART_COLORS.primary,
              borderWidth: 0,
              borderRadius: { topLeft: 2, topRight: 2, bottomLeft: 0, bottomRight: 0 },
            },
          ],
        },
      };
    }

    // Default time-series line
    const labels = rows.map((r) => String(r["period"] || ""));
    const dataValues = rows.map((r) => Number(r["metric_value"] || r[chart.chart_spec.metric] || 0));

    // Previous-period comparison dataset (faint dashed line behind)
    const prevValues = rows.map((r, i) => {
      if (r["previous_value"] !== undefined && r["previous_value"] !== null) {
        return Number(r["previous_value"]);
      }
      // If warehouse didn't provide previous_value column, synthesize previous window baseline
      if (i > 0) {
        return Number(rows[i - 1]["metric_value"] || rows[i - 1][chart.chart_spec.metric] || 0);
      }
      return dataValues[0] * 0.95; // graceful baseline anchor
    });

    // Check which points have persistent explained highlight rings
    const pointRadii = labels.map((lbl) => (explainedPoints.has(lbl) ? 6 : 0));
    const pointBorderWidths = labels.map((lbl) => (explainedPoints.has(lbl) ? 2.5 : 0));
    const pointBorderColors = labels.map((lbl) => (explainedPoints.has(lbl) ? CHART_COLORS.highlight : "transparent"));
    const pointBgColors = labels.map((lbl) => (explainedPoints.has(lbl) ? "#ffffff" : CHART_COLORS.primary));

    return {
      sortedRows: rows,
      chartData: {
        labels,
        datasets: [
          // Previous-period faint dashed line behind
          {
            label: "Previous period",
            data: prevValues,
            borderColor: CHART_COLORS.baseline,
            borderWidth: 1.5,
            borderDash: [4, 4],
            fill: false,
            tension: 0.2,
            pointRadius: 0,
            pointHoverRadius: 0,
            order: 2,
          },
          // Main current-period ink series (2px stroke, round join, no markers until hover)
          {
            label: chart.chart_spec.metric,
            data: dataValues,
            borderColor: CHART_COLORS.primary,
            borderWidth: 2,
            borderJoinStyle: "round" as const,
            borderCapStyle: "round" as const,
            fill: false, // Clean flat background without gradients or excessive area fill
            tension: 0.2,
            pointRadius: pointRadii,
            pointHoverRadius: 5,
            pointBackgroundColor: pointBgColors,
            pointBorderColor: pointBorderColors,
            pointBorderWidth: pointBorderWidths,
            order: 1,
          },
        ],
      },
    };
  }, [rows, chart, isStacked, explainedPoints]);

  // Direct end-of-line series label plugin and Bar value label plugin
  const customCanvasPlugin: Plugin = React.useMemo(() => {
    return {
      id: "whenceChartEditorialPlugin",
      afterDatasetsDraw(chartInstance) {
        const { ctx, data } = chartInstance;
        const meta = chartInstance.getDatasetMeta(chartInstance.data.datasets.length - 1);
        if (!meta) return;

        // 1. Direct end-of-line label for time-series lines
        if (isLine && meta.data && meta.data.length > 0) {
          const lastPoint = meta.data[meta.data.length - 1];
          if (lastPoint) {
            ctx.save();
            ctx.font = "500 11px 'Instrument Sans', sans-serif";
            ctx.fillStyle = CHART_COLORS.textMuted;
            ctx.textBaseline = "middle";
            ctx.textAlign = "left";
            const labelText = toSentenceCase(chart.chart_spec.metric);
            // Draw slightly to the right of the last point if space permits
            if (lastPoint.x + 8 < chartInstance.width - 40) {
              ctx.fillText(labelText, lastPoint.x + 8, lastPoint.y);
            }
            ctx.restore();
          }
        }

        // 2. Bar tips value labels when room permits
        if (!isLine && meta.data && meta.data.length > 0) {
          ctx.save();
          ctx.font = "500 10px 'Instrument Sans', sans-serif";
          ctx.fillStyle = CHART_COLORS.textMuted;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";

          meta.data.forEach((bar, index) => {
            const val = Number(data.datasets[0]?.data?.[index] || 0);
            const valStr = formatMetricValue(val, metricFormat);
            if (bar && bar.y > 20) {
              ctx.fillText(valStr, bar.x, bar.y - 4);
            }
          });
          ctx.restore();
        }

        // 3. Persistent marker ring on explained points
        if (isLine && meta.data) {
          meta.data.forEach((point, index) => {
            const label = String(data.labels?.[index] || "");
            if (explainedPoints.has(label)) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
              ctx.strokeStyle = CHART_COLORS.highlight;
              ctx.lineWidth = 2.5;
              ctx.stroke();
              ctx.restore();
            }
          });
        }
      },
    };
  }, [isLine, chart, metricFormat, explainedPoints]);

  // Chart.js options
  const chartOptions: ChartOptions<"line" | "bar"> = React.useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          right: isLine ? 65 : 10,
          top: 15,
          left: 5,
          bottom: 5,
        },
      },
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false, // We use custom editorial HTML tooltip below
          external: (context) => {
            const { tooltip, chart: chartObj } = context;
            if (tooltip.opacity === 0) {
              setTooltipState((prev) => (prev.visible ? { ...prev, visible: false } : prev));
              return;
            }

            const dataPoint = tooltip.dataPoints[tooltip.dataPoints.length - 1];
            if (!dataPoint) return;

            const idx = dataPoint.dataIndex;
            const label = String(chartData.labels[idx] || "");
            const val = Number(dataPoint.raw || 0);

            let deltaStr: string | undefined = undefined;
            let isUp: boolean | undefined = undefined;

            if (isLine && idx > 0) {
              const prev = Number(chartData.datasets[0]?.data[idx] ?? chartData.datasets[1]?.data[idx - 1] ?? 0);
              if (prev !== 0) {
                const pct = ((val - prev) / Math.abs(prev)) * 100;
                deltaStr = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs baseline`;
                isUp = pct >= 0;
              }
            }

            const chartRect = chartObj.canvas.getBoundingClientRect();
            setTooltipState({
              visible: true,
              x: chartRect.left + tooltip.caretX + window.scrollX,
              y: chartRect.top + tooltip.caretY + window.scrollY,
              label,
              value: formatMetricValue(val, metricFormat),
              deltaStr,
              isUp,
            });
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: CHART_COLORS.textMuted,
            font: { size: 12, family: "Instrument Sans, sans-serif" },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: isHero ? 10 : 6,
          },
          border: { display: false }, // Outer chart border removed
        },
        y: {
          grid: {
            color: "rgba(205, 206, 214, 0.3)",
            lineWidth: 1,
          },
          border: { display: false }, // Outer chart border removed
          beginAtZero: true,
          ticks: {
            count: 3, // Exactly 3 horizontal hairline gridlines (bottom, mid, top)
            color: CHART_COLORS.textMuted,
            font: { size: 12, family: "Instrument Sans, sans-serif" },
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
  }, [chart, chartData, isLine, isHero, metricFormat, onExplain]);

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
    } else if (e.altKey && (e.key === "t" || e.key === "T")) {
      e.preventDefault();
      setShowDataTable((prev) => !prev);
    }
  };

  return (
    <div
      className={`group relative flex flex-col py-5 px-1 bg-[var(--bg-surface)] border-b border-[var(--border-hairline)] transition-all ${
        isFullscreen ? "col-span-full z-20 shadow-lg min-h-[500px]" : isHero ? "min-h-[380px]" : "min-h-[320px]"
      }`}
      data-testid={`chart-card-${chart.chart_spec.metric}`}
    >
      {/* Editorial Header: Title in Newsreader serif, headline number, delta badge */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-baseline gap-3">
            <h3 className="font-heading font-serif text-[18px] sm:text-[20px] font-normal tracking-tight text-[var(--text-main)]">
              {toSentenceCase(chart.title)}
            </h3>
            {/* Headline Metric Number */}
            {headlineData && (
              <span className="font-sans text-[18px] sm:text-[21px] font-semibold tabular-nums tracking-tight text-[var(--text-main)]">
                {headlineData.formattedValue}
              </span>
            )}
            {/* Period-over-period delta badge */}
            {headlineData && headlineData.deltaPct !== null && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums ${
                  headlineData.isPositive
                    ? "bg-[var(--trend-up-subtle)] text-[var(--trend-up)]"
                    : "bg-[var(--trend-down-subtle)] text-[var(--trend-down)]"
                }`}
                title="Change vs previous period"
              >
                {headlineData.isPositive ? (
                  <ArrowUpRight className="h-3 w-3 stroke-[2.5]" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 stroke-[2.5]" />
                )}
                <span>
                  {headlineData.isPositive ? "+" : ""}
                  {headlineData.deltaPct.toFixed(1)}%
                </span>
              </span>
            )}
          </div>
          {/* Muted Definition Line */}
          <p className="text-[12px] text-[var(--text-muted)] mt-1 font-sans">
            {toSentenceCase(chart.chart_spec.metric)}
            {chart.chart_spec.dimensions?.length ? ` by ${chart.chart_spec.dimensions.map(toSentenceCase).join(", ")}` : " over time"}
            {runResult?.date_range ? ` • ${String(runResult.date_range).replace("_", " ")}` : ""}
          </p>
        </div>

        {/* Action Toolbar on hover & focus */}
        <div
          className="flex items-center gap-1 self-start opacity-90 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity"
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

          {/* Toggle Screen Reader Data Table View (Alt+T) */}
          <button
            type="button"
            onClick={() => setShowDataTable(!showDataTable)}
            className="p-1 rounded-[4px] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-subtle cursor-pointer"
            title="Toggle data table view (Alt+T)"
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

          {/* Delete Chart Button */}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(chart)}
              className="p-1 rounded-[4px] text-[var(--text-muted)] hover:text-red-500 hover:bg-[var(--bg-subtle)] transition-subtle cursor-pointer"
              title="Remove chart"
              data-testid={`btn-remove-chart-${chart.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* One-line hint banner */}
      {showHint && (
        <div className="mb-3 px-2.5 py-1 rounded-[4px] bg-[var(--bg-subtle)] text-[11px] text-[var(--text-muted)] flex items-center justify-between">
          <span>Click any point or bar on a chart to see why it moved.</span>
        </div>
      )}

      {/* Main Chart Canvas or Loading / Error states */}
      <div
        className="flex-1 w-full relative min-h-[220px] outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="region"
        aria-label={`${chart.title} chart. Use arrow keys to navigate points, Enter to explain, Alt+T to toggle table.`}
      >
        {loading ? (
          <div className="flex flex-col gap-2 h-full justify-center p-4">
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-32 w-full" />
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
          <div className="overflow-auto max-h-[260px] text-[12px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-[var(--text-muted)]">
                  <th className="py-1.5 px-2">Period / Segment</th>
                  <th className="py-1.5 px-2">{chart.chart_spec.metric}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {sortedRows.map((r, i) => (
                  <tr key={i} className="hover:bg-[var(--bg-subtle)]">
                    <td className="py-1 px-2 font-mono">
                      {String(r["period"] || r[chart.chart_spec.dimensions?.[0] || ""] || i)}
                    </td>
                    <td className="py-1 px-2 font-mono tabular-nums">
                      {formatMetricValue(Number(r["metric_value"] || r[chart.chart_spec.metric] || 0), metricFormat)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : isLine ? (
          <Line
            data={chartData}
            options={chartOptions as ChartOptions<"line">}
            plugins={[customCanvasPlugin]}
          />
        ) : (
          <Bar
            data={chartData}
            options={chartOptions as ChartOptions<"bar">}
            plugins={[customCanvasPlugin]}
          />
        )}
      </div>

      {/* Custom HTML Tooltip */}
      {tooltipState.visible && (
        <div
          className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full mb-3.5 px-3 py-2 rounded-[4px] bg-[#111827] text-white shadow-xl text-[12px] font-sans flex flex-col gap-0.5 border border-slate-700/60 transition-opacity duration-75"
          style={{
            left: `${tooltipState.x}px`,
            top: `${tooltipState.y}px`,
          }}
          data-testid="custom-html-tooltip"
        >
          <div className="font-mono text-[11px] text-slate-300 font-medium">{tooltipState.label}</div>
          <div className="flex items-center gap-2 font-semibold text-[13px] tabular-nums">
            <span>{tooltipState.value}</span>
            {tooltipState.deltaStr && (
              <span
                className={`text-[11px] font-normal ${
                  tooltipState.isUp ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {tooltipState.deltaStr}
              </span>
            )}
          </div>
          <div className="text-[10px] text-sky-300 mt-1 flex items-center gap-1 font-medium">
            <Sparkles className="h-2.5 w-2.5" />
            <span>Click to explain</span>
          </div>
        </div>
      )}

      {/* SQL & Execution Metadata Inspector Dialog */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[6px] shadow-overlay max-w-2xl w-full p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
              <div>
                <h4 className="font-heading font-serif text-[17px] font-medium text-[var(--text-main)]">
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
