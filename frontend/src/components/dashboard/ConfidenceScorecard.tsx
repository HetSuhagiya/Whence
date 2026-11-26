"use client";

import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";

export interface ConfidenceCheckItem {
  name: string;
  category: string;
  status: "pass" | "warning" | "fail" | string;
  score: number;
  description: string;
}

interface ConfidenceScorecardProps {
  breakdown: ConfidenceCheckItem[];
  overallConfidence: "High" | "Medium" | "Low";
  confidenceReason?: string;
}

export function ConfidenceScorecard({
  breakdown,
  overallConfidence,
  confidenceReason,
}: ConfidenceScorecardProps) {
  if (!breakdown || breakdown.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      data-testid="confidence-scorecard"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-[13px] font-medium text-[var(--text-main)]">
            Statistical Confidence Breakdown
          </span>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider ${
            overallConfidence === "High"
              ? "bg-[var(--trend-up-subtle)] text-[var(--trend-up)] border border-[var(--trend-up)]/30"
              : overallConfidence === "Medium"
              ? "bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30"
              : "bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)]"
          }`}
          data-testid="scorecard-overall-badge"
        >
          {overallConfidence} Confidence
        </span>
      </div>

      {confidenceReason && (
        <p className="text-[12px] text-[var(--text-muted)] italic">
          {confidenceReason}
        </p>
      )}

      {/* Itemized scorecard table/list */}
      <div className="flex flex-col divide-y divide-[var(--border-hairline)]/70 rounded-[3px] border border-[var(--border-hairline)] bg-[var(--bg-app)]/30 overflow-hidden text-[12px]">
        {breakdown.map((item, idx) => {
          const isPass = item.status === "pass";
          const isFail = item.status === "fail";
          return (
            <div
              key={item.name || idx}
              className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[var(--bg-subtle)]/50 transition-colors"
              data-testid={`scorecard-row-${idx}`}
            >
              <div className="flex items-start gap-2.5">
                {isPass ? (
                  <CheckCircle2 className="h-4 w-4 text-[var(--trend-up)] shrink-0 mt-0.5" />
                ) : isFail ? (
                  <AlertCircle className="h-4 w-4 text-[var(--trend-down)] shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-medium text-[var(--text-main)]">
                    {item.name}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-snug">
                    {item.description}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                <span
                  className={`inline-block px-2 py-0.5 rounded-[2px] text-[10px] font-semibold uppercase tracking-wider ${
                    isPass
                      ? "bg-[var(--trend-up-subtle)] text-[var(--trend-up)]"
                      : isFail
                      ? "bg-[var(--trend-down-subtle)] text-[var(--trend-down)]"
                      : "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {item.status}
                </span>
                <span className="font-mono text-[11px] text-[var(--text-muted)] w-8 text-right">
                  {item.score}/100
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
