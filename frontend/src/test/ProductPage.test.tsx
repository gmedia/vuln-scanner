import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProductPage from "@/pages/products/ProductPage";

const route = vi.hoisted(() => ({ slug: "scan" }));

const auth = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
  initialize: vi.fn(async () => undefined),
}));

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
  useParams: () => ({ slug: route.slug }),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: (selector: (state: typeof auth) => unknown) => selector(auth),
}));

function robots(): string | null {
  return (
    document.head
      .querySelector('meta[name="robots"]')
      ?.getAttribute("content") ?? null
  );
}

const products = [
  ["scan", "Sinexis Scan"],
  ["guard", "Sinexis Guard"],
  ["host", "Sinexis Host Protect"],
  ["uptime", "Sinexis Uptime"],
  ["ai-gateway", "Sinexis AI Gateway"],
] as const;

describe("Product page", () => {
  beforeEach(() => {
    route.slug = "scan";
    document.head
      .querySelectorAll('meta[name="robots"], link[rel="canonical"]')
      .forEach((element) => element.remove());
  });

  afterEach(cleanup);

  it.each(products)("renders /products/%s with one h1", (slug, name) => {
    route.slug = slug;
    render(<ProductPage />);

    expect(screen.getByRole("heading", { level: 1, name })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(robots()).toBe("index");
  });

  it("shows capabilities, does-not-do block, steps, and requirements", () => {
    route.slug = "host";
    render(<ProductPage />);

    expect(screen.getByText("Host Protect")).toBeInTheDocument();
    expect(screen.getByText("Host WAF")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "What it does" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "What it does not do" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "How it works" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Host add-on. Requires a Guard agent on the same VM. Returns empty on a clean disk.",
      ).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(
        "Pro and Multi. Runs in your nginx, never on the Sinexis edge.",
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renders the exact SIEM caveat on Guard", () => {
    route.slug = "guard";
    render(<ProductPage />);

    expect(screen.getByText("By request")).toBeInTheDocument();
    expect(
      screen.getByText(
        "By request. Log search and cases are enabled per account; never included in the Guard plan.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the exact status-page plan gates on Uptime", () => {
    route.slug = "uptime";
    render(<ProductPage />);

    expect(
      screen.getAllByText(
        "Publish on Pro, Multi, and Enterprise. Custom hostname on Multi and Enterprise.",
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renders the exact Beta caveat on AI Gateway", () => {
    route.slug = "ai-gateway";
    render(<ProductPage />);

    expect(
      screen.getAllByText(
        "Beta. Request access; wallet and keys are issued per org.",
      ).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("link", {
        name: "Create an account and request access",
      }),
    ).toHaveAttribute("href", "/register");
  });

  it("offers Get started on a live product", () => {
    route.slug = "scan";
    render(<ProductPage />);

    expect(
      screen.getByRole("link", { name: "Get started" }),
    ).toHaveAttribute("href", "/register");
  });

  it("renders NotFound and noindex for an unknown slug", () => {
    route.slug = "not-a-product";
    render(<ProductPage />);

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(robots()).toBe("noindex");
  });
});
