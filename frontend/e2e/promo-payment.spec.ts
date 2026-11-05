import type { APIRequestContext, APIResponse } from "@playwright/test";

import { e2eEmail, e2ePassword } from "./credentials";
import { test, expect } from "./fixtures";

const baseURL = process.env.BASE_URL || "http://localhost";
const runId = Date.now().toString(36);
// PROMO_CODE_PATTERN is ^[A-Z0-9][A-Z0-9_-]{7,31}$ (stored uppercase).
const promoCode = `E2E${runId
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "")
  .slice(0, 12)}`;
const promoDescription = `E2E promo ${runId}`;

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
  organization_id: string;
  number: string;
  product: string;
  amount_idr: number;
  discount_idr: number;
  promo_code: string | null;
  ppn_idr: number;
  total_idr: number;
  status: string;
  period_start: string;
  period_end: string;
};
type PendingRequest = {
  id: string;
  organization_id: string;
  status: string;
  promo_code: string | null;
  target_sku: string;
};
type ListResponse<T> = { items: T[] };

async function body<T>(res: APIResponse): Promise<T> {
  return (await res.json()) as T;
}

test.describe.serial("Promo code → invoice → payment @admin @smoke", () => {
  let api: APIRequestContext | undefined;
  let org: OrgMembership | undefined;
  let promoId: string | undefined;
  let requestId: string | undefined;
  let invoiceId: string | undefined;
  let paidBlocker: string | undefined;

  function requireOrg(): OrgMembership {
    if (!org) throw new Error("beforeAll did not resolve an organization");
    return org;
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
    if (orgs.length === 0) {
      throw new Error("E2E user has no organization; seed the stack first.");
    }
    org = orgs[0];

    // Prefer a requestable scan SKU that differs from the org's plan so the
    // request is a real change; fall back to the first invoicable scan row.
    const catalogRes = await api.get("/api/admin/sku-catalog");
    expect(catalogRes.status()).toBe(200);
    const catalog = (await body<ListResponse<CatalogRow>>(catalogRes)).items.filter(
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
    if (pool.length === 0) {
      throw new Error("No requestable scan SKU in the catalog; seed the stack first.");
    }
    const target = pool.find((row) => row.sku !== org!.sku) ?? pool[0];
    test.skip(
      target.sku === org.sku,
      "No scan SKU distinct from the seeded org's plan is requestable",
    );

    // The admin form has no period field, so every run invoices the current
    // month. Void stale draft/sent lines from earlier local runs so the
    // overlap guard in InvoiceService does not 409. A paid line is never
    // touched — skip instead of silently rewriting financial history.
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1,
    );
    const existingRes = await api.get(
      `/api/admin/invoices?organization_id=${org.id}&page_size=100`,
    );
    expect(existingRes.status()).toBe(200);
    for (const existing of (await body<ListResponse<InvoiceItem>>(existingRes)).items) {
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
    for (const pending of (await body<ListResponse<PendingRequest>>(pendingRes)).items) {
      if (pending.organization_id !== org.id) continue;
      await api.delete(`/api/orgs/${org.id}/subscription/requests/${pending.id}`);
    }

    // 10% (1000 bp) stays below the second-admin approval threshold, so the
    // code is usable immediately by this single admin.
    const promoRes = await api.post("/api/admin/promo-codes", {
      data: {
        code: promoCode,
        description: promoDescription,
        kind: "percent",
        percent_off_bp: 1000,
        applies_to_product: "scan",
        max_redemptions: 50,
        max_redemptions_per_org: 50,
      },
    });
    expect(promoRes.status()).toBe(201);
    promoId = (await body<{ id: string }>(promoRes)).id;

    const requestRes = await api.post(
      `/api/orgs/${org.id}/subscription/requests`,
      {
        data: {
          target_sku: target.sku,
          cycle: "monthly",
          note: `E2E promo ${runId}`,
          promo_code: promoCode,
        },
      },
    );
    expect(requestRes.status()).toBe(201);
    requestId = (await body<PendingRequest>(requestRes)).id;

    const queueRes = await api.get(
      "/api/admin/subscription-requests?status=pending&page_size=100",
    );
    expect(queueRes.status()).toBe(200);
    expect(
      (await body<ListResponse<PendingRequest>>(queueRes)).items.map((item) => item.id),
    ).toContain(requestId);
  });

  test.afterAll(async () => {
    if (!api) return;
    try {
      if (org && invoiceId) {
        // Releases the promo redemption; a rerun may already have voided it.
        await api.post(`/api/admin/invoices/${invoiceId}/void`);
      }
      if (promoId) {
        const deleted = await api.delete(`/api/admin/promo-codes/${promoId}`);
        if (deleted.status() === 409) {
          await api.post(`/api/admin/promo-codes/${promoId}/deactivate`);
        }
      }
      if (org && requestId) {
        // 204 while pending; an already-invoiced request is a harmless no-op.
        await api.delete(`/api/orgs/${org.id}/subscription/requests/${requestId}`);
      }
    } finally {
      await api.dispose();
    }
  });

  test("creates the promo invoice and renders the discount on /pay", async ({
    page,
  }) => {
    test.skip(
      !!paidBlocker,
      `A paid scan invoice (${paidBlocker}) already covers this month; void it manually to rerun.`,
    );
    const selectedOrg = requireOrg();

    await page.goto("/admin/invoices");
    await expect(page.getByTestId("admin-invoices-page")).toBeVisible();

    await page.locator("#inv-org").click();
    await page
      .getByRole("option", { name: selectedOrg.name })
      .first()
      .click();

    // The single pending request with a promo is surfaced before selection.
    await expect(page.getByTestId("invoice-request-promo-hint")).toBeVisible();

    await page.getByTestId("invoice-request").click();
    await page.getByRole("option", { name: new RegExp(promoCode) }).click();

    const preview = page.getByTestId("invoice-promo-result");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(/Rp\s*[1-9]/);

    const created = page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/admin/invoices") &&
        res.request().method() === "POST",
    );
    await page.getByTestId("invoice-create").click();
    expect((await created).status()).toBe(201);

    // Newest first; the code is unique per run, so exactly one row must match.
    const listed = await api!.get(
      `/api/admin/invoices?organization_id=${selectedOrg.id}&page_size=100`,
    );
    expect(listed.status()).toBe(200);
    const matches = (await body<ListResponse<InvoiceItem>>(listed)).items.filter(
      (item) => item.promo_code === promoCode,
    );
    expect(matches).toHaveLength(1);
    const invoice = matches[0];
    invoiceId = invoice.id;
    expect(invoice.discount_idr).toBeGreaterThan(0);
    expect(invoice.total_idr).toBe(
      invoice.amount_idr - invoice.discount_idr + invoice.ppn_idr,
    );

    const pending = await api!.get(
      "/api/admin/subscription-requests?status=pending&page_size=100",
    );
    expect(pending.status()).toBe(200);
    expect(
      (await body<ListResponse<PendingRequest>>(pending)).items.map((item) => item.id),
    ).not.toContain(requestId);

    // CI runs with PAYMENT_GATEWAY_ENABLED=false, so a sent invoice keeps
    // can_pay=false. Gateway-on checkout is out of scope here (the backend
    // webhook tests cover it); sending only reaches the customer-facing state.
    const sent = await api!.post(`/api/admin/invoices/${invoice.id}/send`);
    expect(sent.status()).toBe(200);

    await page.goto(`/pay/${invoice.id}`);
    await expect(page.getByTestId("pay-invoice-page")).toBeVisible();
    await expect(page.getByTestId("pay-invoice-discount")).toBeVisible();
    await expect(page.getByTestId("pay-invoice-total")).toHaveText(
      `Rp ${invoice.total_idr.toLocaleString("id-ID")}`,
    );
    await expect(page.getByTestId("pay-invoice-not-payable")).toBeVisible();
  });
});
