import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import PayInvoice from "@/pages/PayInvoice";
import { toast } from "sonner";
import {
  checkoutInvoice,
  getInvoice,
  listPaymentProviders,
  type PayableInvoice,
} from "@/api/orgs";

vi.mock("@/api/orgs", async () => {
  const actual = await vi.importActual<typeof import("@/api/orgs")>("@/api/orgs");
  return {
    ...actual,
    getInvoice: vi.fn(),
    listPaymentProviders: vi.fn(),
    checkoutInvoice: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const assignMock = vi.fn();
const originalLocation = window.location;

function invoice(overrides: Partial<PayableInvoice> = {}): PayableInvoice {
  return {
    id: "inv-1",
    organization_id: "org-a",
    organization_name: "Org A",
    number: "SX-202611-0001",
    product: "scan",
    sku: "pro",
    seats: 1,
    amount_idr: 1_000_000,
    dpp_idr: 900_901,
    ppn_idr: 99_099,
    total_idr: 1_000_000,
    discount_idr: 0,
    promo_code: null,
    period_start: "2026-11-01T00:00:00Z",
    period_end: "2026-11-30T23:59:59Z",
    due_date: "2026-11-15T00:00:00Z",
    status: "sent",
    bank_ref: null,
    notes: "",
    paid_at: null,
    created_at: "2026-11-01T00:00:00Z",
    payment_status: null,
    can_pay: true,
    ...overrides,
  };
}

const midtrans = {
  name: "midtrans",
  label: "Midtrans",
  mode: "sandbox" as const,
};

function renderPage(entry = "/pay/inv-1") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/pay/:invoiceId" element={<PayInvoice />} />
          <Route
            path="/settings/subscription"
            element={<div>subscription page</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PayInvoice", () => {
  beforeEach(() => {
    vi.mocked(getInvoice).mockReset();
    vi.mocked(listPaymentProviders).mockReset();
    vi.mocked(checkoutInvoice).mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.success).mockReset();
    assignMock.mockReset();
    vi.mocked(listPaymentProviders).mockResolvedValue({ items: [midtrans] });
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

  it("shows a notice for a draft invoice", async () => {
    vi.mocked(getInvoice).mockResolvedValue(invoice({ status: "draft" }));
    renderPage();
    expect(await screen.findByTestId("pay-invoice-draft")).toHaveTextContent(
      "This invoice has not been issued yet.",
    );
    expect(screen.queryByTestId("pay-invoice-submit")).not.toBeInTheDocument();
  });

  it("shows a notice for a void invoice", async () => {
    vi.mocked(getInvoice).mockResolvedValue(invoice({ status: "void" }));
    renderPage();
    expect(await screen.findByTestId("pay-invoice-void")).toHaveTextContent(
      "This invoice has been cancelled.",
    );
  });

  it("shows the paid panel with date and total", async () => {
    vi.mocked(getInvoice).mockResolvedValue(
      invoice({
        status: "paid",
        paid_at: "2026-11-10T08:00:00Z",
        payment_method: "bank_transfer",
        payment_status: "succeeded",
      }),
    );
    renderPage();
    const paid = await screen.findByTestId("pay-invoice-paid");
    expect(paid).toHaveTextContent("This invoice is paid.");
    expect(paid).toHaveTextContent("bank_transfer");
    expect(paid).toHaveTextContent("Rp 1.000.000");
  });

  it("renders the payment panel for a sent invoice with a total", async () => {
    vi.mocked(getInvoice).mockResolvedValue(invoice());
    renderPage();
    expect(await screen.findByTestId("pay-invoice-submit")).toBeEnabled();
    expect(screen.getByTestId("pay-invoice-total")).toHaveTextContent(
      "Rp 1.000.000",
    );
  });

  it("shows Lunas for a sent invoice settled by a full discount", async () => {
    vi.mocked(getInvoice).mockResolvedValue(
      invoice({ total_idr: 0, discount_idr: 1_000_000, promo_code: "FULL" }),
    );
    renderPage();
    expect(await screen.findByTestId("pay-invoice-zero")).toHaveTextContent(
      "Paid",
    );
    expect(screen.queryByTestId("pay-invoice-submit")).not.toBeInTheDocument();
  });

  it("renders discount only when it is non-zero and uses total_idr", async () => {
    vi.mocked(getInvoice).mockResolvedValue(
      invoice({
        amount_idr: 1_000_000,
        discount_idr: 100_000,
        promo_code: "HEMAT",
        total_idr: 900_000,
      }),
    );
    renderPage();
    expect(await screen.findByTestId("pay-invoice-discount")).toHaveTextContent(
      "HEMAT",
    );
    expect(screen.getByTestId("pay-invoice-total")).toHaveTextContent(
      "Rp 900.000",
    );
  });

  it("omits the discount row when it is zero", async () => {
    vi.mocked(getInvoice).mockResolvedValue(invoice());
    renderPage();
    await screen.findByTestId("pay-invoice-submit");
    expect(screen.queryByTestId("pay-invoice-discount")).not.toBeInTheDocument();
  });

  it("shows the provider as text when only one is enabled", async () => {
    vi.mocked(getInvoice).mockResolvedValue(invoice());
    renderPage();
    await screen.findByText("Midtrans");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("shows a Select when more than one provider is enabled", async () => {
    vi.mocked(listPaymentProviders).mockResolvedValue({
      items: [midtrans, { name: "xendit", label: "Xendit", mode: "production" }],
    });
    vi.mocked(getInvoice).mockResolvedValue(invoice());
    renderPage();
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
  });

  it("starts checkout with the chosen provider and redirects", async () => {
    vi.mocked(getInvoice).mockResolvedValue(invoice());
    vi.mocked(checkoutInvoice).mockResolvedValue({
      attempt_id: "att-1",
      provider: "midtrans",
      redirect_url: "https://sandbox.midtrans.com/snap/redirect/att-1",
      expires_at: null,
      amount_idr: 1_000_000,
      status: "pending",
    });
    renderPage();
    fireEvent.click(await screen.findByTestId("pay-invoice-submit"));
    await waitFor(() => {
      expect(checkoutInvoice).toHaveBeenCalledWith(
        "org-a",
        "inv-1",
        "midtrans",
      );
    });
    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(
        "https://sandbox.midtrans.com/snap/redirect/att-1",
      );
    });
  });

  it("keeps the page and toasts when checkout fails", async () => {
    vi.mocked(getInvoice).mockResolvedValue(invoice());
    vi.mocked(checkoutInvoice).mockRejectedValue({
      response: { status: 409, data: { detail: "A payment is already pending" } },
    });
    renderPage();
    fireEvent.click(await screen.findByTestId("pay-invoice-submit"));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("A payment is already pending");
    });
    expect(screen.getByTestId("pay-invoice-submit")).toBeInTheDocument();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it("polls a pending payment and renders the paid state", async () => {
    let tick: (() => void) | null = null;
    vi.spyOn(window, "setInterval").mockImplementation((handler) => {
      tick = handler as () => void;
      return 1 as unknown as ReturnType<typeof window.setInterval>;
    });
    vi.mocked(getInvoice)
      .mockResolvedValueOnce(invoice({ payment_status: "pending", can_pay: false }))
      .mockResolvedValueOnce(
        invoice({ status: "paid", payment_status: "succeeded", can_pay: false }),
      );
    renderPage();
    await screen.findByTestId("pay-invoice-polling");
    await act(async () => {
      tick?.();
      await Promise.resolve();
    });
    expect(await screen.findByTestId("pay-invoice-paid")).toBeInTheDocument();
    expect(getInvoice).toHaveBeenCalledTimes(2);
  });

  it("polls when returning with status=finish", async () => {
    vi.mocked(getInvoice).mockResolvedValue(
      invoice({ payment_status: null, can_pay: false }),
    );
    renderPage("/pay/inv-1?status=finish");
    expect(await screen.findByTestId("pay-invoice-polling")).toBeInTheDocument();
  });

  it("stops polling after the limit and offers a manual refresh", async () => {
    const start = 1_000_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    let tick: (() => void) | null = null;
    vi.spyOn(window, "setInterval").mockImplementation((handler) => {
      tick = handler as () => void;
      return 1 as unknown as ReturnType<typeof window.setInterval>;
    });
    vi.mocked(getInvoice).mockResolvedValue(
      invoice({ payment_status: "pending", can_pay: false }),
    );
    renderPage();
    await screen.findByTestId("pay-invoice-polling");
    now.mockReturnValue(start + 60_001);
    act(() => {
      tick?.();
    });
    expect(await screen.findByTestId("pay-invoice-refresh")).toBeInTheDocument();
    expect(getInvoice).toHaveBeenCalledTimes(1);
  });

  it("disables the pay button and explains why when can_pay is false", async () => {
    vi.mocked(getInvoice).mockResolvedValue(
      invoice({ can_pay: false, payment_status: null }),
    );
    renderPage();
    expect(await screen.findByTestId("pay-invoice-not-payable")).toHaveTextContent(
      "Online payment is not available for this invoice.",
    );
    expect(screen.getByTestId("pay-invoice-submit")).toBeDisabled();
  });

  it("renders the manual bank fallback when a bank is present", async () => {
    vi.mocked(getInvoice).mockResolvedValue(
      invoice({
        bank: {
          bank_name: "Bank Contoh",
          bank_account: "1234567890",
          bank_holder: "PT Contoh",
        },
      }),
    );
    renderPage();
    const bank = await screen.findByTestId("pay-invoice-bank");
    expect(bank).toHaveTextContent("Bank Contoh");
    expect(bank).toHaveTextContent("1234567890");
    expect(bank).toHaveTextContent("PT Contoh");
  });

  it("shows the not-found state on a 404", async () => {
    vi.mocked(getInvoice).mockRejectedValue(
      Object.assign(new Error("Not Found"), {
        isAxiosError: true,
        response: { status: 404, data: { detail: "Invoice not found" } },
      }),
    );
    renderPage();
    expect(await screen.findByTestId("pay-invoice-not-found")).toHaveTextContent(
      "Invoice not found",
    );
  });
});
