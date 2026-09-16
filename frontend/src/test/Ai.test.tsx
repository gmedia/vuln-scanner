import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    expect(await screen.findByText("Rp 12.000")).toBeInTheDocument();
    expect(screen.getByText("Balance (IDR)")).toBeInTheDocument();
  });

  it("shows empty wallet copy and credits CTA when balance is zero", async () => {
    vi.mocked(aiApi.getAiWallet).mockResolvedValue({
      organization_id: "org1",
      balance_idr: 0,
      currency: "IDR",
    });
    vi.mocked(aiApi.listAiKeys).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(aiApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(aiApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    renderAi();
    expect(
      await screen.findByText(
        "AI wallet is empty (IDR prepaid, not scan credits). Top up the org wallet to use the gateway.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("Rp 0")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Top up IDR wallet" });
    expect(cta).toHaveAttribute("href", "/guide");
    expect(cta.className).toMatch(/bg-primary/);
  });

  it("keeps key and catalog tabs on the tablist when rendered", async () => {
    vi.mocked(aiApi.getAiWallet).mockResolvedValue({
      organization_id: "org1",
      balance_idr: 0,
      currency: "IDR",
    });
    vi.mocked(aiApi.listAiKeys).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(aiApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(aiApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    renderAi();
    expect(await screen.findByRole("tab", { name: "Wallet" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Keys" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Catalog" })).toBeInTheDocument();
    const list = screen.getByRole("tablist");
    expect(list.className).toMatch(/min-w-max/);
    expect(list.className).not.toMatch(/\bw-full\b/);
    expect(screen.getByTestId("ai-tab-wallet")).toBeInTheDocument();
    expect(screen.getByTestId("ai-tab-keys")).toBeInTheDocument();
    expect(screen.getByTestId("ai-tab-usage")).toBeInTheDocument();
    expect(screen.getByTestId("ai-tab-catalog")).toBeInTheDocument();
  });

  it("shows a usage empty well with catalog CTA", async () => {
    vi.mocked(aiApi.getAiWallet).mockResolvedValue({
      organization_id: "org1",
      balance_idr: 0,
      currency: "IDR",
    });
    vi.mocked(aiApi.listAiKeys).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(aiApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(aiApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    const user = userEvent.setup();
    renderAi();
    await user.click(await screen.findByTestId("ai-tab-usage"));
    expect(await screen.findByTestId("ai-usage-empty")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See catalog" })).toBeInTheDocument();
    expect(screen.getByTestId("ai-usage-card")).not.toHaveClass("max-w-xl");
  });

  it("keeps keys card full-width and fills the create form when fewer than 3 keys", async () => {
    vi.mocked(aiApi.getAiWallet).mockResolvedValue({
      organization_id: "org1",
      balance_idr: 0,
      currency: "IDR",
    });
    vi.mocked(aiApi.listAiKeys).mockResolvedValue({
      items: [
        {
          id: "k1",
          name: "sinexis",
          prefix: "sx-mQ0HsrDRmy4XV",
          is_active: true,
          rate_limit_rpm: 60,
          created_at: "2026-09-13T10:00:00Z",
          last_used_at: null,
        },
      ],
      total: 1,
    });
    vi.mocked(aiApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(aiApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    const user = userEvent.setup();
    renderAi();
    await user.click(await screen.findByTestId("ai-tab-keys"));
    expect(await screen.findByTestId("ai-keys-card")).not.toHaveClass("max-w-xl");
    const nameWrap = screen.getByLabelText("Key name").closest("div");
    expect(nameWrap?.className).not.toMatch(/max-w-sm/);
    expect(screen.queryByTestId("ai-keys-grid")).not.toBeInTheDocument();
    expect(await screen.findByTestId("ai-keys-list-mobile")).toHaveClass(
      "space-y-2",
      "md:hidden",
    );
    const card = screen.getByTestId("ai-keys-card-k1");
    expect(card.textContent).toMatch(/sx-mQ0HsrDRmy4XV/);
    expect(card.textContent).toMatch(/sinexis/);
    expect(card.className).toMatch(/rounded-lg/);
    expect(card.className).toMatch(/border-border/);
    const desktop = screen.getByTestId("ai-keys-list-desktop");
    expect(desktop).toHaveClass("hidden", "md:block", "overflow-x-auto");
    expect(desktop.querySelector("table")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Revoke" }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("keeps catalog card full-width when fewer than 3 models", async () => {
    vi.mocked(aiApi.getAiWallet).mockResolvedValue({
      organization_id: "org1",
      balance_idr: 0,
      currency: "IDR",
    });
    vi.mocked(aiApi.listAiKeys).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(aiApi.listAiUsage).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(aiApi.listAiModels).mockResolvedValue({
      items: [
        {
          public_id: "sx/minimax-m3",
          price_idr_per_1k_in: 1000,
          price_idr_per_1k_out: 3000,
          max_ctx: 8192,
          max_tokens_cap: 2048,
        },
      ],
      total: 1,
    });
    const user = userEvent.setup();
    renderAi();
    await user.click(await screen.findByTestId("ai-tab-catalog"));
    expect(await screen.findByTestId("ai-catalog-card")).not.toHaveClass(
      "max-w-xl",
    );
    expect(screen.queryByTestId("ai-catalog-grid")).not.toBeInTheDocument();
    expect(await screen.findByTestId("ai-catalog-list-mobile")).toHaveClass(
      "space-y-2",
      "md:hidden",
    );
    const card = screen.getByTestId("ai-catalog-card-sx/minimax-m3");
    expect(card.textContent).toMatch(/sx\/minimax-m3/);
    expect(card.textContent).toMatch(/Rp 1\.000/);
    expect(card.textContent).toMatch(/Rp 3\.000/);
    expect(card.className).toMatch(/rounded-lg/);
    expect(card.className).toMatch(/border-border/);
    const desktop = screen.getByTestId("ai-catalog-list-desktop");
    expect(desktop).toHaveClass("hidden", "md:block", "overflow-x-auto");
    expect(desktop.querySelector("table")).toBeTruthy();
  });

  it("shows feature-off on 404", async () => {
    vi.mocked(aiApi.getAiWallet).mockRejectedValue({ response: { status: 404 } });
    renderAi();
    expect(
      await screen.findByText("The AI Gateway module is not enabled in this environment."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("ai-feature-off")).toBeInTheDocument();
  });

  it("asks to pick org when none active", () => {
    useAuthStore.setState({ activeOrgId: null });
    renderAi();
    expect(screen.getByText("Select an organization first.")).toBeInTheDocument();
  });

  it("renders stacked usage cards on small screens and a table from md", async () => {
    vi.mocked(aiApi.getAiWallet).mockResolvedValue({
      organization_id: "org1",
      balance_idr: 12000,
      currency: "IDR",
    });
    vi.mocked(aiApi.listAiKeys).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(aiApi.listAiModels).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(aiApi.listAiUsage).mockResolvedValue({
      items: [
        {
          id: "u1",
          source: "sdk",
          model_public_id: "gpt-4.1-mini",
          prompt_tokens: 120,
          completion_tokens: 40,
          billed_idr: 1500,
          created_at: "2026-09-13T10:00:00Z",
        },
      ],
      total: 1,
    });
    const user = userEvent.setup();
    renderAi();
    await user.click(await screen.findByRole("tab", { name: "Usage" }));
    expect(screen.getByTestId("ai-usage-card")).not.toHaveClass("max-w-xl");
    expect(await screen.findByTestId("ai-usage-list-mobile")).toHaveClass(
      "space-y-2",
      "md:hidden",
    );
    const card = screen.getByTestId("ai-usage-card-u1");
    expect(card.textContent).toMatch(/gpt-4\.1-mini/);
    expect(card.textContent).toMatch(/120\/40/);
    expect(card.textContent).toMatch(/Rp 1\.500/);
    expect(card.className).toMatch(/rounded-lg/);
    expect(card.className).toMatch(/border-border/);
    const desktop = screen.getByTestId("ai-usage-list-desktop");
    expect(desktop).toHaveClass("hidden", "md:block", "overflow-x-auto");
    expect(desktop.querySelector("table")).toBeTruthy();
    expect(desktop.querySelector("table")?.className).not.toMatch(
      /min-w-\[36rem\]/,
    );
  });
});
