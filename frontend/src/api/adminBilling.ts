import api from "@/api/scans";

export type AdminBillingStatus =
  | "incomplete"
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled";

export type AdminBillingCycle = "monthly" | "annual";

export interface AdminSubscriptionItem {
  id: string;
  organization_id: string;
  organization_name: string | null;
  sku: string;
  status: AdminBillingStatus;
  cycle: AdminBillingCycle;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  ended_at: string | null;
  provider: string;
  provider_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminPaymentAttempt {
  id: string;
  organization_id: string;
  subscription_id: string | null;
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

export interface AdminSubscriptionDetail extends AdminSubscriptionItem {
  attempts: AdminPaymentAttempt[];
}

export interface AdminSubscriptionListResponse {
  items: AdminSubscriptionItem[];
  total: number;
}

export async function listAdminSubscriptions(params?: {
  status?: string;
  page?: number;
}): Promise<AdminSubscriptionListResponse> {
  const { data } = await api.get<AdminSubscriptionListResponse>(
    "/api/admin/subscriptions",
    { params },
  );
  return data;
}

export async function getAdminSubscription(
  orgId: string,
): Promise<AdminSubscriptionDetail> {
  const { data } = await api.get<AdminSubscriptionDetail>(
    `/api/admin/subscriptions/${orgId}`,
  );
  return data;
}

export async function recordAdminSubscriptionPayment(
  orgId: string,
  body: { invoice_id: string; method?: string; reference?: string },
): Promise<{
  subscription: AdminSubscriptionItem | null;
  attempt: AdminPaymentAttempt;
  invoice_id: string;
  invoice_status: string;
}> {
  const { data } = await api.post(
    `/api/admin/subscriptions/${orgId}/record-payment`,
    body,
  );
  return data;
}

export async function cancelAdminSubscription(
  orgId: string,
  body: { at_period_end: boolean; note?: string },
): Promise<AdminSubscriptionItem> {
  const { data } = await api.post<AdminSubscriptionItem>(
    `/api/admin/subscriptions/${orgId}/cancel`,
    body,
  );
  return data;
}
