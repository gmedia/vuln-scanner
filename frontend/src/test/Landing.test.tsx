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

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => (asChild ? <>{children}</> : <button type="button">{children}</button>),
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
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

  it("renders outcome headline and attach eyebrow", () => {
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Find exposure on IP, domain, and mobile — then schedule it/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Security attach for colo, VPS, and hospitality stacks",
        {
          selector: "p",
        },
      ),
    ).toBeInTheDocument();
  });

  it("renders attach-loop description without engine dump", () => {
    expect(
      screen.getByText(
        /Credits, workspace, assets, Guard, and uptime on the same account/,
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
    const headerSignIn = Array.from(header!.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") === "/login",
    );
    expect(headerSignIn).toHaveClass("hidden", "sm:inline");
  });

  it("exposes a mobile menu trigger in the header", () => {
    const header = document.querySelector("header");
    expect(header).toBeTruthy();
    const menu = header!.querySelector("button[aria-label]");
    expect(menu).toBeTruthy();
    expect(menu).toHaveClass("sm:hidden");
  });

  it("shows Sign In in the hero on mobile", () => {
    const heroSignIn = Array.from(
      document.querySelectorAll("main a[href='/login']"),
    );
    expect(heroSignIn.length).toBeGreaterThanOrEqual(1);
    expect(heroSignIn[0]).not.toHaveClass("hidden");
  });

  it("renders attach loop microcopy without SIEM as a live step", () => {
    expect(
      screen.getAllByText(/Scan → Attach → Workspace → Guard/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Guard → SIEM/)).not.toBeInTheDocument();
  });

  it("renders How it works and What you can use today", () => {
    expect(
      screen.getByRole("heading", { level: 2, name: "How it works" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "What you can use today",
      }),
    ).toBeInTheDocument();
  });

  it("renders nine live-module cards without SIEM as shipped", () => {
    expect(screen.getByText("IP scan")).toBeInTheDocument();
    expect(screen.getByText("Domain scan")).toBeInTheDocument();
    expect(screen.getByText("Mobile scan")).toBeInTheDocument();
    expect(screen.getAllByText("Scan Attach").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Workspace").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Assets")).toBeInTheDocument();
    expect(screen.getAllByText("Guard").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Uptime")).toBeInTheDocument();
    expect(screen.getByText("Credits")).toBeInTheDocument();
    expect(screen.getAllByTestId("card")).toHaveLength(9);
    expect(
      screen.queryByRole("heading", { name: "SIEM" }),
    ).not.toBeInTheDocument();
  });

  it("links public blog from header and footer", () => {
    const blogs = screen.getAllByRole("link", { name: "Blog" });
    expect(blogs.length).toBeGreaterThanOrEqual(2);
    blogs.forEach((blog) => {
      expect(blog).toHaveAttribute("href", "/blog");
    });
  });

  it("renders FAQ", () => {
    expect(
      screen.getByRole("heading", { level: 2, name: "Questions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Is this a human pentest?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Do I install two agents?" }),
    ).toBeInTheDocument();
  });

  it("links terms and privacy HTML islands from the footer", () => {
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
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
