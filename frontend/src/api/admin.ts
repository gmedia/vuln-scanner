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

export interface ResendVerificationResponse {
  message: string;
  email_sent?: boolean | null;
}

export async function resendVerification(
  userId: string,
): Promise<ResendVerificationResponse> {
  const { data } = await api.post<ResendVerificationResponse>(
    `/api/admin/users/${userId}/resend-verification`,
  );
  return data;
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

export interface BlogPostAdmin {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body_md: string;
  body_html: string;
  locale: "id" | "en";
  status: string;
  published_at: string | null;
  author_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogPostWrite {
  slug: string;
  title: string;
  excerpt: string;
  body_md: string;
  locale: "id" | "en";
}

export async function listBlogPosts(): Promise<{
  items: BlogPostAdmin[];
  total: number;
}> {
  const { data } = await api.get("/api/admin/blog/posts");
  return data;
}

export async function createBlogPost(
  body: BlogPostWrite,
): Promise<BlogPostAdmin> {
  const { data } = await api.post("/api/admin/blog/posts", body);
  return data;
}

export async function updateBlogPost(
  id: string,
  body: Partial<BlogPostWrite>,
): Promise<BlogPostAdmin> {
  const { data } = await api.patch(`/api/admin/blog/posts/${id}`, body);
  return data;
}

export async function publishBlogPost(id: string): Promise<BlogPostAdmin> {
  const { data } = await api.post(`/api/admin/blog/posts/${id}/publish`);
  return data;
}

export async function unpublishBlogPost(
  id: string,
  status: "draft" | "archived" = "draft",
): Promise<BlogPostAdmin> {
  const { data } = await api.post(`/api/admin/blog/posts/${id}/unpublish`, {
    status,
  });
  return data;
}

export interface HppRateItem {
  key: string;
  amount_idr: number;
  updated_at: string;
  updated_by: string | null;
}

export interface HppReportLine {
  key: string;
  count: number;
  rate_idr: number;
  hpp_idr: number;
}

export interface HppSkuEstimate {
  sku: string;
  list_idr: number;
  credits_per_month: number;
  label: string;
  hpp_if_all_ip_idr: number | null;
  hpp_if_all_domain_idr: number | null;
  margin_if_all_ip_idr: number | null;
  margin_if_all_domain_idr: number | null;
}

export interface HppReportResponse {
  from_date: string;
  to_date: string;
  lines: HppReportLine[];
  total_count: number;
  total_hpp_idr: number;
  sku_estimates: HppSkuEstimate[];
}

export async function getHppRates(): Promise<HppRateItem[]> {
  const { data } = await api.get<{ items: HppRateItem[] }>("/api/admin/hpp");
  return data.items ?? [];
}

export async function updateHppRate(
  key: string,
  data: { amount_idr: number },
): Promise<HppRateItem> {
  const { data: res } = await api.put<HppRateItem>(
    `/api/admin/hpp/${key}`,
    data,
  );
  return res;
}

export async function getHppReport(params?: {
  from?: string;
  to?: string;
}): Promise<HppReportResponse> {
  const { data } = await api.get<HppReportResponse>("/api/admin/hpp/report", {
    params,
  });
  return data;
}

export const adminApi = {
  getStats: getAdminStats,
  getUsers: getAdminUsers,
  getUserDetail: getAdminUserDetail,
  updateUserCredits,
  resendVerification,
  getPricing,
  updatePricing,
  getHppRates,
  updateHppRate,
  getHppReport,
  listBlogPosts,
  createBlogPost,
  updateBlogPost,
  publishBlogPost,
  unpublishBlogPost,
};
