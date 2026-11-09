import type { APIRequestContext, APIResponse } from "@playwright/test";

import { e2eEmail, e2ePassword } from "./credentials";
import { test, expect } from "./fixtures";

const baseURL = process.env.BASE_URL || "http://localhost";
const runId = Date.now().toString(36);
const bankRef = `E2E-TF-${runId}`;
const voidReason = "E2E wrong invoice";

type OrgMembership = { id: string; name: string; sku: string };
type CatalogRow = {
  product: string;
  sku: string;
  list_idr: number;
  invoicable: boolean;
  active?: boolean;
};
type SkuTier = { code: string; active: boolean; requestable: boolean };
type InvoiceItem = {
  id: string;
  number: string;
  product: string;
  sku: string;
  subscription_request_id: string | null;
  status: string;
  period_start: string;
  period_end: string;
};
type SubscriptionRequestItem = {
  id: string;
  organization_id: string;
  status: string;
};
type SubscriptionItem = { id: string; organization_id: string };
type TierHistoryItem = {
  action: string;
  changes: { tier?: { to: string }; source?: { to: string } };
};
type ListResponse<T> = { items: T[] };

async function body<T>(res: APIResponse): Promise<T> {
  return (await res.json()) as T;
}

test.describe
  .serial("Admin billing — approve → pay → correct @admin @billing", () => {
  let api: APIRequestContext | undefined;
  let org: OrgMembership | undefined;
  let target: CatalogRow | undefined;
  let startingSku: string | undefined;
  let requestId: string | undefined;
  let invoiceId: string | undefined;
  let subscriptionId: string | undefined;
  let paidBlocker: string | undefined;

  function requireApi(): APIRequestContext {
    if (!api) throw new Error("beforeAll did not create an API context");
    return api;
  }

  function requireOrg(): OrgMembership {
    if (!org) throw new Error("beforeAll did not resolve an organization");
    return org;
  }

  function requireTarget(): CatalogRow {
    if (!target) throw new Error("beforeAll did not resolve a target SKU");
    return target;
  }

  function requireStartingSku(): string {
    if (!startingSku)
      throw new Error("beforeAll did not capture the starting SKU");
    return startingSku;
  }

  function requireRequestId(): string {
    if (!requestId)
      throw new Error("beforeAll did not create a subscription request");
    return requestId;
  }

  function requireInvoiceId(): string {
    if (!invoiceId) throw new Error("approval did not create an invoice");
    return invoiceId;
  }

  function requireSubscriptionId(): string {
    if (!subscriptionId)
      throw new Error("approval did not create a subscription row");
    return subscriptionId;
  }

  async function listInvoices(): Promise<InvoiceItem[]> {
    const res = await requireApi().get(
      `/api/admin/invoices?organization_id=${requireOrg().id}&page_size=100`,
    );
    expect(res.status()).toBe(200);
    return (await body<ListResponse<InvoiceItem>>(res)).items;
  }

  async function invoiceById(id: string): Promise<InvoiceItem | undefined> {
    const res = await requireApi().get(
      `/api/admin/invoices?organization_id=${requireOrg().id}&page_size=100`,
    );
    if (res.status() !== 200) return undefined;
    return (await body<ListResponse<InvoiceItem>>(res)).items.find(
      (item) => item.id === id,
    );
  }

  async function orgSku(): Promise<string | undefined> {
    const res = await requireApi().get("/api/orgs");
    expect(res.status()).toBe(200);
    return (await body<OrgMembership[]>(res)).find(
      (item) => item.id === requireOrg().id,
    )?.sku;
  }

  test.beforeAll(async ({ playwright }) => {
    const anonymous = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "X-E2E-Test": "true" },
    });
    const login = await anonymous.post("/api/auth/login", {
      data: { email: e2eEmail(), password: e2ePassword() },
    });
    expect(login.status()).toBe(200);
    const tokens = await body<{ access_token?: string }>(login);
    await anonymous.dispose();
    expect(tokens.access_token).toBeTruthy();

    api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: {
        "X-E2E-Test": "true",
        Authorization: `Bearer ${tokens.access_token ?? ""}`,
      },
    });

    const orgsRes = await api.get("/api/orgs");
    expect(orgsRes.status()).toBe(200);
    const orgs = await body<OrgMembership[]>(orgsRes);
    test.skip(
      orgs.length === 0,
      "E2E user has no organization; seed the stack first.",
    );
    if (orgs.length === 0) return;
    org = orgs[0];
    startingSku = org.sku;

    // Approval needs a requestable scan SKU that is invoicable and priced, and
    // the request endpoint rejects target_sku === the org's current plan.
    const catalogRes = await api.get("/api/admin/sku-catalog");
    expect(catalogRes.status()).toBe(200);
    const catalog = (
      await body<ListResponse<CatalogRow>>(catalogRes)
    ).items.filter(
      (row) =>
        row.product === "scan" &&
        row.invoicable &&
        row.list_idr > 0 &&
        row.active !== false,
    );
    const tiersRes = await api.get("/api/admin/sku-tiers");
    expect(tiersRes.status()).toBe(200);
    const requestable = new Set(
      (await body<SkuTier[]>(tiersRes))
        .filter((tier) => tier.active && tier.requestable)
        .map((tier) => tier.code),
    );
    const pool = catalog.filter((row) => requestable.has(row.sku));
    const picked = pool.find((row) => row.sku !== org!.sku);
    test.skip(
      !picked,
      "No requestable scan SKU distinct from the seeded org's plan",
    );
    if (!picked) return;
    target = picked;

    // The approval invoices the current month (or the next free period). Void
    // stale draft/sent scan lines from earlier local runs so the overlap guard
    // in InvoiceService does not 409. A paid line is never touched — skip
    // instead of silently rewriting financial history.
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1,
    );
    const existingRes = await api.get(
      `/api/admin/invoices?organization_id=${org.id}&page_size=100`,
    );
    expect(existingRes.status()).toBe(200);
    for (const existing of (await body<ListResponse<InvoiceItem>>(existingRes))
      .items) {
      if (existing.product !== "scan" || existing.status === "void") continue;
      if (
        new Date(existing.period_start) > monthEnd ||
        new Date(existing.period_end) < monthStart
      ) {
        continue;
      }
      if (existing.status === "paid") {
        paidBlocker = existing.number;
        break;
      }
      const voided = await api.post(`/api/admin/invoices/${existing.id}/void`);
      expect(voided.status()).toBe(200);
    }
    if (paidBlocker) return;

    // A previous failed run may have left a pending request; only one may
    // exist per org, so clear ours before creating a fresh one.
    const pendingRes = await api.get(
      "/api/admin/subscription-requests?status=pending&page_size=100",
    );
    expect(pendingRes.status()).toBe(200);
    for (const pending of (
      await body<ListResponse<SubscriptionRequestItem>>(pendingRes)
    ).items) {
      if (pending.organization_id !== org.id) continue;
      await api.delete(
        `/api/orgs/${org.id}/subscription/requests/${pending.id}`,
      );
    }

    const requestRes = await api.post(
      `/api/orgs/${org.id}/subscription/requests`,
      {
        data: {
          target_sku: target.sku,
          cycle: "monthly",
          note: `E2E billing ${runId}`,
        },
      },
    );
    expect(requestRes.status()).toBe(201);
    requestId = (await body<SubscriptionRequestItem>(requestRes)).id;
  });

  test.afterAll(async () => {
    if (!api) return;
    await api.dispose();
  });

  test("approval creates a draft invoice without moving the entitlement", async ({
    page,
  }) => {
    test.skip(!!paidBlocker, `paid invoice ${paidBlocker} blocks this month`);
    test.skip(!requestId, "beforeAll did not create a subscription request");
    const selectedOrg = requireOrg();
    const targetSku = requireTarget().sku;
    const requestIdValue = requireRequestId();
    const startingSkuValue = requireStartingSku();

    await page.goto("/admin/subscription-requests");
    const approve = page.getByTestId(
      `admin-subscription-approve-${requestIdValue}`,
    );
    await expect(approve).toBeVisible();
    await approve.click();

    await expect
      .poll(
        async () => {
          const res = await requireApi().get(
            "/api/admin/subscription-requests?status=approved&page_size=100",
          );
          if (res.status() !== 200) return undefined;
          return (
            await body<ListResponse<SubscriptionRequestItem>>(res)
          ).items.find((item) => item.id === requestIdValue)?.status;
        },
        { timeout: 30_000 },
      )
      .toBe("approved");

    const invoices = await listInvoices();
    const linked = invoices.filter(
      (item) => item.subscription_request_id === requestIdValue,
    );
    expect(linked).toHaveLength(1);
    const invoice = linked[0];
    invoiceId = invoice.id;
    expect(invoice.status).toBe("draft");
    expect(invoice.product).toBe("scan");
    expect(invoice.sku).toBe(targetSku);

    // Approval is a decision, not a payment: the org keeps its current tier.
    expect(await orgSku()).toBe(startingSkuValue);

    // Approval persists an `incomplete` subscription row (a synthetic
    // `awaiting_payment` row only exists when no row was created at all).
    const incompleteRes = await requireApi().get(
      "/api/admin/subscriptions?status=incomplete&page_size=100",
    );
    expect(incompleteRes.status()).toBe(200);
    let subscription = (
      await body<ListResponse<SubscriptionItem>>(incompleteRes)
    ).items.find((item) => item.organization_id === selectedOrg.id);
    if (!subscription) {
      // A rerun after a paid run keeps the row `active`; fall back to the
      // unfiltered list so the rest of the flow still has a row id.
      const allRes = await requireApi().get(
        "/api/admin/subscriptions?page_size=100",
      );
      expect(allRes.status()).toBe(200);
      subscription = (
        await body<ListResponse<SubscriptionItem>>(allRes)
      ).items.find((item) => item.organization_id === selectedOrg.id);
    }
    if (!subscription) {
      throw new Error("Approved request did not create a subscription row");
    }
    subscriptionId = subscription.id;

    await page.goto("/admin/invoices");
    const desktopInvoices = page.getByTestId("invoices-list-desktop");
    await expect(
      desktopInvoices.getByTestId(`invoice-actions-${invoice.id}`),
    ).toBeVisible();
    await expect(
      desktopInvoices.getByTestId(`invoice-stale-draft-${invoice.id}`),
    ).toHaveCount(0);

    await page.goto("/admin/subscriptions");
    const subscriptionsTable = page.getByTestId("admin-subscriptions-table");
    await expect(
      subscriptionsTable.getByTestId(
        `admin-subscription-${requireSubscriptionId()}`,
      ),
    ).toBeVisible();
  });

  test("marking paid uses the per-invoice bank-reference dialog and applies the tier", async ({
    page,
  }) => {
    test.skip(!!paidBlocker, `paid invoice ${paidBlocker} blocks this month`);
    test.skip(!invoiceId, "approval did not create an invoice");
    const selectedOrg = requireOrg();
    const targetSku = requireTarget().sku;
    const currentInvoiceId = requireInvoiceId();

    await page.goto("/admin/invoices");
    const desktopInvoices = page.getByTestId("invoices-list-desktop");
    await desktopInvoices
      .getByTestId(`invoice-actions-${currentInvoiceId}`)
      .click();
    await page.getByTestId(`invoice-paid-${currentInvoiceId}`).click();

    await expect(page.getByTestId("invoice-pay-ref")).toBeVisible();
    // The old global bank-reference input must not come back.
    await expect(page.locator("#inv-bank-ref")).toHaveCount(0);

    await page.getByTestId("invoice-pay-ref").fill(bankRef);
    await page.getByTestId("invoice-pay-confirm").click();

    await expect
      .poll(async () => (await invoiceById(currentInvoiceId))?.status, {
        timeout: 30_000,
      })
      .toBe("paid");

    // Payment, not approval, applies the requested tier.
    expect(await orgSku()).toBe(targetSku);

    // Source lives in the history row's `changes.source`; the org-scoped
    // endpoint is /api/admin/orgs/{org}/tier-history.
    const historyRes = await requireApi().get(
      `/api/admin/orgs/${selectedOrg.id}/tier-history?page_size=100`,
    );
    expect(historyRes.status()).toBe(200);
    const assigned = (
      await body<ListResponse<TierHistoryItem>>(historyRes)
    ).items.filter(
      (row) =>
        row.action === "assigned" &&
        row.changes.tier?.to === targetSku &&
        row.changes.source?.to === "subscription_request",
    );
    expect(assigned).toHaveLength(1);
  });

  test("correcting a paid invoice requires a reason and leaves the tier in place", async ({
    page,
  }) => {
    test.skip(!!paidBlocker, `paid invoice ${paidBlocker} blocks this month`);
    test.skip(!invoiceId, "approval did not create an invoice");
    const targetSku = requireTarget().sku;
    const currentInvoiceId = requireInvoiceId();

    await page.goto("/admin/invoices");
    const desktopInvoices = page.getByTestId("invoices-list-desktop");
    await desktopInvoices
      .getByTestId(`invoice-actions-${currentInvoiceId}`)
      .click();
    await page.getByTestId(`invoice-correct-${currentInvoiceId}`).click();

    const confirm = page.getByTestId("invoice-void-confirm");
    await expect(confirm).toBeDisabled();

    await page.getByTestId("invoice-void-reason").fill(voidReason);
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect
      .poll(async () => (await invoiceById(currentInvoiceId))?.status, {
        timeout: 30_000,
      })
      .toBe("void");

    // Force-void is an audit correction, not a refund: the paid tier stays.
    expect(await orgSku()).toBe(targetSku);
  });
});
