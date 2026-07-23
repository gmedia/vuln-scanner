import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ErrorBoundaryFallback } from "@/components/ErrorBoundaryFallback";

function renderFallback(
  props: Partial<React.ComponentProps<typeof ErrorBoundaryFallback>> = {},
) {
  const resetErrorBoundary = props.resetErrorBoundary ?? vi.fn();
  const error = props.error ?? new Error("Test error");
  return {
    resetErrorBoundary,
    ...render(
      <MemoryRouter>
        <ErrorBoundaryFallback
          error={error}
          resetErrorBoundary={resetErrorBoundary}
        />
      </MemoryRouter>,
    ),
  };
}

describe("ErrorBoundaryFallback", () => {
  const originalDev = import.meta.env.DEV;

  beforeEach(() => {
    vi.stubEnv("DEV", true);
  });

  afterEach(() => {
    vi.stubEnv("DEV", originalDev);
    vi.unstubAllEnvs();
  });

  it('renders "Something went wrong" title', () => {
    renderFallback();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("shows error message in development", () => {
    vi.stubEnv("DEV", true);
    renderFallback({ error: new Error("Failed to load dashboard") });
    expect(screen.getByText("Failed to load dashboard")).toBeInTheDocument();
  });

  it("hides technical details by default in production", () => {
    vi.stubEnv("DEV", false);
    renderFallback({ error: new Error("Secret stack trace") });
    expect(screen.queryByText("Secret stack trace")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show technical details" }),
    ).toBeInTheDocument();
  });

  it("reveals technical details when toggled in production", async () => {
    vi.stubEnv("DEV", false);
    const user = userEvent.setup();
    renderFallback({ error: "Network timeout" });
    await user.click(
      screen.getByRole("button", { name: "Show technical details" }),
    );
    expect(screen.getByText("Network timeout")).toBeInTheDocument();
  });

  it('renders "Try Again" button', () => {
    renderFallback({ error: new Error("Boom") });
    expect(
      screen.getByRole("button", { name: "Try Again" }),
    ).toBeInTheDocument();
  });

  it("calls resetErrorBoundary when Try Again is clicked", async () => {
    const resetErrorBoundary = vi.fn();
    const user = userEvent.setup();
    renderFallback({ error: new Error("Boom"), resetErrorBoundary });
    await user.click(screen.getByRole("button", { name: "Try Again" }));
    expect(resetErrorBoundary).toHaveBeenCalledTimes(1);
  });

  it("renders Back to Dashboard link", () => {
    renderFallback({ error: new Error("Boom") });
    expect(
      screen.getByRole("link", { name: "Back to Dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
  });

  it("does not use full-viewport layout (keeps page shell usable)", () => {
    const { container } = renderFallback({ error: new Error("Boom") });
    const root = container.firstElementChild;
    expect(root?.className).not.toMatch(/min-h-screen/);
  });

  it("renders the warning SVG icon", () => {
    const { container } = renderFallback({ error: new Error("Boom") });
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders the support text paragraph", () => {
    renderFallback({ error: new Error("Boom") });
    expect(
      screen.getByText(/An unexpected error occurred/),
    ).toBeInTheDocument();
    expect(screen.getByText(/contact support/)).toBeInTheDocument();
  });
});
