"use client";

import * as React from "react";
import { Table } from "lucide-react";
import { formatMetricValue } from "./chartConfig";

export interface SegmentComparisonRow {
  dimension: string;
  segment: string;
  baseline_value: number;
  current_value: number;
  delta: number;
  percent_change: number;
  share_of_change: number;
  lift: number;
}

interface SegmentComparisonTableProps {
  rows: SegmentComparisonRow[];
  metricFormat?: string;
  activeDimension?: string;
}

export function SegmentComparisonTable({
  rows,
  metricFormat = "currency",
  activeDimension,
}: SegmentComparisonTableProps) {
  const filteredRows = React.useMemo(() => {
    if (!rows) return [];
    if (!activeDimension || activeDimension === "all") return rows;
    return rows.filter((r) => r.dimension.toLowerCase() === activeDimension.toLowerCase());
  }, [rows, activeDimension]);

  if (!filteredRows || filteredRows.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      data-testid="segment-comparison-table-container"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Table className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-[13px] font-medium text-[var(--text-main)]">
            Baseline vs Current Segment Comparison
          </span>
        </div>
        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          {filteredRows.length} segment{filteredRows.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto mt-1 rounded-[3px] border border-[var(--border-hairline)]">
        <table className="w-full text-left text-[12px] border-collapse" data-testid="segment-comparison-table">
          <thead>
            <tr className="bg-[var(--bg-app)] border-b border-[var(--border-hairline)] text-[11px] font-medium text-[var(--text-muted)]">
              <th className="py-2 px-3">Segment</th>
              <th className="py-2 px-2.5">Dimension</th>
              <th className="py-2 px-2.5 text-right">Baseline</th>
              <th className="py-2 px-2.5 text-right">Current</th>
              <th className="py-2 px-2.5 text-right">Delta</th>
              <th className="py-2 px-2.5 text-right">% Change</th>
              <th className="py-2 px-2.5 text-right">Share of Change</th>
              <th className="py-2 px-3 text-right">Lift Ratio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]/60 font-mono">
            {filteredRows.map((row, idx) => {
              const isPos = row.delta >= 0;
              const liftVal = row.lift ?? 1.0;
              return (
                <tr
                  key={`${row.dimension}-${row.segment}-${idx}`}
                  className="hover:bg-[var(--bg-subtle)]/70 transition-colors"
                  data-testid={`segment-row-${idx}`}
                >
                  <td className="py-2 px-3 font-sans font-medium text-[var(--text-main)] max-w-[160px] truncate" title={row.segment}>
                    {row.segment}
                  </td>
                  <td className="py-2 px-2.5 font-sans text-[var(--text-muted)]">
                    {row.dimension}
                  </td>
                  <td className="py-2 px-2.5 text-right text-[var(--text-muted)]">
                    {formatMetricValue(row.baseline_value, metricFormat)}
                  </td>
                  <td className="py-2 px-2.5 text-right text-[var(--text-main)] font-medium">
                    {formatMetricValue(row.current_value, metricFormat)}
                  </td>
                  <td
                    className={`py-2 px-2.5 text-right font-medium ${
                      isPos ? "text-[var(--trend-up)]" : "text-[var(--trend-down)]"
                    }`}
                  >
                    {isPos ? "+" : ""}{formatMetricValue(row.delta, metricFormat)}
                  </td>
                  <td
                    className={`py-2 px-2.5 text-right ${
                      row.percent_change >= 0 ? "text-[var(--trend-up)]" : "text-[var(--trend-down)]"
                    }`}
                  >
                    {row.percent_change >= 0 ? "+" : ""}{row.percent_change.toFixed(1)}%
                  </td>
                  <td className="py-2 px-2.5 text-right text-[var(--text-muted)]">
                    {row.share_of_change.toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 text-right">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                        liftVal > 1.2
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40"
                          : liftVal < 0.8
                          ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40"
                          : "bg-[var(--bg-app)] text-[var(--text-muted)] border border-[var(--border-hairline)]"
                      }`}
                      data-testid={`segment-lift-${idx}`}
                    >
                      {liftVal.toFixed(2)}x
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
