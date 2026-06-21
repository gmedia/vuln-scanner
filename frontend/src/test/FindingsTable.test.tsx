import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FindingsTable from "@/components/results/FindingsTable";
import type { ScanFinding } from "@/api/scans";

function mockFinding(overrides: Partial<ScanFinding> = {}): ScanFinding {
  return {
    id: "1",
    job_id: "j1",
    severity: "critical",
    category: "auth",
    title: "SQL Injection",
    description: "SQL injection vulnerability in login form",
    cve_id: "CVE-2024-1234",
    cvss_score: 9.8,
    remediation: "Use parameterized queries",
    raw_data: {},
    found_at: "2024-01-01",
    ...overrides,
  };
}

describe("FindingsTable", () => {
  it("shows loading skeletons when isLoading=true", () => {
    render(<FindingsTable findings={undefined} isLoading={true} />);
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows 'No findings detected' when findings is an empty array", () => {
    render(<FindingsTable findings={[]} isLoading={false} />);
    expect(screen.getByText("No findings detected")).toBeInTheDocument();
  });

  it("renders filter search input", () => {
    const findings = [
      mockFinding(),
      mockFinding({ id: "2", title: "XSS Attack", severity: "high", cvss_score: 7.5 }),
      mockFinding({ id: "3", title: "Open Redirect", severity: "medium", cvss_score: 5.0 }),
    ];
    render(<FindingsTable findings={findings} isLoading={false} />);
    expect(screen.getByPlaceholderText("Filter findings...")).toBeInTheDocument();
  });

  it("renders table with findings data", () => {
    const findings = [
      mockFinding(),
      mockFinding({ id: "2", title: "XSS Attack", severity: "high", cvss_score: 7.5 }),
      mockFinding({ id: "3", title: "Open Redirect", severity: "medium", cvss_score: 5.0 }),
    ];
    render(<FindingsTable findings={findings} isLoading={false} />);
    expect(screen.getByText("SQL Injection")).toBeInTheDocument();
    expect(screen.getByText("XSS Attack")).toBeInTheDocument();
    expect(screen.getByText("Open Redirect")).toBeInTheDocument();
  });

  it("shows 'No matching findings' when search filters everything out", async () => {
    const user = userEvent.setup();
    const findings = [
      mockFinding(),
      mockFinding({ id: "2", title: "XSS Attack", severity: "high", cvss_score: 7.5 }),
    ];
    render(<FindingsTable findings={findings} isLoading={false} />);
    const searchInput = screen.getByPlaceholderText("Filter findings...");
    await user.type(searchInput, "zzz_nonexistent_pattern_zzz");
    expect(screen.getByText("No matching findings")).toBeInTheDocument();
  });

  it("renders severity badges for each finding", () => {
    const findings = [
      mockFinding(),
      mockFinding({ id: "2", title: "Info Issue", severity: "info", cvss_score: 0 }),
    ];
    render(<FindingsTable findings={findings} isLoading={false} />);
    expect(screen.getByText("critical")).toBeInTheDocument();
    expect(screen.getByText("info")).toBeInTheDocument();
  });
});
