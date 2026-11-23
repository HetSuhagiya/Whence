"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Calendar,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import {
  api,
  ChartRunResult,
  DashboardChartPublic,
  DashboardPublic,
} from "@/lib/api";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ExplainDialog } from "@/components/dashboard/ExplainDialog";
import { Button } from "@/components/ui/button";

export default function DashboardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dashboardId = params?.id as string;

  const [dashboard, setDashboard] = React.useState<DashboardPublic | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Global Date Range
  const [dateRange, setDateRange] = React.useState<string>("last_30_days");

  // Chart Runs State: { chartId: ChartRunResult }
  const [chartResults, setChartResults] = React.useState<Record<string, ChartRunResult>>({});
  const [chartLoading, setChartLoading] = React.useState<Record<string, boolean>>({});
  const [chartErrors, setChartErrors] = React.useState<Record<string, string>>({});

  // Explain Dialog State
  const [explainChart, setExplainChart] = React.useState<DashboardChartPublic | null>(null);
  const [explainPoint, setExplainPoint] = React.useState<string | undefined>(undefined);
  const [baselineMode, setBaselineMode] = React.useState<"previous_period" | "same_weekday_last_week" | "same_period_last_year" | "trailing_average">("previous_period");

  // Load Dashboard Metadata
  const loadDashboard = React.useCallback(async () => {
    if (!dashboardId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDashboard(dashboardId);
      setDashboard(data);
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

      api
        .runDashboardChart(dashboard.id, chart.id, { date_range: dateRange })
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
  }, [dashboard, dateRange]);

  React.useEffect(() => {
    if (dashboard) {
      executeCharts();
    }
  }, [dashboard, executeCharts]);

  const handleOpenExplain = (chart: DashboardChartPublic, point?: string) => {
    setExplainChart(chart);
    setExplainPoint(point);
  };

  const handleCloseExplain = () => {
    setExplainChart(null);
    setExplainPoint(undefined);
  };

  return (
    <AppShell dashboardTitle={dashboard?.name || "Dashboard"}>
      <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
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
              Deterministic click-to-explain ecommerce analytics. Click any data point to trigger automated diagnosis.
            </p>
          </div>

          {/* Working Date Range & Refresh Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[13px]">
              <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="bg-transparent font-medium text-[var(--text-main)] outline-none cursor-pointer"
                aria-label="Filter date range"
              >
                <option value="last_7_days">Last 7 days</option>
                <option value="last_30_days">Last 30 days</option>
                <option value="last_90_days">Last 90 days</option>
                <option value="all_time">All available time</option>
              </select>
            </div>

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

        {/* 5-Chart Grid */}
        {!loading && !error && dashboard && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {dashboard.charts.map((chart, idx) => (
              <ChartCard
                key={chart.id}
                chart={chart}
                runResult={chartResults[chart.id] || null}
                loading={chartLoading[chart.id] || false}
                error={chartErrors[chart.id] || null}
                showHint={idx === 0}
                onExplain={handleOpenExplain}
              />
            ))}
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
          />
        )}
      </div>
    </AppShell>
  );
}
