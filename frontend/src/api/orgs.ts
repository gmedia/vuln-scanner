import api from "@/api/scans";
import type {
  SkuTierFeatures,
  SkuTierWorkspaceLimits,
} from "@/api/subscription";

export type OrgRole = "owner" | "admin" | "member" | "viewer";

export type InviteRole = "admin" | "member" | "viewer";

export type OrgKind = "personal" | "team" | string;

export interface OrgMembershipSummary {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  kind?: OrgKind;
  sku?: string;
  sku_label?: string;
  sku_features?: SkuTierFeatures;
  workspace_seats_limits?: SkuTierWorkspaceLimits;
}

export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  kind?: OrgKind;
  created_at?: string;
}

export interface OrgMember {
  user_id: string;
  email: string;
  role: OrgRole;
  joined_at?: string;
}

export interface OrgInvite {
  id: string;
  email: string;
  role: InviteRole;
  created_at?: string;
  expires_at?: string | null;
  invited_by?: string | null;
  token?: string | null;
}

export interface CreateOrgRequest {
  name: string;
  slug?: string;
}

export interface SwitchOrgRequest {
  organization_id: string;
}

export interface SwitchOrgResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface CreateInviteRequest {
  email: string;
  role: InviteRole;
}

export interface AcceptInviteRequest {
  token: string;
}

export interface AcceptInviteResponse {
  organization_id: string;
  role: OrgRole;
  message?: string;
}

export async function listOrgs(): Promise<OrgMembershipSummary[]> {
  const { data } = await api.get<OrgMembershipSummary[]>("/api/orgs");
  return data;
}

export async function createOrg(
  payload: CreateOrgRequest,
): Promise<OrganizationDetail> {
  const { data } = await api.post<OrganizationDetail>("/api/orgs", payload);
  return data;
}

export async function getOrg(orgId: string): Promise<OrganizationDetail> {
  const { data } = await api.get<OrganizationDetail>(`/api/orgs/${orgId}`);
  return data;
}

export async function switchOrg(
  organizationId: string,
): Promise<SwitchOrgResponse> {
  const { data } = await api.post<SwitchOrgResponse>("/api/orgs/switch", {
    organization_id: organizationId,
  } satisfies SwitchOrgRequest);
  return data;
}

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  const { data } = await api.get<OrgMember[]>(`/api/orgs/${orgId}/members`);
  return data;
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<OrgMember> {
  const { data } = await api.patch<OrgMember>(
    `/api/orgs/${orgId}/members/${userId}`,
    { role },
  );
  return data;
}

export async function removeMember(
  orgId: string,
  userId: string,
): Promise<void> {
  await api.delete(`/api/orgs/${orgId}/members/${userId}`);
}

export async function listInvites(orgId: string): Promise<OrgInvite[]> {
  const { data } = await api.get<OrgInvite[]>(`/api/orgs/${orgId}/invites`);
  return data;
}

export async function createInvite(
  orgId: string,
  payload: CreateInviteRequest,
): Promise<OrgInvite> {
  const { data } = await api.post<OrgInvite>(
    `/api/orgs/${orgId}/invites`,
    payload,
  );
  return data;
}

export async function revokeInvite(
  orgId: string,
  inviteId: string,
): Promise<void> {
  await api.delete(`/api/orgs/${orgId}/invites/${inviteId}`);
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export type InvoicePaymentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "expired"
  | "refunded"
  | null;

export interface OrgInvoiceItem {
  id: string;
  organization_id: string;
  number: string;
  product: "scan" | "host" | "uptime" | "guard";
  sku: string;
  seats: number;
  amount_idr: number;
  dpp_idr?: number;
  ppn_idr?: number;
  pph23_idr?: number;
  total_idr?: number;
  discount_idr?: number;
  promo_code?: string | null;
  payment_status?: InvoicePaymentStatus;
  can_pay?: boolean;
  period_start: string;
  period_end: string;
  due_date?: string;
  sent_at?: string | null;
  status: InvoiceStatus | string;
  bank_ref: string | null;
  notes: string;
  paid_at: string | null;
  created_at: string;
  organization_name?: string | null;
  bank?: {
    bank_name: string | null;
    bank_account: string | null;
    bank_holder: string | null;
  } | null;
}

/**
 * `GET /api/invoices/{id}` resolves the org from the invoice, so a multi-org
 * admin can open `/pay/:invoiceId` without the active-org path.
 */
export interface PayableInvoice extends OrgInvoiceItem {
  payment_status: InvoicePaymentStatus;
  can_pay: boolean;
  discount_idr: number;
  promo_code: string | null;
  /** Optional server hint; the contract does not require it. */
  payment_method?: string | null;
}

export interface PaymentProvider {
  name: string;
  label: string;
  mode: "sandbox" | "production";
}

export interface PaymentProvidersResponse {
  items: PaymentProvider[];
}

export interface CheckoutResponse {
  attempt_id: string;
  provider: string;
  redirect_url: string;
  expires_at: string | null;
  amount_idr: number;
  status: string;
}

export async function listOrgInvoices(
  orgId: string,
): Promise<{ items: OrgInvoiceItem[]; total: number }> {
  const { data } = await api.get<{ items: OrgInvoiceItem[]; total: number }>(
    `/api/orgs/${orgId}/invoices`,
  );
  return data;
}

export async function getInvoice(invoiceId: string): Promise<PayableInvoice> {
  const { data } = await api.get<PayableInvoice>(
    `/api/invoices/${invoiceId}`,
  );
  return data;
}

export async function listPaymentProviders(): Promise<PaymentProvidersResponse> {
  const { data } = await api.get<PaymentProvidersResponse>(
    "/api/payments/providers",
  );
  return data;
}

export async function checkoutInvoice(
  orgId: string,
  invoiceId: string,
  provider: string,
): Promise<CheckoutResponse> {
  const { data } = await api.post<CheckoutResponse>(
    `/api/orgs/${orgId}/invoices/${invoiceId}/checkout`,
    { provider },
  );
  return data;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadOrgInvoicePdf(
  orgId: string,
  invoiceId: string,
  number: string,
): Promise<void> {
  const resp = await api.get<Blob>(
    `/api/orgs/${orgId}/invoices/${invoiceId}/export`,
    { params: { format: "pdf" }, responseType: "blob" },
  );
  const data: unknown = resp.data;
  if (!(data instanceof Blob)) {
    throw new Error("invoice_pdf_not_blob");
  }
  saveBlob(data, `invoice_${number}.pdf`);
}

export async function acceptInvite(
  token: string,
): Promise<AcceptInviteResponse> {
  const { data } = await api.post<AcceptInviteResponse>("/api/invites/accept", {
    token,
  } satisfies AcceptInviteRequest);
  return data;
}

export function canMutateWorkspace(role: OrgRole | null | undefined): boolean {
  if (!role) return true;
  return role !== "viewer";
}

export function canManageMembers(role: OrgRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}
