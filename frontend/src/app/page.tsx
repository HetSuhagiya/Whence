"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Database,
  Plus,
  Trash2,
} from "lucide-react";
import { CreateDashboardDialog } from "@/components/dashboard/CreateDashboardDialog";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { api, ConnectionPublic, DashboardPublic } from "@/lib/api";

export default function DashboardsPage() {
  const [dashboards, setDashboards] = React.useState<DashboardPublic[]>([]);
  const [connections, setConnections] = React.useState<ConnectionPublic[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Create Dashboard Dialog
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = React.useState<string>("");

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashList, connList] = await Promise.all([
        api.listDashboards(),
        api.listConnections(),
      ]);
      setDashboards(dashList);
      setConnections(connList);
      if (connList.length > 0 && !selectedConnectionId) {
        setSelectedConnectionId(connList[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load dashboards");
    } finally {
      setLoading(false);
    }
  }, [selectedConnectionId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteDashboard = async (id: string, name: string) => {
    if (!confirm(`Delete dashboard "${name}"?`)) return;
    try {
      await api.deleteDashboard(id);
      setDashboards((prev) => prev.filter((d) => d.id !== id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete dashboard");
    }
  };

  return (
    <AppShell dashboardTitle="Dashboards">
      <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
        {/* Dashboards Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-4">
          <div>
            <h1 className="font-heading text-[20px] font-medium text-[var(--text-main)]">
              All dashboards
            </h1>
            <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
              Deterministic click-to-explain ecommerce analytics.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {dashboards.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateOpen(true)}
                className="cursor-pointer"
                data-testid="btn-create-dashboard"
              >
                <Plus className="h-4 w-4 mr-1" />
                <span>Create dashboard</span>
              </Button>
            )}
            <Link href="/data">
              <Button variant="outline" size="sm" className="cursor-pointer">
                <Database className="h-4 w-4 mr-1.5" />
                <span>Data sources</span>
              </Button>
            </Link>
          </div>
        </div>

        {error && (
          <div className="p-3 text-[13px] rounded-[4px] border border-[var(--trend-down)] bg-[var(--trend-down-subtle)] text-[var(--trend-down)]">
            {error}
          </div>
        )}

        {/* Empty State: exactly one sentence with one button as specified when 0 dashboards */}
        {!loading && dashboards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)]">
            <div className="h-10 w-10 rounded-[4px] bg-[var(--bg-app)] border border-[var(--border-hairline)] flex items-center justify-center text-[var(--text-muted)] mb-4">
              <Database className="h-5 w-5" />
            </div>
            <p className="text-[14px] text-[var(--text-muted)] max-w-md mb-5">
              Connect a data source to build your first dashboard
            </p>
            {connections.length > 0 ? (
              <Button
                variant="primary"
                onClick={() => setIsCreateOpen(true)}
                className="cursor-pointer"
                data-testid="btn-create-first-dashboard"
              >
                Create dashboard
              </Button>
            ) : (
              <Link href="/data">
                <Button variant="primary" className="cursor-pointer" data-testid="btn-connect-warehouse">
                  Connect your warehouse
                </Button>
              </Link>
            )}
          </div>
        )}

        {/* Dashboards Grid */}
        {!loading && dashboards.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {dashboards.map((dash) => (
              <div
                key={dash.id}
                className="group flex flex-col justify-between p-5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] transition-all shadow-sm"
                data-testid={`dashboard-card-${dash.id}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-muted)] font-semibold uppercase">
                      {dash.warehouse_type}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteDashboard(dash.id, dash.name)}
                      className="text-[var(--text-muted)] hover:text-[var(--trend-down)] p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="Delete dashboard"
                      aria-label={`Delete ${dash.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <h3 className="font-heading text-[16px] font-medium text-[var(--text-main)] group-hover:text-[var(--accent-text)] transition-colors">
                    {dash.name}
                  </h3>
                  <p className="text-[12px] text-[var(--text-muted)] mt-1 truncate">
                    Source: {dash.connection_name}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]/75 mt-0.5">
                    5 analytical charts • Click-to-explain enabled
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-[var(--border-hairline)] flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-muted)] font-mono">
                    {new Date(dash.created_at * 1000).toLocaleDateString()}
                  </span>
                  <Link href={`/dashboards/${dash.id}`}>
                    <Button variant="outline" size="sm" className="cursor-pointer text-[12px]">
                      <span>Open</span>
                      <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Dashboard Dialog */}
        <CreateDashboardDialog
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          connections={connections}
          defaultConnectionId={selectedConnectionId}
        />
      </div>
    </AppShell>
  );
}
