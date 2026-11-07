import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AiTopupStatus from "@/pages/ai/AiTopupStatus";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import {
  cancelTopupOrder,
  checkoutTopupOrder,
  getTopupOrder,
  uploadTopupProof,
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

const assignMock = vi.fn();
const originalLocation = window.location;

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
    bank: {
      bank_name: "Bank Contoh",
      bank_account: "1234567890",
      bank_holder: "PT Contoh",
    },
    ...overrides,
  };
}

function renderPage(entry = "/ai/topup/o1") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/ai/topup/:orderId" element={<AiTopupStatus />} />
          <Route path="/ai/topup" element={<div>topup page</div>} />
          <Route path="/ai" element={<div>ai page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AiTopupStatus", () => {
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
      balance_idr: 125_000,
      currency: "IDR",
    });
    vi.mocked(checkoutTopupOrder).mockReset();
    vi.mocked(uploadTopupProof).mockReset();
    vi.mocked(cancelTopupOrder).mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    assignMock.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign: assignMock },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("renders the bank block with reference and amount for a manual order", async () => {
    vi.mocked(getTopupOrder).mockResolvedValue(order());
    renderPage();
    await screen.findByTestId("ai-topup-bank");
    expect(screen.getByTestId("ai-topup-bank")).toHaveTextContent("Bank Contoh");
    expect(screen.getByTestId("ai-topup-bank")).toHaveTextContent("1234567890");
    expect(screen.getByTestId("ai-topup-reference")).toHaveTextContent(
      "261107-ABC123",
    );
    expect(screen.getByTestId("ai-topup-bank")).toHaveTextContent("Rp 100.000");
  });

  it("uploads the selected proof file to the endpoint", async () => {
    vi.mocked(getTopupOrder).mockResolvedValue(order());
    vi.mocked(uploadTopupProof).mockResolvedValue(
      order({ status: "awaiting_verification", has_proof: true }),
    );
    renderPage();
    await screen.findByTestId("ai-topup-proof");

    const file = new File(["proof"], "transfer.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("ai-topup-proof-input"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByTestId("ai-topup-proof-submit"));

    await waitFor(() => {
      expect(uploadTopupProof).toHaveBeenCalledWith("o1", file);
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("surfaces an upload error and a too-large pre-check", async () => {
    vi.mocked(getTopupOrder).mockResolvedValue(order());
    vi.mocked(uploadTopupProof).mockRejectedValue({
      response: { status: 422, data: { detail: "Proof must be a JPEG" } },
    });
    renderPage();
    await screen.findByTestId("ai-topup-proof");

    const big = new File(["x"], "huge.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
    fireEvent.change(screen.getByTestId("ai-topup-proof-input"), {
      target: { files: [big] },
    });
    expect(await screen.findByTestId("ai-topup-proof-error")).toHaveTextContent(
      "The file is larger than 5 MB.",
    );

    const file = new File(["proof"], "transfer.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("ai-topup-proof-input"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByTestId("ai-topup-proof-submit"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Proof must be a JPEG");
    });
  });

  it("starts Midtrans checkout and redirects", async () => {
    vi.mocked(getTopupOrder).mockResolvedValue(
      order({ payment_method: "midtrans", bank: null }),
    );
    vi.mocked(checkoutTopupOrder).mockResolvedValue({
      redirect_url: "https://sandbox.midtrans.com/snap/redirect/att-1",
      attempt_id: "att-1",
    });
    renderPage();
    fireEvent.click(await screen.findByTestId("ai-topup-pay-now"));
    await waitFor(() => {
      expect(checkoutTopupOrder).toHaveBeenCalledWith("o1");
    });
    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(
        "https://sandbox.midtrans.com/snap/redirect/att-1",
      );
    });
  });

  it("does not trust ?status=finish when the API still says pending", async () => {
    vi.mocked(getTopupOrder).mockResolvedValue(order());
    renderPage("/ai/topup/o1?status=finish");
    await screen.findByTestId("ai-topup-bank");
    expect(screen.queryByTestId("ai-topup-paid")).not.toBeInTheDocument();
  });

  it("shows the paid state with credit and new balance", async () => {
    vi.mocked(getTopupOrder).mockResolvedValue(
      order({ status: "paid", paid_at: "2026-11-07T10:00:00Z" }),
    );
    renderPage();
    const paid = await screen.findByTestId("ai-topup-paid");
    expect(paid).toHaveTextContent("Rp 100.000");
    expect(await screen.findByTestId("ai-topup-paid-balance")).toHaveTextContent(
      "Rp 125.000",
    );
  });

  it("renders terminal failure states without a success panel", async () => {
    vi.mocked(getTopupOrder).mockResolvedValue(order({ status: "rejected" }));
    const { unmount } = renderPage();
    expect(await screen.findByTestId("ai-topup-rejected")).toHaveTextContent(
      "This top-up was rejected. No credit was added.",
    );
    expect(screen.queryByTestId("ai-topup-paid")).not.toBeInTheDocument();
    unmount();

    vi.mocked(getTopupOrder).mockResolvedValue(order({ status: "expired" }));
    const second = renderPage();
    expect(await screen.findByTestId("ai-topup-expired")).toBeInTheDocument();
    second.unmount();
  });

  it("stops polling after 60s and offers check again", async () => {
    const start = 1_000_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    let tick: (() => void) | null = null;
    vi.spyOn(window, "setInterval").mockImplementation((handler) => {
      tick = handler as () => void;
      return 1 as unknown as ReturnType<typeof window.setInterval>;
    });
    vi.mocked(getTopupOrder).mockResolvedValue(order());
    renderPage();
    await screen.findByTestId("ai-topup-status-polling");
    now.mockReturnValue(start + 60_001);
    act(() => {
      tick?.();
    });
    expect(
      await screen.findByTestId("ai-topup-status-refresh"),
    ).toBeInTheDocument();
    expect(getTopupOrder).toHaveBeenCalledTimes(1);
  });

  it("cancels an order after confirmation", async () => {
    vi.mocked(getTopupOrder).mockResolvedValue(order());
    vi.mocked(cancelTopupOrder).mockResolvedValue(order({ status: "canceled" }));
    renderPage();
    fireEvent.click(await screen.findByTestId("ai-topup-cancel"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("ai-topup-cancel-confirm"));
    await waitFor(() => expect(cancelTopupOrder).toHaveBeenCalledWith("o1"));
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows the not-found state on a 404", async () => {
    vi.mocked(getTopupOrder).mockRejectedValue(
      Object.assign(new Error("Not Found"), {
        isAxiosError: true,
        response: { status: 404, data: { detail: "Order not found" } },
      }),
    );
    renderPage();
    expect(
      await screen.findByTestId("ai-topup-status-not-found"),
    ).toHaveTextContent("Order not found");
  });
});
