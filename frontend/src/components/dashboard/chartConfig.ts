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
  // Ink tokens (slate12)
  inkLight: "#111827",
  inkDark: "#F9FAFB",
  primary: "#111827", // default ink series
  baseline: "#889096", // slate8 previous period comparison
  highlight: "#0090FF", // blue9 explained point ring / highlight
  
  // Waterfall: Radix green9 and red9
  waterfallUp: "#30A46C",
  waterfallUpDark: "#3DD68C",
  waterfallDown: "#E54D2E",
  waterfallDownDark: "#F3705A",

  // Grid and labels
  gridLine: "rgba(205, 206, 214, 0.4)",
  gridLineDark: "rgba(67, 72, 78, 0.4)",
  textMuted: "#60646c",
  textMutedDark: "#b0b4ba",
  textMain: "#111827",
  textMainDark: "#F9FAFB",

  // Paul Tol muted scheme (exact order)
  series: [
    "#332288",
    "#88CCEE",
    "#44AA99",
    "#117733",
    "#999933",
    "#DDCC77",
    "#CC6677",
    "#882255",
    "#AA4499",
    "#DDDDDD",
  ],

  // High-contrast variants for dark mode (>= 3:1 contrast against #111827 / #0F172A)
  seriesDark: [
    "#6F5ED3", // adjusted for dark bg contrast >= 3:1
    "#88CCEE",
    "#44AA99",
    "#117733",
    "#999933",
    "#DDCC77",
    "#CC6677",
    "#BD4882", // adjusted for dark bg contrast >= 3:1
    "#AA4499",
    "#DDDDDD",
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
