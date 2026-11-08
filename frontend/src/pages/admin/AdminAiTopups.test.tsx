import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

import AdminAiTopups from "@/pages/admin/AdminAiTopups";
import {
  approveAdminTopupOrder,
  fetchAdminTopupProof,
  listAdminTopupOrders,
  rejectAdminTopupOrder,
  resolveAdminTopupRefund,
  type AdminTopupOrder,
} from "@/api/adminAiTopup";

vi.mock("@/api/adminAiTopup", () => ({
  listAdminTopupOrders: vi.fn(),
  getAdminTopupOrder: vi.fn(),
  fetchAdminTopupProof: vi.fn(),
  approveAdminTopupOrder: vi.fn(),
  rejectAdminTopupOrder: vi.fn(),
  resolveAdminTopupRefund: vi.fn(),
}));

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

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function order(overrides: Partial<AdminTopupOrder> = {}): AdminTopupOrder {
  return {
    id: "o1",
    organization_id: "org1",
    organization_name: "PT Contoh",
    created_by_user_id: "u1",
    pack_id: "pack1",
    pack_code: "PACK100",
    reference_code: "261107-ABC123",
    amount_idr: 100_000,
    credit_idr: 100_000,
    bonus_idr: 0,
    currency: "IDR",
    payment_method: "manual_transfer",
    status: "awaiting_verification",
    has_proof: true,
    proof_mime: "image/png",
    proof_size_bytes: 1024,
    proof_uploaded_at: "2026-11-07T09:00:00Z",
    bank_ref: null,
    verified_by_user_id: null,
    verified_at: null,
    rejection_reason: null,
    resolution_note: null,
    paid_at: null,
    expires_at: "2026-11-10T00:00:00Z",
    created_at: "2026-11-07T08:00:00Z",
    updated_at: "2026-11-07T09:00:00Z",
    ...overrides,
  };
}

function listResponse(items: AdminTopupOrder[]) {
  return { items, total: items.length, page: 1, limit: 20 };
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AdminAiTopups />
    </QueryClientProvider>,
  );
}

async function openMenu(id = "o1") {
  const user = userEvent.setup();
  const triggers = await screen.findAllByTestId(`topup-actions-${id}`);
  await user.click(triggers[0]);
  return user;
}

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listAdminTopupOrders).mockResolvedValue(
    listResponse([order()]),
  );
  vi.mocked(approveAdminTopupOrder).mockResolvedValue(
    order({ status: "paid" }),
  );
  vi.mocked(rejectAdminTopupOrder).mockResolvedValue(
    order({ status: "rejected", rejection_reason: "Not received" }),
  );
  vi.mocked(resolveAdminTopupRefund).mockResolvedValue(
    order({ status: "refunded", resolution_note: "Chargeback accepted" }),
  );
  vi.mocked(fetchAdminTopupProof).mockResolvedValue(
    new Blob(["%PDF-1.4"], { type: "application/pdf" }),
  );
  createObjectURL = vi.fn(() => "blob:topup-proof");
  revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminAiTopups", () => {
  it("loads the awaiting-verification queue by default", async () => {
    renderPage();

    expect(await screen.findByTestId("admin-ai-topups-table")).toHaveTextContent(
      "PT Contoh",
    );
    expect(screen.getByTestId("admin-ai-topups-table")).toHaveTextContent(
      "261107-ABC123",
    );
    expect(listAdminTopupOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "awaiting_verification",
        page: 1,
        limit: 20,
      }),
    );
  });

  it("refetches when the status filter changes", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("admin-ai-topups-table");

    await user.click(
      screen.getByRole("combobox", { name: "Status" }),
    );
    await user.click(await screen.findByRole("option", { name: "Paid" }));

    await waitFor(() =>
      expect(listAdminTopupOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "paid", page: 1 }),
      ),
    );
  });

  it("exposes row actions through a menu trigger", async () => {
    renderPage();
    await screen.findByTestId("admin-ai-topups-table");

    const triggers = screen.getAllByRole("button", { name: "Row actions" });
    expect(triggers.length).toBeGreaterThan(0);
  });

  it("approves with an optional bank reference and refetches", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("admin-ai-topups-table");

    await openMenu();
    await user.click(await screen.findByTestId("topup-approve-o1"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();

    await user.type(screen.getByTestId("admin-ai-topups-bank-ref"), "BCA-123");
    await user.click(screen.getByTestId("admin-ai-topups-approve-submit"));

    await waitFor(() =>
      expect(approveAdminTopupOrder).toHaveBeenCalledWith("o1", {
        bank_ref: "BCA-123",
        force: false,
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Top-up approved and wallet credited.",
      ),
    );
    await waitFor(() =>
      expect(listAdminTopupOrders).toHaveBeenCalledTimes(2),
    );
  });

  it("blocks an empty rejection reason and submits a filled one", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("admin-ai-topups-table");

    await openMenu();
    await user.click(await screen.findByTestId("topup-reject-o1"));

    const submit = await screen.findByTestId("admin-ai-topups-reject-submit");
    expect(submit).toBeDisabled();

    await user.type(
      screen.getByTestId("admin-ai-topups-reject-reason"),
      "Transfer not received",
    );
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() =>
      expect(rejectAdminTopupOrder).toHaveBeenCalledWith("o1", {
        reason: "Transfer not received",
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Top-up rejected."),
    );
  });

  it("fetches the proof as a blob and offers a PDF download link", async () => {
    vi.mocked(listAdminTopupOrders).mockResolvedValue(
      listResponse([order({ proof_mime: "application/pdf" })]),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("admin-ai-topups-table");

    await openMenu();
    await user.click(await screen.findByTestId("topup-proof-o1"));

    await waitFor(() => expect(fetchAdminTopupProof).toHaveBeenCalledWith("o1"));
    expect(createObjectURL).toHaveBeenCalled();

    const download = await screen.findByTestId("admin-ai-topups-proof-download");
    expect(download).toHaveAttribute("href", "blob:topup-proof");
    expect(download).toHaveAttribute("download", "topup-proof-261107-ABC123.pdf");
    expect(screen.getByTestId("admin-ai-topups-proof-pdf")).toBeInTheDocument();
  });

  it("shows a retry action when the queue fails to load", async () => {
    vi.mocked(listAdminTopupOrders).mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByTestId("admin-ai-topups-error")).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByTestId("admin-ai-topups-retry"));

    await waitFor(() =>
      expect(listAdminTopupOrders).toHaveBeenCalledTimes(2),
    );
  });

  it("renders the empty state when nothing matches", async () => {
    vi.mocked(listAdminTopupOrders).mockResolvedValue(listResponse([]));
    renderPage();

    expect(await screen.findByTestId("admin-ai-topups-empty")).toBeInTheDocument();
  });

  it("shows the Resolve refund action only for refund_review rows", async () => {
    vi.mocked(listAdminTopupOrders).mockResolvedValue(
      listResponse([
        order({ id: "o1", status: "refund_review" }),
        order({ id: "o2", status: "awaiting_verification" }),
        order({ id: "o3", status: "paid" }),
      ]),
    );
    renderPage();
    await screen.findByTestId("admin-ai-topups-table");

    const user = await openMenu("o1");
    expect(
      await screen.findByTestId("topup-resolve-refund-o1"),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByTestId("topup-resolve-refund-o1"),
      ).not.toBeInTheDocument(),
    );

    const user2 = await openMenu("o2");
    expect(await screen.findByTestId("topup-approve-o2")).toBeInTheDocument();
    expect(
      screen.queryByTestId("topup-resolve-refund-o2"),
    ).not.toBeInTheDocument();
    await user2.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByTestId("topup-approve-o2"),
      ).not.toBeInTheDocument(),
    );

    await openMenu("o3");
    expect(await screen.findByTestId("topup-approve-o3")).toBeInTheDocument();
    expect(
      screen.queryByTestId("topup-resolve-refund-o3"),
    ).not.toBeInTheDocument();
  });

  it("resolves a refund as a clawback with a note and refetches", async () => {
    vi.mocked(listAdminTopupOrders).mockResolvedValue(
      listResponse([order({ id: "o1", status: "refund_review" })]),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("admin-ai-topups-table");

    await openMenu();
    await user.click(await screen.findByTestId("topup-resolve-refund-o1"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();

    await user.type(
      screen.getByTestId("admin-ai-topups-refund-note"),
      "Customer disputed the transfer",
    );
    await user.click(screen.getByTestId("admin-ai-topups-refund-submit"));

    await waitFor(() =>
      expect(resolveAdminTopupRefund).toHaveBeenCalledWith("o1", {
        action: "clawback",
        note: "Customer disputed the transfer",
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Refund resolved."),
    );
    await waitFor(() =>
      expect(listAdminTopupOrders).toHaveBeenCalledTimes(2),
    );
  });

  it("sends write_off when that resolution is chosen", async () => {
    vi.mocked(listAdminTopupOrders).mockResolvedValue(
      listResponse([order({ id: "o1", status: "refund_review" })]),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("admin-ai-topups-table");

    await openMenu();
    await user.click(await screen.findByTestId("topup-resolve-refund-o1"));

    await user.click(screen.getByRole("combobox", { name: "Resolution" }));
    await user.click(
      await screen.findByRole("option", {
        name: "Write off (leave the money with the customer)",
      }),
    );
    await user.click(screen.getByTestId("admin-ai-topups-refund-submit"));

    await waitFor(() =>
      expect(resolveAdminTopupRefund).toHaveBeenCalledWith(
        "o1",
        expect.objectContaining({ action: "write_off" }),
      ),
    );
  });

  it("keeps the refund dialog open and shows a 409 error", async () => {
    vi.mocked(listAdminTopupOrders).mockResolvedValue(
      listResponse([order({ id: "o1", status: "refund_review" })]),
    );
    vi.mocked(resolveAdminTopupRefund).mockRejectedValue({
      response: {
        status: 409,
        data: { detail: "Insufficient balance to claw back this top-up" },
      },
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId("admin-ai-topups-table");

    await openMenu();
    await user.click(await screen.findByTestId("topup-resolve-refund-o1"));
    await user.click(screen.getByTestId("admin-ai-topups-refund-submit"));

    expect(
      await screen.findByTestId("admin-ai-topups-refund-error"),
    ).toHaveTextContent("Insufficient balance to claw back this top-up");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows a resolved refund note under the status", async () => {
    vi.mocked(listAdminTopupOrders).mockResolvedValue(
      listResponse([
        order({
          id: "o1",
          status: "refunded",
          resolution_note: "Chargeback accepted",
        }),
      ]),
    );
    renderPage();

    expect(
      await screen.findByTestId("topup-resolution-note-o1"),
    ).toHaveTextContent("Chargeback accepted");
  });
});
