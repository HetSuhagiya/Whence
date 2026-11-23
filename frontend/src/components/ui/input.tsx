import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, helperText, icon, id, disabled, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5 text-left">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[12px] font-medium text-[var(--text-muted)] tracking-wide uppercase"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-2.5 flex items-center pointer-events-none text-[var(--text-muted)]">
              {icon}
            </div>
          )}
          <input
            id={inputId}
            type={type}
            ref={ref}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            className={cn(
              "w-full h-8.5 px-3 py-1.5 text-[14px] bg-[var(--bg-surface)] text-[var(--text-main)]",
              "border border-[var(--border-hairline)] rounded-[4px]",
              "placeholder:text-[var(--text-muted)]/70",
              "focus:outline-none focus:border-[var(--border-focus)] focus:ring-1 focus:ring-[var(--border-focus)]",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "transition-subtle",
              type === "number" && "tabular-nums",
              icon && "pl-8.5",
              error && "border-[var(--trend-down)] focus:border-[var(--trend-down)] focus:ring-[var(--trend-down)]",
              className
            )}
            {...props}
          />
        </div>
        {error ? (
          <p id={`${inputId}-error`} className="text-[12px] text-[var(--trend-down)]">
            {error}
          </p>
        ) : helperText ? (
          <p id={`${inputId}-helper`} className="text-[12px] text-[var(--text-muted)]">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
