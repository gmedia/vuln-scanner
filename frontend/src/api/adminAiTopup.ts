import api from "./scans";

export interface AdminTopupOrder {
  id: string;
  organization_id: string;
  organization_name: string | null;
  created_by_user_id: string | null;
  pack_id: string | null;
  pack_code: string | null;
  reference_code: string;
  amount_idr: number;
  credit_idr: number;
  bonus_idr: number;
  currency: string;
  payment_method: string;
  status: string;
  has_proof: boolean;
  proof_mime: string | null;
  proof_size_bytes: number | null;
  proof_uploaded_at: string | null;
  bank_ref: string | null;
  verified_by_user_id: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  paid_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface AdminTopupOrderList {
  items: AdminTopupOrder[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminTopupOrderFilters {
  status?: string;
  organization_id?: string;
  page?: number;
  limit?: number;
}

export interface ApproveAdminTopupInput {
  bank_ref?: string;
  force?: boolean;
}

export interface RejectAdminTopupInput {
  reason: string;
}

export async function listAdminTopupOrders(
  params: AdminTopupOrderFilters = {},
): Promise<AdminTopupOrderList> {
  const { data } = await api.get<AdminTopupOrderList>(
    "/api/admin/ai/topup/orders",
    { params },
  );
  return data;
}

export async function getAdminTopupOrder(
  id: string,
): Promise<AdminTopupOrder> {
  const { data } = await api.get<AdminTopupOrder>(
    `/api/admin/ai/topup/orders/${id}`,
  );
  return data;
}

/**
 * The proof endpoint is bearer-auth only and the CSP bans PDF frames, so the
 * SPA must fetch the bytes and hand them to an object URL.
 */
export async function fetchAdminTopupProof(id: string): Promise<Blob> {
  const { data } = await api.get<Blob>(
    `/api/admin/ai/topup/orders/${id}/proof`,
    { responseType: "blob" },
  );
  return data;
}

export async function approveAdminTopupOrder(
  id: string,
  input: ApproveAdminTopupInput = {},
): Promise<AdminTopupOrder> {
  const { data } = await api.post<AdminTopupOrder>(
    `/api/admin/ai/topup/orders/${id}/approve`,
    input,
  );
  return data;
}

export async function rejectAdminTopupOrder(
  id: string,
  input: RejectAdminTopupInput,
): Promise<AdminTopupOrder> {
  const { data } = await api.post<AdminTopupOrder>(
    `/api/admin/ai/topup/orders/${id}/reject`,
    input,
  );
  return data;
}
