import api from "./scans";

export interface AdminStats {
  total_users: number;
  total_scans: number;
  total_findings: number;
  credits_distributed: number;
  credits_used: number;
}

export interface AdminUserItem {
  id: string;
  email: string;
  is_admin: boolean;
  is_verified: boolean;
  credits: number;
  scan_count: number;
  created_at: string;
}

export interface AdminUserList {
  users: AdminUserItem[];
  total: number;
}

export interface PricingItem {
  id: string;
  scan_type: string;
  credit_cost: number;
  updated_at: string;
}

export interface PricingListResponse {
  items: PricingItem[];
}

export function normalizePricingList(
  data: PricingListResponse | PricingItem[] | null | undefined,
): PricingItem[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data } = await api.get<AdminStats>("/api/admin/stats");
  return data;
}

export async function getAdminUsers(params: {
  page?: number;
  page_size?: number;
  search?: string;
}): Promise<AdminUserList> {
  const { data } = await api.get<AdminUserList>("/api/admin/users", { params });
  return data;
}

export async function getAdminUserDetail(
  userId: string,
): Promise<AdminUserItem> {
  const { data } = await api.get<AdminUserItem>(`/api/admin/users/${userId}`);
  return data;
}

export async function updateUserCredits(
  userId: string,
  data: { amount: number; description: string },
): Promise<{ message: string }> {
  const { data: res } = await api.post<{ message: string }>(
    `/api/admin/users/${userId}/credits`,
    data,
  );
  return res;
}

export async function getPricing(): Promise<PricingItem[]> {
  const { data } = await api.get<PricingListResponse | PricingItem[]>(
    "/api/admin/pricing",
  );
  return normalizePricingList(data);
}

export async function updatePricing(
  scanType: string,
  data: { credit_cost: number },
): Promise<PricingItem> {
  const { data: res } = await api.put<PricingItem>(
    `/api/admin/pricing/${scanType}`,
    data,
  );
  return res;
}

export const adminApi = {
  getStats: getAdminStats,
  getUsers: getAdminUsers,
  getUserDetail: getAdminUserDetail,
  updateUserCredits,
  getPricing,
  updatePricing,
};
