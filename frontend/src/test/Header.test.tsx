import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Header from "@/components/layout/Header";
import { useScanStore } from "@/store/scanStore";
import { useAuthStore } from "@/store/authStore";
import { useCreditStore } from "@/store/creditStore";

vi.mock("@/store/creditStore", () => ({
  useCreditStore: vi.fn(),
}));

function renderWithRouter(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Header", () => {
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
      organizations: [],
      activeOrgId: null,
    });
    const creditState = {
      credits: 42,
      isAdmin: false,
      isLoading: false,
      error: null,
      fetchBalance: vi.fn(),
      checkEligibility: vi.fn(),
    };
    vi.mocked(useCreditStore).mockImplementation(((
      selector?: (s: typeof creditState) => unknown,
    ) =>
      typeof selector === "function"
        ? selector(creditState)
        : creditState) as typeof useCreditStore);
  });

  it("renders brand name SINEXIS", () => {
    renderWithRouter(<Header />);
    expect(screen.getByText("SINE")).toBeInTheDocument();
    expect(screen.getByText("XIS")).toBeInTheDocument();
  });

  it("renders children", () => {
    renderWithRouter(
      <Header>
        <button>Test Child</button>
      </Header>,
    );
    expect(
      screen.getByRole("button", { name: "Test Child" }),
    ).toBeInTheDocument();
  });

  it("shows scan progress when activeJobId is set", () => {
    useScanStore.setState({
      activeJobId: "job-123",
      scanType: "ip",
      progress: 45,
    });
    renderWithRouter(<Header />);
    expect(screen.getByText("IP Address")).toBeInTheDocument();
    expect(screen.getByText("45%")).toBeInTheDocument();
  });

  it("hides progress when no active scan", () => {
    renderWithRouter(<Header />);
    expect(screen.queryByText("%")).toBeNull();
  });

  it("renders with different scan type label", () => {
    useScanStore.setState({
      activeJobId: "job-456",
      scanType: "domain",
      progress: 80,
    });
    renderWithRouter(<Header />);
    expect(screen.getByText("Domain")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("renders scanType fallback when label not found", () => {
    useScanStore.setState({
      activeJobId: "job-789",
      scanType: "unknown_type",
      progress: 10,
    });
    renderWithRouter(<Header />);
    expect(screen.getByText("unknown_type")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
  });

  it("shows credits chip when authenticated", () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: "u1",
        email: "user@example.com",
        is_verified: true,
        is_admin: false,
        credits: 10,
      },
      accessToken: "tok",
      isLoading: false,
      error: null,
    });
    renderWithRouter(<Header />);
    expect(screen.getByTestId("header-credits")).toHaveTextContent("42");
    expect(
      screen.getByTitle("Saldo kredit pribadi"),
    ).toBeInTheDocument();
  });

  it("shows org switcher when organizations present", () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: "u1",
        email: "user@example.com",
        is_verified: true,
        is_admin: false,
        credits: 10,
      },
      accessToken: "tok",
      isLoading: false,
      error: null,
      organizations: [
        {
          id: "org-1",
          name: "Personal",
          slug: "personal",
          role: "owner",
        },
      ],
      activeOrgId: "org-1",
    });
    renderWithRouter(<Header />);
    expect(screen.getByTestId("org-switcher")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("hides credits chip when not authenticated", () => {
    renderWithRouter(<Header />);
    expect(screen.queryByTestId("header-credits")).toBeNull();
  });

  it("opens user menu with Sign Out", async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: "u1",
        email: "user@example.com",
        is_verified: true,
        is_admin: false,
        credits: 10,
      },
      accessToken: "tok",
      isLoading: false,
      error: null,
    });
    renderWithRouter(<Header />);
    await user.click(screen.getByRole("button", { name: /user@example.com/i }));
    expect(screen.getByTestId("user-menu")).toBeInTheDocument();
    expect(screen.getByTestId("sign-out")).toHaveTextContent("Sign Out");
    expect(screen.getByText(/Signed in as/)).toBeInTheDocument();
  });
});
