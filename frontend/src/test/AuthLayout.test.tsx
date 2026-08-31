import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AuthLayout, AUTH_SECONDARY_LINK } from "@/components/layout/AuthLayout";

vi.mock("react-router-dom", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("AuthLayout", () => {
  it("renders brand logo linking to home", () => {
    render(
      <AuthLayout title="Sign in">
        <div>form</div>
      </AuthLayout>,
    );
    const home = screen.getByRole("link", { name: /sinexis home/i });
    expect(home).toHaveAttribute("href", "/");
    expect(screen.getByText("SINE")).toBeInTheDocument();
    expect(screen.getByText("XIS")).toBeInTheDocument();
  });

  it("renders optional title and subtitle", () => {
    render(
      <AuthLayout title="Welcome back" subtitle="Enter your credentials">
        <div>form</div>
      </AuthLayout>,
    );
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(screen.getByText("Enter your credentials")).toBeInTheDocument();
  });

  it("uses a wider island at the default maxWidth", () => {
    const { container } = render(
      <AuthLayout title="Sign in">
        <div>form</div>
      </AuthLayout>,
    );
    const island = container.querySelector(".max-w-3xl");
    expect(island).toBeInstanceOf(HTMLElement);
    expect(island).toHaveClass("2xl:max-w-4xl");
  });

  it("keeps the brand tagline hidden until the sm breakpoint", () => {
    render(
      <AuthLayout title="Sign in">
        <div>form</div>
      </AuthLayout>,
    );
    const tagline = screen.getByText(/colo, VPS, and hospitality/i);
    expect(tagline).toHaveClass("hidden", "sm:block");
  });

  it("sizes secondary auth links for 44pt taps", () => {
    expect(AUTH_SECONDARY_LINK).toMatch(/min-h-11/);
    expect(AUTH_SECONDARY_LINK).toMatch(/min-w-11/);
  });

  it("keeps theme and locale switcher testids", () => {
    render(
      <AuthLayout title="Sign in">
        <div>form</div>
      </AuthLayout>,
    );
    expect(screen.getByTestId("theme-switcher")).toBeInTheDocument();
    expect(screen.getByTestId("language-switcher")).toBeInTheDocument();
  });

  it("styles selected chips as secondary, not primary CTA", () => {
    render(
      <AuthLayout title="Sign in">
        <div>form</div>
      </AuthLayout>,
    );
    const theme = screen.getByTestId("theme-switcher");
    const row = theme.parentElement;
    expect(row?.className).toContain(
      "[&_button[aria-pressed=true]]:!bg-secondary",
    );
    expect(row?.className).toContain(
      "[&_button[aria-pressed=true]]:!text-secondary-foreground",
    );
  });

  it("keeps switchers in a compact row with 44px min height", () => {
    render(
      <AuthLayout title="Sign in">
        <div>form</div>
      </AuthLayout>,
    );
    const theme = screen.getByTestId("theme-switcher");
    const locale = screen.getByTestId("language-switcher");
    expect(theme).toHaveClass("min-h-11", "w-auto");
    expect(locale).toHaveClass("min-h-11", "w-auto");
    expect(theme.parentElement).toHaveClass("flex-row");
  });
});
