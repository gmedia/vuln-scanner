import api from "@/api/scans";

/**
 * Tier codes are data, not a compile-time union: admins can create a tier at
 * runtime (`pro_plus`) without shipping a frontend build. Labels and feature
 * gates come from `GET /api/sku-tiers` via `useTierMap`.
 */
export type SkuCode = string;
export type SubscriptionSku = SkuCode;
export type SubscriptionTier = SkuCode;
export type SubscriptionCycle = "monthly" | "annual";
export type SubscriptionStatus =
  | "active"
  | "grace"
  | "pending_payment"
  | "draft"
  | "expired"
  | "unbilled"
  | "enterprise";

export interface SubscriptionPlan {
  sku: SubscriptionSku;
  label: string;
  status: SubscriptionStatus;
  source: "invoice" | "default" | "ops" | "custom" | "subscription";
  cycle: SubscriptionCycle;
  amount_idr: number | null;
  period_start: string | null;
  period_end: string | null;
  renewal_at: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  cancel_at_period_end?: boolean;
  billing_status?: string | null;
}

export interface SubscriptionUsageItem {
  product: "scan" | "host" | "uptime" | "guard";
  used: number;
  limit: number | null;
  unit: string;
}

export interface WorkspaceSeats {
  editors: number;
  viewers: number;
  editor_limit: number | null;
  viewer_limit: number | null;
}

export interface SkuTierLimits {
  scan: number;
  host: number;
  uptime: number;
  guard: number;
}

export interface SkuTierFeatures {
  allow_status_page: boolean;
  allow_custom_host: boolean;
  allow_waf_protect: boolean;
  allow_siem: boolean;
  billing_unrestricted: boolean;
  sales_led: boolean;
  requestable: boolean;
}

export interface SkuTierWorkspaceLimits {
  editor: number | null;
  viewer: number | null;
}

export interface SkuTierUsage {
  orgs: number;
  subscriptions: number;
  invoices: number;
  requests: number;
}

export interface SkuTierInfo {
  code: SkuCode;
  label: string;
  rank: number;
  active: boolean;
  requestable: boolean;
  sales_led: boolean;
  is_default: boolean;
  bundle_idr: number | null;
  limits: SkuTierLimits;
  features: SkuTierFeatures;
  workspace_limits: SkuTierWorkspaceLimits;
  usage?: SkuTierUsage | null;
  has_catalog?: boolean;
}

export interface SubscriptionCatalogItem {
  service: "scan" | "host" | "uptime" | "guard";
  sku: SubscriptionTier;
  label: string;
  active: boolean;
  list_idr: number;
  seats: number;
  invoicable: boolean;
}

export interface SubscriptionBundleItem {
  tier: SubscriptionTier;
  label: string;
  active: boolean;
  bundle_idr: number;
  alacarte_idr: number;
  saving_idr: number;
  saving_pct: number;
}

export interface SubscriptionAnnualPolicy {
  months_paid: number;
  months_served: number;
}

export interface SubscriptionCapabilities {
  can_manage: boolean;
  can_request_change: boolean;
  can_view_invoices: boolean;
  can_self_serve: boolean;
  read_only: boolean;
  read_only_reason: string | null;
  promo_codes?: boolean;
}

export interface SubscriptionPaymentAttempt {
  id: string;
  organization_id: string;
  invoice_id: string | null;
  provider: string;
  provider_ref: string | null;
  amount_idr: number;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "expired" | "refunded";
  method: string | null;
  failure_code: string | null;
  failure_message: string | null;
  next_retry_at: string | null;
  succeeded_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionRequestItem {
  id: string;
  organization_id: string;
  direction: "upgrade" | "downgrade";
  current_sku: SubscriptionTier;
  target_sku: SubscriptionTier;
  cycle: SubscriptionCycle;
  promo_code?: string | null;
  note: string;
  status: "pending" | "approved" | "rejected" | "canceled";
  resolution_note: string;
  created_at: string;
  resolved_at: string | null;
  requested_by_email?: string | null;
  organization_name?: string | null;
}

export interface SubscriptionOverview {
  organization_id: string;
  organization_name: string;
  plan: SubscriptionPlan;
  tiers: SkuTierInfo[];
  usage: SubscriptionUsageItem[];
  workspace_seats: WorkspaceSeats;
  catalog: SubscriptionCatalogItem[];
  bundles: SubscriptionBundleItem[];
  annual: SubscriptionAnnualPolicy;
  enterprise: { contact_only: boolean };
  capabilities: SubscriptionCapabilities;
  pending_request: SubscriptionRequestItem | null;
  recent_attempts: SubscriptionPaymentAttempt[];
}

export interface SubscriptionRequestCreate {
  target_sku: SubscriptionTier;
  cycle?: SubscriptionCycle;
  note?: string;
  promo_code?: string | null;
}

export interface CustomerPromoValidateInput {
  code: string;
  target_sku: string;
  cycle: SubscriptionCycle;
}

export interface PromoValidateResult {
  valid: boolean;
  description: string;
  discount_idr: number;
  total_idr: number;
}

export interface SubscriptionRequestListResponse {
  items: SubscriptionRequestItem[];
  total: number;
}

export async function getSkuTiers(): Promise<SkuTierInfo[]> {
  const { data } = await api.get<SkuTierInfo[]>("/api/sku-tiers");
  return data;
}

export async function getSubscription(
  orgId: string,
): Promise<SubscriptionOverview> {
  const { data } = await api.get<SubscriptionOverview>(
    `/api/orgs/${orgId}/subscription`,
  );
  return data;
}

export async function createSubscriptionRequest(
  orgId: string,
  body: SubscriptionRequestCreate,
): Promise<SubscriptionRequestItem> {
  const { data } = await api.post<SubscriptionRequestItem>(
    `/api/orgs/${orgId}/subscription/requests`,
    body,
  );
  return data;
}

export async function validateOrgPromoCode(
  orgId: string,
  body: CustomerPromoValidateInput,
): Promise<PromoValidateResult> {
  const { data } = await api.post<PromoValidateResult>(
    `/api/orgs/${orgId}/promo-codes/validate`,
    body,
  );
  return data;
}

export async function cancelSubscriptionRequest(
  orgId: string,
  requestId: string,
): Promise<void> {
  await api.delete(
    `/api/orgs/${orgId}/subscription/requests/${requestId}`,
  );
}

export async function listAdminSubscriptionRequests(params?: {
  status?: string;
  page?: number;
}): Promise<SubscriptionRequestListResponse> {
  const { data } = await api.get<SubscriptionRequestListResponse>(
    "/api/admin/subscription-requests",
    { params },
  );
  return data;
}

export async function approveAdminSubscriptionRequest(
  requestId: string,
  note = "",
): Promise<SubscriptionRequestItem> {
  const { data } = await api.post<SubscriptionRequestItem>(
    `/api/admin/subscription-requests/${requestId}/approve`,
    { note },
  );
  return data;
}

export async function rejectAdminSubscriptionRequest(
  requestId: string,
  note = "",
): Promise<SubscriptionRequestItem> {
  const { data } = await api.post<SubscriptionRequestItem>(
    `/api/admin/subscription-requests/${requestId}/reject`,
    { note },
  );
  return data;
}


export interface SubscriptionLifecycle {
  id: string;
  organization_id: string;
  sku: string;
  status: string;
  cycle: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancel_note: string;
}

export async function cancelSubscription(
  orgId: string,
  note = "",
): Promise<SubscriptionLifecycle> {
  const { data } = await api.post<SubscriptionLifecycle>(
    `/api/orgs/${orgId}/subscription/cancel`,
    { note },
  );
  return data;
}

export async function resumeSubscription(
  orgId: string,
): Promise<SubscriptionLifecycle> {
  const { data } = await api.post<SubscriptionLifecycle>(
    `/api/orgs/${orgId}/subscription/resume`,
  );
  return data;
}
