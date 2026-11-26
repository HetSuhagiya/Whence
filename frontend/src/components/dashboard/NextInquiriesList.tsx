"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";

interface NextInquiriesListProps {
  inquiries: string[];
}

export function NextInquiriesList({ inquiries }: NextInquiriesListProps) {
  if (!inquiries || inquiries.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2.5 p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]"
      data-testid="next-inquiries-container"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-[13px] font-medium text-[var(--text-main)]">
            Recommended Next Inquiries
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-mono">
          Inquiry-Only · No Unverified Causality
        </span>
      </div>

      <div className="flex flex-col gap-2 mt-1">
        {inquiries.map((q, idx) => (
          <div
            key={idx}
            className="flex items-start gap-2 text-[12px] text-[var(--text-main)] bg-[var(--bg-app)]/40 p-2.5 rounded-[3px] border border-[var(--border-hairline)]/50"
            data-testid={`next-inquiry-${idx}`}
          >
            <span className="font-mono text-[var(--accent)] font-semibold text-[11px] mt-0.5">
              Q{idx + 1}.
            </span>
            <span className="leading-relaxed font-sans">{q}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
