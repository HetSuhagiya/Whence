"use client";

import * as React from "react";
import { Bar } from "react-chartjs-2";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { CHART_COLORS, formatMetricValue } from "./chartConfig";
import type { ChartOptions, TooltipItem } from "chart.js";

interface DriverFinding {
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

interface EvidenceIssue {
  description: string;
  id?: string;
  issue_type?: string;
  dimension?: string;
  severity?: string;
}

interface EvidenceCheck {
  name: string;
  status: string;
  message?: string;
}

interface EvidenceWindow {
  start?: string;
  end?: string;
}

interface EvidencePayload {
  confidence: "High" | "Medium" | "Low";
  confidence_reason: string;
  data_quality_issues?: EvidenceIssue[];
  drivers?: DriverFinding[];
  checks_run?: EvidenceCheck[];
  metric_name?: string;
  baseline_value?: number;
  current_value?: number;
  total_change?: number;
  delta?: number;
  percent_change?: number;
  pct_change?: number;
  noise_mad?: number;
  normal_range_lower?: number;
  normal_range_upper?: number;
  baseline_window?: EvidenceWindow;
  current_window?: EvidenceWindow;
  has_offsetting_effects?: boolean;
}

interface NarrativePayload {
  headline: string;
  supporting_sentences: string[];
  caveats?: string[];
  is_fallback?: boolean;
  fallback_reason?: string;
}

export interface ExplainCompletedPayload {
  event?: string;
  evidence: EvidencePayload;
  narrative: NarrativePayload;
  chart?: Record<string, unknown>;
}

interface ExplainDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dashboardId: string;
  chartId: string;
  targetPoint?: string;
  baselineMode: "previous_period" | "same_weekday_last_week" | "same_period_last_year" | "trailing_average";
  onBaselineModeChange: (mode: "previous_period" | "same_weekday_last_week" | "same_period_last_year" | "trailing_average") => void;
  initialCompletedData?: ExplainCompletedPayload; // For test harness / mocks
}

interface StepProgress {
  step: number;
  name: string;
  title: string;
  status: "pending" | "running" | "completed";
  detail?: string;
}

export function ExplainDialog({
  isOpen,
  onClose,
  dashboardId,
  chartId,
  targetPoint,
  baselineMode,
  onBaselineModeChange,
  initialCompletedData,
}: ExplainDialogProps) {
  const [activeTab, setActiveTab] = React.useState<"summary" | "evidence" | "checks">("summary");
  const [drilledSegment, setDrilledSegment] = React.useState<string | null>(null);
  const [copiedText, setCopiedText] = React.useState(false);
  const [copiedSqlId, setCopiedSqlId] = React.useState<string | null>(null);

  // Streaming State
  const [isLoading, setIsLoading] = React.useState(!initialCompletedData);
  const [error, setError] = React.useState<string | null>(null);
  const [completedPayload, setCompletedPayload] = React.useState<ExplainCompletedPayload | null>(initialCompletedData || null);
  const [pipelineSteps, setPipelineSteps] = React.useState<StepProgress[]>([
    { step: 1, name: "resolve", title: "Resolve comparison windows", status: "pending" },
    { step: 2, name: "completeness", title: "Check reporting completeness & lag", status: "pending" },
    { step: 3, name: "noise", title: "Evaluate normal volatility (Median / MAD)", status: "pending" },
    { step: 4, name: "seasonality", title: "Verify weekday & seasonal cycles", status: "pending" },
    { step: 5, name: "drivers", title: "Search dimension drivers & exact contribution", status: "pending" },
    { step: 6, name: "drill", title: "Two-way segment interaction search", status: "pending" },
    { step: 7, name: "data_quality", title: "Scan for duplicate loads, zero drops & null spikes", status: "pending" },
    { step: 8, name: "events", title: "Correlate external calendar events", status: "pending" },
    { step: 9, name: "confidence", title: "Score statistical confidence & assemble evidence", status: "pending" },
    { step: 10, name: "narrative", title: "Generate & verify plain narrative", status: "pending" },
  ]);

  // Connect to SSE stream
  React.useEffect(() => {
    if (!isOpen || initialCompletedData) return;

    setIsLoading(true);
    setError(null);
    setCompletedPayload(null);
    setDrilledSegment(null);

    // Reset steps
    setPipelineSteps((prev) =>
      prev.map((s) => ({ ...s, status: "pending", detail: undefined }))
    );

    const abortController = new AbortController();

    async function startStream() {
      try {
        const res = await fetch(
          `/api/v1/dashboards/${dashboardId}/charts/${chartId}/explain`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              target_point: targetPoint || null,
              baseline_mode: baselineMode,
            }),
            signal: abortController.signal,
          }
        );

        if (!res.ok) {
          throw new Error(`Failed to initialize explanation stream (HTTP ${res.status})`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream available.");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              try {
                const eventData = JSON.parse(trimmed.slice(6));
                handleStreamEvent(eventData);
              } catch (e) {
                console.error("Error parsing SSE JSON:", e);
              }
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // Normal user cancellation on dialog close
          return;
        }
        setError(err instanceof Error ? err.message : "Explain pipeline error");
        setIsLoading(false);
      }
    }

    startStream();

    return () => {
      abortController.abort();
    };
  }, [isOpen, dashboardId, chartId, targetPoint, baselineMode, initialCompletedData]);

  const handleStreamEvent = (data: { event: string; step?: number; detail?: string; message?: string; evidence?: EvidencePayload; narrative?: NarrativePayload }) => {
    if (data.event === "step_start") {
      setPipelineSteps((prev) =>
        prev.map((s) => (s.step === data.step ? { ...s, status: "running" } : s))
      );
    } else if (data.event === "step_complete") {
      setPipelineSteps((prev) =>
        prev.map((s) =>
          s.step === data.step
            ? { ...s, status: "completed", detail: data.detail }
            : s
        )
      );
    } else if (data.event === "completed") {
      setCompletedPayload(data as unknown as ExplainCompletedPayload);
      setIsLoading(false);
    } else if (data.event === "error") {
      setError(data.message || "Unknown engine error");
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const evidence = completedPayload?.evidence;
  const narrative = completedPayload?.narrative;
  const confidence = evidence?.confidence || "Medium";

  // Check for severe data quality flags
  const dqIssues = evidence?.data_quality_issues || [];
  const hasDataIssue = dqIssues.length > 0;

  // Waterfall Chart Data
  const driversList: DriverFinding[] = evidence?.drivers || [];
  const waterfallLabels = driversList.map((d: DriverFinding) => String(d.segment_value));
  const waterfallValues = driversList.map((d: DriverFinding) => Number(d.contribution_amount || 0));
  const waterfallColors = waterfallValues.map((v: number) =>
    v >= 0 ? CHART_COLORS.waterfallUp : CHART_COLORS.waterfallDown
  );

  const waterfallData = {
    labels: waterfallLabels,
    datasets: [
      {
        label: "Contribution",
        data: waterfallValues,
        backgroundColor: waterfallColors,
        borderWidth: 0,
        borderRadius: 2,
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
            const d = driversList[ctx.dataIndex];
            const share = d ? ` (${(d.share_of_change * 100).toFixed(1)}% of change)` : "";
            return ` Contribution: ${formatMetricValue(Number(ctx.parsed.y || 0), "currency")}${share}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: CHART_COLORS.textMuted, font: { size: 11 } },
      },
      y: {
        grid: { color: "rgba(205, 206, 214, 0.2)" },
        ticks: {
          color: CHART_COLORS.textMuted,
          callback: (v: string | number) => formatMetricValue(Number(v), "currency"),
        },
      },
    },
  };

  // Copy narrative as text
  const handleCopyNarrative = () => {
    if (narrative) {
      const full = `${narrative.headline}\n\n${narrative.supporting_sentences.join(" ")}\n\n${(narrative.caveats || []).join("\n")}`;
      navigator.clipboard.writeText(full);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  // Copy SQL
  const handleCopySql = (sql: string, id: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSqlId(id);
    setTimeout(() => setCopiedSqlId(null), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="explain-dialog-title"
    >
      <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-[6px] shadow-overlay w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-hairline)] bg-[var(--bg-app)]/50 shrink-0">
          <div className="flex items-center gap-3">
            {drilledSegment ? (
              <button
                type="button"
                onClick={() => setDrilledSegment(null)}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>All dimensions</span>
                <span>/</span>
                <span className="font-semibold text-[var(--text-main)]">{drilledSegment}</span>
              </button>
            ) : (
              <div>
                <h2
                  id="explain-dialog-title"
                  className="font-heading text-[17px] font-medium text-[var(--text-main)]"
                >
                  Explain {evidence?.metric_name || "metric"}
                </h2>
                <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)] mt-0.5">
                  <span>Compared against:</span>
                  <select
                    value={baselineMode}
                    onChange={(e) => onBaselineModeChange(e.target.value as "previous_period" | "same_weekday_last_week" | "same_period_last_year" | "trailing_average")}
                    className="bg-transparent font-medium text-[var(--text-main)] border-b border-[var(--border-hairline)] outline-none cursor-pointer text-[12px] py-0.5"
                  >
                    <option value="previous_period">Previous period</option>
                    <option value="same_weekday_last_week">Same weekday last week</option>
                    <option value="same_period_last_year">Same period last year</option>
                    <option value="trailing_average">Trailing 4-week average</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {narrative && (
              <button
                type="button"
                onClick={handleCopyNarrative}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-subtle)] text-[var(--text-main)] cursor-pointer shadow-sm"
              >
                {copiedText ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[var(--trend-up)]" />
                    <span>Copied text</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span>Copy text</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-[4px] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-subtle"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {/* Progress State (SSE streaming checklist) */}
          {isLoading && (
            <div className="flex flex-col gap-4 py-8 max-w-lg mx-auto w-full">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
                <span className="font-heading text-[15px] font-medium text-[var(--text-main)]">
                  Running 10-step explain pipeline...
                </span>
              </div>

              <div className="flex flex-col gap-2 rounded-[4px] border border-[var(--border-hairline)] p-4 bg-[var(--bg-app)]/30">
                {pipelineSteps.map((step) => (
                  <div
                    key={step.step}
                    className="flex items-center justify-between text-[12px] py-1 border-b border-[var(--border-hairline)]/40 last:border-b-0"
                  >
                    <div className="flex items-center gap-2.5">
                      {step.status === "completed" ? (
                        <CheckCircle2 className="h-4 w-4 text-[var(--trend-up)] shrink-0" />
                      ) : step.status === "running" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--accent)] shrink-0" />
                      ) : (
                        <span className="h-3.5 w-3.5 rounded-full border border-[var(--border-hairline)] inline-block shrink-0" />
                      )}
                      <span
                        className={
                          step.status === "completed"
                            ? "font-medium text-[var(--text-main)]"
                            : step.status === "running"
                            ? "font-medium text-[var(--accent-text)]"
                            : "text-[var(--text-muted)]"
                        }
                      >
                        {step.title}
                      </span>
                    </div>

                    {step.detail && (
                      <span className="text-[11px] font-mono text-[var(--text-muted)] truncate max-w-[200px]">
                        {step.detail}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 rounded-[4px] border border-[var(--trend-down)] bg-[var(--trend-down-subtle)] text-[var(--trend-down)] flex items-start gap-3 text-[13px]">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Explain pipeline halted</p>
                <p className="mt-1 text-[12px]">{error}</p>
              </div>
            </div>
          )}

          {/* Result State */}
          {!isLoading && !error && evidence && (
            <>
              {/* Data Issue Banner (Prominent if present) */}
              {hasDataIssue && (
                <div
                  className="p-3.5 rounded-[4px] border border-amber-300 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 flex items-start gap-3 text-[13px]"
                  data-testid="data-issue-banner"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Data Quality Irregularity Flagged: </span>
                    <span>{dqIssues.map((i: EvidenceIssue) => i.description).join("; ")}. Attribution is marked with Low confidence.</span>
                  </div>
                </div>
              )}

              {/* Confidence & Headline Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)]">
                <div className="flex-1">
                  <h3
                    className="font-heading text-[16px] font-medium text-[var(--text-main)]"
                    data-testid="explain-headline"
                  >
                    {narrative?.headline || "Analysis completed"}
                  </h3>
                  <p className="text-[12px] text-[var(--text-muted)] mt-1">
                    {evidence.confidence_reason}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-center">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-[4px] text-[12px] font-semibold border ${
                      confidence === "High"
                        ? "bg-[var(--trend-up-subtle)] text-[var(--trend-up)] border-[var(--trend-up)]/30"
                        : confidence === "Medium"
                        ? "bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900/30"
                        : "bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border-hairline)]"
                    }`}
                    data-testid={`confidence-badge-${confidence.toLowerCase()}`}
                  >
                    {confidence} Confidence
                  </span>
                </div>
              </div>

              {/* Driver Waterfall & Ranked List Side-by-Side (Only when drivers exist) */}
              {driversList.length > 0 && !hasDataIssue && confidence !== "Low" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
                  {/* Waterfall Chart */}
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] font-medium text-[var(--text-main)]">
                        Driver waterfall
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Floating bars (#59A14F / #E15759)
                      </span>
                    </div>
                    <div className="h-[200px] w-full">
                      <Bar data={waterfallData} options={waterfallOptions} />
                    </div>
                  </div>

                  {/* Ranked List */}
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium text-[var(--text-main)] mb-2">
                      Ranked driver contributions
                    </span>
                    <div className="flex flex-col divide-y divide-[var(--border-hairline)] overflow-y-auto max-h-[200px] text-[12px]">
                      {driversList.map((d: DriverFinding, idx: number) => (
                        <div
                          key={d.id || idx}
                          className="py-2 flex items-center justify-between hover:bg-[var(--bg-subtle)] px-2 rounded-[2px]"
                        >
                          <div>
                            <span className="font-semibold text-[var(--text-main)]">
                              {d.segment_value}
                            </span>
                            <span className="text-[11px] text-[var(--text-muted)] ml-2">
                              in {d.dimension}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span
                              className={`font-mono font-medium ${
                                d.contribution_amount >= 0
                                  ? "text-[var(--trend-up)]"
                                  : "text-[var(--trend-down)]"
                              }`}
                            >
                              {d.contribution_amount >= 0 ? "+" : ""}
                              {formatMetricValue(d.contribution_amount, "currency")}
                            </span>
                            <span className="text-[11px] font-mono text-[var(--text-muted)] w-12 text-right">
                              {(d.share_of_change * 100).toFixed(1)}%
                            </span>
                            <button
                              type="button"
                              onClick={() => setDrilledSegment(d.segment_value)}
                              className="text-[11px] text-[var(--accent-text)] hover:underline cursor-pointer"
                            >
                              Drill in
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Calm "no single cause stands out" notice */
                <div
                  className="p-6 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-center flex flex-col items-center justify-center"
                  data-testid="no-single-cause-notice"
                >
                  <Info className="h-5 w-5 text-[var(--text-muted)] mb-2" />
                  <p className="font-heading text-[15px] font-medium text-[var(--text-main)]">
                    No single cause stands out
                  </p>
                  <p className="text-[13px] text-[var(--text-muted)] mt-1 max-w-md">
                    {evidence.confidence_reason ||
                      "The movement is distributed broadly across monitored categories and within normal historical noise."}
                  </p>
                </div>
              )}

              {/* Tabs: Summary, Evidence, Data checks */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] pb-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("summary")}
                    className={`px-3 py-1.5 text-[13px] font-medium border-b-2 transition-subtle cursor-pointer ${
                      activeTab === "summary"
                        ? "border-[var(--accent)] text-[var(--text-main)] font-semibold"
                        : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    }`}
                  >
                    Summary
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("evidence")}
                    className={`px-3 py-1.5 text-[13px] font-medium border-b-2 transition-subtle cursor-pointer ${
                      activeTab === "evidence"
                        ? "border-[var(--accent)] text-[var(--text-main)] font-semibold"
                        : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    }`}
                  >
                    Evidence
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("checks")}
                    className={`px-3 py-1.5 text-[13px] font-medium border-b-2 transition-subtle cursor-pointer ${
                      activeTab === "checks"
                        ? "border-[var(--accent)] text-[var(--text-main)] font-semibold"
                        : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    }`}
                  >
                    Data checks
                  </button>
                </div>

                {/* Tab 1: Summary */}
                {activeTab === "summary" && (
                  <div className="flex flex-col gap-3 text-[13px] leading-relaxed text-[var(--text-main)]">
                    <p className="font-medium">{narrative?.headline}</p>
                    <div className="flex flex-col gap-1.5 text-[var(--text-muted)]">
                      {narrative?.supporting_sentences?.map((s: string, idx: number) => (
                        <p key={idx}>• {s}</p>
                      ))}
                    </div>

                    {narrative?.caveats && narrative.caveats.length > 0 && (
                      <div className="mt-2 p-3 bg-[var(--bg-app)] rounded-[4px] border border-[var(--border-hairline)] text-[12px] text-[var(--text-muted)] flex flex-col gap-1">
                        <span className="font-semibold text-[var(--text-main)]">Caveats & observations:</span>
                        {narrative.caveats.map((c: string, idx: number) => (
                          <span key={idx}>- {c}</span>
                        ))}
                      </div>
                    )}

                    {/* Fallback Note */}
                    {narrative?.is_fallback && (
                      <div className="mt-1 text-[11px] text-[var(--text-muted)] italic" data-testid="fallback-note">
                        Summary written without a language model
                        {narrative.fallback_reason ? ` (${narrative.fallback_reason})` : ""}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Evidence */}
                {activeTab === "evidence" && (
                  <div className="flex flex-col gap-4 text-[12px]">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-[var(--bg-app)] rounded-[4px] border border-[var(--border-hairline)]">
                      <div>
                        <span className="text-[var(--text-muted)] block text-[11px]">Baseline period</span>
                        <span className="font-mono font-medium">{evidence.baseline_window?.start} to {evidence.baseline_window?.end}</span>
                        <span className="block font-mono text-[var(--text-main)] mt-0.5">{formatMetricValue(Number(evidence.baseline_value || 0), "currency")}</span>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)] block text-[11px]">Current period</span>
                        <span className="font-mono font-medium">{evidence.current_window?.start} to {evidence.current_window?.end}</span>
                        <span className="block font-mono text-[var(--text-main)] mt-0.5">{formatMetricValue(Number(evidence.current_value || 0), "currency")}</span>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)] block text-[11px]">Delta</span>
                        <span className="font-mono font-medium">{formatMetricValue(Number(evidence.delta || 0), "currency")}</span>
                        <span className="block font-mono text-[var(--text-muted)] mt-0.5">{(evidence.percent_change ?? 0) >= 0 ? "+" : ""}{(evidence.percent_change ?? 0).toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-[var(--text-muted)] block text-[11px]">Offsetting effects</span>
                        <span className="font-mono font-medium">{evidence.has_offsetting_effects ? "Detected" : "None"}</span>
                      </div>
                    </div>

                    {/* SQL per finding */}
                    {driversList.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="font-medium text-[var(--text-main)]">Verification SQL queries:</span>
                        {driversList.slice(0, 2).map((d: DriverFinding, idx: number) => (
                          <div key={d.id || idx} className="relative">
                            <pre className="p-3 bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                              {d.sql || `SELECT ${d.dimension}, SUM(sale_price) FROM orders GROUP BY 1`}
                            </pre>
                            <button
                              type="button"
                              onClick={() => handleCopySql(d.sql || `SELECT ${d.dimension}, SUM(sale_price) FROM orders GROUP BY 1`, d.id || String(idx))}
                              className="absolute top-2 right-2 px-2 py-0.5 text-[10px] bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded cursor-pointer hover:bg-[var(--bg-subtle)]"
                            >
                              {copiedSqlId === (d.id || String(idx)) ? "Copied" : "Copy SQL"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 3: Data checks */}
                {activeTab === "checks" && (
                  <div className="flex flex-col gap-3 text-[12px]">
                    <span className="font-medium text-[var(--text-main)]">Automated pipeline check outcomes:</span>
                    <div className="flex flex-col divide-y divide-[var(--border-hairline)] border border-[var(--border-hairline)] rounded-[4px] overflow-hidden">
                      {evidence.checks_run?.map((check: EvidenceCheck, idx: number) => (
                        <div key={idx} className="p-2.5 flex items-center justify-between bg-[var(--bg-surface)]">
                          <div className="flex items-center gap-2">
                            {check.status === "pass" ? (
                              <CheckCircle2 className="h-4 w-4 text-[var(--trend-up)]" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                            )}
                            <span className="font-medium text-[var(--text-main)]">{check.name}</span>
                          </div>
                          <span className="text-[11px] text-[var(--text-muted)] font-mono">{check.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
