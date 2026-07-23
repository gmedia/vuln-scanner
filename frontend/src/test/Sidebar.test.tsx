import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import { useScanStore } from "@/store/scanStore";
import { useAuthStore } from "@/store/authStore";
import { useCreditStore } from "@/store/creditStore";

vi.mock("@/store/creditStore", () => ({
  useCreditStore: vi.fn(() => ({
    credits: 0,
    fetchBalance: vi.fn(),
  })),
}));

describe("Sidebar", () => {
  const renderSidebar = (open: boolean, onClose = vi.fn()) => {
    return render(
      <MemoryRouter>
        <Sidebar open={open} onClose={onClose} />
      </MemoryRouter>,
    );
  };

  beforeEach(() => {
    useScanStore.setState({
      activeJobId: null,
      scanType: null,
      progress: 0,
      status: "pending",
    });
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      accessToken: null,
      isLoading: false,
      error: null,
    });
    vi.mocked(useCreditStore).mockReturnValue({
      credits: 0,
      isAdmin: false,
      isLoading: false,
      error: null,
      fetchBalance: vi.fn(),
      checkEligibility: vi.fn(),
    });
  });

  it("renders nav items", () => {
    renderSidebar(true);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("IP Scanner")).toBeInTheDocument();
    expect(screen.getByText("Domain Scanner")).toBeInTheDocument();
    expect(screen.getByText("Mobile Scanner")).toBeInTheDocument();
  });

  it("renames admin Dashboard to Admin overview", () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: "admin-1",
        email: "admin@example.com",
        is_verified: true,
        is_admin: true,
        credits: 100,
      },
      accessToken: "tok",
      isLoading: false,
      error: null,
    });
    renderSidebar(true);
    expect(screen.getByText("Admin overview")).toBeInTheDocument();
    const adminLinks = screen.getAllByRole("link").filter((a) =>
      a.getAttribute("href") === "/admin",
    );
    expect(adminLinks[0]).toHaveTextContent("Admin overview");
  });

  it("shows active scan section when activeJobId is set", () => {
    useScanStore.setState({ activeJobId: "scan-abc" });
    renderSidebar(true);
    expect(screen.getByText("Active Scan")).toBeInTheDocument();
    expect(screen.getByText("scan-abc".slice(0, 12) + "...")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("does not show active scan section when no activeJobId", () => {
    renderSidebar(true);
    expect(screen.queryByText("Active Scan")).toBeNull();
  });

  it("close button exists with X icon", () => {
    renderSidebar(true);
    const closeButton = screen.getByRole("button");
    expect(closeButton).toBeInTheDocument();
    expect(closeButton.querySelector("svg")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    renderSidebar(true, onClose);
    const closeButton = screen.getByRole("button");
    await closeButton.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders version text at bottom", () => {
    renderSidebar(true);
    expect(screen.getByText("VulnScanner v0.1.0")).toBeInTheDocument();
  });

  it("renders brand VULNSCAN in sidebar header", () => {
    renderSidebar(true);
    const brandLinks = screen.getAllByText("VULN");
    expect(brandLinks.length).toBeGreaterThanOrEqual(1);
    const scanLinks = screen.getAllByText("SCAN");
    expect(scanLinks.length).toBeGreaterThanOrEqual(1);
  });
});
