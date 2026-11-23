"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Database } from "lucide-react";

export default function DashboardsPage() {
  return (
    <AppShell dashboardTitle="Dashboards">
      <div className="flex flex-col gap-6">
        {/* Dashboards Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-4">
          <div>
            <h2 className="font-heading text-[20px] font-medium text-[var(--text-main)]">
              All dashboards
            </h2>
            <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
              Select or create an analytical dashboard.
            </p>
          </div>
          <Link href="/data">
            <Button variant="primary" size="sm">
              New dashboard
            </Button>
          </Link>
        </div>

        {/* Empty State: exactly one sentence with one button as specified */}
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)]">
          <div className="h-10 w-10 rounded-[4px] bg-[var(--bg-app)] border border-[var(--border-hairline)] flex items-center justify-center text-[var(--text-muted)] mb-4">
            <Database className="h-5 w-5" />
          </div>
          <p className="text-[14px] text-[var(--text-muted)] max-w-md mb-5">
            Connect a data source to build your first dashboard
          </p>
          <Link href="/data">
            <Button variant="primary">
              Connect a data source
            </Button>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
