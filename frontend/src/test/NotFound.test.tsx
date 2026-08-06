import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "@/pages/NotFound";

const mockAuthState = vi.hoisted(() => ({
  isAuthenticated: false,
}));

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

vi.mock("@/store/authStore", () => ({
  useAuthStore: (selector: (s: { isAuthenticated: boolean }) => unknown) =>
    selector(mockAuthState),
}));

describe("NotFound", () => {
  beforeEach(() => {
    mockAuthState.isAuthenticated = false;
  });

  it("renders the 404 heading", () => {
    render(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders the Page not found subheading", () => {
    render(<NotFound />);
    expect(screen.getByText("Page not found")).toBeInTheDocument();
  });

  it("renders the description text", () => {
    render(<NotFound />);
    expect(
      screen.getByText(/The target you.*re looking for is out of scan range/),
    ).toBeInTheDocument();
  });

  it("for guests: primary home + Sign in, no dashboard CTA", () => {
    mockAuthState.isAuthenticated = false;
    render(<NotFound />);

    const home = screen.getByRole("link", { name: /Back to home/i });
    expect(home).toHaveAttribute("href", "/");

    const signIn = screen.getByRole("link", { name: /Sign in/i });
    expect(signIn).toHaveAttribute("href", "/login");

    expect(
      screen.queryByRole("link", { name: /Return to dashboard/i }),
    ).not.toBeInTheDocument();
  });

  it("for authenticated: dashboard primary + home secondary", () => {
    mockAuthState.isAuthenticated = true;
    render(<NotFound />);

    const dash = screen.getByRole("link", { name: /Return to dashboard/i });
    expect(dash).toHaveAttribute("href", "/dashboard");

    const home = screen.getByRole("link", { name: /Back to home/i });
    expect(home).toHaveAttribute("href", "/");

    expect(
      screen.queryByRole("link", { name: /Sign in/i }),
    ).not.toBeInTheDocument();
  });

  it("renders Crosshair icons", () => {
    render(<NotFound />);
    const icons = document.querySelectorAll(".lucide-crosshair");
    expect(icons.length).toBeGreaterThanOrEqual(2);
  });

  it("renders within a flex container", () => {
    render(<NotFound />);
    const container = document.querySelector(".flex.min-h-screen");
    expect(container).toBeInTheDocument();
  });
});
