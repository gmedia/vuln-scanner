import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

import AdminSubscriptions from "@/pages/admin/AdminSubscriptions";
import { listAdminInvoices } from "@/api/admin";
import {
  cancelAdminSubscription,
  listAdminSubscriptions,
  recordAdminSubscriptionPayment,
  type AdminSubscriptionItem,
} from "@/api/adminBilling";

vi.mock("@/api/admin", async () => {
  const actual = await vi.importActual<typeof import("@/api/admin")>("@/api/admin");
  return { ...actual, listAdminInvoices: vi.fn() };
});

vi.mock("@/api/adminBilling", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/adminBilling")>(
      "@/api/adminBilling",
    );
  return {
    ...actual,
    listAdminSubscriptions: vi.fn(),
    getAdminSubscription: vi.fn(),
    recordAdminSubscriptionPayment: vi.fn(),
    cancelAdminSubscription: vi.fn(),
  };
});

const subscription: AdminSubscriptionItem = {
  id: "sub-1",
  organization_id: "org-a",
  organization_name: "Org A",
  sku: "pro",
  status: "past_due",
  cycle: "monthly",
  current_period_start: "2026-09-01T00:00:00Z",
  current_period_end: "2026-09-30T23:59:59Z",
  cancel_at_period_end: true,
  canceled_at: null,
  ended_at: null,
  provider: "manual",
  provider_subscription_id: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/admin/subscriptions"]}>
        <AdminSubscriptions />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminSubscriptions", () => {
  beforeEach(() => {
    vi.mocked(listAdminSubscriptions).mockReset();
    vi.mocked(listAdminInvoices).mockReset();
    vi.mocked(recordAdminSubscriptionPayment).mockReset();
    vi.mocked(cancelAdminSubscription).mockReset();

    vi.mocked(listAdminSubscriptions).mockResolvedValue({
      items: [subscription],
      total: 1,
    });
    vi.mocked(listAdminInvoices).mockResolvedValue({
      items: [
        {
          id: "inv-9",
          organization_id: "org-a",
          number: "SX-202610-0009",
          product: "scan",
          sku: "pro",
          seats: 3,
          amount_idr: 650_000,
          period_start: "2026-10-01T00:00:00Z",
          period_end: "2026-10-31T23:59:59Z",
          status: "sent",
          bank_ref: null,
          notes: "",
          paid_at: null,
          created_at: "2026-10-01T00:00:00Z",
          updated_at: "2026-10-01T00:00:00Z",
        },
      ],
      total: 1,
    });
    vi.mocked(recordAdminSubscriptionPayment).mockResolvedValue({
      subscription,
      attempt: {
        id: "att-1",
        organization_id: "org-a",
        subscription_id: "sub-1",
        invoice_id: "inv-9",
        provider: "manual",
        provider_ref: "TF-9",
        amount_idr: 650_000,
        currency: "IDR",
        status: "succeeded",
        method: "bank_transfer",
        failure_code: null,
        failure_message: null,
        next_retry_at: null,
        succeeded_at: "2026-10-20T00:00:00Z",
        failed_at: null,
        created_at: "2026-10-20T00:00:00Z",
        updated_at: "2026-10-20T00:00:00Z",
      },
      invoice_id: "inv-9",
      invoice_status: "paid",
    });
    vi.mocked(cancelAdminSubscription).mockResolvedValue({
      ...subscription,
      status: "canceled",
      cancel_at_period_end: false,
    });
  });

  it("lists subscriptions with status and the scheduled cancel date", async () => {
    renderPage();

    const table = await screen.findByTestId("admin-subscriptions-table");
    expect(within(table).getByText("Org A")).toBeInTheDocument();
    expect(within(table).getByText("Past due")).toBeInTheDocument();
    expect(within(table).getByText("pro · Monthly")).toBeInTheDocument();
    expect(within(table).getByText(/Ends/)).toBeInTheDocument();
  });

  it("records a payment against an unpaid invoice", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("admin-subscriptions-table");
    await user.click(screen.getByTestId("admin-subscription-pay-sub-1"));

    const invoiceSelect = await screen.findByTestId(
      "admin-subscription-invoice-trigger",
    );
    const root = invoiceSelect.closest("[data-testid='select-root']");
    const select = root?.querySelector("select");
    expect(select).not.toBeNull();
    await user.selectOptions(select as HTMLSelectElement, "inv-9");

    await user.type(
      screen.getByTestId("admin-subscription-reference"),
      "TF-9",
    );
    await user.click(screen.getByTestId("admin-subscription-pay-submit"));

    await waitFor(() =>
      expect(recordAdminSubscriptionPayment).toHaveBeenCalledWith("org-a", {
        invoice_id: "inv-9",
        method: "bank_transfer",
        reference: "TF-9",
      }),
    );
  });

  it("cancels at period end by default", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("admin-subscriptions-table");
    await user.click(screen.getByTestId("admin-subscription-cancel-sub-1"));

    expect(
      await screen.findByText("Cancel this subscription?"),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("admin-subscription-cancel-submit"));

    await waitFor(() =>
      expect(cancelAdminSubscription).toHaveBeenCalledWith("org-a", {
        at_period_end: true,
        note: "",
      }),
    );
  });

  it("renders the empty state", async () => {
    vi.mocked(listAdminSubscriptions).mockResolvedValue({ items: [], total: 0 });
    renderPage();
    expect(
      await screen.findByTestId("admin-subscriptions-empty"),
    ).toBeInTheDocument();
  });
});
