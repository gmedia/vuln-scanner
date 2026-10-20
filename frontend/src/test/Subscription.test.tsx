import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Subscription from "@/pages/Subscription";
import { useAuthStore } from "@/store/authStore";
import {
  cancelSubscriptionRequest,
  createSubscriptionRequest,
  getSubscription,
  type SubscriptionOverview,
} from "@/api/subscription";
import { listOrgInvoices } from "@/api/orgs";

vi.mock("@/api/subscription", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/subscription")>(
      "@/api/subscription",
    );
  return {
    ...actual,
    getSubscription: vi.fn(),
    createSubscriptionRequest: vi.fn(),
    cancelSubscriptionRequest: vi.fn(),
  };
});

vi.mock("@/api/orgs", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/orgs")>("@/api/orgs");
  return {
    ...actual,
    listOrgInvoices: vi.fn(async () => ({ items: [], total: 0 })),
    downloadOrgInvoicePdf: vi.fn(async () => {}),
  };
});

function overview(overrides: Partial<SubscriptionOverview> = {}): SubscriptionOverview {
  return {
    organization_id: "org-a",
    organization_name: "Org A",
    plan: {
      sku: "pro",
      label: "Sinexis Secure — Pro",
      status: "active",
      source: "invoice",
      cycle: "monthly",
      amount_idr: 1_000_000,
      period_start: "2026-10-01T00:00:00Z",
      period_end: "2026-10-31T23:59:59Z",
      renewal_at: "2026-10-31T23:59:59Z",
      invoice_id: "inv-1",
      invoice_number: "SX-202610-0001",
    },
    usage: [
      { product: "scan", used: 2, limit: 3, unit: "asset" },
      { product: "host", used: 1, limit: 3, unit: "site" },
      { product: "uptime", used: 12, limit: 50, unit: "monitor" },
      { product: "guard", used: 2, limit: 3, unit: "agent" },
    ],
    workspace_seats: {
      editors: 2,
      viewers: 1,
      editor_limit: null,
      viewer_limit: null,
    },
    catalog: ["scan", "host", "uptime", "guard"].flatMap((service) =>
      (["basic", "pro", "multi"] as const).map((sku) => ({
        service: service as "scan" | "host" | "uptime" | "guard",
        sku,
        list_idr: 100_000,
        seats: 1,
        invoicable: true,
      })),
    ),
    bundles: [
      { tier: "basic", bundle_idr: 450_000, alacarte_idr: 625_000, saving_idr: 175_000, saving_pct: 28 },
      { tier: "pro", bundle_idr: 1_000_000, alacarte_idr: 1_450_000, saving_idr: 450_000, saving_pct: 31 },
      { tier: "multi", bundle_idr: 2_900_000, alacarte_idr: 4_000_000, saving_idr: 1_100_000, saving_pct: 27.5 },
    ],
    annual: { months_paid: 10, months_served: 12 },
    enterprise: { contact_only: true },
    capabilities: {
      can_manage: true,
      can_request_change: true,
      can_view_invoices: true,
      can_self_serve: false,
    },
    pending_request: null,
    ...overrides,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/settings/subscription"]}>
        <Subscription />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setRole(role: "owner" | "viewer") {
  useAuthStore.setState({
    user: {
      id: "u-1",
      email: "owner@example.com",
      is_verified: true,
      is_admin: false,
      credits: 0,
    },
    activeOrgId: "org-a",
    organizations: [
      {
        id: "org-a",
        name: "Org A",
        slug: "org-a",
        role,
        kind: "team",
        sku: "pro",
      },
    ],
  });
}

describe("Subscription page", () => {
  beforeEach(() => {
    vi.mocked(getSubscription).mockReset();
    vi.mocked(createSubscriptionRequest).mockReset();
    vi.mocked(cancelSubscriptionRequest).mockReset();
    vi.mocked(listOrgInvoices).mockReset();
    vi.mocked(listOrgInvoices).mockResolvedValue({ items: [], total: 0 });
    setRole("owner");
  });

  it("renders the plan summary, capacity, and plan grid", async () => {
    vi.mocked(getSubscription).mockResolvedValue(overview());
    renderPage();

    expect(await screen.findByTestId("subscription-summary")).toBeInTheDocument();
    expect(screen.getAllByText("Sinexis Secure — Pro").length).toBeGreaterThan(0);
    expect(screen.getByTestId("subscription-usage-scan")).toHaveTextContent("2 / 3");
    expect(screen.getByTestId("subscription-plan-basic")).toBeInTheDocument();
    expect(screen.getByTestId("subscription-choose-pro")).toBeDisabled();
    expect(screen.getByTestId("subscription-alacarte-table")).toBeInTheDocument();
    expect(screen.getByTestId("subscription-invoices-empty")).toBeInTheDocument();
  });

  it("submits a plan change request from the dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(getSubscription).mockResolvedValue(overview());
    vi.mocked(createSubscriptionRequest).mockResolvedValue({
      id: "req-1",
      organization_id: "org-a",
      direction: "upgrade",
      current_sku: "pro",
      target_sku: "multi",
      cycle: "monthly",
      note: "Need 10",
      status: "pending",
      resolution_note: "",
      created_at: "2026-10-19T00:00:00Z",
      resolved_at: null,
    });
    renderPage();

    await screen.findByTestId("subscription-summary");
    await user.click(screen.getByTestId("subscription-choose-multi"));
    expect(await screen.findByText("Request Multi")).toBeInTheDocument();
    await user.type(screen.getByTestId("subscription-request-note"), "Need 10");
    await user.click(screen.getByTestId("subscription-request-submit"));

    await waitFor(() =>
      expect(createSubscriptionRequest).toHaveBeenCalledWith("org-a", {
        target_sku: "multi",
        cycle: "monthly",
        note: "Need 10",
      }),
    );
  });

  it("disables change requests and shows the admin-only invoice notice for viewers", async () => {
    setRole("viewer");
    vi.mocked(getSubscription).mockResolvedValue(
      overview({
        capabilities: {
          can_manage: false,
          can_request_change: false,
          can_view_invoices: false,
          can_self_serve: false,
        },
      }),
    );
    renderPage();

    await screen.findByTestId("subscription-summary");
    expect(screen.getByTestId("subscription-choose-multi")).toBeDisabled();
    expect(
      screen.getByText("Only owners and admins can view invoices."),
    ).toBeInTheDocument();
    expect(listOrgInvoices).not.toHaveBeenCalled();
  });

  it("renders an error state instead of an empty plan", async () => {
    vi.mocked(getSubscription).mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByTestId("subscription-error")).toBeInTheDocument();
  });

  it("renders the no-org empty state", () => {
    useAuthStore.setState({ activeOrgId: null, organizations: [] });
    renderPage();
    expect(screen.getByTestId("subscription-no-org")).toBeInTheDocument();
  });
});
