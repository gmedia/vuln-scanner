import api from "@/api/scans";

export type TopupMethod = "manual_transfer" | "midtrans";

export type TopupStatus =
  | "pending_payment"
  | "awaiting_verification"
  | "paid"
  | "rejected"
  | "expired"
  | "canceled"
  | "refunded"
  | "refund_review";

export interface TopupPack {
  id: string;
  code: string;
  label: string;
  amount_idr: number;
  bonus_idr: number;
  active: boolean;
  sort_order: number;
}

export interface TopupBank {
  bank_name: string | null;
  bank_account: string | null;
  bank_holder: string | null;
}

export interface TopupOrder {
  id: string;
  organization_id: string;
  reference_code: string;
  amount_idr: number;
  credit_idr: number;
  bonus_idr: number;
  currency: string;
  payment_method: string;
  status: string;
  has_proof: boolean;
  proof_uploaded_at: string | null;
  paid_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  bank: TopupBank | null;
}

export interface TopupPackList {
  items: TopupPack[];
  total: number;
}

export interface TopupOrderList {
  items: TopupOrder[];
  total: number;
  page: number;
  limit: number;
}

export interface TopupCheckoutResult {
  redirect_url: string;
  attempt_id: string;
}

export async function getTopupPacks(): Promise<TopupPackList> {
  const { data } = await api.get<TopupPackList>("/api/ai/topup/packs");
  return data;
}

export async function createTopupOrder(input: {
  pack_id: string;
  method: TopupMethod;
}): Promise<TopupOrder> {
  const { data } = await api.post<TopupOrder>("/api/ai/topup/orders", input);
  return data;
}

export async function getTopupOrders(
  page = 1,
  limit = 20,
): Promise<TopupOrderList> {
  const { data } = await api.get<TopupOrderList>("/api/ai/topup/orders", {
    params: { page, limit },
  });
  return data;
}

export async function getTopupOrder(id: string): Promise<TopupOrder> {
  const { data } = await api.get<TopupOrder>(`/api/ai/topup/orders/${id}`);
  return data;
}

export async function uploadTopupProof(
  id: string,
  file: File,
): Promise<TopupOrder> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<TopupOrder>(
    `/api/ai/topup/orders/${id}/proof`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120_000,
    },
  );
  return data;
}

export async function checkoutTopupOrder(
  id: string,
): Promise<TopupCheckoutResult> {
  const { data } = await api.post<TopupCheckoutResult>(
    `/api/ai/topup/orders/${id}/checkout`,
    { provider: "midtrans" },
  );
  return data;
}

export async function cancelTopupOrder(id: string): Promise<TopupOrder> {
  const { data } = await api.post<TopupOrder>(
    `/api/ai/topup/orders/${id}/cancel`,
  );
  return data;
}

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

export const PROOF_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

const PROOF_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/** Client-side pre-check mirroring the server 5 MB + MIME allowlist. */
export function proofFileError(file: File): "too-large" | "bad-type" | null {
  if (file.size > MAX_PROOF_BYTES) return "too-large";
  if (!PROOF_MIME_TYPES.has(file.type)) return "bad-type";
  return null;
}
