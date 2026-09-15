import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminInvoices from "@/pages/admin/AdminInvoices";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("@/api/admin", () => ({
  adminApi: {
    getSkuCatalog: vi.fn(),
    listAdminOrgs: vi.fn(),
    listAdminInvoices: vi.fn(),
    createAdminInvoice: vi.fn(),
    sendAdminInvoice: vi.fn(),
    payAdminInvoice: vi.fn(),
    voidAdminInvoice: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const catalog = [
  {
    product: "scan",
    sku: "basic",
    list_idr: 300_000,
    seats: 1,
    invoicable: true,
    updated_at: "2026-09-13T00:00:00Z",
  },
];
const invoices = [
  {
    id: "inv-1",
    organization_id: "org-1",
    number: "SX-202609-0001",
    product: "scan",
    sku: "basic",
    amount_idr: 300_000,
    period_start: "2026-09-01T00:00:00Z",
    period_end: "2026-09-30T23:59:59Z",
    status: "draft",
    bank_ref: null,
    notes: "",
    paid_at: null,
    created_at: "2026-09-13T00:00:00Z",
    updated_at: "2026-09-13T00:00:00Z",
    organization_name: "Acme",
  },
];

describe("AdminInvoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQueryClient).mockReturnValue({
      invalidateQueries: vi.fn(),
    } as unknown as ReturnType<typeof useQueryClient>);
    vi.mocked(useMutation).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useMutation>);
    vi.mocked(useQuery).mockImplementation(((opts: { queryKey: unknown[] }) => {
      const key = String(opts.queryKey[0]);
      if (key === "admin-sku-catalog") {
        return { data: catalog, isLoading: false };
      }
      if (key === "admin-orgs") {
        return {
          data: {
            items: [
              {
                id: "org-1",
                name: "Acme",
                slug: "acme",
                sku: "basic",
                kind: "company",
              },
            ],
            total: 1,
          },
          isLoading: false,
        };
      }
      return { data: { items: invoices, total: 1 }, isLoading: false };
    }) as typeof useQuery);
  });

  it("renders page, catalog, and create control", () => {
    render(<AdminInvoices />);
    expect(screen.getByTestId("admin-invoices-page")).toBeInTheDocument();
    expect(screen.getByText("Sinexis bills Scan SKUs")).toBeInTheDocument();
    expect(screen.getByText("SX-202609-0001")).toBeInTheDocument();
    expect(screen.getByTestId("invoice-create")).toBeDisabled();
    expect(screen.getByTestId("invoice-paid-inv-1")).toBeInTheDocument();
  });

  it("calls paid mutate from the draft row", async () => {
    const mutate = vi.fn();
    vi.mocked(useMutation).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useMutation>);
    render(<AdminInvoices />);
    await userEvent.click(screen.getByTestId("invoice-paid-inv-1"));
    expect(mutate).toHaveBeenCalledWith("inv-1");
  });

  it("does not show print on a draft invoice", () => {
    render(<AdminInvoices />);
    expect(screen.queryByTestId("admin-invoice-print")).not.toBeInTheDocument();
  });

  it("prints a sent invoice with bank on the sheet", async () => {
    const print = vi.fn();
    window.print = print;
    vi.mocked(useQuery).mockImplementation(((opts: { queryKey: unknown[] }) => {
      const key = String(opts.queryKey[0]);
      if (key === "admin-sku-catalog") {
        return { data: catalog, isLoading: false };
      }
      if (key === "admin-orgs") {
        return {
          data: {
            items: [
              {
                id: "org-1",
                name: "Acme",
                slug: "acme",
                sku: "basic",
                kind: "company",
              },
            ],
            total: 1,
          },
          isLoading: false,
        };
      }
      return {
        data: {
          items: [
            {
              ...invoices[0],
              status: "sent",
              bank: {
                bank_name: "Bank Contoh",
                bank_account: "0000000000",
                bank_holder: "Acme Holder",
              },
            },
          ],
          total: 1,
        },
        isLoading: false,
      };
    }) as typeof useQuery);
    render(<AdminInvoices />);
    await userEvent.click(screen.getByTestId("admin-invoice-print"));
    expect(screen.getByTestId("invoice-print-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("invoice-print-bank")).toHaveTextContent(
      "0000000000",
    );
    await waitFor(() => expect(print).toHaveBeenCalled());
  });
});
