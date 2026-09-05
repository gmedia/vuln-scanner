import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminAi from "@/pages/admin/AdminAi";
import * as adminApi from "@/api/admin";

vi.mock("@/api/admin", async () => {
  const actual = await vi.importActual<typeof import("@/api/admin")>("@/api/admin");
  return {
    ...actual,
    listAiProviders: vi.fn(),
    listAiModels: vi.fn(),
    listAiUsage: vi.fn(),
    createAiProvider: vi.fn(),
    createAiModel: vi.fn(),
    topupAiWallet: vi.fn(),
    adminAiChat: vi.fn(),
  };
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminAi />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminAi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading and empty providers", async () => {
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    renderPage();
    expect(await screen.findByText("AI Gateway")).toBeInTheDocument();
    expect(await screen.findByText("No providers.")).toBeInTheDocument();
  });

  it("shows feature-off on 404", async () => {
    vi.mocked(adminApi.listAiProviders).mockRejectedValue({ response: { status: 404 } });
    renderPage();
    expect(
      await screen.findByText("The AI Gateway module is not enabled in this environment."),
    ).toBeInTheDocument();
  });
});
