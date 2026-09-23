import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminInvoices from "@/pages/admin/AdminInvoices";
import i18n from "@/i18n";
import { toast } from "sonner";
import { adminApi, downloadAdminInvoicePdf } from "@/api/admin";

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
  downloadAdminInvoicePdf: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/ui/Select", () => {
  function collectSelectValues(node: React.ReactNode): string[] {
    const values: string[] = [];
    const walk = (n: React.ReactNode) => {
      if (Array.isArray(n)) {
        n.forEach(walk);
        return;
      }
      if (!n || typeof n !== "object" || !("props" in n)) return;
      const props = (n as React.ReactElement<{ value?: unknown; children?: React.ReactNode }>).props;
      if (typeof props.value === "string") values.push(props.value);
      if (props.children != null) walk(props.children);
    };
    walk(node);
    return [...new Set(values)];
  }
  return {
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => {
    const options = collectSelectValues(children);
    const all = options.includes(value) ? options : [value, ...options];
    return (
      <div data-testid="select-root" data-value={value}>
        {typeof children === "function" ? null : children}
        <select
          aria-hidden
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          style={{ display: "none" }}
        >
          {all.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  },
  SelectTrigger: ({
    children,
    id,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { id?: string }) => (
    <button type="button" id={id} {...props}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <div data-value={value}>{children}</div>,
  };
});

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
  {
    product: "scan",
    sku: "pro",
    list_idr: 650_000,
    seats: 3,
    invoicable: true,
    updated_at: "2026-09-13T00:00:00Z",
  },
  {
    product: "scan",
    sku: "multi",
    list_idr: 2_000_000,
    seats: 10,
    invoicable: true,
    updated_at: "2026-09-13T00:00:00Z",
  },
  {
    product: "host",
    sku: "basic",
    list_idr: 150_000,
    seats: 1,
    invoicable: true,
    updated_at: "2026-09-13T00:00:00Z",
  },
  {
    product: "host",
    sku: "pro",
    list_idr: 350_000,
    seats: 3,
    invoicable: true,
    updated_at: "2026-09-13T00:00:00Z",
  },
];

function changeSelect(trigger: HTMLElement, value: string) {
  const root = trigger.closest("[data-testid=select-root]");
  const sel = root?.querySelector("select");
  expect(sel).toBeTruthy();
  fireEvent.change(sel as HTMLSelectElement, { target: { value } });
}
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
  afterEach(() => {
    void i18n.changeLanguage("en");
  });

  beforeEach(() => {
    vi.clearAllMocks();
    void i18n.changeLanguage("en");
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
    expect(
      screen.getByText("Sinexis bills Scan and Host SKUs"),
    ).toBeInTheDocument();
    expect(screen.getByText("SX-202609-0001")).toBeInTheDocument();
    expect(screen.getByTestId("invoice-create")).toBeDisabled();
    expect(screen.getByTestId("invoice-paid-inv-1")).toBeInTheDocument();
  });

  it("shows Mark sent on a draft row and toasts status-flip copy, not emailed", async () => {
    type MutOpts = {
      mutationFn: (id: string) => unknown;
      onSuccess?: () => void;
    };
    vi.mocked(useMutation).mockImplementation(((opts: MutOpts) => ({
      mutate: (id: string) => {
        opts.mutationFn(id);
        opts.onSuccess?.();
      },
      isPending: false,
    })) as unknown as typeof useMutation);

    render(<AdminInvoices />);
    const sendBtn = screen.getByTestId("invoice-send-inv-1");
    expect(sendBtn).toBeVisible();
    expect(sendBtn).toHaveTextContent("Mark sent");
    expect(sendBtn.textContent).not.toMatch(/emailed/i);
    expect(screen.queryByText(/emailed/i)).not.toBeInTheDocument();

    await userEvent.click(sendBtn);
    expect(toast.success).toHaveBeenCalledWith(
      "Invoice marked sent (no email)",
    );
    expect(
      vi.mocked(toast.success).mock.calls.flat().join(" "),
    ).not.toMatch(/emailed/i);
  });

  it("says Mark sent after switching locale back to en", async () => {
    await i18n.changeLanguage("id");
    const first = render(<AdminInvoices />);
    expect(screen.getByTestId("invoice-send-inv-1")).toHaveTextContent(
      "Tandai terkirim",
    );
    first.unmount();
    await i18n.changeLanguage("en");
    render(<AdminInvoices />);
    expect(screen.getByTestId("invoice-send-inv-1")).toHaveTextContent(
      "Mark sent",
    );
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
    expect(screen.queryByTestId("admin-invoice-pdf")).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByTestId("admin-invoice-pdf"));
    expect(downloadAdminInvoicePdf).toHaveBeenCalledWith(
      "inv-1",
      "SX-202609-0001",
    );
  });

  it("toasts when invoice pdf download fails", async () => {
    vi.mocked(downloadAdminInvoicePdf).mockRejectedValueOnce(new Error("down"));
    vi.mocked(useQuery).mockImplementation(((opts: { queryKey: unknown[] }) => {
      const key = String(opts.queryKey[0]);
      if (key === "admin-sku-catalog") {
        return { data: catalog, isLoading: false };
      }
      if (key === "admin-orgs") {
        return { data: { items: [], total: 0 }, isLoading: false };
      }
      return {
        data: { items: [{ ...invoices[0], status: "paid" }], total: 1 },
        isLoading: false,
      };
    }) as typeof useQuery);
    render(<AdminInvoices />);
    await userEvent.click(screen.getByTestId("admin-invoice-pdf"));
    expect(toast.error).toHaveBeenCalledWith("Could not download invoice PDF");
  });

  it("lists Host in the product picker and filters SKU to Host catalog rows", async () => {
    type MutOpts = {
      mutationFn: (...args: unknown[]) => unknown;
      onSuccess?: (...args: unknown[]) => void;
    };
    vi.mocked(useMutation).mockImplementation(((opts: MutOpts) => ({
      mutate: () => {
        opts.mutationFn();
        opts.onSuccess?.();
      },
      isPending: false,
    })) as unknown as typeof useMutation);

    render(<AdminInvoices />);
    expect(screen.getByTestId("invoice-product")).toBeInTheDocument();
    expect(
      screen.getByTestId("invoice-product").closest("[data-testid=select-root]")
        ?.querySelector("[data-value=host]"),
    ).toBeTruthy();
    const skuRoot = () =>
      screen.getByTestId("invoice-sku").closest("[data-testid=select-root]");
    expect(skuRoot()?.querySelector("[data-value=multi]")).toBeTruthy();

    const orgTrigger = document.getElementById("inv-org");
    expect(orgTrigger).toBeTruthy();
    changeSelect(orgTrigger as HTMLElement, "org-1");
    changeSelect(screen.getByTestId("invoice-product"), "host");

    expect(skuRoot()?.querySelector("[data-value=multi]")).toBeFalsy();
    expect(screen.getByTestId("invoice-create")).not.toBeDisabled();
    await userEvent.click(screen.getByTestId("invoice-create"));
    expect(adminApi.createAdminInvoice).toHaveBeenCalledWith({
      organization_id: "org-1",
      sku: "basic",
      product: "host",
    });
  });

  it("toasts Host paid copy without implying Scan SKU apply", async () => {
    vi.mocked(adminApi.payAdminInvoice).mockReturnValue({
      ...invoices[0],
      product: "host",
      sku: "pro",
    } as never);
    type MutOpts = {
      mutationFn: (id: string) => unknown;
      onSuccess?: (inv: unknown) => void;
    };
    vi.mocked(useMutation).mockImplementation(((opts: MutOpts) => ({
      mutate: (id: string) => {
        const result = opts.mutationFn(id);
        opts.onSuccess?.(result);
      },
      isPending: false,
    })) as unknown as typeof useMutation);

    render(<AdminInvoices />);
    await userEvent.click(screen.getByTestId("invoice-paid-inv-1"));
    expect(toast.success).toHaveBeenCalledWith(
      "Marked paid — Host invoice; Scan org SKU unchanged",
    );
  });
});
