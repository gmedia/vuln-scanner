import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundaryFallback } from "@/components/ErrorBoundaryFallback";

describe("ErrorBoundaryFallback", () => {
  it('renders "Something went wrong" title', () => {
    const resetErrorBoundary = vi.fn();
    render(
      <ErrorBoundaryFallback
        error={new Error("Test error")}
        resetErrorBoundary={resetErrorBoundary}
      />,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders error message from Error object", () => {
    const resetErrorBoundary = vi.fn();
    const error = new Error("Failed to load dashboard");
    render(
      <ErrorBoundaryFallback
        error={error}
        resetErrorBoundary={resetErrorBoundary}
      />,
    );
    expect(screen.getByText("Failed to load dashboard")).toBeInTheDocument();
  });

  it("renders error message from string error", () => {
    const resetErrorBoundary = vi.fn();
    render(
      <ErrorBoundaryFallback
        error="Network timeout"
        resetErrorBoundary={resetErrorBoundary}
      />,
    );
    expect(screen.getByText("Network timeout")).toBeInTheDocument();
  });

  it('renders "Try Again" button', () => {
    const resetErrorBoundary = vi.fn();
    render(
      <ErrorBoundaryFallback
        error={new Error("Boom")}
        resetErrorBoundary={resetErrorBoundary}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Try Again" }),
    ).toBeInTheDocument();
  });

  it("calls resetErrorBoundary when Try Again is clicked", async () => {
    const resetErrorBoundary = vi.fn();
    const user = userEvent.setup();
    render(
      <ErrorBoundaryFallback
        error={new Error("Boom")}
        resetErrorBoundary={resetErrorBoundary}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Try Again" }));
    expect(resetErrorBoundary).toHaveBeenCalledTimes(1);
  });

  it("renders the warning SVG icon", () => {
    const resetErrorBoundary = vi.fn();
    const { container } = render(
      <ErrorBoundaryFallback
        error={new Error("Boom")}
        resetErrorBoundary={resetErrorBoundary}
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders the support text paragraph", () => {
    const resetErrorBoundary = vi.fn();
    render(
      <ErrorBoundaryFallback
        error={new Error("Boom")}
        resetErrorBoundary={resetErrorBoundary}
      />,
    );
    expect(
      screen.getByText(/An unexpected error occurred/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/contact support/),
    ).toBeInTheDocument();
  });
});
