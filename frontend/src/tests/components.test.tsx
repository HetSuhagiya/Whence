import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

describe("Base UI Components", () => {
  describe("Button Component", () => {
    it("renders children text correctly", () => {
      render(<Button>Click to explain</Button>);
      expect(screen.getByRole("button", { name: /click to explain/i })).toBeInTheDocument();
    });

    it("handles click events", () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Run analysis</Button>);
      fireEvent.click(screen.getByRole("button", { name: /run analysis/i }));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("respects disabled state", () => {
      const handleClick = vi.fn();
      render(<Button disabled onClick={handleClick}>Disabled action</Button>);
      const btn = screen.getByRole("button", { name: /disabled action/i });
      expect(btn).toBeDisabled();
      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it("renders loading state and prevents clicks", () => {
      const handleClick = vi.fn();
      render(<Button isLoading onClick={handleClick}>Processing</Button>);
      const btn = screen.getByRole("button", { name: /processing/i });
      expect(btn).toBeDisabled();
      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe("Input Component", () => {
    it("renders input with label and helper text", () => {
      render(
        <Input
          label="Date range"
          helperText="Select historical comparison range"
          placeholder="YYYY-MM-DD"
        />
      );
      expect(screen.getByText("Date range")).toBeInTheDocument();
      expect(screen.getByText("Select historical comparison range")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("YYYY-MM-DD")).toBeInTheDocument();
    });

    it("renders error message and sets aria-invalid", () => {
      render(
        <Input
          label="Metric definition"
          error="Syntax error in expression"
        />
      );
      const input = screen.getByRole("textbox");
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("Syntax error in expression")).toBeInTheDocument();
    });

    it("supports value change events", () => {
      const handleChange = vi.fn();
      render(<Input placeholder="Type query" onChange={handleChange} />);
      const input = screen.getByPlaceholderText("Type query");
      fireEvent.change(input, { target: { value: "orders" } });
      expect(handleChange).toHaveBeenCalled();
    });
  });

  describe("Skeleton Component", () => {
    it("renders base skeleton element", () => {
      const { container } = render(<Skeleton className="w-20 h-4" />);
      expect(container.firstChild).toHaveClass("animate-pulse");
    });

    it("renders KPI layout skeleton", () => {
      const { container } = render(<Skeleton variant="kpi" />);
      expect(container.getElementsByClassName("animate-pulse").length).toBeGreaterThan(1);
    });

    it("renders chart layout skeleton", () => {
      const { container } = render(<Skeleton variant="chart" />);
      expect(container.getElementsByClassName("animate-pulse").length).toBeGreaterThan(1);
    });
  });

  describe("Centred Explain Dialog Component", () => {
    it("opens dialog on trigger click and displays title and description", () => {
      render(
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open explain dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Explain revenue movement</DialogTitle>
              <DialogDescription>
                Comparing 11 Nov 2026 with 4 Nov 2026 baseline window
              </DialogDescription>
            </DialogHeader>
            <div data-testid="dialog-body">Dialog content body</div>
          </DialogContent>
        </Dialog>
      );

      expect(screen.queryByTestId("dialog-body")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /open explain dialog/i }));
      expect(screen.getByText("Explain revenue movement")).toBeInTheDocument();
      expect(screen.getByText("Comparing 11 Nov 2026 with 4 Nov 2026 baseline window")).toBeInTheDocument();
      expect(screen.getByTestId("dialog-body")).toBeInTheDocument();
    });
  });
});
