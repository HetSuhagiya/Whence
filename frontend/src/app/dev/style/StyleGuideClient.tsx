"use client";

import * as React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartEvent,
  ActiveElement,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import {
  Search,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Info,
  ChevronRight,
  CornerDownRight,
  Copy,
} from "lucide-react";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function StyleGuideClient() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [drillBreadcrumb, setDrillBreadcrumb] = React.useState<string[]>(["All dimensions"]);
  const [toastOpen, setToastOpen] = React.useState(false);
  const [toastVariant, setToastVariant] = React.useState<"default" | "success" | "destructive">("default");
  const [toastMessage, setToastMessage] = React.useState({ title: "", desc: "" });

  const triggerToast = (variant: "default" | "success" | "destructive", title: string, desc: string) => {
    setToastVariant(variant);
    setToastMessage({ title, desc });
    setToastOpen(false);
    setTimeout(() => setToastOpen(true), 50);
  };

  // 10 Chart series palette in order (#4E79A7 first)
  const chartSeriesColors = [
    { num: 1, hex: "#4E79A7", name: "Classic Blue (Default)" },
    { num: 2, hex: "#F28E2B", name: "Amber Orange" },
    { num: 3, hex: "#E15759", name: "Coral Red" },
    { num: 4, hex: "#76B7B2", name: "Muted Cyan" },
    { num: 5, hex: "#59A14F", name: "Meadow Green" },
    { num: 6, hex: "#EDC948", name: "Golden Yellow" },
    { num: 7, hex: "#B07AA1", name: "Soft Purple" },
    { num: 8, hex: "#FF9DA7", name: "Blush Pink" },
    { num: 9, hex: "#9C755F", name: "Earth Brown" },
    { num: 10, hex: "#BAB0AC", name: "Silver Grey" },
  ];

  // Contrast measurements calculated according to WCAG 2.1 specs
  const contrastPairs = [
    { text: "slate12 (#1c2024)", bg: "slate1 / white", ratio: "16.39:1", status: "Pass AAA", mode: "Light text" },
    { text: "slate11 (#60646c)", bg: "slate1 / white", ratio: "5.94:1", status: "Pass AA", mode: "Light text" },
    { text: "blue11 (#0d74ce)", bg: "slate1 / white", ratio: "4.77:1", status: "Pass AA", mode: "Light text" },
    { text: "green11 (#218358)", bg: "slate1 / white", ratio: "4.72:1", status: "Pass AA", mode: "Light text" },
    { text: "red11 (#ce2c31)", bg: "slate1 / white", ratio: "5.21:1", status: "Pass AA", mode: "Light text" },
    { text: "white (#ffffff)", bg: "blue11 (#0d74ce)", ratio: "4.77:1", status: "Pass AA", mode: "Light solid accent" },
    { text: "white (#ffffff)", bg: "green11 (#218358)", ratio: "4.72:1", status: "Pass AA", mode: "Light solid status" },
    { text: "white (#ffffff)", bg: "red11 (#ce2c31)", ratio: "5.21:1", status: "Pass AA", mode: "Light solid status" },
    { text: "slateDark12 (#edeef0)", bg: "slateDark1 (#111113)", ratio: "16.25:1", status: "Pass AAA", mode: "Dark text" },
    { text: "slateDark11 (#b0b4ba)", bg: "slateDark1 (#111113)", ratio: "9.06:1", status: "Pass AAA", mode: "Dark text" },
    { text: "blueDark11 (#70b8ff)", bg: "slateDark1 (#111113)", ratio: "8.97:1", status: "Pass AAA", mode: "Dark text" },
    { text: "greenDark11 (#3dd68c)", bg: "slateDark1 (#111113)", ratio: "10.06:1", status: "Pass AAA", mode: "Dark text" },
    { text: "redDark11 (#ff9592)", bg: "slateDark1 (#111113)", ratio: "8.95:1", status: "Pass AAA", mode: "Dark text" },
    { text: "slateDark12 (#111113)", bg: "blueDark9 (#0090ff)", ratio: "5.78:1", status: "Pass AA", mode: "Dark solid accent" },
    { text: "slateDark12 (#111113)", bg: "greenDark11 (#3dd68c)", ratio: "10.06:1", status: "Pass AAA", mode: "Dark solid status" },
    { text: "slateDark12 (#111113)", bg: "redDark11 (#ff9592)", ratio: "8.95:1", status: "Pass AAA", mode: "Dark solid status" },
  ];

  // Typography scale with explicit font family classes
  const typographyScale = [
    { size: "36 px", class: "text-[36px] font-newsreader", font: "Newsreader", weight: "Regular", sample: "Revenue fell 8.4% last week" },
    { size: "28 px", class: "text-[28px] font-newsreader", font: "Newsreader", weight: "Medium", sample: "Category mix shift analysis" },
    { size: "20 px", class: "text-[20px] font-newsreader", font: "Newsreader", weight: "Medium", sample: "Why average order value changed" },
    { size: "16 px", class: "text-[16px] font-instrument", font: "Instrument Sans", weight: "Regular", sample: "Primary metric explanation paragraph and drivers" },
    { size: "14 px", class: "text-[14px] font-instrument", font: "Instrument Sans", weight: "Medium", sample: "UI controls, button labels, and table body" },
    { size: "13 px", class: "text-[13px] font-instrument", font: "Instrument Sans", weight: "Regular", sample: "Tab labels, dropdown options, and metadata" },
    { size: "12 px", class: "text-[12px] font-instrument", font: "Instrument Sans", weight: "Medium", sample: "Axis labels, timestamps, and confidence badges" },
  ];

  // Interactive Chart.js data
  const lineChartData = {
    labels: ["05 Nov", "06 Nov", "07 Nov", "08 Nov", "09 Nov", "10 Nov", "11 Nov"],
    datasets: [
      {
        label: "Revenue",
        data: [168000, 172000, 169000, 164000, 161000, 159000, 154800],
        borderColor: "#4E79A7",
        backgroundColor: "rgba(78, 121, 167, 0.08)",
        borderWidth: 2,
        fill: true,
        tension: 0.1,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: "#4E79A7",
      },
    ],
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event: ChartEvent, elements: ActiveElement[]) => {
      if (elements.length > 0) {
        setDialogOpen(true);
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1c2024",
        titleFont: { family: "Instrument Sans", size: 12 },
        bodyFont: { family: "JetBrains Mono", size: 12 },
        padding: 8,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#60646c", font: { family: "Instrument Sans", size: 11 } },
      },
      y: {
        grid: { color: "#e8e8ec" },
        ticks: {
          color: "#60646c",
          font: { family: "JetBrains Mono", size: 11 },
          callback: (value: number | string) => `$${Number(value) / 1000}k`,
        },
      },
    },
  };

  // Waterfall items with #59A14F for gains and #E15759 for losses
  const waterfallDrivers = drillBreadcrumb.length === 1
    ? [
        { name: "Apparel (CA)", delta: -9650, share: "68.0%", isLoss: true },
        { name: "Footwear (NY)", delta: -3400, share: "23.9%", isLoss: true },
        { name: "Accessories (TX)", delta: -2150, share: "15.1%", isLoss: true },
        { name: "Electronics (WA)", delta: 1000, share: "+7.0%", isLoss: false },
      ]
    : [
        { name: "Jackets & outerwear", delta: -6200, share: "64.2%", isLoss: true },
        { name: "Denim & trousers", delta: -2450, share: "25.4%", isLoss: true },
        { name: "Knitwear & tops", delta: -1000, share: "10.4%", isLoss: true },
      ];

  return (
    <ToastProvider>
      <AppShell dashboardTitle="Design system & style guide (dev only)">
        <div className="flex flex-col gap-10 pb-16">
          {/* Header */}
          <section className="border-b border-[var(--border-hairline)] pb-5">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-mono px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)]">
                dev only
              </span>
              <span className="text-[12px] text-[var(--text-muted)] font-mono">
                /dev/style • served in non-production or when ENABLE_STYLE_GUIDE=true
              </span>
            </div>
            <h2 className="font-newsreader text-[32px] text-[var(--text-main)] mt-2">
              Whence editorial design system
            </h2>
            <p className="mt-1 text-[14px] text-[var(--text-muted)] max-w-2xl leading-relaxed">
              Quiet analytical precision: Radix Slate neutrals, Radix Blue accent, Tableau 10 chart palette,
              dedicated waterfall bars (#59A14F and #E15759), and WCAG AA contrast measured.
            </p>
          </section>

          {/* 1. Radix Slate & Blue Tokens */}
          <section className="flex flex-col gap-4">
            <h3 className="font-newsreader text-[20px] font-medium text-[var(--text-main)]">
              1. Color foundations & tokens (Radix Slate & Blue)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <div className="p-3 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-app)]">
                <div className="text-[11px] font-mono text-[var(--text-muted)]">--bg-app (slate2)</div>
                <div className="text-[13px] font-medium mt-1">App background</div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1">#f9f9fb</div>
              </div>
              <div className="p-3 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)]">
                <div className="text-[11px] font-mono text-[var(--text-muted)]">--bg-surface</div>
                <div className="text-[13px] font-medium mt-1">Surface card</div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1">#ffffff</div>
              </div>
              <div className="p-3 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)]">
                <div className="text-[11px] font-mono text-[var(--text-muted)]">--text-main (slate12)</div>
                <div className="text-[13px] font-medium mt-1">Primary ink</div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1">#1c2024 (15.6:1)</div>
              </div>
              <div className="p-3 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)]">
                <div className="text-[11px] font-mono text-[var(--text-muted)]">--text-muted (slate11)</div>
                <div className="text-[13px] font-medium mt-1">Muted text</div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1">#60646c (5.94:1)</div>
              </div>
              <div className="p-3 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)]">
                <div className="text-[11px] font-mono text-[var(--text-muted)]">--border-hairline</div>
                <div className="text-[13px] font-medium mt-1">Hairline border</div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1">#cdced6 (slate7)</div>
              </div>
              <div className="p-3 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--accent)] text-white">
                <div className="text-[11px] font-mono opacity-80">--accent (blue9)</div>
                <div className="text-[13px] font-medium mt-1">Radix blue solid</div>
                <div className="text-[11px] font-mono opacity-80 mt-1">#0090ff</div>
              </div>
            </div>

            {/* Directional Movement & Waterfall Bars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-1">
              <div className="p-3.5 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)]">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Positive movement text
                </div>
                <div className="text-[18px] font-semibold text-[var(--trend-up)] flex items-center gap-1.5 mt-1 tabular-nums">
                  <ArrowUpRight className="h-4 w-4" />
                  +14.2%
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1">Radix green11 (#218358)</div>
              </div>

              <div className="p-3.5 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)]">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Negative movement text
                </div>
                <div className="text-[18px] font-semibold text-[var(--trend-down)] flex items-center gap-1.5 mt-1 tabular-nums">
                  <ArrowDownRight className="h-4 w-4" />
                  -8.4%
                </div>
                <div className="text-[11px] font-mono text-[var(--text-muted)] mt-1">Radix red11 (#ce2c31)</div>
              </div>

              <div className="p-3.5 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)]">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Waterfall gain bar
                </div>
                <div className="h-6 w-full rounded-[2px] mt-2 flex items-center px-2 text-[11px] text-white font-mono" style={{ backgroundColor: "#59A14F" }}>
                  #59A14F
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1.5">Dedicated positive bar</div>
              </div>

              <div className="p-3.5 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)]">
                <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  Waterfall loss bar
                </div>
                <div className="h-6 w-full rounded-[2px] mt-2 flex items-center px-2 text-white text-[11px] font-mono" style={{ backgroundColor: "#E15759" }}>
                  #E15759
                </div>
                <div className="text-[11px] text-[var(--text-muted)] mt-1.5">Dedicated negative bar</div>
              </div>
            </div>
          </section>

          {/* 2. Measured WCAG AA Contrast Ratios */}
          <section className="flex flex-col gap-3">
            <h3 className="font-newsreader text-[20px] font-medium text-[var(--text-main)]">
              2. Measured WCAG AA contrast compliance
            </h3>
            <div className="border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)] overflow-hidden">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[var(--bg-subtle)] border-b border-[var(--border-hairline)] text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  <tr>
                    <th className="py-2 px-3">Mode</th>
                    <th className="py-2 px-3">Text element</th>
                    <th className="py-2 px-3">Background</th>
                    <th className="py-2 px-3">Measured contrast</th>
                    <th className="py-2 px-3">WCAG standard</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)] font-mono text-[12px]">
                  {contrastPairs.map((p) => (
                    <tr key={p.text + p.mode} className="hover:bg-[var(--bg-subtle)]/50">
                      <td className="py-2 px-3 font-sans text-[12px]">{p.mode}</td>
                      <td className="py-2 px-3">{p.text}</td>
                      <td className="py-2 px-3">{p.bg}</td>
                      <td className="py-2 px-3 font-semibold text-[var(--text-main)] tabular-nums">{p.ratio}</td>
                      <td className="py-2 px-3 text-[var(--trend-up)] font-sans">{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3. Chart Series Palette (10 colors) */}
          <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between border-b border-[var(--border-hairline)] pb-2">
              <h3 className="font-newsreader text-[20px] font-medium text-[var(--text-main)]">
                3. Chart series palette (in order)
              </h3>
              <span className="text-[12px] text-[var(--text-muted)]">
                Single color (#4E79A7) by default; breakdowns use additional colors in sequence
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {chartSeriesColors.map((color) => (
                <div
                  key={color.num}
                  className="p-3 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)] flex flex-col gap-1.5"
                >
                  <div
                    className="h-7 w-full rounded-[2px]"
                    style={{ backgroundColor: color.hex }}
                  />
                  <div className="flex justify-between items-center text-[12px] mt-1">
                    <span className="font-medium text-[var(--text-main)]">Slot {color.num}</span>
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">{color.hex}</span>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] truncate">{color.name}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 4. Real Chart.js Line Chart & Sample Waterfall */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Real Chart.js Line Chart */}
            <div className="p-5 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)] flex flex-col gap-3">
              <div className="flex justify-between items-baseline">
                <div>
                  <h4 className="font-newsreader text-[18px] font-medium text-[var(--text-main)]">
                    Revenue over time
                  </h4>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    Chart.js canvas with series color #4E79A7 • Click any point to open explain dialog
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                  Explain
                </Button>
              </div>

              <div className="h-56 w-full cursor-pointer relative">
                <Line data={lineChartData} options={lineChartOptions} />
              </div>
              <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 pt-2 border-t border-[var(--border-hairline)]">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>Tip: Click any point on the series to compare that period against baseline in the dialog.</span>
              </div>
            </div>

            {/* Sample Driver Waterfall */}
            <div className="p-5 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)] flex flex-col gap-3">
              <div className="flex justify-between items-baseline">
                <div>
                  <h4 className="font-newsreader text-[18px] font-medium text-[var(--text-main)]">
                    Driver waterfall sample
                  </h4>
                  <p className="text-[12px] text-[var(--text-muted)]">
                    Bars use #59A14F (gains) and #E15759 (losses) only
                  </p>
                </div>
                <span className="text-[12px] font-mono text-[var(--text-muted)]">
                  Total Δ -$14,200
                </span>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                {waterfallDrivers.map((driver) => {
                  const barWidth = `${Math.min(Math.abs(driver.delta) / 100, 100)}%`;
                  return (
                    <div key={driver.name} className="flex flex-col gap-1">
                      <div className="flex justify-between text-[12px]">
                        <span className="font-medium text-[var(--text-main)]">{driver.name}</span>
                        <div className="flex items-center gap-2 font-mono tabular-nums">
                          <span className={driver.isLoss ? "text-[var(--trend-down)]" : "text-[var(--trend-up)]"}>
                            {driver.delta > 0 ? `+$${driver.delta}` : `-$${Math.abs(driver.delta)}`}
                          </span>
                          <span className="text-[var(--text-muted)]">({driver.share})</span>
                        </div>
                      </div>
                      <div className="h-3 w-full bg-[var(--bg-subtle)] rounded-[2px] overflow-hidden flex">
                        <div
                          className="h-full rounded-[2px] transition-all duration-300"
                          style={{
                            width: barWidth,
                            backgroundColor: driver.isLoss ? "#E15759" : "#59A14F",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 5. Typography Scale (Self-Hosted Fonts Verified) */}
          <section className="flex flex-col gap-3">
            <h3 className="font-newsreader text-[20px] font-medium text-[var(--text-main)]">
              5. Typography scale (self-hosted fonts)
            </h3>
            <div className="border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)] divide-y divide-[var(--border-hairline)] overflow-hidden">
              {typographyScale.map((t) => (
                <div key={t.size} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="w-48 shrink-0 flex items-center gap-3">
                    <span className="font-mono text-[12px] text-[var(--text-muted)] w-14">
                      {t.size}
                    </span>
                    <span className="text-[12px] px-2 py-0.5 border border-[var(--border-hairline)] rounded-[2px] text-[var(--text-muted)] font-mono">
                      {t.font}
                    </span>
                  </div>
                  <div className={`flex-1 text-[var(--text-main)] ${t.class} truncate`}>
                    {t.sample}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 6. Base Components & Centred Explain Dialog */}
          <section className="flex flex-col gap-4">
            <h3 className="font-newsreader text-[20px] font-medium text-[var(--text-main)]">
              6. Base components & centred explain dialog
            </h3>

            <div className="p-5 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)] flex flex-col gap-4">
              <div className="text-[12px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
                Buttons, inputs, popovers & dialog trigger
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* Centred Explain Dialog Trigger */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="primary">Open centred explain dialog</Button>
                  </DialogTrigger>

                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Explain revenue movement</DialogTitle>
                      <DialogDescription>
                        Comparing 11 Nov 2026 with 4 Nov 2026 baseline window
                      </DialogDescription>
                    </DialogHeader>

                    {/* Dialog Main Content */}
                    <div className="flex flex-col gap-5 py-4">
                      {/* Top Headline & Confidence Rating */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-subtle)]/70">
                        <div>
                          <div className="text-[12px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
                            Headline finding
                          </div>
                          <div className="text-[15px] font-semibold text-[var(--text-main)] mt-0.5">
                            Revenue fell $14,200 (-8.4%) driven primarily by apparel in California
                          </div>
                        </div>

                        <div className="sm:text-right shrink-0">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] bg-[var(--trend-up-subtle)] text-[var(--trend-up)] text-[12px] font-medium border border-[var(--trend-up)]/30">
                            <CheckCircle2 className="h-3.5 w-3.5" /> High confidence (driver explains 68%)
                          </span>
                        </div>
                      </div>

                      {/* Breadcrumbs for Drill in */}
                      {drillBreadcrumb.length > 1 && (
                        <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
                          <button
                            onClick={() => setDrillBreadcrumb(["All dimensions"])}
                            className="hover:text-[var(--accent-text)] underline cursor-pointer"
                          >
                            All dimensions
                          </button>
                          <ChevronRight className="h-3 w-3" />
                          <span className="text-[var(--text-main)] font-medium">Apparel (CA)</span>
                        </div>
                      )}

                      {/* Side-by-side: Small chart copy + Waterfall & Ranked list */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Small Chart Copy with Windows Highlighted */}
                        <div className="p-3.5 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-app)] flex flex-col gap-2">
                          <div className="text-[12px] font-medium text-[var(--text-muted)]">
                            Series comparison (compared windows highlighted)
                          </div>
                          <div className="h-44 w-full">
                            <Line
                              data={{
                                labels: ["05 Nov", "06 Nov", "07 Nov", "08 Nov", "09 Nov", "10 Nov", "11 Nov"],
                                datasets: [
                                  {
                                    label: "Baseline (4 Nov)",
                                    data: [170000, 169000, 171000, 170000, 168000, 169500, 169000],
                                    borderColor: "#BAB0AC",
                                    borderDash: [4, 4],
                                    borderWidth: 1.5,
                                    pointRadius: 0,
                                  },
                                  {
                                    label: "Current (11 Nov)",
                                    data: [168000, 172000, 169000, 164000, 161000, 159000, 154800],
                                    borderColor: "#4E79A7",
                                    backgroundColor: "rgba(78, 121, 167, 0.1)",
                                    borderWidth: 2,
                                    fill: true,
                                    pointRadius: 3,
                                  },
                                ],
                              }}
                              options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { display: true, labels: { boxWidth: 12, font: { size: 10 } } } },
                                scales: { x: { grid: { display: false } }, y: { display: false } },
                              }}
                            />
                          </div>
                          <span className="text-[11px] text-[var(--text-muted)]">
                            Drop occurred between 08 Nov and 11 Nov (larger than 24 of last 26 periods).
                          </span>
                        </div>

                        {/* Waterfall & Ranked List */}
                        <div className="p-3.5 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-app)] flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-center text-[12px] font-medium text-[var(--text-muted)] mb-2">
                              <span>Ranked drivers</span>
                              <span>Share of change</span>
                            </div>

                            <div className="flex flex-col gap-2.5">
                              {waterfallDrivers.map((item) => (
                                <div key={item.name} className="flex flex-col gap-1">
                                  <div className="flex justify-between items-center text-[12px]">
                                    <span className="text-[var(--text-main)] font-medium">{item.name}</span>
                                    <div className="flex items-center gap-2 font-mono tabular-nums">
                                      <span className={item.isLoss ? "text-[var(--trend-down)]" : "text-[var(--trend-up)]"}>
                                        {item.delta > 0 ? `+$${item.delta}` : `-$${Math.abs(item.delta)}`}
                                      </span>
                                      <span className="text-[var(--text-muted)]">{item.share}</span>
                                    </div>
                                  </div>
                                  <div className="h-2 w-full bg-[var(--bg-subtle)] rounded-[2px] overflow-hidden flex">
                                    <div
                                      className="h-full rounded-[2px]"
                                      style={{
                                        width: `${Math.min(Math.abs(item.delta) / 100, 100)}%`,
                                        backgroundColor: item.isLoss ? "#E15759" : "#59A14F",
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Drill in Action button */}
                          <div className="pt-3 border-t border-[var(--border-hairline)] mt-3 flex justify-end">
                            {drillBreadcrumb.length === 1 ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setDrillBreadcrumb(["All dimensions", "Apparel (CA)"])}
                              >
                                <CornerDownRight className="h-3.5 w-3.5 mr-1" />
                                Drill in: Apparel (CA)
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDrillBreadcrumb(["All dimensions"])}
                              >
                                Back to all dimensions
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Tabs below: Summary / Evidence / Data checks */}
                      <Tabs defaultValue="summary" className="w-full">
                        <TabsList>
                          <TabsTrigger value="summary">Summary</TabsTrigger>
                          <TabsTrigger value="evidence">Evidence</TabsTrigger>
                          <TabsTrigger value="data_checks">Data checks</TabsTrigger>
                        </TabsList>

                        <TabsContent value="summary" className="text-[13px] text-[var(--text-main)] py-2 leading-relaxed">
                          Revenue fell by $14,200 (-8.4%) compared with 04 Nov 2026. 
                          The primary driver was Apparel in California, which decreased by $9,650 and accounted for 68.0% of the net decline. 
                          Footwear in New York (-$3,400, 23.9%) and Accessories in Texas (-$2,150, 15.1%) also contributed downward, partially offset by gains in Electronics in Washington (+$1,000, +7.0%).
                        </TabsContent>

                        <TabsContent value="evidence" className="py-2 flex flex-col gap-2">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px] font-mono">
                            <div className="p-2 border border-[var(--border-hairline)] rounded bg-[var(--bg-subtle)]">
                              <span className="text-[var(--text-muted)] block text-[10px]">CURRENT WINDOW</span>
                              11 Nov 2026
                            </div>
                            <div className="p-2 border border-[var(--border-hairline)] rounded bg-[var(--bg-subtle)]">
                              <span className="text-[var(--text-muted)] block text-[10px]">BASELINE WINDOW</span>
                              04 Nov 2026
                            </div>
                            <div className="p-2 border border-[var(--border-hairline)] rounded bg-[var(--bg-subtle)]">
                              <span className="text-[var(--text-muted)] block text-[10px]">DIMENSIONS SCANNED</span>
                              7 checked
                            </div>
                            <div className="p-2 border border-[var(--border-hairline)] rounded bg-[var(--bg-subtle)]">
                              <span className="text-[var(--text-muted)] block text-[10px]">DRY RUN SCAN</span>
                              4.2 MB (0.004 GB)
                            </div>
                          </div>

                          <div className="relative mt-1">
                            <pre className="font-mono text-[12px] bg-[var(--bg-subtle)] p-3 rounded border border-[var(--border-hairline)] overflow-x-auto text-[var(--text-main)]">
{`SELECT 
    category,
    customer_state,
    SUM(CASE WHEN date = '2026-11-11' THEN amount ELSE 0 END) -
    SUM(CASE WHEN date = '2026-11-04' THEN amount ELSE 0 END) AS delta_amount
FROM orders
WHERE date IN ('2026-11-11', '2026-11-04')
GROUP BY 1, 2
ORDER BY ABS(delta_amount) DESC;`}
                            </pre>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="absolute top-2 right-2 text-[11px]"
                              onClick={() => triggerToast("default", "SQL copied", "Query copied to clipboard.")}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Copy
                            </Button>
                          </div>
                        </TabsContent>

                        <TabsContent value="data_checks" className="text-[13px] py-2 text-[var(--text-main)]">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 text-[12px] text-[var(--trend-up)]">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>Completeness check: full period (no missing hours or partial days).</span>
                            </div>
                            <div className="flex items-center gap-2 text-[12px] text-[var(--trend-up)]">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>Continuity check: zero row-count discontinuities or null spikes.</span>
                            </div>
                            <div className="flex items-center gap-2 text-[12px] text-[var(--trend-up)]">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>Support check: all ranked segments contain &gt; 50 distinct orders.</span>
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Other base components */}
                <Button variant="secondary">Secondary button</Button>
                <Button variant="outline">Outline button</Button>
                <Button variant="ghost">Ghost button</Button>
                <Button variant="destructive">Destructive button</Button>
                <Button variant="primary" isLoading>Processing</Button>
              </div>

              {/* Form Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <Input
                  label="Search dimensions"
                  placeholder="e.g. channel, state..."
                  icon={<Search className="h-3.5 w-3.5" />}
                />
                <Input
                  label="Scan byte limit (GB)"
                  type="number"
                  defaultValue="10"
                  helperText="Enforced on dry-run before query execution"
                />
                <div>
                  <label className="text-[12px] font-medium text-[var(--text-muted)] tracking-wide uppercase block mb-1.5">
                    Warehouse dialect
                  </label>
                  <Select defaultValue="duckdb">
                    <SelectTrigger>
                      <SelectValue placeholder="Select dialect" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="duckdb">DuckDB (local / demo & eval)</SelectItem>
                      <SelectItem value="bigquery">Google BigQuery (production)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Global Toast */}
        <Toast open={toastOpen} onOpenChange={setToastOpen} variant={toastVariant}>
          <div className="flex flex-col gap-0.5">
            <ToastTitle>{toastMessage.title}</ToastTitle>
            <ToastDescription>{toastMessage.desc}</ToastDescription>
          </div>
          <ToastClose />
        </Toast>
        <ToastViewport />
      </AppShell>
    </ToastProvider>
  );
}
