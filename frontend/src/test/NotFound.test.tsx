import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "@/pages/NotFound";

vi.mock("react-router-dom", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({
    children,
    asChild,
    ...props
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    [key: string]: unknown;
  }) => (asChild ? <>{children}</> : <button {...props}>{children}</button>),
}));

describe("NotFound", () => {
  beforeEach(() => {
    render(<NotFound />);
  });

  it("renders the 404 heading", () => {
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders the Page not found subheading", () => {
    expect(screen.getByText("Page not found")).toBeInTheDocument();
  });

  it("renders the description text", () => {
    expect(
      screen.getByText(
        /The target you.*re looking for is out of scan range/,
      ),
    ).toBeInTheDocument();
  });

  it("renders a Return to dashboard link", () => {
    const link = screen.getByRole("link", { name: /Return to dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  it("renders a Back to home link", () => {
    const link = screen.getByRole("link", { name: /Back to home/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("renders Crosshair icons", () => {
    const icons = document.querySelectorAll(".lucide-crosshair");
    expect(icons.length).toBeGreaterThanOrEqual(2);
  });

  it("renders within a flex container", () => {
    const container = document.querySelector(".flex.min-h-screen");
    expect(container).toBeInTheDocument();
  });
});
