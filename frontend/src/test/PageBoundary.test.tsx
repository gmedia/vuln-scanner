import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { lazy } from "react";
import { PageBoundary } from "@/components/PageBoundary";

vi.mock("react-error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("PageBoundary", () => {
  it("shows page skeleton while the lazy page is pending", () => {
    const Never = lazy(() => new Promise<{ default: () => null }>(() => {}));
    render(<PageBoundary component={Never} />);
    expect(screen.getByTestId("page-loading")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });
});
