"use client";

import * as React from "react";
import { Check, Lock } from "lucide-react";

export type StepStatus = "done" | "current" | "blocked" | "upcoming";

export interface StepItem {
  id: string;
  name: string;
  status: StepStatus;
  reason?: string;
}

export interface StepIndicatorProps {
  steps: StepItem[];
  onStepClick?: (stepId: string, index: number) => void;
  className?: string;
}

export function StepIndicator({ steps, onStepClick, className = "" }: StepIndicatorProps) {
  return (
    <nav
      aria-label="Workflow progress"
      className={`w-full rounded-[6px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 shadow-xs ${className}`}
      data-testid="workflow-step-indicator"
    >
      <ol className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-3">
        {steps.map((step, index) => {
          const isDone = step.status === "done";
          const isCurrent = step.status === "current";
          const isBlocked = step.status === "blocked";
          const isClickable = !isBlocked && !!onStepClick;

          let badgeStyles = "border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-muted)]";
          let borderHighlight = "border-[var(--border-hairline)]";

          if (isDone) {
            badgeStyles = "border-[var(--trend-up)]/30 bg-[var(--trend-up-subtle)] text-[var(--trend-up)]";
            borderHighlight = "border-[var(--trend-up)]/30 bg-[var(--trend-up-subtle)]/10";
          } else if (isCurrent) {
            badgeStyles = "border-[var(--accent)] bg-[var(--accent)] text-white";
            borderHighlight = "border-[var(--accent)] bg-[var(--accent-subtle)]/40";
          } else if (isBlocked) {
            badgeStyles = "border-dashed border-[var(--border-hairline)] bg-[var(--bg-subtle)]/60 text-[var(--text-muted)]/60";
            borderHighlight = "border-[var(--border-hairline)]/60 opacity-60";
          }

          return (
            <li
              key={step.id}
              className={`relative flex flex-col justify-between p-2.5 rounded-[4px] border transition-all ${borderHighlight} ${
                isClickable ? "cursor-pointer hover:border-[var(--border-strong)]" : ""
              }`}
              onClick={() => {
                if (isClickable) {
                  onStepClick(step.id, index);
                }
              }}
              data-testid={`step-${step.id}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-mono font-medium border ${badgeStyles}`}
                    data-testid={`step-${step.id}-badge`}
                  >
                    {isDone ? (
                      <Check className="h-3 w-3 stroke-[2.5]" />
                    ) : isBlocked ? (
                      <Lock className="h-2.5 w-2.5" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={`text-[13px] font-medium tracking-tight ${
                      isCurrent
                        ? "text-[var(--text-main)] font-semibold"
                        : isDone
                        ? "text-[var(--text-main)]"
                        : "text-[var(--text-muted)]"
                    }`}
                  >
                    {step.name}
                  </span>
                </div>

                {/* Status chip */}
                <span
                  className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded tracking-wider ${
                    isDone
                      ? "text-[var(--trend-up)] font-medium"
                      : isCurrent
                      ? "text-[var(--accent-text)] font-semibold"
                      : isBlocked
                      ? "text-[var(--text-muted)] font-normal"
                      : "text-[var(--text-muted)] font-normal"
                  }`}
                  data-testid={`step-${step.id}-status`}
                >
                  {step.status}
                </span>
              </div>

              {step.reason && (
                <p
                  className="text-[11px] text-[var(--text-muted)] leading-tight truncate"
                  title={step.reason}
                  data-testid={`step-${step.id}-reason`}
                >
                  {step.reason}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
