import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AiTopup from "@/pages/ai/AiTopup";
import { useAuthStore } from "@/store/authStore";
import {
  getTopupOrders,
  getTopupPacks,
  type TopupOrder,
  type TopupPack,
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

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/ai/topup"]}>
        <Routes>
          <Route path="/ai/topup" element={<AiTopup />} />
          <Route
            path="/ai/topup/:orderId"
            element={<div>status page</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AiTopup history", () => {
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
    vi.mocked(getTopupPacks).mockResolvedValue({ items: [pack()], total: 1 });
    vi.mocked(getTopupOrders).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
  });

  it("renders the first page of orders with amount, method, status, and an open link", async () => {
    vi.mocked(getTopupOrders).mockResolvedValue({
      items: [
        order({
          id: "o1",
          reference_code: "REF-1",
          amount_idr: 150_000,
          payment_method: "midtrans",
          status: "paid",
        }),
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    renderPage();

    const ref = await screen.findByTestId("ai-topup-history-ref-desktop-o1");
    expect(ref).toHaveTextContent("REF-1");
    expect(getTopupOrders).toHaveBeenCalledWith(1, 20);
    expect(
      screen.getByTestId("ai-topup-history-open-desktop-o1"),
    ).toHaveAttribute("href", "/ai/topup/o1");
    expect(screen.getByTestId("ai-topup-history-card-o1")).toBeInTheDocument();
    expect(screen.getAllByText("Rp 150.000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Midtrans").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Paid").length).toBeGreaterThan(0);
  });

  it("shows the empty state when the organization has no orders", async () => {
    renderPage();

    expect(await screen.findByTestId("ai-topup-history-empty")).toHaveTextContent(
      "No top-ups yet.",
    );
  });

  it("shows an error and refetches when retry is pressed", async () => {
    vi.mocked(getTopupOrders)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        items: [order({ id: "o1", reference_code: "REF-1" })],
        total: 1,
        page: 1,
        limit: 20,
      });
    renderPage();

    expect(await screen.findByTestId("ai-topup-history-error")).toHaveTextContent(
      "Could not load top-up history.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(getTopupOrders).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByTestId("ai-topup-history-ref-desktop-o1"),
    ).toBeInTheDocument();
  });

  it("appends the next page and hides load more once everything is loaded", async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) =>
      order({
        id: `o${index + 1}`,
        reference_code: `REF-${index + 1}`,
      }),
    );
    const secondPage = Array.from({ length: 5 }, (_, index) =>
      order({
        id: `o${index + 21}`,
        reference_code: `REF-${index + 21}`,
      }),
    );
    vi.mocked(getTopupOrders).mockImplementation((page = 1) =>
      Promise.resolve(
        page === 1
          ? { items: firstPage, total: 25, page: 1, limit: 20 }
          : { items: secondPage, total: 25, page: 2, limit: 20 },
      ),
    );
    renderPage();

    await screen.findByTestId("ai-topup-history-ref-desktop-o1");
    fireEvent.click(screen.getByTestId("ai-topup-history-load-more"));

    expect(
      await screen.findByTestId("ai-topup-history-ref-desktop-o21"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByTestId("ai-topup-history-load-more"),
      ).not.toBeInTheDocument(),
    );
  });

  it("navigates to the order status page when a row is opened", async () => {
    vi.mocked(getTopupOrders).mockResolvedValue({
      items: [order({ id: "o1" })],
      total: 1,
      page: 1,
      limit: 20,
    });
    renderPage();

    fireEvent.click(
      await screen.findByTestId("ai-topup-history-open-desktop-o1"),
    );

    expect(await screen.findByText("status page")).toBeInTheDocument();
  });
});
