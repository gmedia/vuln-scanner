import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FindingDetail from "@/components/results/FindingDetail";
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
    impact:
      "If left unfixed, attackers can read or modify database contents via SQL injection.",
    attacker_benefit:
      "A named SQL injection lets attackers read or change data using public techniques.",
    raw_data: { vector: "AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" },
    found_at: "2024-01-01",
    ...overrides,
  };
}

describe("FindingDetail", () => {
  it("renders severity badge", () => {
    render(<FindingDetail finding={mockFinding()} />);
    expect(screen.getByText("critical")).toBeInTheDocument();
  });

  it("renders CVE ID as a link when present", () => {
    render(<FindingDetail finding={mockFinding()} />);
    const cveLink = screen.getByText("CVE-2024-1234");
    expect(cveLink).toBeInTheDocument();
    expect(cveLink.tagName).toBe("A");
    expect(cveLink).toHaveAttribute(
      "href",
      "https://nvd.nist.gov/vuln/detail/CVE-2024-1234"
    );
  });

  it("renders CVSS score", () => {
    render(<FindingDetail finding={mockFinding()} />);
    expect(screen.getByText("CVSS 9.8")).toBeInTheDocument();
  });

  it("renders description section with 'Description' label", () => {
    render(<FindingDetail finding={mockFinding()} />);
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(
      screen.getByText("SQL injection vulnerability in login form")
    ).toBeInTheDocument();
  });

  it("renders impact section with risk label when impact exists", () => {
    render(<FindingDetail finding={mockFinding()} />);
    expect(
      screen.getByText("Risk if not addressed")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/If left unfixed, attackers can read or modify/)
    ).toBeInTheDocument();
  });

  it("does NOT render impact section when impact is null", () => {
    render(<FindingDetail finding={mockFinding({ impact: null })} />);
    expect(
      screen.queryByText("Risk if not addressed")
    ).not.toBeInTheDocument();
  });

  it("renders attacker benefit section when present", () => {
    render(<FindingDetail finding={mockFinding()} />);
    expect(
      screen.getByText("What an attacker gains from knowing this")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/named SQL injection/)
    ).toBeInTheDocument();
  });

  it("does NOT render attacker benefit when null", () => {
    render(
      <FindingDetail finding={mockFinding({ attacker_benefit: null })} />
    );
    expect(
      screen.queryByText("What an attacker gains from knowing this")
    ).not.toBeInTheDocument();
  });

  it("renders remediation section with 'Saran aksi' label when remediation exists", () => {
    render(<FindingDetail finding={mockFinding()} />);
    expect(screen.getByText("Suggested action")).toBeInTheDocument();
  });

  it("does NOT render remediation section when remediation is null", () => {
    render(
      <FindingDetail
        finding={mockFinding({ remediation: null })}
      />
    );
    expect(screen.queryByText("Suggested action")).not.toBeInTheDocument();
  });

  it("renders 'RAW DATA' toggle button", async () => {
    const user = userEvent.setup();
    render(<FindingDetail finding={mockFinding()} />);
    const toggleButton = screen.getByText("RAW DATA");
    expect(toggleButton).toBeInTheDocument();
    await user.click(toggleButton);
    expect(
      screen.getByText(/AV:N\/AC:L/)
    ).toBeInTheDocument();
  });
});
