import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";

// Register Chart.js components once
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  annotationPlugin
);

export const CHART_COLORS = {
  primary: "#4E79A7",
  waterfallUp: "#59A14F",
  waterfallDown: "#E15759",
  gridLine: "rgba(205, 206, 214, 0.3)",
  textMuted: "#60646c",
  textMain: "#1c2024",
  series: [
    "#4E79A7",
    "#F28E2B",
    "#E15759",
    "#76B7B2",
    "#59A14F",
    "#EDC948",
    "#B07AA1",
    "#FF9DA7",
    "#9C755F",
    "#BAB0AC",
  ],
};

export function formatMetricValue(val: number, format: string = "currency"): string {
  if (val === undefined || val === null || isNaN(val)) return "—";
  if (format === "currency") {
    if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
    if (Math.abs(val) >= 10_000) return `$${(val / 1_000).toFixed(1)}k`;
    return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (format === "percent") {
    return `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`;
  }
  if (format === "integer") {
    return Math.round(val).toLocaleString("en-US");
  }
  if (format === "decimal") {
    return val.toFixed(2);
  }
  return val.toLocaleString("en-US");
}
