import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

vi.mock("@/api/subscription", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/subscription")>(
      "@/api/subscription",
    );
  return {
    ...actual,
    getSkuTiers: vi.fn(async () => []),
    listAdminSubscriptionRequests: vi.fn(async () => ({ items: [], total: 0 })),
  };
});

vi.mock("@/api/admin", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/admin")>("@/api/admin");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      getSkuCatalog: vi.fn(),
      listAdminOrgs: vi.fn(),
      listAdminInvoices: vi.fn(),
    },
    downloadAdminInvoicePdf: vi.fn(),
  };
});

import AdminInvoices from "@/pages/admin/AdminInvoices";
import {
  adminApi,
  type AdminOrgItem,
  type InvoiceItem,
  type SkuCatalogItem,
} from "@/api/admin";

const catalog: SkuCatalogItem[] = [
  {
    product: "scan",
    sku: "basic",
    label: "Basic",
    active: true,
    list_idr: 300_000,
    seats: 1,
    invoicable: true,
    updated_at: "2026-09-13T00:00:00Z",
  },
];

const org: AdminOrgItem = {
  id: "org-1",
  name: "Acme",
  slug: "acme",
  sku: "basic",
  kind: "company",
};

function invoice(n: number): InvoiceItem {
  return {
    id: `inv-${n}`,
    organization_id: org.id,
    number: `SX-202609-${String(n).padStart(4, "0")}`,
    product: "scan",
    sku: "basic",
    seats: 1,
    amount_idr: 300_000,
    total_idr: 300_000,
    period_start: "2026-09-01T00:00:00Z",
    period_end: "2026-09-30T23:59:59Z",
    status: "draft",
    bank_ref: null,
    notes: "",
    paid_at: null,
    created_at: "2026-09-13T00:00:00Z",
    updated_at: "2026-09-13T00:00:00Z",
    organization_name: "Acme",
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/admin/invoices"]}>
        <AdminInvoices />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminInvoices pagination and org search", () => {
  beforeEach(() => {
    vi.mocked(adminApi.getSkuCatalog).mockResolvedValue(catalog);
    vi.mocked(adminApi.listAdminOrgs).mockResolvedValue({
      items: [org],
      total: 1,
    });
    vi.mocked(adminApi.listAdminInvoices).mockImplementation(async (params) => {
      const page = params?.page ?? 1;
      const items =
        page === 1
          ? Array.from({ length: 20 }, (_, i) => invoice(i + 1))
          : Array.from({ length: 20 }, (_, i) => invoice(21 + i));
      return { items, total: 40 };
    });
  });

  it("requests page 2 and renders the matching slice count", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("invoices-list-desktop");
    expect(screen.getByTestId("invoices-range")).toHaveTextContent(
      "Showing 1–20 of 40",
    );

    await user.click(screen.getByTestId("invoices-next"));

    await waitFor(() =>
      expect(adminApi.listAdminInvoices).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, page_size: 20 }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("invoices-range")).toHaveTextContent(
        "Showing 21–40 of 40",
      ),
    );
  });

  it("resets to page 1 when the status filter changes", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("invoices-list-desktop");
    await user.click(screen.getByTestId("invoices-next"));
    await waitFor(() =>
      expect(adminApi.listAdminInvoices).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );

    const statusSelect = document
      .getElementById("inv-status")
      ?.closest("[data-testid='select-root']")
      ?.querySelector("select");
    expect(statusSelect).not.toBeNull();
    fireEvent.change(statusSelect as HTMLSelectElement, {
      target: { value: "paid" },
    });

    await waitFor(() =>
      expect(adminApi.listAdminInvoices).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, status: "paid" }),
      ),
    );
  });

  it("debounces org search and keeps the selected org in the list", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("invoices-list-desktop");
    const search = screen.getByTestId("invoice-org-search");
    await user.type(search, "acme");

    await waitFor(
      () =>
        expect(adminApi.listAdminOrgs).toHaveBeenLastCalledWith(
          expect.objectContaining({ q: "acme", page_size: 50 }),
        ),
      { timeout: 2_000 },
    );

    const orgSelect = document
      .getElementById("inv-org")
      ?.closest("[data-testid='select-root']")
      ?.querySelector("select");
    expect(orgSelect).not.toBeNull();
    await user.selectOptions(orgSelect as HTMLSelectElement, org.id);

    vi.mocked(adminApi.listAdminOrgs).mockResolvedValue({
      items: [],
      total: 0,
    });
    await user.clear(search);
    await user.type(search, "zzz");

    await waitFor(
      () =>
        expect(adminApi.listAdminOrgs).toHaveBeenLastCalledWith(
          expect.objectContaining({ q: "zzz", page_size: 50 }),
        ),
      { timeout: 2_000 },
    );

    const orgRoot = document
      .getElementById("inv-org")
      ?.closest("[data-testid='select-root']");
    expect(orgRoot).toHaveAttribute("data-value", org.id);
    expect(orgRoot?.querySelector(`[data-value="${org.id}"]`)).toBeTruthy();
  });
});
