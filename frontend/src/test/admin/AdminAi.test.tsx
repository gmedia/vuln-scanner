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
    updateAiProvider: vi.fn(),
    deleteAiProvider: vi.fn(),
    updateAiModel: vi.fn(),
    deleteAiModel: vi.fn(),
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
    expect(screen.getByRole("tab", { name: "Trial chat" })).toBeInTheDocument();
    const list = screen.getByRole("tablist");
    expect(list.className).toMatch(/min-w-max/);
    expect(list.className).not.toMatch(/\bw-full\b/);
  });

  it("lists provider and model with edit and delete", async () => {
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [
        {
          id: "p1",
          name: "OpenRouter",
          base_url: "https://openrouter.ai/api/v1",
          auth_header: "Authorization",
          credential_set: true,
          enabled: true,
          status: "ok",
          created_at: "",
          updated_at: "",
        },
      ],
      total: 1,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({
      items: [
        {
          id: "m1",
          provider_id: "p1",
          public_id: "sinexis/demo",
          upstream_id: "gpt",
          hpp_usd_per_1k_in: 0,
          hpp_usd_per_1k_out: 0,
          price_idr_per_1k_in: 1,
          price_idr_per_1k_out: 2,
          max_ctx: 1,
          max_tokens_cap: 1,
          enabled: true,
          created_at: "",
          updated_at: "",
        },
      ],
      total: 1,
    });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({
      items: [
        {
          id: "u1",
          organization_id: null,
          source: "admin_trial",
          model_public_id: "sinexis/demo",
          prompt_tokens: 1,
          completion_tokens: 1,
          billed_idr: 0,
          cogs_idr: 0,
          http_status: 200,
          created_at: "",
          request_payload: { model: "sinexis/demo" },
          response_payload: { id: "cmpl" },
        },
      ],
      total: 1,
    });
    renderPage();
    expect(await screen.findByText("OpenRouter")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Delete" }).length).toBeGreaterThan(0);
  });

  it("shows feature-off on 404", async () => {
    vi.mocked(adminApi.listAiProviders).mockRejectedValue({ response: { status: 404 } });
    renderPage();
    expect(
      await screen.findByText("The AI Gateway module is not enabled in this environment."),
    ).toBeInTheDocument();
  });
});
