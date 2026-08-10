import api from "@/api/scans";

export type OrgRole = "owner" | "admin" | "member" | "viewer";

export type InviteRole = "admin" | "member" | "viewer";

export type OrgKind = "personal" | "team" | string;

export interface OrgMembershipSummary {
  id: string;
  name: string;
  slug: string;
  role: OrgRole;
  kind?: OrgKind;
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
