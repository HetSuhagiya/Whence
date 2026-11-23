import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "secondary",
      size = "md",
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-subtle select-none cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--border-focus)] disabled:pointer-events-none disabled:opacity-40 rounded-[4px]";

    const variantStyles = {
      primary:
        "bg-[var(--accent-solid-bg)] text-[var(--accent-solid-text)] hover:bg-[var(--accent-solid-hover)] active:opacity-95 shadow-none",
      secondary:
        "bg-[var(--bg-surface)] text-[var(--text-main)] border border-[var(--border-hairline)] hover:bg-[var(--bg-surface-hover)] active:bg-[var(--bg-subtle)]",
      outline:
        "bg-transparent text-[var(--text-main)] border border-[var(--border-hairline)] hover:bg-[var(--bg-subtle)]",
      ghost:
        "bg-transparent text-[var(--text-main)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-main)]",
      destructive:
        "bg-[var(--bg-surface)] text-[var(--trend-down)] border border-[var(--border-hairline)] hover:bg-[var(--trend-down-subtle)]",
    };

    const sizeStyles = {
      sm: "h-7 px-2.5 text-[12px] gap-1.5",
      md: "h-8.5 px-3.5 text-[14px] gap-2",
      lg: "h-10 px-4.5 text-[16px] gap-2.5",
      icon: "h-8.5 w-8.5 p-0 justify-center",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin h-3.5 w-3.5 text-current shrink-0 mr-1"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
