"use client";

import * as React from "react";
import { Calendar } from "lucide-react";
import { CHART_COLORS, formatMetricValue } from "./chartConfig";

export interface TimingStripItem {
  date: string;
  label: string;
  current_value: number;
  baseline_value: number;
  delta: number;
  share_of_change: number;
}

interface TimingDistributionStripProps {
  timingStrip: TimingStripItem[];
  timingSummary: string;
  metricFormat?: string;
  isDark?: boolean;
}

export function TimingDistributionStrip({
  timingStrip,
  timingSummary,
  metricFormat = "currency",
  isDark = false,
}: TimingDistributionStripProps) {
  if (!timingStrip || timingStrip.length === 0) return null;

  const maxAbsDelta = Math.max(...timingStrip.map((t) => Math.abs(t.delta || 0)), 1);

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      data-testid="timing-distribution-strip"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-[13px] font-medium text-[var(--text-main)]">
            Intra-window timing distribution
          </span>
        </div>
        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          {timingStrip.length} period{timingStrip.length > 1 ? "s" : ""}
        </span>
      </div>

      {timingSummary && (
        <div
          className="text-[12px] font-medium text-[var(--text-main)] bg-[var(--bg-app)]/70 px-3 py-1.5 rounded-[4px] border border-[var(--border-hairline)]/60"
          data-testid="timing-summary-sentence"
        >
          {timingSummary}
        </div>
      )}

      {/* Mini Bar Chart Strip */}
      <div className="pt-2 pb-1">
        <div className="flex items-end gap-1.5 h-20 w-full px-1">
          {timingStrip.map((item, idx) => {
            const absDelta = Math.abs(item.delta || 0);
            const heightPct = Math.max(12, Math.round((absDelta / maxAbsDelta) * 100));
            const isPos = item.delta >= 0;
            const barBg = isPos
              ? (isDark ? CHART_COLORS.waterfallUpDark : CHART_COLORS.waterfallUp)
              : (isDark ? CHART_COLORS.waterfallDownDark : CHART_COLORS.waterfallDown);
            const isPeak = Math.abs(item.share_of_change || 0) >= 0.35;

            return (
              <div
                key={item.date || idx}
                className="flex-1 flex flex-col items-center group relative h-full justify-end cursor-pointer"
                title={`${item.label || item.date}: ${isPos ? "+" : ""}${formatMetricValue(item.delta, metricFormat)} (${(item.share_of_change * 100).toFixed(1)}%)`}
              >
                {/* Bar */}
                <div
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: barBg,
                  }}
                  className={`w-full max-w-[28px] rounded-t-[2px] transition-all group-hover:opacity-80 ${
                    isPeak ? "ring-2 ring-[var(--accent)] ring-offset-1" : ""
                  }`}
                  data-testid={`timing-bar-${idx}`}
                />

                {/* Hover Popover Tooltip */}
                <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute bottom-full mb-2 z-20 whitespace-nowrap bg-gray-900 text-white text-[11px] rounded px-2 py-1 shadow-md transition-opacity">
                  <div className="font-semibold">{item.label || item.date}</div>
                  <div>Current: {formatMetricValue(item.current_value, metricFormat)}</div>
                  <div>Delta: {isPos ? "+" : ""}{formatMetricValue(item.delta, metricFormat)}</div>
                  <div className="text-gray-300">Share: {(item.share_of_change * 100).toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* X-axis date labels */}
        <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] mt-1.5 px-1 font-mono">
          <span>{timingStrip[0]?.label || timingStrip[0]?.date}</span>
          {timingStrip.length > 2 && (
            <span>{timingStrip[Math.floor(timingStrip.length / 2)]?.label || timingStrip[Math.floor(timingStrip.length / 2)]?.date}</span>
          )}
          <span>{timingStrip[timingStrip.length - 1]?.label || timingStrip[timingStrip.length - 1]?.date}</span>
        </div>
      </div>
    </div>
  );
}
