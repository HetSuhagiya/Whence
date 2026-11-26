"use client";

import * as React from "react";
import { Bar } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import { CHART_COLORS, formatMetricValue } from "./chartConfig";

export interface WaterfallItem {
  name: string;
  amount: number;
  isLoss?: boolean;
}

interface ExplainWaterfallProps {
  items: WaterfallItem[];
  metricFormat?: string;
  isDark?: boolean;
}

export function ExplainWaterfall({
  items,
  metricFormat = "currency",
  isDark = false,
}: ExplainWaterfallProps) {
  const upColor = isDark ? CHART_COLORS.waterfallUpDark : CHART_COLORS.waterfallUp;
  const downColor = isDark ? CHART_COLORS.waterfallDownDark : CHART_COLORS.waterfallDown;

  const labels = items.map((i) => i.name);
  const values = items.map((i) => i.amount);
  const backgroundColors = items.map((i) =>
    (i.isLoss !== undefined ? i.isLoss : i.amount < 0) ? downColor : upColor
  );

  const data = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: backgroundColors,
        borderRadius: 2,
        borderWidth: 0,
      },
    ],
  };

  const options: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDark ? "#1f2937" : "#111827",
        titleColor: "#ffffff",
        bodyColor: "#ffffff",
        padding: 8,
        cornerRadius: 4,
        callbacks: {
          label: (ctx) => {
            const val = Number(ctx.parsed.x);
            return ` Contribution: ${val >= 0 ? "+" : ""}${formatMetricValue(val, metricFormat)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: isDark ? "rgba(67, 72, 78, 0.3)" : "rgba(205, 206, 214, 0.3)",
        },
        ticks: {
          color: isDark ? CHART_COLORS.textMutedDark : CHART_COLORS.textMuted,
          font: { size: 11, family: "Instrument Sans, sans-serif" },
          callback: (val) => formatMetricValue(Number(val), metricFormat),
        },
      },
      y: {
        grid: { display: false },
        ticks: {
          color: isDark ? CHART_COLORS.textMutedDark : CHART_COLORS.textMuted,
          font: { size: 11, family: "Instrument Sans, sans-serif" },
        },
      },
    },
  };

  return (
    <div className="w-full h-48" data-testid="explain-waterfall">
      <Bar data={data} options={options} />
    </div>
  );
}
