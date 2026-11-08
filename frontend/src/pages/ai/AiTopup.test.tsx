import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AiTopup from "@/pages/ai/AiTopup";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import {
  createTopupOrder,
  getTopupOrders,
  getTopupPacks,
  type TopupPack,
  type TopupOrder,
} from "@/api/aiTopup";
import { getAiWallet } from "@/api/ai";

vi.mock("@/api/aiTopup", async () => {
  const actual = await vi.importActual<typeof import("@/api/aiTopup")>(
    "@/api/aiTopup",
  );
  return {
    ...actual,
    getTopupPacks: vi.fn(),
    createTopupOrder: vi.fn(),
    getTopupOrders: vi.fn(),
    getTopupOrder: vi.fn(),
    uploadTopupProof: vi.fn(),
    checkoutTopupOrder: vi.fn(),
    cancelTopupOrder: vi.fn(),
  };
});

vi.mock("@/api/ai", async () => {
  const actual = await vi.importActual<typeof import("@/api/ai")>("@/api/ai");
  return {
    ...actual,
    getAiWallet: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function pack(overrides: Partial<TopupPack> = {}): TopupPack {
  return {
    id: "p1",
    code: "starter",
    label: "Starter",
    amount_idr: 100_000,
    bonus_idr: 0,
    active: true,
    sort_order: 0,
    ...overrides,
  };
}

function order(overrides: Partial<TopupOrder> = {}): TopupOrder {
  return {
    id: "o1",
    organization_id: "org1",
    reference_code: "261107-ABC123",
    amount_idr: 100_000,
    credit_idr: 100_000,
    bonus_idr: 0,
    currency: "IDR",
    payment_method: "manual_transfer",
    status: "pending_payment",
    has_proof: false,
    proof_uploaded_at: null,
    paid_at: null,
    expires_at: "2026-11-10T00:00:00Z",
    created_at: "2026-11-07T00:00:00Z",
    updated_at: "2026-11-07T00:00:00Z",
    bank: null,
    ...overrides,
  };
}

function renderPage(entry = "/ai/topup") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/ai/topup" element={<AiTopup />} />
          <Route
            path="/ai/topup/:orderId"
            element={<div>status page</div>}
          />
          <Route path="/ai" element={<div>ai page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AiTopup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: "u1",
        email: "owner@example.test",
        is_admin: false,
        is_verified: true,
        credits: 0,
      } as never,
      isAuthenticated: true,
      accessToken: "t",
      isLoading: false,
      organizations: [
        { id: "org1", name: "Org", slug: "org", role: "owner" } as never,
      ],
      activeOrgId: "org1",
    });
    vi.mocked(getAiWallet).mockResolvedValue({
      organization_id: "org1",
      balance_idr: 25_000,
      currency: "IDR",
    });
    vi.mocked(getTopupOrders).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
  });

  it("renders packs, disables submit until a pack is chosen, then posts the pack", async () => {
    vi.mocked(getTopupPacks).mockResolvedValue({
      items: [
        pack(),
        pack({ id: "p2", code: "growth", label: "Growth", amount_idr: 500_000, sort_order: 1 }),
      ],
      total: 2,
    });
    vi.mocked(createTopupOrder).mockResolvedValue(order());
    renderPage();

    expect(await screen.findByTestId("ai-topup-balance")).toHaveTextContent(
      "Rp 25.000",
    );
    expect(screen.getByTestId("topup-pack-p1")).toBeInTheDocument();
    expect(screen.getByTestId("topup-pack-p2")).toBeInTheDocument();
    const submit = screen.getByTestId("ai-topup-submit");
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByTestId("topup-pack-p2"));
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => {
      expect(createTopupOrder).toHaveBeenCalledWith({
        pack_id: "p2",
        method: "manual_transfer",
      });
    });
    expect(await screen.findByText("status page")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalled();
  });

  it("posts the chosen midtrans method", async () => {
    vi.mocked(getTopupPacks).mockResolvedValue({ items: [pack()], total: 1 });
    vi.mocked(createTopupOrder).mockResolvedValue(
      order({ payment_method: "midtrans" }),
    );
    renderPage();

    fireEvent.click(await screen.findByTestId("topup-pack-p1"));
    fireEvent.click(screen.getByTestId("ai-topup-method-midtrans"));
    fireEvent.click(screen.getByTestId("ai-topup-submit"));

    await waitFor(() => {
      expect(createTopupOrder).toHaveBeenCalledWith({
        pack_id: "p1",
        method: "midtrans",
      });
    });
  });

  it("shows an error and stays on the page when creation fails", async () => {
    vi.mocked(getTopupPacks).mockResolvedValue({ items: [pack()], total: 1 });
    vi.mocked(createTopupOrder).mockRejectedValue({
      response: { status: 409, data: { detail: "Pack is not active" } },
    });
    renderPage();

    fireEvent.click(await screen.findByTestId("topup-pack-p1"));
    fireEvent.click(screen.getByTestId("ai-topup-submit"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Pack is not active");
    });
    expect(screen.getByTestId("ai-topup-page")).toBeInTheDocument();
    expect(screen.queryByText("status page")).not.toBeInTheDocument();
  });

  it("shows the not-available state when no active packs exist", async () => {
    vi.mocked(getTopupPacks).mockResolvedValue({ items: [], total: 0 });
    renderPage();
    expect(await screen.findByTestId("ai-topup-empty")).toHaveTextContent(
      "Top-up packs are not available yet.",
    );
    expect(screen.queryByTestId("ai-topup-submit")).not.toBeInTheDocument();
  });

  it("shows a retry action when the catalog fails to load", async () => {
    vi.mocked(getTopupPacks).mockRejectedValue(new Error("network"));
    renderPage();
    expect(await screen.findByTestId("ai-topup-error")).toHaveTextContent(
      "Could not load top-up options.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(getTopupPacks).toHaveBeenCalledTimes(2));
  });
});
