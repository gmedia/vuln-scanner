import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Ai from "@/pages/Ai";
import { useAuthStore } from "@/store/authStore";
import * as aiApi from "@/api/ai";

vi.mock("@/api/ai", async () => {
  const actual = await vi.importActual<typeof import("@/api/ai")>("@/api/ai");
  return {
    ...actual,
    getAiWallet: vi.fn(),
    listAiKeys: vi.fn(),
    listAiModels: vi.fn(),
    listAiUsage: vi.fn(),
    createAiKey: vi.fn(),
    revokeAiKey: vi.fn(),
  };
});

function renderAi() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Ai />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AI Gateway page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: "u1",
        email: "member@example.test",
        is_admin: false,
        is_verified: true,
        credits: 10,
      } as never,
      isAuthenticated: true,
      accessToken: "t",
      isLoading: false,
      error: null,
      organizations: [
        { id: "org1", name: "Org", slug: "org", role: "owner" } as never,
      ],
      activeOrgId: "org1",
    });
  });

  it("renders heading and wallet", async () => {
    vi.mocked(aiApi.getAiWallet).mockResolvedValue({
      organization_id: "org1",
      balance_idr: 12000,
      currency: "IDR",
    });
    vi.mocked(aiApi.listAiKeys).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(aiApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(aiApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    renderAi();
    expect(await screen.findByText("AI Gateway")).toBeInTheDocument();
    expect(await screen.findByText("12000")).toBeInTheDocument();
  });

  it("shows feature-off on 404", async () => {
    vi.mocked(aiApi.getAiWallet).mockRejectedValue({ response: { status: 404 } });
    renderAi();
    expect(
      await screen.findByText("The AI Gateway module is not enabled in this environment."),
    ).toBeInTheDocument();
  });

  it("asks to pick org when none active", () => {
    useAuthStore.setState({ activeOrgId: null });
    renderAi();
    expect(screen.getByText("Select an organization first.")).toBeInTheDocument();
  });
});
