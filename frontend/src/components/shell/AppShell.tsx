"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Database,
  CalendarDays,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  dashboardTitle?: string;
}

export function AppShell({ children, dashboardTitle = "Executive Revenue & Drivers" }: AppShellProps) {
  const [isCollapsed, setIsCollapsed] = React.useState<boolean>(false);
  const [isDark, setIsDark] = React.useState<boolean>(false);
  const pathname = usePathname();

  // Initialize theme from localStorage or document class
  React.useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
  };

  const navItems = [
    { label: "Dashboards", href: "/", icon: LayoutDashboard },
    { label: "Data", href: "/data", icon: Database },
    { label: "Events", href: "/events", icon: CalendarDays },
    { label: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-main)] font-ui">
      {/* Left Rail */}
      <aside
        className={cn(
          "h-full border-r border-[var(--border-hairline)] bg-[var(--bg-surface)] flex flex-col justify-between transition-all duration-200 select-none z-30 shrink-0",
          isCollapsed ? "w-[56px]" : "w-[220px]"
        )}
      >
        {/* Brand Wordmark & Nav */}
        <div className="flex flex-col">
          {/* Header with lowercase whence in Newsreader */}
          <div className="h-14 border-b border-[var(--border-hairline)] flex items-center justify-between px-3.5">
            <Link
              href="/"
              className={cn(
                "font-wordmark text-[24px] text-[var(--text-main)] hover:opacity-80 transition-opacity flex items-center overflow-hidden",
                isCollapsed && "justify-center w-full"
              )}
            >
              {isCollapsed ? "w" : "whence"}
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="p-2 flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={isCollapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-3 px-2.5 py-2 rounded-[4px] text-[13px] font-medium transition-subtle group",
                    isActive
                      ? "bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold"
                      : "text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)]"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-[var(--accent)]")} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Rail Footer with Collapse Toggle */}
        <div className="p-2 border-t border-[var(--border-hairline)] flex items-center justify-between">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-full flex items-center justify-center p-1.5 rounded-[4px] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-subtle"
            aria-label={isCollapsed ? "Expand left rail" : "Collapse left rail"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <div className="flex items-center justify-between w-full px-2 text-[12px]">
                <span>Collapse rail</span>
                <ChevronLeft className="h-4 w-4" />
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 h-full min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-6 flex items-center justify-between z-20 shrink-0">
          {/* Title & Context */}
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-heading text-[18px] font-medium text-[var(--text-main)] truncate">
              {dashboardTitle}
            </h1>
            <span className="hidden sm:inline-block text-[12px] px-2 py-0.5 border border-[var(--border-hairline)] rounded-[3px] text-[var(--text-muted)] font-mono">
              demo_ecommerce
            </span>
          </div>

          {/* Top Bar Actions: Global Filters & Theme Toggle */}
          <div className="flex items-center gap-3">
            {/* Global filter indicator */}
            <div className="hidden md:flex items-center gap-2 text-[12px] text-[var(--text-muted)] px-2.5 py-1 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-app)]">
              <Filter className="h-3.5 w-3.5" />
              <span>Last 30 days</span>
              <span className="text-[var(--border-hairline)]">|</span>
              <span>All channels</span>
            </div>

            {/* Light / Dark Mode Toggle */}
            <button
              onClick={toggleTheme}
              className="h-8 w-8 flex items-center justify-center rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-subtle cursor-pointer"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* 12-Column Canvas Grid */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-[1440px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
