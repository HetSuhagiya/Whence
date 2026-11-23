import * as React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "rect" | "circle" | "text" | "kpi" | "chart" | "driver";
}

export function Skeleton({ className, variant = "rect", ...props }: SkeletonProps) {
  const baseAnimation = "animate-pulse bg-[var(--bg-subtle)] rounded-[4px]";

  if (variant === "kpi") {
    return (
      <div className={cn("p-4 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)] flex flex-col gap-3", className)}>
        <div className="h-3.5 w-24 bg-[var(--bg-subtle)] rounded-[2px] animate-pulse" />
        <div className="h-7 w-32 bg-[var(--bg-subtle)] rounded-[2px] animate-pulse" />
        <div className="h-3 w-40 bg-[var(--bg-subtle)] rounded-[2px] animate-pulse" />
      </div>
    );
  }

  if (variant === "chart") {
    return (
      <div className={cn("p-4 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)] flex flex-col gap-4", className)}>
        <div className="flex justify-between items-center">
          <div className="h-4 w-36 bg-[var(--bg-subtle)] rounded-[2px] animate-pulse" />
          <div className="h-6 w-16 bg-[var(--bg-subtle)] rounded-[2px] animate-pulse" />
        </div>
        <div className="h-48 w-full bg-[var(--bg-subtle)]/60 rounded-[4px] animate-pulse flex items-end gap-2 p-3">
          <div className="h-16 w-full bg-[var(--bg-subtle)] rounded-t-[2px]" />
          <div className="h-28 w-full bg-[var(--bg-subtle)] rounded-t-[2px]" />
          <div className="h-20 w-full bg-[var(--bg-subtle)] rounded-t-[2px]" />
          <div className="h-36 w-full bg-[var(--bg-subtle)] rounded-t-[2px]" />
          <div className="h-24 w-full bg-[var(--bg-subtle)] rounded-t-[2px]" />
          <div className="h-40 w-full bg-[var(--bg-subtle)] rounded-t-[2px]" />
        </div>
      </div>
    );
  }

  if (variant === "driver") {
    return (
      <div className={cn("flex flex-col gap-2 p-2", className)}>
        <div className="flex justify-between">
          <div className="h-3.5 w-24 bg-[var(--bg-subtle)] rounded animate-pulse" />
          <div className="h-3.5 w-12 bg-[var(--bg-subtle)] rounded animate-pulse" />
        </div>
        <div className="h-2 w-full bg-[var(--bg-subtle)] rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        baseAnimation,
        variant === "circle" && "rounded-full",
        variant === "text" && "h-4 w-full rounded-[2px]",
        className
      )}
      {...props}
    />
  );
}
