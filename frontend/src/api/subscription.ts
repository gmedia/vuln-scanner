import api from "@/api/scans";

export type SubscriptionSku = "basic" | "pro" | "multi" | "enterprise";
export type SubscriptionTier = "basic" | "pro" | "multi";
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

export interface SubscriptionCatalogItem {
  service: "scan" | "host" | "uptime" | "guard";
  sku: SubscriptionTier;
  list_idr: number;
  seats: number;
  invoicable: boolean;
}

export interface SubscriptionBundleItem {
  tier: SubscriptionTier;
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
}

export interface SubscriptionRequestListResponse {
  items: SubscriptionRequestItem[];
  total: number;
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
