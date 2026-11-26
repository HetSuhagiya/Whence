"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, ConnectionPublic, DashboardPublic, ModelPublic } from "@/lib/api";

export interface CreateDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: ConnectionPublic[];
  defaultConnectionId?: string;
  defaultName?: string;
  onSuccess?: (dashboard: DashboardPublic) => void;
}

export function CreateDashboardDialog({
  open,
  onOpenChange,
  connections,
  defaultConnectionId,
  defaultName = "",
  onSuccess,
}: CreateDashboardDialogProps) {
  const router = useRouter();
  const [selectedConnectionId, setSelectedConnectionId] = React.useState<string>(
    defaultConnectionId || connections[0]?.id || ""
  );
  const [dashboardName, setDashboardName] = React.useState(defaultName);
  const [isCreating, setIsCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [model, setModel] = React.useState<ModelPublic | null>(null);

  React.useEffect(() => {
    if (open && selectedConnectionId && typeof api?.listModels === "function") {
      api
        .listModels(selectedConnectionId)
        .then((models) => setModel(models[0] || null))
        .catch(() => setModel(null));
    } else if (!open) {
      setModel(null);
    }
  }, [open, selectedConnectionId]);

  React.useEffect(() => {
    if (defaultConnectionId) {
      setSelectedConnectionId(defaultConnectionId);
    } else if (connections.length > 0 && !selectedConnectionId) {
      setSelectedConnectionId(connections[0].id);
    }
  }, [defaultConnectionId, connections, selectedConnectionId]);

  React.useEffect(() => {
    if (open) {
      setDashboardName(defaultName);
      setCreateError(null);
    }
  }, [open, defaultName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConnectionId) {
      setCreateError("Please select a data connection.");
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      const created = await api.createDashboard({
        connection_id: selectedConnectionId,
        name: dashboardName.trim() || undefined,
      });
      onOpenChange(false);
      setDashboardName("");
      if (onSuccess) {
        onSuccess(created);
      }
      router.push(`/dashboards/${created.id}`);
    } catch (err: unknown) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create dashboard"
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="create-dashboard-dialog">
        <DialogHeader>
          <DialogTitle>Create analytical dashboard</DialogTitle>
          <DialogDescription>
            Generate a full dashboard preconfigured with editorial charts, period comparisons, and click-to-explain analytics.
          </DialogDescription>
        </DialogHeader>

        {createError && (
          <div className="p-3 text-[12px] rounded-[4px] border border-[var(--trend-down)] bg-[var(--trend-down-subtle)] text-[var(--trend-down)]">
            {createError}
            {createError.includes("No confirmed semantic model") && (
              <div className="mt-2">
                <Link
                  href={`/data?tab=model&connection_id=${selectedConnectionId}`}
                  onClick={() => onOpenChange(false)}
                  className="font-medium underline hover:text-[var(--text-main)]"
                >
                  Go to Data page to confirm default ecommerce set →
                </Link>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
              Dashboard name (optional)
            </label>
            <input
              type="text"
              value={dashboardName}
              onChange={(e) => setDashboardName(e.target.value)}
              placeholder="e.g. Ecommerce Performance"
              className="w-full px-3 py-1.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)] text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
              data-testid="input-dashboard-name"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[var(--text-main)] mb-1">
              Select warehouse data source
            </label>
            {connections.length > 0 ? (
              <select
                value={selectedConnectionId}
                onChange={(e) => setSelectedConnectionId(e.target.value)}
                className="w-full px-3 py-1.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)] text-[13px] text-[var(--text-main)] outline-none focus:border-[var(--accent)] cursor-pointer"
                data-testid="select-connection"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.warehouse_type})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-[12px] text-[var(--trend-down)]">
                No connections found. Please connect DuckDB or BigQuery first.
              </p>
            )}
            {model && (
              <div className="mt-3 p-3 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-app)] text-[12px] flex flex-col gap-2" data-testid="dashboard-model-preview">
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                  <span className="font-medium text-[var(--text-main)]">Model: {model.name}</span>
                  <span>{model.metrics.length} metrics · {model.dimensions.length} dimensions</span>
                </div>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {model.metrics.map((m) => (
                    <span
                      key={m.id}
                      className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-main)] font-mono"
                    >
                      {m.name}
                      {m.metric_type === "ratio" && <span className="text-[var(--text-muted)] ml-1">(ratio)</span>}
                    </span>
                  ))}
                  {model.dimensions.map((d) => (
                    <span
                      key={d.id}
                      className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-muted)] font-mono"
                    >
                      {d.name}
                      {d.is_custom && <span className="text-[var(--accent)] ml-1 font-semibold">(custom)</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
              Builds the standard demo charts dynamically on this confirmed warehouse model.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isCreating}
              disabled={isCreating || connections.length === 0}
              className="cursor-pointer"
              data-testid="btn-submit-create-dashboard"
            >
              Build dashboard
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
