import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PageHeader from "@/components/layout/PageHeader";

describe("PageHeader", () => {
  it("renders an h2 title", () => {
    render(<PageHeader title="Overview" />);
    const heading = screen.getByRole("heading", { level: 2, name: "Overview" });
    expect(heading).toBeInTheDocument();
    expect(heading.className).toMatch(/text-2xl/);
  });

  it("renders description and actions", () => {
    render(
      <PageHeader
        title="Overview"
        description="One-off scans"
        actions={<button type="button">New scan</button>}
      />,
    );
    expect(screen.getByText("One-off scans")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New scan" })).toBeInTheDocument();
  });
});
