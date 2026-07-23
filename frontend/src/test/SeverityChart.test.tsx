import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SeverityChart from "@/components/results/SeverityChart";

describe("SeverityChart", () => {
  it("shows 'No findings to display' when summary is null", () => {
    render(<SeverityChart summary={null} />);
    expect(screen.getByText("No findings to display")).toBeInTheDocument();
  });

  it("shows 'No findings to display' when total_findings is 0", () => {
    render(
      <SeverityChart
        summary={{
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
          total_findings: 0,
        }}
      />
    );
    expect(screen.getByText("No findings to display")).toBeInTheDocument();
  });

  it("renders chart with SVG elements when data exists", () => {
    const { container } = render(
      <SeverityChart
        summary={{
          critical: 3,
          high: 2,
          medium: 5,
          low: 1,
          info: 4,
          total_findings: 15,
        }}
      />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <SeverityChart
        summary={{
          critical: 1,
          high: 1,
          medium: 0,
          low: 0,
          info: 0,
          total_findings: 2,
        }}
        className="my-custom-chart"
      />
    );
    // The chart container should have the custom class
    const chartWrapper = container.querySelector(".my-custom-chart");
    expect(chartWrapper).toBeInTheDocument();
  });

  it("renders chart with data having only some severities", () => {
    const { container } = render(
      <SeverityChart
        summary={{
          critical: 4,
          high: 3,
          medium: 0,
          low: 0,
          info: 0,
          total_findings: 7,
        }}
      />
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    // Should still render a chart even though medium/low/info are 0
    expect(screen.queryByText("No findings to display")).not.toBeInTheDocument();
  });

  it("shows full severity legend with counts and percentages", () => {
    render(
      <SeverityChart
        summary={{
          critical: 2,
          high: 2,
          medium: 0,
          low: 0,
          info: 1,
          total_findings: 5,
        }}
      />,
    );
    expect(screen.getByTestId("severity-legend")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("Info")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/40%/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/0%/).length).toBeGreaterThanOrEqual(1);
  });
});
