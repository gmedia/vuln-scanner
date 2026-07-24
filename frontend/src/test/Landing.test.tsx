import { render, screen } from "@testing-library/react";
import { describe, it, beforeEach, expect } from "vitest";
import Landing from "@/pages/Landing";

vi.mock("react-router-dom", () => ({
  Link: ({ to, children }: any) => <a href={to}>{children}</a>,
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children, ...props }: any) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h3>{children}</h3>,
  CardContent: ({ children }: any) => <div>{children}</div>,
}));

describe("Landing Page", () => {
  beforeEach(() => {
    render(<Landing />);
  });

  it("renders VulnScanner title", () => {
    expect(screen.getByText("VulnScanner")).toBeInTheDocument();
  });

  it("renders description text", () => {
    expect(
      screen.getByText(
        "Web-based vulnerability scanner — IP, domain, and mobile analysis",
      ),
    ).toBeInTheDocument();
  });

  it("renders brand logo in top nav", () => {
    expect(screen.getByText("VULN")).toBeInTheDocument();
    expect(screen.getByText("SCAN")).toBeInTheDocument();
  });

  it('renders "Get Started" links pointing to /register', () => {
    const links = screen.getAllByRole("link", { name: /get started/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    links.forEach((link) => {
      expect(link).toHaveAttribute("href", "/register");
    });
  });

  it('renders "Sign In" links pointing to /login', () => {
    const links = screen.getAllByRole("link", { name: /sign in/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    links.forEach((link) => {
      expect(link).toHaveAttribute("href", "/login");
    });
  });

  it("renders trust line with real deploy facts", () => {
    expect(
      screen.getByText(/JWT auth · API key access · Docker Compose deploy/),
    ).toBeInTheDocument();
  });

  it("renders Features section heading", () => {
    expect(screen.getByText("Features")).toBeInTheDocument();
  });

  it("renders IP Scanner feature card with correct title", () => {
    expect(screen.getByText("IP Scanner")).toBeInTheDocument();
  });

  it("renders IP Scanner capability bullets", () => {
    expect(screen.getByText("Port scan (nmap)")).toBeInTheDocument();
    expect(screen.getByText("CVE lookup")).toBeInTheDocument();
  });

  it("renders Domain Scanner feature card with correct title", () => {
    expect(screen.getByText("Domain Scanner")).toBeInTheDocument();
  });

  it("renders Domain Scanner capability bullets", () => {
    expect(screen.getByText("DNS & subdomains")).toBeInTheDocument();
    expect(screen.getByText("SSL/TLS analysis")).toBeInTheDocument();
  });

  it("renders Mobile Scanner feature card with correct title", () => {
    expect(screen.getByText("Mobile Scanner")).toBeInTheDocument();
  });

  it("renders Mobile Scanner capability bullets", () => {
    expect(screen.getByText("APK/IPA static analysis")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret scan")).toBeInTheDocument();
  });

  it("renders 3 feature cards", () => {
    const cards = screen.getAllByTestId("card");
    expect(cards).toHaveLength(3);
  });

  it("renders footer with version text", () => {
    expect(screen.getByText(/VulnScanner v0\.1\.0/)).toBeInTheDocument();
  });
});
