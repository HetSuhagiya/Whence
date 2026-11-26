"use client";

import * as React from "react";
import { Bar } from "react-chartjs-2";
import type { ChartOptions, TooltipItem } from "chart.js";
import { Ban, Filter } from "lucide-react";
import { CHART_COLORS, formatMetricValue } from "./chartConfig";

export interface SegmentFinding {
  id?: string;
  dimension: string;
  segment_value: string;
  contribution_amount: number;
  share_of_change: number;
  direction?: string;
  baseline_value?: number;
  current_value?: number;
  percent_change?: number;
  sql?: string;
}

interface DimensionSelectorWaterfallProps {
  dimensionWaterfalls: Record<string, SegmentFinding[]>;
  dimensionShares: Record<string, number>;
  segmentLift: Record<string, Record<string, number>>;
  ruledOutDimensions: string[];
  onDrillSegment?: (segment: string) => void;
  metricFormat?: string;
  isDark?: boolean;
}

export function DimensionSelectorWaterfall({
  dimensionWaterfalls,
  dimensionShares,
  segmentLift,
  ruledOutDimensions,
  onDrillSegment,
  metricFormat = "currency",
  isDark = false,
}: DimensionSelectorWaterfallProps) {
  const dimensions = Object.keys(dimensionWaterfalls || {});
  const [selectedDimension, setSelectedDimension] = React.useState<string>(
    dimensions[0] || ""
  );

  React.useEffect(() => {
    if (dimensions.length > 0 && (!selectedDimension || !dimensions.includes(selectedDimension))) {
      setSelectedDimension(dimensions[0]);
    }
  }, [dimensions, selectedDimension]);

  if (dimensions.length === 0) return null;

  const currentSegments = dimensionWaterfalls[selectedDimension] || [];

  // Chart data
  const labels = currentSegments.map((s) => String(s.segment_value));
  const values = currentSegments.map((s) => Number(s.contribution_amount || 0));
  const colors = values.map((v) =>
    v >= 0
      ? (isDark ? CHART_COLORS.waterfallUpDark : CHART_COLORS.waterfallUp)
      : (isDark ? CHART_COLORS.waterfallDownDark : CHART_COLORS.waterfallDown)
  );

  const waterfallData = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: colors,
        borderRadius: 2,
        borderWidth: 0,
      },
    ],
  };

  const waterfallOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<"bar">) => {
            const seg = currentSegments[ctx.dataIndex];
            const share = seg ? ` (${(seg.share_of_change * 100).toFixed(1)}% of change)` : "";
            const liftVal = segmentLift[selectedDimension]?.[seg?.segment_value];
            const liftText = liftVal !== undefined ? ` · Lift: ${liftVal.toFixed(2)}x` : "";
            return ` Contribution: ${formatMetricValue(Number(ctx.parsed.y || 0), metricFormat)}${share}${liftText}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: isDark ? CHART_COLORS.textMutedDark : CHART_COLORS.textMuted,
          font: { size: 11, family: "Instrument Sans, sans-serif" },
        },
      },
      y: {
        grid: {
          color: isDark ? "rgba(67, 72, 78, 0.3)" : "rgba(205, 206, 214, 0.3)",
        },
        ticks: {
          color: isDark ? CHART_COLORS.textMutedDark : CHART_COLORS.textMuted,
          font: { size: 11, family: "Instrument Sans, sans-serif" },
          callback: (v: string | number) => formatMetricValue(Number(v), metricFormat),
        },
      },
    },
  };

  return (
    <div
      className="flex flex-col gap-4 p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      data-testid="dimension-selector-waterfall"
    >
      {/* Dimension Selector Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-[13px] font-medium text-[var(--text-main)]">
            Explore Dimension Drivers
          </span>
        </div>

        {/* Dimension Pill Buttons */}
        <div className="flex flex-wrap items-center gap-1.5" data-testid="dimension-pills">
          {dimensions.map((dim) => {
            const share = dimensionShares[dim];
            const sharePct = share !== undefined ? `${Math.round(share * 100)}%` : "";
            const isSelected = selectedDimension === dim;
            return (
              <button
                key={dim}
                type="button"
                onClick={() => setSelectedDimension(dim)}
                className={`px-2.5 py-1 text-[12px] rounded-[4px] font-medium transition-subtle cursor-pointer ${
                  isSelected
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-main)] border border-[var(--border-hairline)]"
                }`}
                data-testid={`dimension-btn-${dim}`}
              >
                <span>{dim}</span>
                {sharePct && (
                  <span className={`ml-1.5 text-[11px] font-mono ${isSelected ? "text-white/80" : "text-[var(--text-muted)]"}`}>
                    {sharePct}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Ruled-out dimensions banner if any */}
      {ruledOutDimensions && ruledOutDimensions.length > 0 && (
        <div
          className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] bg-[var(--bg-app)]/50 px-3 py-1.5 rounded-[4px] border border-[var(--border-hairline)]"
          data-testid="ruled-out-dimensions-badge"
        >
          <Ban className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <span>Ruled out (&lt; 15% change explained): </span>
          <span className="font-mono text-[var(--text-main)]">{ruledOutDimensions.join(", ")}</span>
        </div>
      )}

      {/* Waterfall & Segment Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
        {/* Waterfall Chart for active dimension */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium text-[var(--text-main)]">
              {selectedDimension} Waterfall
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              Radix green9 / red9
            </span>
          </div>
          <div className="h-[210px] w-full" data-testid={`waterfall-chart-${selectedDimension}`}>
            <Bar data={waterfallData} options={waterfallOptions} />
          </div>
        </div>

        {/* Ranked Segment Contributions with Lift Badges */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium text-[var(--text-main)]">
              Ranked Segments & Lift
            </span>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              Lift = Share of Change / Baseline Share
            </span>
          </div>

          <div className="flex flex-col divide-y divide-[var(--border-hairline)] overflow-y-auto max-h-[210px] text-[12px] rounded-[3px] border border-[var(--border-hairline)] bg-[var(--bg-app)]/20">
            {currentSegments.map((d, idx) => {
              const liftVal = segmentLift[selectedDimension]?.[d.segment_value] ?? 1.0;
              const isPos = d.contribution_amount >= 0;
              return (
                <div
                  key={d.id || idx}
                  className="py-2 px-2.5 flex items-center justify-between hover:bg-[var(--bg-subtle)]/60 transition-colors"
                  data-testid={`dimension-segment-row-${idx}`}
                >
                  <div className="flex items-center gap-2 max-w-[170px] truncate">
                    <span className="font-semibold text-[var(--text-main)] truncate" title={d.segment_value}>
                      {d.segment_value}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                        liftVal > 1.2
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                          : liftVal < 0.8
                          ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
                          : "bg-gray-100 dark:bg-gray-800 text-[var(--text-muted)]"
                      }`}
                      title={`Lift: ${liftVal.toFixed(2)}x`}
                      data-testid={`segment-lift-badge-${d.segment_value}`}
                    >
                      {liftVal.toFixed(2)}x
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono font-medium ${
                        isPos ? "text-[var(--trend-up)]" : "text-[var(--trend-down)]"
                      }`}
                    >
                      {isPos ? "+" : ""}
                      {formatMetricValue(d.contribution_amount, metricFormat)}
                    </span>
                    <span className="text-[11px] font-mono text-[var(--text-muted)] w-11 text-right">
                      {(d.share_of_change * 100).toFixed(1)}%
                    </span>
                    {onDrillSegment && (
                      <button
                        type="button"
                        onClick={() => onDrillSegment(d.segment_value)}
                        className="text-[11px] text-[var(--accent-text)] hover:underline cursor-pointer"
                      >
                        Drill
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
