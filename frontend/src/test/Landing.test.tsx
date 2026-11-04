import { render, screen, within } from "@testing-library/react";
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

  it("renders the umbrella headline and attach eyebrow", () => {
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Run the servers you already pay for\. See them from the outside and from the box\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Security and operations attach", {
        selector: "p",
      }),
    ).toBeInTheDocument();
  });

  it("keeps the attach-loop description free of engine dump", () => {
    expect(screen.getByText(/one thin agent for on-box inventory and alerts/)).toBeInTheDocument();
    expect(screen.queryByText(/VulnScanner engine/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/JWT auth/)).not.toBeInTheDocument();
  });

  it("renders brand logo in top nav", () => {
    const header = document.querySelector("header");
    expect(header).toBeTruthy();
    expect(header!.textContent).toMatch(/SINE/);
    expect(header!.textContent).toMatch(/XIS/);
    expect(screen.getAllByText("SINE").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("XIS").length).toBeGreaterThanOrEqual(2);
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

  it("puts Products in the desktop header, the mobile sheet, and the footer", () => {
    const header = document.querySelector("header");
    expect(header).toBeTruthy();
    const headerProducts = Array.from(header!.querySelectorAll("a")).filter(
      (a) => a.getAttribute("href") === "/products",
    );
    expect(headerProducts.length).toBeGreaterThanOrEqual(2);
    expect(
      headerProducts.some(
        (a) => a.className.includes("hidden") && a.className.includes("sm:inline-flex"),
      ),
    ).toBe(true);

    const products = screen.getAllByRole("link", { name: "Products" });
    expect(products.length).toBeGreaterThanOrEqual(3);
    products.forEach((link) => {
      expect(link).toHaveAttribute("href", "/products");
    });
  });

  it("renders the three-step attach loop with two arrows", () => {
    const loop = screen.getByTestId("landing-loop");
    expect(loop).toBeTruthy();
    expect(loop.textContent).toMatch(/Connect/);
    expect(loop.textContent).toMatch(/Watch/);
    expect(loop.textContent).toMatch(/Prove/);
    expect(loop.textContent).not.toMatch(/Workspace/);
    expect(loop.querySelectorAll(".lucide-arrow-right")).toHaveLength(2);
  });

  it("renders the umbrella section headings", () => {
    expect(
      screen.getByRole("heading", { level: 2, name: "Four surfaces" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "How it attaches" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Straight answers" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "What is open in the account" }),
    ).not.toBeInTheDocument();
  });

  it("renders four pillar cards with product names and anchor links", () => {
    const cards = screen.getAllByTestId("pillar-card");
    expect(cards).toHaveLength(4);

    const expected = [
      { title: "Exposure", href: "/products#exposure", product: /Sinexis Scan/ },
      {
        title: "On-box security",
        href: "/products#onbox",
        product: /Sinexis Guard/,
      },
      {
        title: "Availability",
        href: "/products#availability",
        product: /Sinexis Uptime/,
      },
      { title: "AI", href: "/products#ai", product: /Sinexis AI Gateway/ },
    ];

    cards.forEach((card, index) => {
      const entry = expected[index]!;
      expect(
        within(card).getByRole("heading", { level: 3, name: entry.title }),
      ).toBeInTheDocument();
      expect(card.textContent).toMatch(entry.product);
      expect(card.closest("a")).toHaveAttribute("href", entry.href);
    });

    expect(screen.getByText(/Sinexis Host Protect/)).toBeInTheDocument();
    expect(document.querySelector(".lg\\:grid-cols-4")).toBeNull();
  });

  it("renders the honesty band once and removes the old feature grid", () => {
    expect(
      screen.getByText(
        "Not a pentest. Not a 24/7 SOC. Not a second agent. Not an edge WAF. If a control needs a human or a contract, we say so.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("IP scan")).not.toBeInTheDocument();
    expect(screen.queryByText("Domain scan")).not.toBeInTheDocument();
    expect(screen.queryByText("Scan Attach")).not.toBeInTheDocument();
  });

  it("names the three attach steps and their descriptions", () => {
    expect(
      screen.getByText(/Connect one surface you already run/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Schedule the scan, attach the agent, or add a probe/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Read the diff, the report, or the public status page/),
    ).toBeInTheDocument();
  });

  it("links public blog from header and footer", () => {
    const blogs = screen.getAllByRole("link", { name: "Blog" });
    expect(blogs.length).toBeGreaterThanOrEqual(2);
    blogs.forEach((blog) => {
      expect(blog).toHaveAttribute("href", "/blog");
    });
  });

  it("renders six FAQ items including the AI Gateway honesty item", () => {
    expect(
      screen.getByRole("heading", { level: 2, name: "Straight answers" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Do I need written permission to scan?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Does a human review every finding?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Where do findings live?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "How is Guard different from SIEM and Host Protect?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Two agents on the same VM?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Is AI Gateway a security product?" }),
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

  it("renders the seven-link footer with the umbrella line", () => {
    const footer = document.querySelector("footer");
    expect(footer).toBeTruthy();
    expect(footer!.textContent).toMatch(/Sinexis · Security & operations attach/);
    expect(footer!.textContent).not.toMatch(/SIEM/);
    expect(footer!.textContent).not.toMatch(/v1\.2\.0/);
    expect(footer!.textContent).not.toMatch(/VulnScanner/i);
    expect(footer!.querySelector(".lg\\:grid-cols-4")).toBeNull();

    const nav = screen.getByRole("navigation", { name: "Site" });
    expect(nav).toBeTruthy();
    expect(within(nav).getAllByRole("link")).toHaveLength(7);
    expect(screen.queryByRole("navigation", { name: "Product" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Legal" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Account" })).toBeNull();
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

  it("keeps the landing surfaces shadow-free", () => {
    expect(document.querySelectorAll(".shadow-sm")).toHaveLength(0);
    expect(document.querySelectorAll("[class*='shadow-']")).toHaveLength(0);
  });
});
