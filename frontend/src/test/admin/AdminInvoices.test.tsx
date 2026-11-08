import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminInvoices from "@/pages/admin/AdminInvoices";
import i18n from "@/i18n";
import { toast } from "sonner";
import { adminApi, downloadAdminInvoicePdf } from "@/api/admin";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
  keepPreviousData: (data: unknown) => data,
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

vi.mock("@/components/ui/DatePicker", () => ({
  DatePicker: ({
    id,
    value,
    onChange,
    placeholder,
  }: {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      id={id}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock("@/components/ui/Select", () => {
  function collectSelectValues(node: React.ReactNode): string[] {
    const values: string[] = [];
    const walk = (n: React.ReactNode) => {
      if (Array.isArray(n)) {
        n.forEach(walk);
        return;
      }
      if (!n || typeof n !== "object" || !("props" in n)) return;
      const props = (
        n as React.ReactElement<{ value?: unknown; children?: React.ReactNode }>
      ).props;
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
    }) => (
      <div role="option" aria-selected={false} data-value={value}>
        {children}
      </div>
    ),
  };
});

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const catalog = ([
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
  {
    product: "uptime",
    sku: "basic",
    list_idr: 75_000,
    seats: 10,
    invoicable: true,
    updated_at: "",
  },
] as { product: string; sku: string; list_idr: number; seats: number; invoicable: boolean; updated_at: string; label?: string; active?: boolean }[]).map((row) => ({
  ...row,
  label: row.sku.charAt(0).toUpperCase() + row.sku.slice(1),
  active: true,
}));

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

  it("renders page, catalog, and create control", async () => {
    const user = userEvent.setup();
    render(<AdminInvoices />);
    expect(screen.getByTestId("admin-invoices-page")).toBeInTheDocument();
    expect(screen.getByTestId("invoices-guide")).toBeInTheDocument();
    expect(
      screen.getByText("Sinexis bills Scan and Host SKUs"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("invoices-list-desktop")).getByText(
        "SX-202609-0001",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("invoice-create")).toBeDisabled();
    await user.click(screen.getAllByTestId("invoice-actions-inv-1")[1]);
    expect(await screen.findByTestId("invoice-paid-inv-1")).toBeInTheDocument();
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
    await userEvent.click(screen.getAllByTestId("invoice-actions-inv-1")[1]);
    const sendBtn = await screen.findByTestId("invoice-send-inv-1");
    expect(sendBtn).toBeVisible();
    expect(sendBtn).toHaveTextContent("Mark sent");
    expect(sendBtn.textContent).not.toMatch(/emailed/i);
    expect(screen.queryByText(/emailed/i)).not.toBeInTheDocument();

    await userEvent.click(sendBtn);
    expect(toast.success).toHaveBeenCalledWith(
      "Invoice marked sent (no email)",
    );
    expect(vi.mocked(toast.success).mock.calls.flat().join(" ")).not.toMatch(
      /emailed/i,
    );
  });

  it("says Mark sent after switching locale back to en", async () => {
    await i18n.changeLanguage("id");
    const first = render(<AdminInvoices />);
    await userEvent.click(screen.getAllByTestId("invoice-actions-inv-1")[1]);
    expect(await screen.findByTestId("invoice-send-inv-1")).toHaveTextContent(
      "Tandai terkirim",
    );
    first.unmount();
    await i18n.changeLanguage("en");
    render(<AdminInvoices />);
    await userEvent.click(screen.getAllByTestId("invoice-actions-inv-1")[1]);
    expect(await screen.findByTestId("invoice-send-inv-1")).toHaveTextContent(
      "Mark sent",
    );
  });

  it("asks for a bank reference before marking paid", async () => {
    const mutate = vi.fn();
    vi.mocked(useMutation).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useMutation>);
    render(<AdminInvoices />);
    await userEvent.click(screen.getAllByTestId("invoice-actions-inv-1")[1]);
    await userEvent.click(await screen.findByTestId("invoice-paid-inv-1"));
    expect(mutate).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("SX-202609-0001");

    await userEvent.type(screen.getByTestId("invoice-pay-ref"), "TF-999");
    await userEvent.click(screen.getByTestId("invoice-pay-confirm"));
    expect(mutate).toHaveBeenCalledWith({ id: "inv-1", bankRef: "TF-999" });
  });

  it("does not carry the bank reference to another invoice", async () => {
    const mutate = vi.fn();
    vi.mocked(useMutation).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useMutation>);
    vi.mocked(useQuery).mockImplementation(((opts: { queryKey: unknown[] }) => {
      const key = String(opts.queryKey[0]);
      if (key === "admin-sku-catalog") {
        return { data: catalog, isLoading: false };
      }
      if (key === "admin-orgs") {
        return { data: { items: [], total: 0 }, isLoading: false };
      }
      return {
        data: {
          items: [
            { ...invoices[0], id: "inv-1", number: "SX-ONE" },
            { ...invoices[0], id: "inv-2", number: "SX-TWO" },
          ],
          total: 2,
        },
        isLoading: false,
      };
    }) as typeof useQuery);

    render(<AdminInvoices />);
    await userEvent.click(screen.getAllByTestId("invoice-actions-inv-1")[1]);
    await userEvent.click(await screen.findByTestId("invoice-paid-inv-1"));
    await userEvent.type(screen.getByTestId("invoice-pay-ref"), "TF-ONE");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getAllByTestId("invoice-actions-inv-2")[1]);
    await userEvent.click(await screen.findByTestId("invoice-paid-inv-2"));
    expect(await screen.findByTestId("invoice-pay-ref")).toHaveValue("");
  });

  it("has no global bank reference input", () => {
    render(<AdminInvoices />);
    expect(document.getElementById("inv-bank-ref")).toBeNull();
    expect(
      screen.queryByText("Bank ref (for mark paid)"),
    ).not.toBeInTheDocument();
  });

  it("asks before voiding an invoice", async () => {
    const user = userEvent.setup();
    type MutOpts = { mutationFn: (id: string) => unknown };
    vi.mocked(useMutation).mockImplementation(((opts: MutOpts) => ({
      mutate: (id: string) => opts.mutationFn(id),
      isPending: false,
    })) as unknown as typeof useMutation);

    render(<AdminInvoices />);
    await user.click(screen.getAllByTestId("invoice-actions-inv-1")[1]);
    await user.click(await screen.findByTestId("invoice-void-inv-1"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(adminApi.voidAdminInvoice).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("invoice-void-confirm"));
    expect(adminApi.voidAdminInvoice).toHaveBeenCalledWith("inv-1");
  });

  it("does not show print on a draft invoice", async () => {
    render(<AdminInvoices />);
    await userEvent.click(screen.getAllByTestId("invoice-actions-inv-1")[1]);
    await screen.findByTestId("invoice-send-inv-1");
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
    await userEvent.click(screen.getAllByTestId("invoice-actions-inv-1")[1]);
    await userEvent.click(await screen.findByTestId("admin-invoice-print"));
    expect(screen.getByTestId("invoice-print-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("invoice-print-bank")).toHaveTextContent(
      "0000000000",
    );
    await waitFor(() => expect(print).toHaveBeenCalled());
    await userEvent.click(screen.getAllByTestId("invoice-actions-inv-1")[1]);
    await userEvent.click(await screen.findByTestId("admin-invoice-pdf"));
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
    await userEvent.click(screen.getAllByTestId("invoice-actions-inv-1")[1]);
    await userEvent.click(await screen.findByTestId("admin-invoice-pdf"));
    expect(toast.error).toHaveBeenCalledWith("Could not download invoice PDF");
  });

  it("offers Uptime in the product picker", async () => {
    render(<AdminInvoices />);
    await userEvent.click(screen.getByTestId("invoice-product"));
    expect(
      await screen.findByRole("option", { name: /uptime/i }),
    ).toBeInTheDocument();
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
      screen
        .getByTestId("invoice-product")
        .closest("[data-testid=select-root]")
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
      cycle: "monthly",
    });
  });

  it("creates an annual invoice when the cycle is switched", async () => {
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
    const orgTrigger = document.getElementById("inv-org");
    changeSelect(orgTrigger as HTMLElement, "org-1");
    changeSelect(screen.getByTestId("invoice-cycle"), "annual");
    await userEvent.click(screen.getByTestId("invoice-create"));

    expect(adminApi.createAdminInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ cycle: "annual" }),
    );
  });

  it("toasts Host paid copy without implying Scan SKU apply", async () => {
    vi.mocked(adminApi.payAdminInvoice).mockReturnValue({
      ...invoices[0],
      product: "host",
      sku: "pro",
    } as never);
    type MutOpts = {
      mutationFn: (vars: { id: string; bankRef?: string }) => unknown;
      onSuccess?: (inv: unknown) => void;
    };
    vi.mocked(useMutation).mockImplementation(((opts: MutOpts) => ({
      mutate: (vars: { id: string; bankRef?: string }) => {
        const result = opts.mutationFn(vars);
        opts.onSuccess?.(result);
      },
      isPending: false,
    })) as unknown as typeof useMutation);

    render(<AdminInvoices />);
    await userEvent.click(screen.getAllByTestId("invoice-actions-inv-1")[1]);
    await userEvent.click(await screen.findByTestId("invoice-paid-inv-1"));
    await userEvent.click(await screen.findByTestId("invoice-pay-confirm"));
    expect(toast.success).toHaveBeenCalledWith(
      "Marked paid — Host invoice; Scan org SKU unchanged",
    );
  });

  it("labels the invoice amount column as the tax-inclusive total", () => {
    render(<AdminInvoices />);
    expect(
      within(screen.getByTestId("invoices-list-desktop")).getByText(
        "Total (incl. tax)",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("invoice-catalog-desktop")).getByText(
        "List IDR",
      ),
    ).toBeInTheDocument();
  });

  it("sends period start, due date, and notes when filled", async () => {
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
    changeSelect(document.getElementById("inv-org") as HTMLElement, "org-1");
    fireEvent.change(
      document.getElementById("inv-period-start") as HTMLInputElement,
      { target: { value: "2026-12-01" } },
    );
    fireEvent.change(
      document.getElementById("inv-due-date") as HTMLInputElement,
      { target: { value: "2027-01-15" } },
    );
    fireEvent.change(
      document.getElementById("inv-notes") as HTMLTextAreaElement,
      { target: { value: "PO-123" } },
    );
    await userEvent.click(screen.getByTestId("invoice-create"));

    expect(adminApi.createAdminInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        period_start: "2026-12-01",
        due_date: "2027-01-15",
        notes: "PO-123",
      }),
    );
  });

  it("rails the banner info and a draft row muted", () => {
    render(<AdminInvoices />);
    expect(
      screen.getByTestId("invoices-banner").querySelector(".bg-sky-600"),
    ).toBeTruthy();
    const list = screen.getByTestId("invoices-list-shell");
    const draftRow = within(screen.getByTestId("invoices-list-desktop"))
      .getByText("SX-202609-0001")
      .closest("tr");
    expect(draftRow?.querySelector(".bg-border")).toBeTruthy();
    expect(list.querySelector(".bg-border")).toBeTruthy();
  });

  it("rails a sent invoice amber and a void one destructive", () => {
    vi.mocked(useQuery).mockImplementation(((opts: { queryKey: unknown[] }) => {
      const key = String(opts.queryKey[0]);
      if (key === "admin-sku-catalog") {
        return { data: catalog, isLoading: false };
      }
      if (key === "admin-orgs") {
        return { data: { items: [], total: 0 }, isLoading: false };
      }
      return {
        data: {
          items: [
            {
              ...invoices[0],
              id: "inv-sent",
              number: "SX-SENT",
              status: "sent",
            },
            {
              ...invoices[0],
              id: "inv-void",
              number: "SX-VOID",
              status: "void",
            },
          ],
          total: 2,
        },
        isLoading: false,
      };
    }) as typeof useQuery);
    render(<AdminInvoices />);
    const sentRow = within(screen.getByTestId("invoices-list-desktop"))
      .getByText("SX-SENT")
      .closest("tr");
    expect(sentRow?.querySelector(".bg-amber-600")).toBeTruthy();
    const voidRow = within(screen.getByTestId("invoices-list-desktop"))
      .getByText("SX-VOID")
      .closest("tr");
    expect(voidRow?.querySelector(".bg-destructive")).toBeTruthy();
    expect(
      screen
        .getByTestId("invoices-list-shell")
        .querySelector(".bg-destructive"),
    ).toBeTruthy();
  });

  it("renders an empty island when there are no invoices", () => {
    vi.mocked(useQuery).mockImplementation(((opts: { queryKey: unknown[] }) => {
      const key = String(opts.queryKey[0]);
      if (key === "admin-sku-catalog") {
        return { data: catalog, isLoading: false };
      }
      if (key === "admin-orgs") {
        return { data: { items: [], total: 0 }, isLoading: false };
      }
      return { data: { items: [], total: 0 }, isLoading: false };
    }) as typeof useQuery);
    render(<AdminInvoices />);
    const island = screen.getByTestId("admin-invoices-empty");
    expect(island.className).toMatch(/bg-muted\/40/);
    expect(island.className).toMatch(/rounded-xl/);
  });
  it("uses API labels and excludes retired tiers from new invoices", () => {
    const retiredCatalog = catalog.map((row) =>
      row.product === "scan" && row.sku === "pro"
        ? { ...row, label: "Pro Legacy", active: false }
        : row,
    );
    vi.mocked(useQuery).mockImplementation(((opts: { queryKey: unknown[] }) => {
      const key = String(opts.queryKey[0]);
      if (key === "admin-sku-catalog") {
        return { data: retiredCatalog, isLoading: false };
      }
      if (key === "admin-orgs") {
        return { data: { items: [], total: 0 }, isLoading: false };
      }
      return { data: { items: invoices, total: 1 }, isLoading: false };
    }) as typeof useQuery);
    render(<AdminInvoices />);

    expect(screen.getByTestId("invoice-catalog-desktop")).toHaveTextContent(
      "Pro Legacy",
    );
    const skuRoot = screen
      .getByTestId("invoice-sku")
      .closest("[data-testid=select-root]");
    expect(skuRoot?.querySelector("[data-value=pro]")).toBeFalsy();
    expect(skuRoot?.querySelector("[data-value=basic]")).toBeTruthy();
  });

  it("shows a billing-only notice for non-Scan products and hides it for Scan", async () => {
    render(<AdminInvoices />);
    expect(
      screen.queryByTestId("invoice-nonscan-notice"),
    ).not.toBeInTheDocument();

    changeSelect(screen.getByTestId("invoice-product"), "host");

    const notice = await screen.findByTestId("invoice-nonscan-notice");
    expect(notice).toHaveTextContent(/billing record only/i);
    expect(notice.textContent).not.toMatch(/plan is now/i);
  });

});
