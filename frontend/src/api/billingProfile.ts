import api from "@/api/scans";

export interface BillingRecipient {
  id: string;
  email: string;
  kind: "billing" | "account";
  is_primary: boolean;
  verified_at: string | null;
}

export interface BillingProfile {
  organization_id: string;
  legal_name: string;
  tax_id: string;
  nitku: string;
  address_line1: string;
  address_line2: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  billing_email: string;
  po_required: boolean;
  po_number: string;
  payment_terms_days: number;
  pkp_status: "unknown" | "pkp" | "non_pkp";
  recipients: BillingRecipient[];
}

export type BillingProfileUpdate = Omit<
  BillingProfile,
  "organization_id" | "recipients"
>;

export async function getBillingProfile(orgId: string): Promise<BillingProfile> {
  const { data } = await api.get<BillingProfile>(
    `/api/orgs/${orgId}/billing-profile`,
  );
  return data;
}

export async function saveBillingProfile(
  orgId: string,
  body: BillingProfileUpdate,
): Promise<BillingProfile> {
  const { data } = await api.put<BillingProfile>(
    `/api/orgs/${orgId}/billing-profile`,
    body,
  );
  return data;
}

export async function addBillingRecipient(
  orgId: string,
  body: { email: string; kind?: "billing" | "account"; is_primary?: boolean },
): Promise<BillingRecipient> {
  const { data } = await api.post<BillingRecipient>(
    `/api/orgs/${orgId}/billing-recipients`,
    body,
  );
  return data;
}

export async function removeBillingRecipient(
  orgId: string,
  recipientId: string,
): Promise<void> {
  await api.delete(`/api/orgs/${orgId}/billing-recipients/${recipientId}`);
}
