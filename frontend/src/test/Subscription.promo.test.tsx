import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Subscription from "@/pages/Subscription";
import { useAuthStore } from "@/store/authStore";
import {
  createSubscriptionRequest,
  getSubscription,
  validateOrgPromoCode,
  type SkuTierInfo,
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
    cancelSubscription: vi.fn(),
    resumeSubscription: vi.fn(),
    validateOrgPromoCode: vi.fn(),
  };
});

vi.mock("@/api/billingProfile", () => ({
  getBillingProfile: vi.fn(async () => ({
    organization_id: "org-a",
    legal_name: "",
    tax_id: "",
    nitku: "",
    address_line1: "",
    address_line2: "",
    city: "",
    province: "",
    postal_code: "",
    country: "ID",
    billing_email: "",
    po_required: false,
    po_number: "",
    payment_terms_days: 0,
    pkp_status: "unknown",
    recipients: [],
  })),
  saveBillingProfile: vi.fn(),
  addBillingRecipient: vi.fn(),
  removeBillingRecipient: vi.fn(),
}));

vi.mock("@/api/orgs", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/orgs")>("@/api/orgs");
  return {
    ...actual,
    listOrgInvoices: vi.fn(async () => ({ items: [], total: 0 })),
    downloadOrgInvoicePdf: vi.fn(async () => {}),
  };
});

const TIERS: SkuTierInfo[] = [
  {
    code: "basic",
    label: "Basic",
    rank: 1,
    active: true,
    requestable: true,
    sales_led: false,
    is_default: true,
    bundle_idr: 450_000,
    limits: { scan: 1, host: 1, uptime: 10, guard: 1 },
    features: {
      allow_status_page: false,
      allow_custom_host: false,
      allow_waf_protect: false,
      allow_siem: false,
      billing_unrestricted: false,
      sales_led: false,
      requestable: true,
    },
    workspace_limits: { editor: 1, viewer: 1 },
  },
  {
    code: "pro",
    label: "Pro",
    rank: 2,
    active: true,
    requestable: true,
    sales_led: false,
    is_default: false,
    bundle_idr: 1_000_000,
    limits: { scan: 3, host: 3, uptime: 50, guard: 3 },
    features: {
      allow_status_page: true,
      allow_custom_host: false,
      allow_waf_protect: true,
      allow_siem: false,
      billing_unrestricted: false,
      sales_led: false,
      requestable: true,
    },
    workspace_limits: { editor: null, viewer: null },
  },
];

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
    tiers: TIERS,
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
      ["basic", "pro"].map((sku) => ({
        service: service as "scan" | "host" | "uptime" | "guard",
        sku,
        label: sku === "basic" ? "Basic" : "Pro",
        active: true,
        list_idr: 100_000,
        seats: 1,
        invoicable: true,
      })),
    ),
    bundles: [
      { tier: "basic", label: "Basic", active: true, bundle_idr: 450_000, alacarte_idr: 625_000, saving_idr: 175_000, saving_pct: 28 },
      { tier: "pro", label: "Pro", active: true, bundle_idr: 1_000_000, alacarte_idr: 1_450_000, saving_idr: 450_000, saving_pct: 31 },
    ],
    annual: { months_paid: 10, months_served: 12 },
    enterprise: { contact_only: true },
    capabilities: {
      can_manage: true,
      can_request_change: true,
      can_view_invoices: true,
      can_self_serve: false,
      read_only: false,
      read_only_reason: null,
      promo_codes: true,
    },
    pending_request: null,
    recent_attempts: [],
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

async function openRequest() {
  const user = userEvent.setup();
  await user.click(await screen.findByTestId("subscription-choose-basic"));
  await screen.findByTestId("subscription-request-submit");
  return user;
}

beforeEach(() => {
  vi.mocked(getSubscription).mockReset();
  vi.mocked(createSubscriptionRequest).mockReset();
  vi.mocked(validateOrgPromoCode).mockReset();
  vi.mocked(listOrgInvoices).mockResolvedValue({ items: [], total: 0 });
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
        role: "owner",
        kind: "team",
        sku: "pro",
      },
    ],
  });
});

describe("Subscription promo field", () => {
  it("is hidden when the capability is off", async () => {
    vi.mocked(getSubscription).mockResolvedValue(
      overview({
        capabilities: { ...overview().capabilities, promo_codes: false },
      }),
    );
    renderPage();
    await openRequest();

    expect(screen.queryByTestId("subscription-promo")).not.toBeInTheDocument();
  });

  it("is disabled on the annual cycle", async () => {
    vi.mocked(getSubscription).mockResolvedValue(overview());
    renderPage();
    const user = userEvent.setup();
    await screen.findByTestId("subscription-summary");
    await user.click(screen.getByRole("tab", { name: "Annual" }));
    await user.click(await screen.findByTestId("subscription-choose-basic"));

    expect(await screen.findByTestId("subscription-promo")).toBeInTheDocument();
    expect(screen.getByTestId("subscription-promo-code")).toBeDisabled();
    expect(screen.getByTestId("subscription-promo-annual")).toBeInTheDocument();
  });

  it("shows an accepted description and estimate", async () => {
    vi.mocked(getSubscription).mockResolvedValue(overview());
    vi.mocked(validateOrgPromoCode).mockResolvedValue({
      valid: true,
      description: "Launch discount",
      discount_idr: 50_000,
      total_idr: 250_000,
    });
    renderPage();
    const user = await openRequest();

    await user.type(screen.getByTestId("subscription-promo-code"), "launch2026");
    await user.click(screen.getByTestId("subscription-promo-apply"));

    expect(await screen.findByTestId("subscription-promo-result")).toHaveTextContent(
      "Launch discount",
    );
    expect(screen.getByTestId("subscription-promo-result")).toHaveTextContent(
      "Rp 50.000",
    );
    expect(screen.getByTestId("subscription-promo-result")).toHaveTextContent(
      /estimate/i,
    );
    expect(validateOrgPromoCode).toHaveBeenCalledWith("org-a", {
      code: "LAUNCH2026",
      target_sku: "basic",
      cycle: "monthly",
    });
  });

  it("shows a generic error for a rejected code", async () => {
    vi.mocked(getSubscription).mockResolvedValue(overview());
    vi.mocked(validateOrgPromoCode).mockRejectedValue(
      new Error("invalid promo"),
    );
    renderPage();
    const user = await openRequest();

    await user.type(screen.getByTestId("subscription-promo-code"), "BADCODE1");
    await user.click(screen.getByTestId("subscription-promo-apply"));

    expect(await screen.findByTestId("subscription-promo-error")).toHaveTextContent(
      "This code cannot be used",
    );
  });

  it("sends the applied code with the request", async () => {
    vi.mocked(getSubscription).mockResolvedValue(overview());
    vi.mocked(validateOrgPromoCode).mockResolvedValue({
      valid: true,
      description: "Launch discount",
      discount_idr: 50_000,
      total_idr: 250_000,
    });
    vi.mocked(createSubscriptionRequest).mockResolvedValue({
      id: "req-1",
      organization_id: "org-a",
      direction: "downgrade",
      current_sku: "pro",
      target_sku: "basic",
      cycle: "monthly",
      promo_code: "LAUNCH2026",
      note: "",
      status: "pending",
      resolution_note: "",
      created_at: "2026-11-04T00:00:00Z",
      resolved_at: null,
    });
    renderPage();
    const user = await openRequest();

    await user.type(screen.getByTestId("subscription-promo-code"), "launch2026");
    await user.click(screen.getByTestId("subscription-promo-apply"));
    await screen.findByTestId("subscription-promo-result");
    await user.click(screen.getByTestId("subscription-request-submit"));

    await waitFor(() =>
      expect(createSubscriptionRequest).toHaveBeenCalledWith(
        "org-a",
        expect.objectContaining({
          target_sku: "basic",
          promo_code: "LAUNCH2026",
        }),
      ),
    );
  });

  it("shows the code on the pending request notice", async () => {
    vi.mocked(getSubscription).mockResolvedValue(
      overview({
        pending_request: {
          id: "req-1",
          organization_id: "org-a",
          direction: "downgrade",
          current_sku: "pro",
          target_sku: "basic",
          cycle: "monthly",
          promo_code: "LAUNCH2026",
          note: "",
          status: "pending",
          resolution_note: "",
          created_at: "2026-11-04T00:00:00Z",
          resolved_at: null,
        },
      }),
    );
    renderPage();

    expect(await screen.findByTestId("subscription-pending-promo")).toHaveTextContent(
      "LAUNCH2026",
    );
  });
});
