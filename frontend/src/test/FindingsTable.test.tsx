import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import FindingsTable from "@/components/results/FindingsTable";
import type { ScanFinding } from "@/api/scans";

function renderTable(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

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
    impact: "Attackers can manipulate database queries.",
    attacker_benefit: "Public SQL injection techniques apply to this form.",
    raw_data: {},
    found_at: "2024-01-01",
    ...overrides,
  };
}

describe("FindingsTable", () => {
  it("shows loading skeletons when isLoading=true", () => {
    renderTable(<FindingsTable findings={undefined} isLoading={true} />);
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows 'No findings detected' when findings is an empty array", () => {
    renderTable(<FindingsTable findings={[]} isLoading={false} />);
    expect(screen.getByText("No findings detected")).toBeInTheDocument();
  });

  it("renders filter search input", () => {
    const findings = [
      mockFinding(),
      mockFinding({ id: "2", title: "XSS Attack", severity: "high", cvss_score: 7.5 }),
      mockFinding({ id: "3", title: "Open Redirect", severity: "medium", cvss_score: 5.0 }),
    ];
    renderTable(<FindingsTable findings={findings} isLoading={false} />);
    expect(screen.getByPlaceholderText("Filter findings...")).toBeInTheDocument();
  });

  it("renders table with findings data", () => {
    const findings = [
      mockFinding(),
      mockFinding({ id: "2", title: "XSS Attack", severity: "high", cvss_score: 7.5 }),
      mockFinding({ id: "3", title: "Open Redirect", severity: "medium", cvss_score: 5.0 }),
    ];
    renderTable(<FindingsTable findings={findings} isLoading={false} />);
    expect(screen.getAllByText("SQL Injection").length).toBeGreaterThan(0);
    expect(screen.getAllByText("XSS Attack").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Open Redirect").length).toBeGreaterThan(0);
  });

  it("shows 'No matching findings' when search filters everything out", async () => {
    const user = userEvent.setup();
    const findings = [
      mockFinding(),
      mockFinding({ id: "2", title: "XSS Attack", severity: "high", cvss_score: 7.5 }),
    ];
    renderTable(<FindingsTable findings={findings} isLoading={false} />);
    const searchInput = screen.getByPlaceholderText("Filter findings...");
    await user.type(searchInput, "zzz_nonexistent_pattern_zzz");
    expect(screen.getAllByText("No matching findings").length).toBeGreaterThan(0);
  });

  it("filters rows by severity checkbox in the dropdown", async () => {
    const user = userEvent.setup();
    const findings = [
      mockFinding(),
      mockFinding({ id: "2", title: "XSS Attack", severity: "high", cvss_score: 7.5 }),
      mockFinding({ id: "3", title: "Open Redirect", severity: "medium", cvss_score: 5.0 }),
    ];
    renderTable(<FindingsTable findings={findings} isLoading={false} />);
    await user.click(screen.getByRole("button", { name: "Filter by severity" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "high" }));
    expect(screen.queryByText("SQL Injection")).not.toBeInTheDocument();
    expect(screen.getAllByText("XSS Attack").length).toBeGreaterThan(0);
    expect(screen.queryByText("Open Redirect")).not.toBeInTheDocument();
  });

  it("renders severity badges for each finding", () => {
    const findings = [
      mockFinding(),
      mockFinding({ id: "2", title: "Info Issue", severity: "info", cvss_score: 0 }),
    ];
    renderTable(<FindingsTable findings={findings} isLoading={false} />);
    expect(screen.getAllByText("critical").length).toBeGreaterThan(0);
    expect(screen.getAllByText("info").length).toBeGreaterThan(0);
  });

  it("expands detail directly under the clicked row, not below the table", async () => {
    const user = userEvent.setup();
    const findings = [
      mockFinding({ id: "1", title: "SQL Injection" }),
      mockFinding({
        id: "2",
        title: "XSS Attack",
        severity: "high",
        cvss_score: 7.5,
        description: "Reflected XSS in search",
      }),
      mockFinding({
        id: "3",
        title: "Open Redirect",
        severity: "medium",
        cvss_score: 5.0,
      }),
    ];
    renderTable(<FindingsTable findings={findings} isLoading={false} />);

    await user.click(screen.getAllByText("XSS Attack")[0]);

    const detailRow = screen.getByTestId("finding-detail-row-2");
    expect(detailRow).toBeInTheDocument();
    expect(detailRow.querySelector("td")).toHaveAttribute("colspan", "7");
    expect(
      screen.getAllByText("Reflected XSS in search").length,
    ).toBeGreaterThan(0);

    const tbody = detailRow.closest("tbody");
    expect(tbody).not.toBeNull();
    const rows = Array.from(tbody!.querySelectorAll(":scope > tr"));
    const summaryIdx = rows.findIndex((r) => r.textContent?.includes("XSS Attack"));
    expect(summaryIdx).toBeGreaterThanOrEqual(0);
    expect(rows[summaryIdx + 1]).toBe(detailRow);

    await user.click(screen.getAllByText("XSS Attack")[0]);
    expect(screen.queryByTestId("finding-detail-row-2")).not.toBeInTheDocument();
  });
});
