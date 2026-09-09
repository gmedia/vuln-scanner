import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Footer } from "@/components/Footer";

vi.mock("react-router-dom", () => ({
  Link: ({
    to,
    children,
    className,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("Footer", () => {
  it("renders industrial columns: brand, product, legal, account", () => {
    const { container } = render(<Footer />);
    const footer = container.querySelector("footer");
    expect(footer).toBeTruthy();
    const inner = footer!.querySelector(":scope > div");
    expect(inner).toHaveClass("max-w-6xl", "2xl:max-w-[90rem]");
    const grid = inner!.querySelector(":scope > div");
    expect(grid).toHaveClass("grid", "lg:grid-cols-4");

    expect(screen.getByRole("link", { name: "Sinexis home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByText(/Attaches to colo, VPS, and hospitality/),
    ).toBeInTheDocument();

    expect(screen.getByRole("navigation", { name: "Product" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Blog" })).toHaveAttribute(
      "href",
      "/blog",
    );
    expect(screen.getByRole("link", { name: "Blog" })).toHaveClass(
      "text-sm",
      "text-muted-foreground",
    );

    expect(screen.getByRole("navigation", { name: "Legal" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );

    expect(screen.getByRole("navigation", { name: "Account" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "Get Started" })).toHaveAttribute(
      "href",
      "/register",
    );

    expect(screen.getByText("Sinexis · Scan · Guard")).toHaveClass("text-xs");
    expect(footer!.textContent).not.toMatch(/SIEM/);
    expect(footer!.textContent).not.toMatch(/VulnScanner/i);
  });
});
