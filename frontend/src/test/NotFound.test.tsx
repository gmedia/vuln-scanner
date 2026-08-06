import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import NotFound from "@/pages/NotFound";

const mockAuthState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
  initialize: vi.fn(async () => {
    mockAuthState.isLoading = false;
  }),
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
  useAuthStore: (selector: (s: typeof mockAuthState) => unknown) =>
    selector(mockAuthState),
}));

describe("NotFound", () => {
  beforeEach(() => {
    mockAuthState.isAuthenticated = false;
    mockAuthState.isLoading = false;
    mockAuthState.initialize.mockClear();
  });

  it("calls initialize on mount", () => {
    render(<NotFound />);
    expect(mockAuthState.initialize).toHaveBeenCalled();
  });

  it("shows spinner while auth is loading", () => {
    mockAuthState.isLoading = true;
    const { container } = render(<NotFound />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("404")).not.toBeInTheDocument();
  });

  it("renders the 404 heading", async () => {
    render(<NotFound />);
    expect(await screen.findByText("404")).toBeInTheDocument();
  });

  it("renders the Page not found subheading", async () => {
    render(<NotFound />);
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });

  it("renders the description text", async () => {
    render(<NotFound />);
    expect(
      await screen.findByText(
        /The target you.*re looking for is out of scan range/,
      ),
    ).toBeInTheDocument();
  });

  it("for guests: primary home + Sign in, no dashboard CTA", async () => {
    mockAuthState.isAuthenticated = false;
    render(<NotFound />);

    const home = await screen.findByRole("link", { name: /Back to home/i });
    expect(home).toHaveAttribute("href", "/");

    const signIn = screen.getByRole("link", { name: /Sign in/i });
    expect(signIn).toHaveAttribute("href", "/login");

    expect(
      screen.queryByRole("link", { name: /Return to dashboard/i }),
    ).not.toBeInTheDocument();
  });

  it("for authenticated: dashboard primary + home secondary", async () => {
    mockAuthState.isAuthenticated = true;
    render(<NotFound />);

    const dash = await screen.findByRole("link", {
      name: /Return to dashboard/i,
    });
    expect(dash).toHaveAttribute("href", "/dashboard");

    const home = screen.getByRole("link", { name: /Back to home/i });
    expect(home).toHaveAttribute("href", "/");

    expect(
      screen.queryByRole("link", { name: /Sign in/i }),
    ).not.toBeInTheDocument();
  });

  it("renders Crosshair icons", async () => {
    render(<NotFound />);
    await waitFor(() => {
      const icons = document.querySelectorAll(".lucide-crosshair");
      expect(icons.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("renders within a flex container", async () => {
    render(<NotFound />);
    await waitFor(() => {
      expect(document.querySelector(".flex.min-h-screen")).toBeInTheDocument();
    });
  });
});
