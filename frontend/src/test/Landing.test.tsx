import { render, screen } from "@testing-library/react";
import { describe, it, beforeEach, expect } from "vitest";
import Landing from "@/pages/Landing";

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
  Button: ({ children, ...props }: { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, ...props }: { children: React.ReactNode }) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <h3>{children}</h3>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("Landing Page", () => {
  beforeEach(() => {
    render(<Landing />);
  });

  it("renders Sinexis hero title and attach kicker", () => {
    expect(
      screen.getByRole("heading", { level: 1, name: "Sinexis" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Security attach for colo, VPS, and hospitality stacks",
        {
          selector: "p.text-primary",
        },
      ),
    ).toBeInTheDocument();
  });

  it("renders attach-loop description without engine dump", () => {
    expect(
      screen.getByText(
        /Find exposure on IP, domain, and mobile. Schedule attach scans/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/VulnScanner engine/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/JWT auth/)).not.toBeInTheDocument();
  });

  it("renders brand logo in top nav", () => {
    expect(screen.getByText("SINE")).toBeInTheDocument();
    expect(screen.getByText("XIS")).toBeInTheDocument();
  });

  it('renders "Get Started" links pointing to /register', () => {
    const links = screen.getAllByRole("link", { name: /get started/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    links.forEach((link) => {
      expect(link).toHaveAttribute("href", "/register");
    });
  });

  it('renders "Sign In" links pointing to /login', () => {
    const links = screen.getAllByRole("link", { name: /sign in/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    links.forEach((link) => {
      expect(link).toHaveAttribute("href", "/login");
    });
  });

  it("keeps header Sign In off the mobile chrome", () => {
    const header = document.querySelector("header");
    expect(header).toBeTruthy();
    const headerSignIn = Array.from(header!.querySelectorAll("a")).find((a) =>
      a.getAttribute("href") === "/login",
    );
    expect(headerSignIn).toHaveClass("hidden", "sm:inline");
  });

  it("shows Sign In in the hero on mobile", () => {
    const heroSignIn = Array.from(
      document.querySelectorAll("main a[href='/login']"),
    );
    expect(heroSignIn.length).toBeGreaterThanOrEqual(1);
    expect(heroSignIn[0]).not.toHaveClass("hidden");
  });

  it("renders attach loop microcopy", () => {
    expect(
      screen.getAllByText(/Scan → Attach → Workspace → Guard → SIEM/).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renders What ships section heading", () => {
    expect(
      screen.getByRole("heading", { level: 2, name: "What ships" }),
    ).toBeInTheDocument();
  });

  it("renders eight shipped-module cards", () => {
    expect(screen.getByText("IP scan")).toBeInTheDocument();
    expect(screen.getByText("Domain scan")).toBeInTheDocument();
    expect(screen.getByText("Mobile scan")).toBeInTheDocument();
    expect(screen.getByText("Scan Attach")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByText("Guard")).toBeInTheDocument();
    expect(screen.getByText("SIEM")).toBeInTheDocument();
    expect(screen.getByText("Credits")).toBeInTheDocument();
    expect(screen.getAllByTestId("card")).toHaveLength(8);
  });

  it("renders footer without version dump", () => {
    const footer = document.querySelector("footer");
    expect(footer).toBeTruthy();
    expect(footer!.textContent).toMatch(/Sinexis · Scan · Guard · SIEM/);
    expect(footer!.textContent).not.toMatch(/v1\.2\.0/);
    expect(footer!.textContent).not.toMatch(/VulnScanner/i);
  });

  it("uses sticky-footer shell so footer pins on tall viewports", () => {
    const root = document.querySelector(".min-h-dvh.flex.flex-col");
    expect(root).toBeTruthy();
    const main = root!.querySelector("main");
    expect(main).toBeTruthy();
    expect(main).toHaveClass("flex-1");
    const footer = root!.querySelector("footer");
    expect(footer).toBeTruthy();
    expect(footer).toHaveClass("mt-auto");
  });
});
