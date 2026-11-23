import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Whence — Deterministic Explain Engine",
  description: "Click-to-explain analytical dashboard product connecting to Google BigQuery and DuckDB.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-[var(--bg-app)] text-[var(--text-main)] font-ui">
        {children}
      </body>
    </html>
  );
}
