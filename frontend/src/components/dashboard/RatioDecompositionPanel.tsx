"use client";

import * as React from "react";
import { Divide, Layers, Percent, TrendingUp } from "lucide-react";
import { formatMetricValue } from "./chartConfig";

export interface RatioDecompositionData {
  volume_effect: number;
  mix_effect: number;
  rate_effect: number;
  mix_share: number;
  rate_share: number;
  plain_language?: string;
  summary?: string;
}

interface RatioDecompositionPanelProps {
  decomposition: RatioDecompositionData | null | undefined;
  metricFormat?: string;
}

export function RatioDecompositionPanel({
  decomposition,
  metricFormat = "currency",
}: RatioDecompositionPanelProps) {
  if (!decomposition) return null;

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      data-testid="ratio-decomposition-panel"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Divide className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-[13px] font-medium text-[var(--text-main)]">
            Ratio Metric Decomposition
          </span>
        </div>
        <span className="text-[11px] font-mono text-[var(--text-muted)]">
          Volume / Mix / Rate Split
        </span>
      </div>

      {/* 3 Component Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Volume Effect */}
        <div className="p-3 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)]/50 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
              Volume Effect
            </span>
            <span>Overall Scale</span>
          </div>
          <div className="font-mono text-[16px] font-medium text-[var(--text-main)] mt-1">
            {decomposition.volume_effect >= 0 ? "+" : ""}
            {decomposition.volume_effect.toFixed(1)}%
          </div>
          <span className="text-[11px] text-[var(--text-muted)] leading-tight">
            Denominator volume shift between comparison periods.
          </span>
        </div>

        {/* Mix Effect */}
        <div className="p-3 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)]/50 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium">
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-purple-500" />
              Mix Effect
            </span>
            <span className="font-mono">{decomposition.mix_share.toFixed(1)}%</span>
          </div>
          <div className="font-mono text-[16px] font-medium text-[var(--text-main)] mt-1">
            {decomposition.mix_effect >= 0 ? "+" : ""}
            {formatMetricValue(decomposition.mix_effect, metricFormat)}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] leading-tight">
            Shift in basket or order proportion across segments.
          </span>
        </div>

        {/* Rate Effect */}
        <div className="p-3 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)]/50 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-medium">
            <span className="flex items-center gap-1.5">
              <Percent className="h-3.5 w-3.5 text-emerald-500" />
              Rate Effect
            </span>
            <span className="font-mono">{decomposition.rate_share.toFixed(1)}%</span>
          </div>
          <div className="font-mono text-[16px] font-medium text-[var(--text-main)] mt-1">
            {decomposition.rate_effect >= 0 ? "+" : ""}
            {formatMetricValue(decomposition.rate_effect, metricFormat)}
          </div>
          <span className="text-[11px] text-[var(--text-muted)] leading-tight">
            Changes in price or rate within individual segments.
          </span>
        </div>
      </div>

      {/* Plain Language Summary */}
      {(decomposition.plain_language || decomposition.summary) && (
        <div
          className="text-[12px] text-[var(--text-main)] bg-[var(--bg-app)]/80 p-3 rounded-[4px] border border-[var(--border-hairline)]/70 leading-relaxed font-sans"
          data-testid="ratio-plain-words"
        >
          <span className="font-semibold block text-[11px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
            Deterministic Decomposition Narrative
          </span>
          {decomposition.plain_language || decomposition.summary}
        </div>
      )}
    </div>
  );
}
