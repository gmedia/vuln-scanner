import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Products from "@/pages/Products";

vi.mock("react-router-dom", () => ({
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

describe("Products hub", () => {
  it("renders one h1 and the five product cards", () => {
    render(<Products />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      document.querySelectorAll('[data-testid^="product-card-"]'),
    ).toHaveLength(5);
  });

  it("links every card to its product page", () => {
    render(<Products />);

    for (const slug of ["scan", "guard", "host", "uptime", "ai-gateway"]) {
      expect(
        document.querySelector(
          `[data-testid="product-card-${slug}"] a[href="/products/${slug}"]`,
        ),
      ).toBeTruthy();
    }
  });

  it("shows the editorial status labels", () => {
    render(<Products />);

    expect(screen.getAllByText("Live").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Mixed")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("renders the four pillar sections with stable ids", () => {
    const { container } = render(<Products />);

    for (const id of ["exposure", "onbox", "availability", "ai"]) {
      expect(container.querySelector(`section#${id}`)).toBeTruthy();
    }
  });

  it("links Products from the public header and footer", () => {
    render(<Products />);

    const links = screen.getAllByRole("link", { name: "Products" });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/products");
    }
  });
});
