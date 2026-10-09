import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton, TableRowSkeleton } from "@/components/ui/Skeleton";

describe("Skeleton", () => {
  it("renders with animate-pulse class", () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveClass("animate-pulse");
  });

  it("applies custom className", () => {
    const { container } = render(<Skeleton className="h-10 w-full" />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass("h-10");
    expect(skeleton).toHaveClass("w-full");
    expect(skeleton).toHaveClass("animate-pulse");
  });

  it("passes additional HTML attributes", () => {
    const { container } = render(<Skeleton data-testid="skeleton-el" />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveAttribute("data-testid", "skeleton-el");
  });

  it("renders children", () => {
    const { container } = render(<Skeleton>Loading...</Skeleton>);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveTextContent("Loading...");
  });

  it("TableRowSkeleton renders row count with busy status", () => {
    const { container } = render(<TableRowSkeleton rows={3} />);
    const region = container.querySelector('[role="status"]');
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      5,
    );
  });

  it("TableRowSkeleton columns={6} rows={2} renders 12 pulse bars", () => {
    const { container } = render(<TableRowSkeleton columns={6} rows={2} />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(12);
  });

  it("TableRowSkeleton default props render 20 pulse bars", () => {
    const { container } = render(<TableRowSkeleton />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(20);
  });

  it("TableRowSkeleton columns={1} renders one bar per row", () => {
    const { container } = render(<TableRowSkeleton columns={1} rows={3} />);
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
  });
});
