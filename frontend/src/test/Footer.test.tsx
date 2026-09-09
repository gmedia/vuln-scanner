import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Footer } from "@/components/Footer";

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

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("Footer", () => {
  it("matches blog/legal island chrome: one wrapping row, muted xs links, primary register", () => {
    const { container } = render(<Footer />);
    const footer = container.querySelector("footer");
    expect(footer).toBeTruthy();
    const inner = footer!.querySelector(":scope > div");
    expect(inner).toHaveClass("flex-wrap", "justify-between");
    expect(inner).not.toHaveClass("flex-col");

    expect(screen.getByText("Sinexis · Scan · Guard")).toHaveClass("text-xs");

    const blog = screen.getByRole("link", { name: "Blog" });
    expect(blog).toHaveAttribute("href", "/blog");
    expect(blog).toHaveClass("text-xs", "text-muted-foreground");

    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.getByRole("link", { name: "Get Started" })).toHaveAttribute(
      "href",
      "/register",
    );
  });
});
