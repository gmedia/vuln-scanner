import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AuthLayout } from "@/components/layout/AuthLayout";

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
    const home = screen.getByRole("link", { name: /vulnscanner home/i });
    expect(home).toHaveAttribute("href", "/");
    expect(screen.getByText("VULN")).toBeInTheDocument();
    expect(screen.getByText("SCAN")).toBeInTheDocument();
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
});
