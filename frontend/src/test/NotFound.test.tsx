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
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <button {...props}>{children}</button>,
}));

describe("NotFound", () => {
  beforeEach(() => {
    render(<NotFound />);
  });

  it("renders the 404 heading", () => {
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders the PAGE NOT FOUND subheading", () => {
    expect(screen.getByText("PAGE NOT FOUND")).toBeInTheDocument();
  });

  it("renders the description text", () => {
    expect(
      screen.getByText(
        /The target you.*re looking for is out of scan range/,
      ),
    ).toBeInTheDocument();
  });

  it("renders a Return to Dashboard link", () => {
    const link = screen.getByRole("link", { name: /Return to Dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/dashboard");
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
