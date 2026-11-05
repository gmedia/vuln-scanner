import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import AdminInvoices from "@/pages/admin/AdminInvoices";
import { adminApi } from "@/api/admin";
import type { InvoiceItem, SkuCatalogItem } from "@/api/admin";
import {
  listAdminSubscriptionRequests,
  type SubscriptionRequestItem,
} from "@/api/subscription";

vi.mock("@/api/admin", () => ({
  adminApi: {
    getSkuCatalog: vi.fn(),
    listAdminOrgs: vi.fn(),
    listAdminInvoices: vi.fn(),
    createAdminInvoice: vi.fn(),
    sendAdminInvoice: vi.fn(),
    payAdminInvoice: vi.fn(),
    voidAdminInvoice: vi.fn(),
    validateAdminPromoCode: vi.fn(),
  },
  downloadAdminInvoicePdf: vi.fn(),
}));

vi.mock("@/api/subscription", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/subscription")>(
      "@/api/subscription",
    );
  return {
    ...actual,
    getSkuTiers: vi.fn(async () => []),
    listAdminSubscriptionRequests: vi.fn(),
  };
});

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

const catalog: SkuCatalogItem[] = [
  { product: "scan", sku: "basic", label: "Basic", list_idr: 300_000, seats: 1, invoicable: true, active: true, updated_at: "" },
  { product: "scan", sku: "pro", label: "Pro", list_idr: 650_000, seats: 3, invoicable: true, active: true, updated_at: "" },
];

const invoice: InvoiceItem = {
  id: "inv-1",
  organization_id: "org-1",
  number: "SX-202611-0001",
  product: "scan",
  sku: "basic",
  seats: 1,
  amount_idr: 300_000,
  discount_idr: 50_000,
  promo_code: "LAUNCH2026",
  total_idr: 250_000,
  period_start: "2026-11-01T00:00:00Z",
  period_end: "2026-11-30T23:59:59Z",
  status: "draft",
  bank_ref: null,
  notes: "",
  paid_at: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  organization_name: "Acme",
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminInvoices />
    </QueryClientProvider>,
  );
}

const requests: SubscriptionRequestItem[] = [
  {
    id: "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization_id: "org-1",
    direction: "upgrade",
    current_sku: "basic",
    target_sku: "pro",
    cycle: "monthly",
    promo_code: "LINKED2026",
    note: "",
    status: "pending",
    resolution_note: "",
    created_at: "2026-11-01T00:00:00Z",
    resolved_at: null,
  },
  {
    id: "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    organization_id: "org-2",
    direction: "upgrade",
    current_sku: "basic",
    target_sku: "basic",
    cycle: "annual",
    promo_code: null,
    note: "",
    status: "pending",
    resolution_note: "",
    created_at: "2026-11-01T00:00:00Z",
    resolved_at: null,
  },
  {
    id: "33333333-cccc-4ccc-8ccc-cccccccccccc",
    organization_id: "org-1",
    direction: "downgrade",
    current_sku: "pro",
    target_sku: "basic",
    cycle: "monthly",
    promo_code: null,
    note: "",
    status: "approved",
    resolution_note: "",
    created_at: "2026-11-01T00:00:00Z",
    resolved_at: null,
  },
];

function changeSelectById(id: string, value: string) {
  const trigger = document.getElementById(id);
  const root = trigger?.closest("[data-testid=select-root]");
  const select = root?.querySelector("select");
  expect(select).toBeTruthy();
  fireEvent.change(select as HTMLSelectElement, { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminApi.getSkuCatalog).mockResolvedValue(catalog);
  vi.mocked(adminApi.listAdminOrgs).mockResolvedValue({
    items: [
      { id: "org-1", name: "Acme", slug: "acme", sku: "basic", kind: "team" },
      { id: "org-2", name: "Beta", slug: "beta", sku: "basic", kind: "team" },
    ],
    total: 2,
  });
  vi.mocked(listAdminSubscriptionRequests).mockResolvedValue({
    items: requests,
    total: requests.length,
  });
  vi.mocked(adminApi.listAdminInvoices).mockResolvedValue({
    items: [invoice],
    total: 1,
  });
  vi.mocked(adminApi.createAdminInvoice).mockResolvedValue(invoice);
  vi.mocked(adminApi.validateAdminPromoCode).mockResolvedValue({
    valid: true,
    description: "Launch discount",
    discount_idr: 50_000,
    total_idr: 250_000,
  });
});

describe("AdminInvoices promo", () => {
  it("previews a validated code and sends it on create", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("invoices-list-desktop");
    changeSelectById("inv-org", "org-1");
    await waitFor(() =>
      expect(document.getElementById("inv-org")).toBeInTheDocument(),
    );

    await user.type(screen.getByTestId("invoice-promo-code"), "launch2026");
    await user.click(screen.getByTestId("invoice-promo-apply"));

    expect(await screen.findByTestId("invoice-promo-result")).toHaveTextContent(
      "Launch discount",
    );
    expect(adminApi.validateAdminPromoCode).toHaveBeenCalledWith({
      organization_id: "org-1",
      code: "LAUNCH2026",
      product: "scan",
      sku: "basic",
      cycle: "monthly",
    });

    await user.click(screen.getByTestId("invoice-create"));

    await waitFor(() =>
      expect(adminApi.createAdminInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: "org-1",
          sku: "basic",
          promo_code: "LAUNCH2026",
        }),
      ),
    );
  });

  it("shows the discount on the invoice list", async () => {
    renderPage();

    const cell = await screen.findByTestId("invoice-discount-desktop-inv-1");
    expect(cell).toHaveTextContent("Rp 50.000");
    expect(cell).toHaveTextContent("LAUNCH2026");
  });

  it("shows a generic error for a rejected code", async () => {
    vi.mocked(adminApi.validateAdminPromoCode).mockRejectedValue(
      new Error("invalid"),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("invoices-list-desktop");
    changeSelectById("inv-org", "org-1");
    await user.type(screen.getByTestId("invoice-promo-code"), "BADCODE1");
    await user.click(screen.getByTestId("invoice-promo-apply"));

    expect(await screen.findByTestId("invoice-promo-error")).toHaveTextContent(
      "This code cannot be used for the selected invoice",
    );
  });

  it("lists only pending requests for the selected organization", async () => {
    renderPage();

    await screen.findByTestId("invoices-list-desktop");
    changeSelectById("inv-org", "org-1");

    const requestRoot = () =>
      document
        .getElementById("inv-request")
        ?.closest("[data-testid=select-root]") as HTMLElement;

    expect(
      await within(requestRoot()).findByText(
        "#11111111 · pro · monthly · LINKED2026",
      ),
    ).toBeInTheDocument();
    expect(within(requestRoot()).queryByText(/22222222/)).not.toBeInTheDocument();
    expect(within(requestRoot()).queryByText(/33333333/)).not.toBeInTheDocument();

    changeSelectById("inv-org", "org-2");

    expect(
      await within(requestRoot()).findByText("#22222222 · basic · annual"),
    ).toBeInTheDocument();
    expect(within(requestRoot()).queryByText(/11111111/)).not.toBeInTheDocument();
  });

  it("prefills SKU/cycle and validates the linked request promo code", async () => {
    renderPage();

    await screen.findByTestId("invoices-list-desktop");
    changeSelectById("inv-org", "org-1");
    changeSelectById("inv-request", requests[0].id);

    await waitFor(() =>
      expect(adminApi.validateAdminPromoCode).toHaveBeenCalledWith({
        organization_id: "org-1",
        code: "LINKED2026",
        product: "scan",
        sku: "pro",
        cycle: "monthly",
      }),
    );
    expect(await screen.findByTestId("invoice-promo-result")).toHaveTextContent(
      "Launch discount",
    );
    expect(
      document
        .getElementById("inv-sku")
        ?.closest("[data-testid=select-root]"),
    ).toHaveAttribute("data-value", "pro");
    expect(screen.getByTestId("invoice-promo-code")).toHaveValue("LINKED2026");
  });

  it("surfaces a linked code that no longer validates", async () => {
    vi.mocked(adminApi.validateAdminPromoCode).mockRejectedValue(
      new Error("expired"),
    );
    renderPage();

    await screen.findByTestId("invoices-list-desktop");
    changeSelectById("inv-org", "org-1");
    changeSelectById("inv-request", requests[0].id);

    expect(
      await screen.findByTestId("invoice-request-promo-invalid"),
    ).toHaveTextContent("no longer valid");
    expect(screen.queryByTestId("invoice-promo-result")).not.toBeInTheDocument();
    expect(screen.queryByTestId("invoice-promo-error")).not.toBeInTheDocument();
  });

  it("sends the linked request id with the validated promo code", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("invoices-list-desktop");
    changeSelectById("inv-org", "org-1");
    changeSelectById("inv-request", requests[0].id);
    await screen.findByTestId("invoice-promo-result");

    await user.click(screen.getByTestId("invoice-create"));

    await waitFor(() =>
      expect(adminApi.createAdminInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          organization_id: "org-1",
          sku: "pro",
          promo_code: "LINKED2026",
          subscription_request_id: requests[0].id,
        }),
      ),
    );
  });

  it("clears the linked request when the SKU changes", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("invoices-list-desktop");
    changeSelectById("inv-org", "org-1");
    changeSelectById("inv-request", requests[0].id);
    await screen.findByTestId("invoice-promo-result");

    changeSelectById("inv-sku", "basic");
    await user.click(screen.getByTestId("invoice-create"));

    await waitFor(() => expect(adminApi.createAdminInvoice).toHaveBeenCalled());
    const calls = vi.mocked(adminApi.createAdminInvoice).mock.calls;
    const body = calls[calls.length - 1]?.[0];
    expect(body).toBeDefined();
    expect(body).not.toHaveProperty("subscription_request_id");
    expect(body).not.toHaveProperty("promo_code");
  });
});
