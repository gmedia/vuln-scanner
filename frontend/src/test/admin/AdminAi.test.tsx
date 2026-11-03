import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminAi from "@/pages/admin/AdminAi";
import * as adminApi from "@/api/admin";
import { routingPositions } from "@/components/admin/aiUpstreamOrder";
import { toast } from "sonner";

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/api/admin", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/admin")>("@/api/admin");
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
    createAiModelUpstream: vi.fn(),
    updateAiModelUpstream: vi.fn(),
    deleteAiModelUpstream: vi.fn(),
    topupAiWallet: vi.fn(),
    adminAiChat: vi.fn(),
    getAiFx: vi.fn(),
    refreshAiFx: vi.fn(),
    setAiFxManual: vi.fn(),
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

function makeProvider(
  id: string,
  name: string,
  overrides: Partial<adminApi.AiProviderAdmin> = {},
): adminApi.AiProviderAdmin {
  return {
    id,
    name,
    base_url: "https://openrouter.ai/api/v1",
    auth_header: "Authorization",
    credential_set: true,
    enabled: true,
    status: "ok",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeUpstream(
  overrides: Partial<adminApi.AiModelUpstreamAdmin> = {},
): adminApi.AiModelUpstreamAdmin {
  return {
    id: "u1",
    provider_id: "p1",
    provider_name: "OpenRouter",
    provider_status: "ok",
    provider_enabled: true,
    upstream_id: "gpt-fallback",
    hpp_usd_per_1m_in: null,
    hpp_usd_per_1m_out: null,
    max_tokens_cap: null,
    rank: 1,
    enabled: true,
    ...overrides,
  };
}

function makeModel(
  overrides: Partial<adminApi.AiModelAdmin> = {},
): adminApi.AiModelAdmin {
  return {
    id: "m1",
    provider_id: "p1",
    public_id: "sinexis/demo",
    upstream_id: "gpt",
    hpp_usd_per_1k_in: 0,
    hpp_usd_per_1k_out: 0,
    price_idr_per_1k_in: 1,
    price_idr_per_1k_out: 2,
    price_usd_per_1m_in: 0.06135,
    price_usd_per_1m_out: 0.1227,
    hpp_usd_per_1m_in: 0,
    hpp_usd_per_1m_out: 0,
    max_ctx: 1,
    max_tokens_cap: 4096,
    enabled: true,
    created_at: "",
    updated_at: "",
    upstreams: [],
    ...overrides,
  };
}

async function openUpstreamSheet(
  user: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> {
  await user.click(await screen.findByRole("tab", { name: "Models" }));
  await screen.findByTestId("admin-ai-model-card-m1");
  await user.click(screen.getAllByTestId("admin-ai-model-actions-m1")[0]);
  await user.click(await screen.findByTestId("admin-ai-model-upstreams-m1"));
  return await screen.findByTestId("admin-ai-upstream-sheet");
}

describe("AdminAi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getAiFx).mockResolvedValue({
      rate: 16300,
      source: "api.frankfurter.app",
      effective_date: "2026-10-30",
      fetched_at: "2026-10-30T01:10:00Z",
      using_env_fallback: false,
      env_rate: 16000,
      auto_fetch_enabled: true,
      history: [],
    });
  });

  it("renders heading and empty providers", async () => {
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [],
      total: 0,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    renderPage();
    expect(await screen.findByText("AI Gateway")).toBeInTheDocument();
    expect(await screen.findByText("No providers.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Trial chat" })).toBeInTheDocument();
    const list = screen.getByRole("tablist");
    expect(list).toHaveAttribute("data-variant", "line");
    expect(list.className).toMatch(/\bw-full\b/);
    expect(list.className).not.toMatch(/min-w-max/);
    expect(list.className).toMatch(/\bflex-wrap\b/);
    expect(list.className).toMatch(/\bsm:flex-nowrap\b/);
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
          price_usd_per_1m_in: 0.06135,
          price_usd_per_1m_out: 0.1227,
          hpp_usd_per_1m_in: 0,
          hpp_usd_per_1m_out: 0,
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
    expect(
      await screen.findByTestId("admin-ai-provider-card-p1"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("OpenRouter").length).toBeGreaterThan(0);
    expect(screen.getByTestId("admin-ai-providers-mobile")).toHaveClass(
      "space-y-2",
      "md:hidden",
    );
    expect(screen.getByTestId("admin-ai-provider-card-p1")).toBeInTheDocument();
    expect(screen.getByTestId("admin-ai-providers-desktop")).toHaveClass(
      "hidden",
      "md:block",
    );
    await userEvent.click(
      screen.getAllByTestId("admin-ai-provider-actions-p1")[0],
    );
    expect(
      await screen.findByTestId("admin-ai-provider-edit-p1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("admin-ai-provider-delete-p1"),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("tab", { name: "Models" }));
    expect(await screen.findByTestId("admin-ai-models-mobile")).toHaveClass(
      "space-y-2",
      "md:hidden",
    );
    expect(screen.getByTestId("admin-ai-model-card-m1")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", {
        name: "Price IDR / 1K in",
        hidden: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", {
        name: "Price IDR / 1K out",
        hidden: true,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Rp 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rp 2").length).toBeGreaterThan(0);
  });

  it("shows a degraded badge for a degraded provider", async () => {
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [makeProvider("p1", "OpenRouter", { status: "degraded" })],
      total: 1,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    renderPage();
    const desktop = await screen.findByTestId("admin-ai-providers-desktop");
    expect(
      within(desktop).getByTestId("admin-ai-provider-state-p1"),
    ).toHaveTextContent("Degraded");
  });

  it("shows an off badge and enable action for a disabled provider", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [makeProvider("p1", "OpenRouter", { enabled: false })],
      total: 1,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    renderPage();
    const desktop = await screen.findByTestId("admin-ai-providers-desktop");
    expect(
      within(desktop).getByTestId("admin-ai-provider-state-p1"),
    ).toHaveTextContent("Not routed");
    await user.click(screen.getAllByTestId("admin-ai-provider-actions-p1")[0]);
    expect(await screen.findByTestId("ai-provider-toggle-p1")).toHaveTextContent(
      "Enable",
    );
  });

  it("toggles a provider off through the API", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [makeProvider("p1", "OpenRouter")],
      total: 1,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.updateAiProvider).mockResolvedValue(
      makeProvider("p1", "OpenRouter", { enabled: false }),
    );
    renderPage();
    await screen.findByTestId("admin-ai-provider-card-p1");
    await user.click(screen.getAllByTestId("admin-ai-provider-actions-p1")[0]);
    await user.click(await screen.findByTestId("ai-provider-toggle-p1"));
    await waitFor(() =>
      expect(adminApi.updateAiProvider).toHaveBeenCalledWith("p1", {
        enabled: false,
      }),
    );
  });

  it("clears a disabled status when the provider is turned back on", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [makeProvider("p1", "OpenRouter", { status: "disabled" })],
      total: 1,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.updateAiProvider).mockResolvedValue(
      makeProvider("p1", "OpenRouter"),
    );
    renderPage();
    await screen.findByTestId("admin-ai-provider-card-p1");
    await user.click(screen.getAllByTestId("admin-ai-provider-actions-p1")[0]);
    const toggle = await screen.findByTestId("ai-provider-toggle-p1");
    expect(toggle).toHaveTextContent("Enable");
    await user.click(toggle);
    await waitFor(() =>
      expect(adminApi.updateAiProvider).toHaveBeenCalledWith("p1", {
        enabled: true,
        status: "ok",
      }),
    );
  });

  it("leaves status alone when enabling an already-ok provider", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [makeProvider("p1", "OpenRouter", { enabled: false })],
      total: 1,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.updateAiProvider).mockResolvedValue(
      makeProvider("p1", "OpenRouter"),
    );
    renderPage();
    await screen.findByTestId("admin-ai-provider-card-p1");
    await user.click(screen.getAllByTestId("admin-ai-provider-actions-p1")[0]);
    await user.click(await screen.findByTestId("ai-provider-toggle-p1"));
    await waitFor(() =>
      expect(adminApi.updateAiProvider).toHaveBeenCalledWith("p1", {
        enabled: true,
      }),
    );
  });

  it("switches the models price unit to USD / 1M tokens", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [],
      total: 0,
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
          price_idr_per_1k_in: 1000,
          price_idr_per_1k_out: 2000,
          price_usd_per_1m_in: 61.35,
          price_usd_per_1m_out: 122.7,
          hpp_usd_per_1m_in: 0,
          hpp_usd_per_1m_out: 0,
          max_ctx: 1,
          max_tokens_cap: 1,
          enabled: true,
          created_at: "",
          updated_at: "",
        },
      ],
      total: 1,
    });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    renderPage();
    await user.click(await screen.findByRole("tab", { name: "Models" }));
    await screen.findByTestId("admin-ai-model-card-m1");
    const unitSelect = await screen.findByRole("combobox", {
      name: "Price unit",
    });
    await waitFor(() => expect(unitSelect).toBeEnabled());
    await user.click(unitSelect);
    await user.click(await screen.findByRole("option", { name: "USD / 1M tokens" }));
    expect(await screen.findAllByText("$61.35")).not.toHaveLength(0);
    expect(screen.queryByText("Rp 1.000")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("sinexis.admin.aiPriceUnit")).toBe(
      "usd_1m",
    );
  });

  it("asks before deleting an AI model", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [],
      total: 0,
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
          price_usd_per_1m_in: 0.06135,
          price_usd_per_1m_out: 0.1227,
          hpp_usd_per_1m_in: 0,
          hpp_usd_per_1m_out: 0,
          max_ctx: 1,
          max_tokens_cap: 1,
          enabled: true,
          created_at: "",
          updated_at: "",
        },
      ],
      total: 1,
    });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.deleteAiModel).mockResolvedValue(undefined);
    renderPage();
    await user.click(screen.getByRole("tab", { name: "Models" }));
    await screen.findByTestId("admin-ai-model-card-m1");
    await user.click(screen.getAllByTestId("admin-ai-model-actions-m1")[0]);
    await user.click(await screen.findByTestId("admin-ai-model-delete-m1"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(adminApi.deleteAiModel).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("admin-ai-model-delete-confirm"));
    expect(adminApi.deleteAiModel).toHaveBeenCalledWith("m1");
  });

  it("submits USD prices on create and update without client-side IDR conversion", async () => {
    const user = userEvent.setup();
    const provider = {
      id: "p1",
      name: "OpenRouter",
      base_url: "https://openrouter.ai/api/v1",
      auth_header: "Authorization",
      credential_set: true,
      enabled: true,
      status: "ok",
      created_at: "",
      updated_at: "",
    };
    const model: adminApi.AiModelAdmin = {
      id: "m1",
      provider_id: "p1",
      public_id: "sinexis/demo",
      upstream_id: "gpt",
      hpp_usd_per_1k_in: 0,
      hpp_usd_per_1k_out: 0,
      price_idr_per_1k_in: 1000,
      price_idr_per_1k_out: 2000,
      price_usd_per_1m_in: 61.35,
      price_usd_per_1m_out: 122.7,
      hpp_usd_per_1m_in: 0,
      hpp_usd_per_1m_out: 0,
      max_ctx: 1,
      max_tokens_cap: 1,
      enabled: true,
      created_at: "",
      updated_at: "",
    };
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [provider],
      total: 1,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({
      items: [model],
      total: 1,
    });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.createAiModel).mockResolvedValue(model);
    vi.mocked(adminApi.updateAiModel).mockResolvedValue(model);
    renderPage();

    await user.click(await screen.findByRole("tab", { name: "Models" }));
    const providerSelect = await screen.findByRole("combobox", {
      name: "Provider id",
    });
    await user.click(providerSelect);
    await user.click(await screen.findByRole("option", { name: "OpenRouter" }));
    await user.click(screen.getByRole("button", { name: "Add model" }));

    await waitFor(() => expect(adminApi.createAiModel).toHaveBeenCalledTimes(1));
    const created = vi.mocked(adminApi.createAiModel).mock.calls[0][0];
    expect(created).toMatchObject({
      provider_id: "p1",
      public_id: "sinexis/demo",
      upstream_id: "openai/gpt-4o-mini",
      price_usd_per_1m_in: 0.15,
      price_usd_per_1m_out: 0.6,
      hpp_usd_per_1m_in: 0,
      hpp_usd_per_1m_out: 0,
    });
    expect(created).not.toHaveProperty("price_idr_per_1k_in");
    expect(created).not.toHaveProperty("price_idr_per_1k_out");

    await user.click(screen.getAllByTestId("admin-ai-model-actions-m1")[0]);
    await user.click(await screen.findByTestId("admin-ai-model-edit-m1"));
    const outInput = screen
      .getAllByLabelText("Price USD / 1M out")
      .find((el) => el.id === "ai-m-edit-out-m1");
    expect(outInput).toBeTruthy();
    await user.clear(outInput as HTMLElement);
    await user.type(outInput as HTMLElement, "3.5");
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]);

    await waitFor(() => expect(adminApi.updateAiModel).toHaveBeenCalledTimes(1));
    const [updatedId, updatedPayload] = vi.mocked(adminApi.updateAiModel).mock
      .calls[0];
    expect(updatedId).toBe("m1");
    expect(updatedPayload).toMatchObject({
      price_usd_per_1m_in: 61.35,
      price_usd_per_1m_out: 3.5,
      hpp_usd_per_1m_in: 0,
      hpp_usd_per_1m_out: 0,
    });
    expect(updatedPayload).not.toHaveProperty("price_idr_per_1k_in");
    expect(updatedPayload).not.toHaveProperty("price_idr_per_1k_out");
  });

  it("asks before deleting an AI provider", async () => {
    const user = userEvent.setup();
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
    vi.mocked(adminApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.deleteAiProvider).mockResolvedValue(undefined);
    renderPage();
    await screen.findByTestId("admin-ai-provider-card-p1");
    await user.click(screen.getAllByTestId("admin-ai-provider-actions-p1")[0]);
    await user.click(await screen.findByTestId("admin-ai-provider-delete-p1"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(adminApi.deleteAiProvider).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("admin-ai-provider-delete-confirm"));
    expect(adminApi.deleteAiProvider).toHaveBeenCalledWith("p1");
  });

  it("toasts when deleting an AI provider fails", async () => {
    const user = userEvent.setup();
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
    vi.mocked(adminApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.deleteAiProvider).mockRejectedValue(new Error("boom"));
    renderPage();
    await screen.findByTestId("admin-ai-provider-card-p1");
    await user.click(screen.getAllByTestId("admin-ai-provider-actions-p1")[0]);
    await user.click(await screen.findByTestId("admin-ai-provider-delete-p1"));
    await user.click(screen.getByTestId("admin-ai-provider-delete-confirm"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not delete provider."),
    );
  });

  it("uses i18n labels for usage source and billed columns", async () => {
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [],
      total: 0,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
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
          request_payload: null,
          response_payload: null,
        },
      ],
      total: 1,
    });
    renderPage();
    await userEvent.click(await screen.findByRole("tab", { name: "Usage" }));
    expect(await screen.findByTestId("admin-ai-usage-mobile")).toHaveClass(
      "space-y-2",
      "md:hidden",
    );
    expect(screen.getByTestId("admin-ai-usage-card-u1")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Source", hidden: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Billed (IDR)", hidden: true }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "source" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("admin-ai-usage-pagination"),
    ).not.toBeInTheDocument();
  });

  it("pages usage when the API reports more than one page", async () => {
    const row = (id: string, model: string) => ({
      id,
      organization_id: null,
      source: "admin_trial",
      model_public_id: model,
      prompt_tokens: 1,
      completion_tokens: 1,
      billed_idr: 0,
      cogs_idr: 0,
      http_status: 200,
      created_at: "",
      request_payload: null,
      response_payload: null,
    });
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [],
      total: 0,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.listAiUsage).mockImplementation(async (params) => {
      const page = params?.page ?? 1;
      if (page === 2) {
        return { items: [row("u21", "sinexis/page-2")], total: 21 };
      }
      return { items: [row("u1", "sinexis/page-1")], total: 21 };
    });
    renderPage();
    await userEvent.click(await screen.findByRole("tab", { name: "Usage" }));
    expect(
      await screen.findByTestId("admin-ai-usage-pagination"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("admin-ai-usage-card-u1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /next page/i }));
    expect(
      await screen.findByTestId("admin-ai-usage-card-u21"),
    ).toBeInTheDocument();
    expect(adminApi.listAiUsage).toHaveBeenCalledWith({ page: 2, limit: 20 });
  });

  it("shows feature-off on 404", async () => {
    vi.mocked(adminApi.listAiProviders).mockRejectedValue({
      response: { status: 404 },
    });
    renderPage();
    expect(
      await screen.findByText(
        "The AI Gateway module is not enabled in this environment.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("admin-ai-feature-off").querySelector(".bg-amber-600"),
    ).toBeTruthy();
  });

  it("rails the usage shell primary", async () => {
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [],
      total: 0,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    renderPage();
    await userEvent.click(await screen.findByRole("tab", { name: "Usage" }));
    expect(
      (await screen.findByTestId("admin-ai-usage-shell")).querySelector(
        ".bg-primary",
      ),
    ).toBeTruthy();
  });

  it("opens the fallback sheet with the primary and existing candidates", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [makeProvider("p1", "OpenRouter"), makeProvider("p2", "Together")],
      total: 2,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({
      items: [
        makeModel({
          upstreams: [
            makeUpstream({
              id: "u1",
              provider_id: "p2",
              provider_name: "Together",
              upstream_id: "meta/llama",
            }),
          ],
        }),
      ],
      total: 1,
    });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    renderPage();
    const sheet = await openUpstreamSheet(user);
    const scope = within(sheet);
    expect(scope.getByText("Fallback upstreams")).toBeInTheDocument();
    expect(scope.getByText("Primary")).toBeInTheDocument();
    expect(scope.getByText("OpenRouter")).toBeInTheDocument();
    expect(scope.getByText("gpt")).toBeInTheDocument();
    expect(scope.getByDisplayValue("meta/llama")).toBeInTheDocument();
    expect(scope.getByText("#2")).toBeInTheDocument();
  });

  it("adds a fallback upstream and updates the badge", async () => {
    const user = userEvent.setup();
    const saved = makeModel({
      upstreams: [
        makeUpstream({
          id: "u9",
          provider_id: "p1",
          provider_name: "OpenRouter",
          upstream_id: "gpt-4o-mini",
        }),
      ],
    });
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [makeProvider("p1", "OpenRouter")],
      total: 1,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({
      items: [makeModel()],
      total: 1,
    });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.createAiModelUpstream).mockResolvedValue(saved);
    renderPage();
    const sheet = await openUpstreamSheet(user);
    const scope = within(sheet);
    await user.click(scope.getByTestId("ai-upstream-add"));
    await user.click(scope.getByRole("combobox", { name: "Provider id" }));
    await user.click(await screen.findByRole("option", { name: "OpenRouter" }));
    await user.type(scope.getByLabelText("Upstream id"), "gpt-4o-mini");
    await user.click(scope.getByTestId("ai-upstream-save-__new__"));

    await waitFor(() =>
      expect(adminApi.createAiModelUpstream).toHaveBeenCalledTimes(1),
    );
    const [modelId, body] = vi.mocked(adminApi.createAiModelUpstream).mock
      .calls[0];
    expect(modelId).toBe("m1");
    expect(body).toMatchObject({
      provider_id: "p1",
      upstream_id: "gpt-4o-mini",
      hpp_usd_per_1m_in: null,
      hpp_usd_per_1m_out: null,
      max_tokens_cap: null,
      rank: 1,
    });
    const badges = await screen.findAllByTestId("ai-model-fallback-count-m1");
    expect(badges.length).toBeGreaterThan(0);
    expect(badges[0]).toHaveTextContent("+1 fallback");
  });

  it("disables adding a fallback at the candidate cap", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [makeProvider("p1", "OpenRouter")],
      total: 1,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({
      items: [
        makeModel({
          upstreams: [
            makeUpstream({ id: "u1", rank: 1, upstream_id: "fallback-1" }),
            makeUpstream({ id: "u2", rank: 2, upstream_id: "fallback-2" }),
            makeUpstream({ id: "u3", rank: 3, upstream_id: "fallback-3" }),
          ],
        }),
      ],
      total: 1,
    });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    renderPage();
    const sheet = await openUpstreamSheet(user);
    const scope = within(sheet);
    expect(scope.getByTestId("ai-upstream-add")).toBeDisabled();
    expect(scope.getByText(/Up to 3 fallbacks/)).toBeInTheDocument();
  });

  it("confirms before deleting a fallback upstream", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [makeProvider("p1", "OpenRouter")],
      total: 1,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({
      items: [
        makeModel({
          upstreams: [
            makeUpstream({ id: "u1", upstream_id: "meta/llama" }),
          ],
        }),
      ],
      total: 1,
    });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.deleteAiModelUpstream).mockResolvedValue(makeModel());
    renderPage();
    const sheet = await openUpstreamSheet(user);
    const scope = within(sheet);
    expect(scope.getByDisplayValue("meta/llama")).toBeInTheDocument();
    await user.click(scope.getByTestId("ai-upstream-delete-u1"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(adminApi.deleteAiModelUpstream).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("ai-upstream-delete-confirm"));
    await waitFor(() =>
      expect(adminApi.deleteAiModelUpstream).toHaveBeenCalledWith("m1", "u1"),
    );
    expect(
      await screen.findByText("No fallback upstreams yet."),
    ).toBeInTheDocument();
  });
});

describe("fallback routing order", () => {
  const candidate = (
    key: string,
    rank: number,
    overrides: Partial<{
      enabled: boolean;
      providerEnabled: boolean;
      providerStatus: string;
    }> = {},
  ) => ({
    key,
    rank,
    enabled: true,
    providerEnabled: true,
    providerStatus: "ok",
    ...overrides,
  });

  it("tries degraded providers after healthy ones and keeps rank order", () => {
    const positions = routingPositions([
      candidate("primary", 0, { providerStatus: "degraded" }),
      candidate("a", 1),
      candidate("b", 2),
    ]);
    expect(positions.get("a")?.position).toBe(1);
    expect(positions.get("b")?.position).toBe(2);
    expect(positions.get("primary")?.position).toBe(3);
    expect(positions.get("primary")?.degraded).toBe(true);
  });

  it("skips a disabled row and a disabled provider", () => {
    const positions = routingPositions([
      candidate("primary", 0),
      candidate("off-row", 1, { enabled: false }),
      candidate("off-provider", 2, { providerEnabled: false }),
      candidate("disabled-status", 3, { providerStatus: "disabled" }),
    ]);
    expect(positions.get("off-row")?.skipped).toBe(true);
    expect(positions.get("off-provider")?.skipped).toBe(true);
    expect(positions.get("disabled-status")?.skipped).toBe(true);
    expect(positions.get("off-row")?.position).toBeNull();
    expect(positions.get("primary")?.position).toBe(1);
  });

  it("marks a degraded fallback in the sheet", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [makeProvider("p1", "OpenRouter"), makeProvider("p2", "Together")],
      total: 2,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({
      items: [
        makeModel({
          upstreams: [
            makeUpstream({
              id: "u1",
              provider_id: "p2",
              provider_name: "Together",
              provider_status: "degraded",
              upstream_id: "meta/llama",
            }),
          ],
        }),
      ],
      total: 1,
    });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    renderPage();
    const sheet = await openUpstreamSheet(user);
    expect(
      within(sheet).getByTestId("ai-upstream-degraded-u1"),
    ).toBeInTheDocument();
  });

  it("moves a fallback down and applies the re-sequenced model", async () => {
    const user = userEvent.setup();
    const first = makeUpstream({
      id: "u1",
      rank: 1,
      upstream_id: "fallback-1",
    });
    const second = makeUpstream({
      id: "u2",
      rank: 2,
      upstream_id: "fallback-2",
    });
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [makeProvider("p1", "OpenRouter")],
      total: 1,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({
      items: [makeModel({ upstreams: [first, second] })],
      total: 1,
    });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(adminApi.updateAiModelUpstream).mockResolvedValue(
      makeModel({
        upstreams: [
          { ...second, rank: 1 },
          { ...first, rank: 2 },
        ],
      }),
    );
    renderPage();
    const sheet = await openUpstreamSheet(user);
    const scope = within(sheet);
    await user.click(scope.getByTestId("ai-upstream-move-down-u1"));
    await waitFor(() =>
      expect(adminApi.updateAiModelUpstream).toHaveBeenCalledWith(
        "m1",
        "u1",
        { rank: 2 },
      ),
    );
    await waitFor(() =>
      expect(
        scope
          .getAllByLabelText("Upstream id")
          .map((input) => (input as HTMLInputElement).value),
      ).toEqual(["fallback-2", "fallback-1"]),
    );
  });

  it("disables move up on the first row and move down on the last row", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [makeProvider("p1", "OpenRouter")],
      total: 1,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({
      items: [
        makeModel({
          upstreams: [
            makeUpstream({ id: "u1", rank: 1, upstream_id: "fallback-1" }),
            makeUpstream({ id: "u2", rank: 2, upstream_id: "fallback-2" }),
          ],
        }),
      ],
      total: 1,
    });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    renderPage();
    const sheet = await openUpstreamSheet(user);
    const scope = within(sheet);
    expect(scope.getByTestId("ai-upstream-move-up-u1")).toBeDisabled();
    expect(scope.getByTestId("ai-upstream-move-down-u1")).toBeEnabled();
    expect(scope.getByTestId("ai-upstream-move-up-u2")).toBeEnabled();
    expect(scope.getByTestId("ai-upstream-move-down-u2")).toBeDisabled();
  });

  it("cannot move the unsaved draft", async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.listAiProviders).mockResolvedValue({
      items: [makeProvider("p1", "OpenRouter")],
      total: 1,
    });
    vi.mocked(adminApi.listAiModels).mockResolvedValue({
      items: [
        makeModel({
          upstreams: [
            makeUpstream({ id: "u1", rank: 1, upstream_id: "fallback-1" }),
          ],
        }),
      ],
      total: 1,
    });
    vi.mocked(adminApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    renderPage();
    const sheet = await openUpstreamSheet(user);
    const scope = within(sheet);
    await user.click(scope.getByTestId("ai-upstream-add"));
    expect(scope.getByTestId("ai-upstream-move-up-__new__")).toBeDisabled();
    expect(scope.getByTestId("ai-upstream-move-down-__new__")).toBeDisabled();
  });
});
