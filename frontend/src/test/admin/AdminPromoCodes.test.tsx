import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

import AdminPromoCodes from "@/pages/admin/AdminPromoCodes";
import type { PromoCode, PromoCodeListResponse } from "@/api/admin";

const promo: PromoCode = {
  id: "promo-1",
  code: "LAUNCH2026",
  description: "Launch discount",
  kind: "percent",
  percent_off_bp: 1250,
  amount_idr: null,
  min_amount_idr: 0,
  max_discount_idr: null,
  applies_to_sku: null,
  applies_to_product: null,
  starts_at: null,
  ends_at: null,
  max_redemptions: 100,
  max_redemptions_per_org: 1,
  redemption_count: 0,
  active: true,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

const list: PromoCodeListResponse = {
  items: [promo],
  total: 1,
  page: 1,
  page_size: 20,
};

vi.mock("@/api/admin", () => ({
  adminApi: {
    listAdminPromoCodes: vi.fn(),
    getAdminSkuTiers: vi.fn(),
    createAdminPromoCode: vi.fn(),
    updateAdminPromoCode: vi.fn(),
    deactivateAdminPromoCode: vi.fn(),
    reactivateAdminPromoCode: vi.fn(),
    deleteAdminPromoCode: vi.fn(),
    listAdminPromoRedemptions: vi.fn(),
    listAdminPromoHistory: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { adminApi } from "@/api/admin";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminPromoCodes />
    </QueryClientProvider>,
  );
}

async function openMenu(id = "promo-1") {
  const user = userEvent.setup();
  await user.click((await screen.findAllByTestId(`promo-actions-${id}`))[0]);
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminApi.listAdminPromoCodes).mockResolvedValue(list);
  vi.mocked(adminApi.getAdminSkuTiers).mockResolvedValue([
    { code: "basic", label: "Basic" },
  ] as never);
  vi.mocked(adminApi.createAdminPromoCode).mockResolvedValue(promo);
  vi.mocked(adminApi.updateAdminPromoCode).mockResolvedValue(promo);
  vi.mocked(adminApi.deactivateAdminPromoCode).mockResolvedValue({
    ...promo,
    active: false,
  });
  vi.mocked(adminApi.reactivateAdminPromoCode).mockResolvedValue(promo);
  vi.mocked(adminApi.deleteAdminPromoCode).mockResolvedValue();
  vi.mocked(adminApi.listAdminPromoRedemptions).mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
  });
  vi.mocked(adminApi.listAdminPromoHistory).mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
  });
});

describe("AdminPromoCodes", () => {
  it("renders the table and mobile cards from the API", async () => {
    renderPage();

    expect(await screen.findByTestId("promo-table-desktop")).toBeInTheDocument();
    expect(screen.getAllByText("LAUNCH2026").length).toBeGreaterThan(0);
    expect(screen.getByTestId("promo-cards-mobile")).toHaveTextContent(
      "Launch discount",
    );
    expect(adminApi.listAdminPromoCodes).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, q: undefined }),
    );
  });

  it("creates a percent code with an uppercased payload", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("promo-create"));
    await user.type(screen.getByTestId("promo-code"), "launch2026");
    await user.type(screen.getByTestId("promo-percent"), "12.5");
    await user.click(screen.getByTestId("promo-form-submit"));

    await waitFor(() =>
      expect(adminApi.createAdminPromoCode).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "LAUNCH2026",
          kind: "percent",
          percent_off_bp: 1250,
          amount_idr: null,
          min_amount_idr: 0,
          max_redemptions_per_org: 1,
        }),
      ),
    );
  });

  it("keeps the code immutable on edit", async () => {
    renderPage();
    const user = await openMenu();
    await user.click(await screen.findByTestId("promo-edit-promo-1"));

    expect(screen.getByTestId("promo-code")).toBeDisabled();
    expect(screen.getByTestId("promo-code")).toHaveValue("LAUNCH2026");
  });

  it("deactivates a code in one click", async () => {
    renderPage();
    const user = await openMenu();
    await user.click(await screen.findByTestId("promo-toggle-promo-1"));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(adminApi.deactivateAdminPromoCode).toHaveBeenCalledWith("promo-1"),
    );
  });

  it("confirms deletion with the sibling dialog", async () => {
    renderPage();
    const user = await openMenu();
    await user.click(await screen.findByTestId("promo-delete-promo-1"));

    expect(adminApi.deleteAdminPromoCode).not.toHaveBeenCalled();
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByTestId("promo-delete-confirm"));
    await waitFor(() =>
      expect(adminApi.deleteAdminPromoCode).toHaveBeenCalledWith("promo-1"),
    );
  });

  it("surfaces a duplicate 409 detail", async () => {
    vi.mocked(adminApi.createAdminPromoCode).mockRejectedValue({
      response: { data: { detail: "Promo code 'LAUNCH2026' already exists" } },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId("promo-create"));
    await user.type(screen.getByTestId("promo-code"), "launch2026");
    await user.type(screen.getByTestId("promo-percent"), "10");
    await user.click(screen.getByTestId("promo-form-submit"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Promo code 'LAUNCH2026' already exists",
      ),
    );
  });

  it("renders the empty state", async () => {
    vi.mocked(adminApi.listAdminPromoCodes).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    });
    renderPage();

    expect(await screen.findByTestId("promo-empty")).toBeInTheDocument();
  });

  it("applies the search filter", async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText("Search");
    await user.type(input, "LAUNCH");
    await user.click(screen.getByTestId("promo-filter-apply"));

    await waitFor(() =>
      expect(adminApi.listAdminPromoCodes).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "LAUNCH", page: 1 }),
      ),
    );
  });

  it("opens row actions from the mobile card", async () => {
    renderPage();
    const card = await screen.findByTestId("promo-cards-mobile");
    const user = userEvent.setup();
    await user.click(within(card).getByTestId("promo-actions-promo-1"));
    await user.click(await screen.findByTestId("promo-edit-promo-1"));

    expect(screen.getByTestId("promo-code")).toBeDisabled();
  });

  it("shows used / limit for a redeemed code", async () => {
    vi.mocked(adminApi.listAdminPromoCodes).mockResolvedValue({
      ...list,
      items: [{ ...promo, redemption_count: 3 }],
    });
    renderPage();

    expect(await screen.findByTestId("promo-used-promo-1")).toHaveTextContent(
      "3 / 100",
    );
    expect(screen.getAllByText("3 / 100").length).toBeGreaterThan(0);
  });

  it("locks discount terms and explains why when editing a used code", async () => {
    vi.mocked(adminApi.listAdminPromoCodes).mockResolvedValue({
      ...list,
      items: [{ ...promo, redemption_count: 2 }],
    });
    renderPage();
    const user = await openMenu();
    await user.click(await screen.findByTestId("promo-edit-promo-1"));

    expect(screen.getByTestId("promo-kind")).toBeDisabled();
    expect(screen.getByTestId("promo-percent")).toBeDisabled();
    expect(screen.getByTestId("promo-min")).toBeDisabled();
    expect(screen.getByTestId("promo-max-discount")).toBeDisabled();
    expect(screen.getByTestId("promo-product")).toBeDisabled();
    expect(screen.getByTestId("promo-sku")).toBeDisabled();
    expect(screen.getByTestId("promo-terms-locked")).toHaveTextContent(
      "discount terms are locked",
    );
    expect(screen.getByTestId("promo-max-redemptions")).not.toBeDisabled();
  });

  it("leaves discount terms editable when the code is unused", async () => {
    renderPage();
    const user = await openMenu();
    await user.click(await screen.findByTestId("promo-edit-promo-1"));

    expect(screen.getByTestId("promo-kind")).not.toBeDisabled();
    expect(screen.getByTestId("promo-percent")).not.toBeDisabled();
    expect(screen.getByTestId("promo-min")).not.toBeDisabled();
    expect(screen.getByTestId("promo-max-discount")).not.toBeDisabled();
    expect(screen.queryByTestId("promo-terms-locked")).not.toBeInTheDocument();
  });

  it("disables delete for a used code but keeps redemptions reachable", async () => {
    vi.mocked(adminApi.listAdminPromoCodes).mockResolvedValue({
      ...list,
      items: [{ ...promo, redemption_count: 1 }],
    });
    renderPage();
    const user = await openMenu();

    const deleteItem = await screen.findByTestId("promo-delete-promo-1");
    expect(deleteItem).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("promo-redemptions-promo-1")).not.toBeDisabled();

    await user.click(deleteItem);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(adminApi.deleteAdminPromoCode).not.toHaveBeenCalled();
  });
});
