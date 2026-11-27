"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Info,
  Plus,
  RefreshCw,
  Settings,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import {
  api,
  ChartRunResult,
  DashboardChartPublic,
  DashboardPublic,
  ModelPublic,
} from "@/lib/api";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ExplainDialog } from "@/components/dashboard/ExplainDialog";
import { AddChartModal } from "@/components/dashboard/AddChartModal";
import { Button } from "@/components/ui/button";

export default function DashboardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dashboardId = params?.id as string;

  const [dashboard, setDashboard] = React.useState<DashboardPublic | null>(null);
  const [model, setModel] = React.useState<ModelPublic | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Global Date Range
  const [dateRange, setDateRange] = React.useState<string>("last_30_days");
  const [customStart, setCustomStart] = React.useState<string>("");
  const [customEnd, setCustomEnd] = React.useState<string>("");
  const [anchorDate, setAnchorDate] = React.useState<string | null>(null);

  // Chart Runs State: { chartId: ChartRunResult }
  const [chartResults, setChartResults] = React.useState<Record<string, ChartRunResult>>({});
  const [chartLoading, setChartLoading] = React.useState<Record<string, boolean>>({});
  const [chartErrors, setChartErrors] = React.useState<Record<string, string>>({});

  // Explain Dialog State & Persistent Explained Markers State
  const [explainChart, setExplainChart] = React.useState<DashboardChartPublic | null>(null);
  const [explainPoint, setExplainPoint] = React.useState<string | undefined>(undefined);
  const [baselineMode, setBaselineMode] = React.useState<"previous_period" | "same_weekday_last_week" | "same_period_last_year" | "trailing_average">("previous_period");
  const [explainedPointsByChart, setExplainedPointsByChart] = React.useState<Record<string, Set<string>>>({});

  // Add & Delete Chart State
  const [isAddChartOpen, setIsAddChartOpen] = React.useState(false);
  const [chartToDelete, setChartToDelete] = React.useState<DashboardChartPublic | null>(null);
  const [isDeletingChart, setIsDeletingChart] = React.useState(false);

  // Load Dashboard Metadata
  const loadDashboard = React.useCallback(async () => {
    if (!dashboardId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDashboard(dashboardId);
      setDashboard(data);
      if (data.model_id) {
        api.getModel(data.model_id).then((m) => {
          setModel(m);
          if (m?.anchor_date) setAnchorDate(m.anchor_date);
        }).catch(() => {});
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [dashboardId]);

  React.useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Execute all charts when dashboard or dateRange changes
  const executeCharts = React.useCallback(async () => {
    if (!dashboard || !dashboard.charts) return;

    for (const chart of dashboard.charts) {
      setChartLoading((prev) => ({ ...prev, [chart.id]: true }));
      setChartErrors((prev) => ({ ...prev, [chart.id]: "" }));

      const runParams: { date_range?: string | Record<string, string>; start_date?: string; end_date?: string } = {};
      if (dateRange === "custom") {
        if (customStart && customEnd) {
          runParams.date_range = { start: customStart, end: customEnd };
          runParams.start_date = customStart;
          runParams.end_date = customEnd;
        } else {
          runParams.date_range = "last_30_days";
        }
      } else {
        runParams.date_range = dateRange;
      }

      api
        .runDashboardChart(dashboard.id, chart.id, runParams)
        .then((res) => {
          setChartResults((prev) => ({ ...prev, [chart.id]: res }));
        })
        .catch((err) => {
          setChartErrors((prev) => ({
            ...prev,
            [chart.id]: err instanceof Error ? err.message : "Failed to run chart",
          }));
        })
        .finally(() => {
          setChartLoading((prev) => ({ ...prev, [chart.id]: false }));
        });
    }
  }, [dashboard, dateRange, customStart, customEnd]);

  React.useEffect(() => {
    if (dashboard) {
      executeCharts();
    }
  }, [dashboard, executeCharts]);

  const handleOpenExplain = (chart: DashboardChartPublic, point?: string) => {
    setExplainChart(chart);
    setExplainPoint(point);
    if (point) {
      setExplainedPointsByChart((prev) => {
        const nextSet = new Set(prev[chart.id] || []);
        nextSet.add(point);
        return { ...prev, [chart.id]: nextSet };
      });
    }
  };

  const handleCloseExplain = () => {
    setExplainChart(null);
    setExplainPoint(undefined);
  };

  const handleChartAdded = (newChart: DashboardChartPublic) => {
    setDashboard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        charts: [...(prev.charts || []), newChart],
      };
    });
  };

  const handleDeleteChart = async () => {
    if (!dashboard || !chartToDelete) return;
    setIsDeletingChart(true);
    try {
      await api.deleteDashboardChart(dashboard.id, chartToDelete.id);
      setDashboard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          charts: (prev.charts || []).filter((c) => c.id !== chartToDelete.id),
        };
      });
      setChartToDelete(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to remove chart");
    } finally {
      setIsDeletingChart(false);
    }
  };

  const failedChartsCount = Object.values(chartErrors).filter(Boolean).length;

  return (
    <AppShell dashboardTitle={dashboard?.name || "Dashboard"}>
      <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
        {/* Top Failure Banner when charts fail */}
        {failedChartsCount > 0 && (
          <div
            className="p-3 rounded-[4px] border border-[var(--trend-down)] bg-[var(--trend-down-subtle)] text-[var(--trend-down)] text-[13px] flex items-center justify-between"
            data-testid="dashboard-error-banner"
            role="alert"
          >
            <span>
              {failedChartsCount} {failedChartsCount === 1 ? "chart" : "charts"} failed to load. Check the fix notes below.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={executeCharts}
              className="cursor-pointer text-[12px] h-7 px-2"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-heading text-[22px] font-medium text-[var(--text-main)]">
                {dashboard?.name || "Loading..."}
              </h1>
              {dashboard && (
                <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-muted)] font-medium uppercase">
                  {dashboard.warehouse_type} • {dashboard.connection_name}
                </span>
              )}
            </div>
            <p className="text-[13px] text-[var(--text-muted)] mt-1">
              {dashboard?.model_description || `Model: ${dashboard?.model_name || "Warehouse Model"}${dashboard?.primary_time_column ? ` · Primary time: ${dashboard.primary_time_column}` : ""}`}
            </p>
          </div>

          {/* Working Date Range & Refresh Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[13px]">
              <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="bg-transparent font-medium text-[var(--text-main)] outline-none cursor-pointer"
                aria-label="Filter date range"
              >
                <option value="last_7_days">
                  {anchorDate
                    ? `Last 7 days (to ${new Date(anchorDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})`
                    : "Last 7 days"}
                </option>
                <option value="last_30_days">
                  {anchorDate
                    ? `Last 30 days of data (to ${new Date(anchorDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})`
                    : "Last 30 days"}
                </option>
                <option value="last_90_days">
                  {anchorDate
                    ? `Last 90 days (to ${new Date(anchorDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})`
                    : "Last 90 days"}
                </option>
                <option value="all_time">All available time</option>
                <option value="custom">Custom date range...</option>
              </select>
            </div>

            {dateRange === "custom" && (
              <div className="flex items-center gap-2 text-[13px] bg-[var(--bg-surface)] px-3 py-1 rounded-[4px] border border-[var(--border-hairline)]">
                <label className="text-[var(--text-muted)] text-[12px]">From</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-transparent border border-[var(--border-hairline)] rounded px-1.5 py-0.5 text-[var(--text-main)] outline-none text-[12px]"
                  aria-label="Custom start date"
                />
                <label className="text-[var(--text-muted)] text-[12px]">To</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-transparent border border-[var(--border-hairline)] rounded px-1.5 py-0.5 text-[var(--text-main)] outline-none text-[12px]"
                  aria-label="Custom end date"
                />
              </div>
            )}

            {anchorDate && (
              <span className="text-[12px] text-[var(--text-muted)] font-mono">
                Anchor: {anchorDate}
              </span>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={executeCharts}
              className="cursor-pointer"
              aria-label="Refresh dashboard data"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              <span>Refresh</span>
            </Button>

            {dashboard && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddChartOpen(true)}
                className="cursor-pointer"
                data-testid="btn-add-chart"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                <span>Add chart</span>
              </Button>
            )}

            {dashboard && (
              <Link
                href={`/data?tab=model&connection_id=${dashboard.connection_id}`}
                data-testid="btn-edit-data-definitions"
              >
                <Button variant="outline" size="sm" className="cursor-pointer">
                  <Settings className="h-3.5 w-3.5 mr-1.5" />
                  <span>Edit data definitions</span>
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="p-5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] h-[320px] flex flex-col justify-between"
              >
                <div className="h-4 w-1/3 bg-[var(--bg-subtle)] rounded animate-pulse" />
                <div className="h-44 w-full bg-[var(--bg-subtle)] rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-[var(--bg-subtle)] rounded animate-pulse" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="p-6 rounded-[4px] border border-[var(--trend-down)] bg-[var(--trend-down-subtle)] text-[var(--trend-down)] text-center flex flex-col items-center">
            <p className="font-semibold">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/")}
              className="mt-3 cursor-pointer"
            >
              Back to dashboards
            </Button>
          </div>
        )}

        {/* Editorial Charts Layout: Hero chart full width, remaining in 2-column grid */}
        {!loading && !error && dashboard && (
          <div className="flex flex-col gap-8">
            {dashboard.charts && dashboard.charts.length > 0 && (
              <div className="flex flex-col gap-6">
                {/* Hero Chart (First chart spans full width) */}
                <div className="w-full">
                  <ChartCard
                    key={dashboard.charts[0].id}
                    chart={dashboard.charts[0]}
                    runResult={chartResults[dashboard.charts[0].id] || null}
                    loading={chartLoading[dashboard.charts[0].id] || false}
                    error={chartErrors[dashboard.charts[0].id] || null}
                    showHint={true}
                    isHero={true}
                    explainedPoints={explainedPointsByChart[dashboard.charts[0].id] || new Set()}
                    onExplain={handleOpenExplain}
                    onDelete={setChartToDelete}
                  />
                </div>

                {/* Remaining charts formatted in a balanced two-column grid */}
                {dashboard.charts.length > 1 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    {dashboard.charts.slice(1).map((chart) => (
                      <ChartCard
                        key={chart.id}
                        chart={chart}
                        runResult={chartResults[chart.id] || null}
                        loading={chartLoading[chart.id] || false}
                        error={chartErrors[chart.id] || null}
                        showHint={false}
                        isHero={false}
                        explainedPoints={explainedPointsByChart[chart.id] || new Set()}
                        onExplain={handleOpenExplain}
                        onDelete={setChartToDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Skipped Charts Section */}
            {dashboard.skipped_charts && dashboard.skipped_charts.length > 0 && (
              <div className="flex flex-col gap-3 mt-2" data-testid="skipped-charts-section">
                <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-muted)]">
                  <Info className="h-4 w-4" />
                  <span>Skipped charts ({dashboard.skipped_charts.length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {dashboard.skipped_charts.map((note, index) => (
                    <div
                      key={index}
                      className="p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-subtle)] flex flex-col gap-1.5"
                      data-testid="skipped-chart-note"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-[13px] font-semibold text-[var(--text-main)]">
                          {note.title}
                        </h4>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-hairline)]">
                          Skipped
                        </span>
                      </div>
                      <p className="text-[12px] text-[var(--text-muted)]">{note.reason}</p>
                      <p className="text-[12px] text-[var(--text-dim)] italic">
                        <span className="font-medium not-italic">Suggestion: </span>
                        {note.suggestion}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Explain Dialog */}
        {explainChart && dashboard && (
          <ExplainDialog
            isOpen={true}
            onClose={handleCloseExplain}
            dashboardId={dashboard.id}
            chartId={explainChart.id}
            targetPoint={explainPoint}
            baselineMode={baselineMode}
            onBaselineModeChange={setBaselineMode}
            dateRange={dateRange === "custom" && customStart && customEnd ? { start: customStart, end: customEnd } : dateRange}
            startDate={dateRange === "custom" ? customStart : undefined}
            endDate={dateRange === "custom" ? customEnd : undefined}
          />
        )}

        {/* Add Chart Modal */}
        {dashboard && (
          <AddChartModal
            open={isAddChartOpen}
            onOpenChange={setIsAddChartOpen}
            dashboardId={dashboard.id}
            model={model}
            onChartAdded={handleChartAdded}
          />
        )}

        {/* Remove Chart Confirmation Modal */}
        {chartToDelete && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-chart-title"
          >
            <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-lg shadow-xl p-5 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
              <div>
                <h3 id="delete-chart-title" className="font-heading text-[16px] font-semibold text-[var(--text-main)]">
                  Remove chart?
                </h3>
                <p className="text-[13px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
                  Are you sure you want to remove <span className="font-semibold text-[var(--text-main)]">&quot;{chartToDelete.title}&quot;</span> from this dashboard?
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setChartToDelete(null)}
                  disabled={isDeletingChart}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteChart}
                  disabled={isDeletingChart}
                  className="cursor-pointer"
                  data-testid="btn-confirm-delete-chart"
                >
                  {isDeletingChart ? "Removing..." : "Remove chart"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
