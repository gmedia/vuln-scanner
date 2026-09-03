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
  last_login_at: string | null;
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

export interface HppOverheadItem {
  amount_idr: number;
  updated_at: string;
  updated_by: string | null;
}

export interface HppReportLine {
  key: string;
  count: number;
  rate_idr: number;
  hpp_idr: number;
  overhead_share_idr: number;
  fully_loaded_hpp_idr: number;
  fully_loaded_unit_idr: number;
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
  margin_if_all_ip_pct: number | null;
  margin_if_all_domain_pct: number | null;
}

export interface HppReportResponse {
  from_date: string;
  to_date: string;
  lines: HppReportLine[];
  total_count: number;
  total_hpp_idr: number;
  overhead_idr: number;
  journal_opex_idr: number;
  journal_variable_idr: number;
  total_fully_loaded_hpp_idr: number;
  unallocated_overhead_idr: number;
  sku_estimates: HppSkuEstimate[];
}

export interface HppCostLineItem {
  id: string;
  incurred_on: string;
  amount_idr: number;
  category: "opex" | "variable";
  note: string;
  created_at: string;
  created_by: string | null;
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

export async function getHppOverhead(): Promise<HppOverheadItem> {
  const { data } = await api.get<HppOverheadItem>("/api/admin/hpp/overhead");
  return data;
}

export async function updateHppOverhead(data: {
  amount_idr: number;
}): Promise<HppOverheadItem> {
  const { data: res } = await api.put<HppOverheadItem>(
    "/api/admin/hpp/overhead",
    data,
  );
  return res;
}

export async function listHppCosts(params?: {
  from?: string;
  to?: string;
}): Promise<HppCostLineItem[]> {
  const { data } = await api.get<{ items: HppCostLineItem[] }>(
    "/api/admin/hpp/costs",
    { params },
  );
  return data.items ?? [];
}

export async function createHppCost(body: {
  incurred_on: string;
  amount_idr: number;
  category: "opex" | "variable";
  note: string;
}): Promise<HppCostLineItem> {
  const { data } = await api.post<HppCostLineItem>(
    "/api/admin/hpp/costs",
    body,
  );
  return data;
}

export async function deleteHppCost(id: string): Promise<void> {
  await api.delete(`/api/admin/hpp/costs/${id}`);
}

export interface HppQuoteLine {
  key: string;
  jobs: number;
  rate_idr: number;
  hpp_idr: number;
  fully_loaded_unit_idr: number;
}

export interface HppQuoteResponse {
  provider: string;
  region: string;
  monthly_compute_idr: number;
  monthly_power_idr: number;
  monthly_total_idr: number;
  total_jobs: number;
  breakeven_unit_idr: number;
  overhead_pool_idr: number;
  total_hpp_idr: number;
  total_fully_loaded_hpp_idr: number;
  breakeven_pct_of_list_basic: number;
  breakeven_pct_of_list_pro: number;
  breakeven_pct_of_list_multi: number;
  lines: HppQuoteLine[];
  note: string;
}

export interface HppQuoteRequest {
  provider: string;
  region?: string;
  cpu_vcpu: number;
  ram_gb: number;
  monthly_instance_idr: number;
  electricity_idr_per_kwh?: number;
  power_watt_per_vcpu?: number;
  pue?: number;
  jobs: Record<string, number>;
  overhead_idr?: number | null;
}

export async function quoteHpp(
  body: HppQuoteRequest,
): Promise<HppQuoteResponse> {
  const { data } = await api.post<HppQuoteResponse>(
    "/api/admin/hpp/quote",
    body,
  );
  return data;
}

export interface EmailSendLogItem {
  id: string;
  kind: string;
  status: string;
  recipient_masked: string;
  attempts: number;
  error_message: string | null;
  created_at: string;
}

export interface EmailSendLogList {
  items: EmailSendLogItem[];
  total: number;
}

export async function getEmailLogs(params: {
  page?: number;
  page_size?: number;
  kind?: string;
  status?: string;
}): Promise<EmailSendLogList> {
  const { data } = await api.get<EmailSendLogList>("/api/admin/email-logs", {
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
  getHppOverhead,
  updateHppOverhead,
  listHppCosts,
  createHppCost,
  deleteHppCost,
  quoteHpp,
  getEmailLogs,
  listBlogPosts,
  createBlogPost,
  updateBlogPost,
  publishBlogPost,
  unpublishBlogPost,
};
