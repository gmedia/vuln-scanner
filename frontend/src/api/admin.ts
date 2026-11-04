import api from "./scans";
import type { SkuTierInfo } from "./subscription";

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
  /** Tier of the user's personal workspace; null when they own none. */
  sku: string | null;
  sku_label: string | null;
}

export interface AdminUserList {
  users: AdminUserItem[];
  total: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data } = await api.get<AdminStats>("/api/admin/stats");
  return data;
}

export async function getAdminUsers(params: {
  page?: number;
  page_size?: number;
  search?: string;
  sku?: string;
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

export type BlogPillar = "exposure" | "onbox" | "availability" | "ai";

export interface BlogPostAdmin {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body_md: string;
  body_html: string;
  locale: "id" | "en";
  status: string;
  pillar: BlogPillar | null;
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
  pillar: BlogPillar | null;
}

export interface AiProviderAdmin {
  id: string;
  name: string;
  base_url: string;
  auth_header: string;
  credential_set: boolean;
  enabled: boolean;
  status: string;
  last_probed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiModelUpstreamAdmin {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_status: string;
  provider_enabled: boolean;
  upstream_id: string;
  hpp_usd_per_1m_in: number | null;
  hpp_usd_per_1m_out: number | null;
  max_tokens_cap: number | null;
  rank: number;
  enabled: boolean;
}

export interface AiModelAdmin {
  id: string;
  provider_id: string;
  public_id: string;
  upstream_id: string;
  upstreams?: AiModelUpstreamAdmin[];
  hpp_usd_per_1k_in: number;
  hpp_usd_per_1k_out: number;
  price_idr_per_1k_in: number;
  price_idr_per_1k_out: number;
  price_usd_per_1m_in: number;
  price_usd_per_1m_out: number;
  hpp_usd_per_1m_in: number;
  hpp_usd_per_1m_out: number;
  max_ctx: number;
  max_tokens_cap: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function listAiProviders(): Promise<{
  items: AiProviderAdmin[];
  total: number;
}> {
  const { data } = await api.get<{ items: AiProviderAdmin[]; total: number }>(
    "/api/admin/ai/providers",
  );
  return data;
}

export async function createAiProvider(body: {
  name: string;
  base_url: string;
  credential: string;
  auth_header?: string;
  enabled?: boolean;
  status?: string;
}): Promise<AiProviderAdmin> {
  const { data } = await api.post("/api/admin/ai/providers", body);
  return data;
}

export async function updateAiProvider(
  id: string,
  body: Partial<{
    name: string;
    base_url: string;
    credential: string;
    auth_header: string;
    enabled: boolean;
    status: string;
  }>,
): Promise<AiProviderAdmin> {
  const { data } = await api.patch(`/api/admin/ai/providers/${id}`, body);
  return data;
}

export async function deleteAiProvider(id: string): Promise<void> {
  await api.delete(`/api/admin/ai/providers/${id}`);
}

export async function listAiModels(providerId?: string): Promise<{
  items: AiModelAdmin[];
  total: number;
}> {
  const { data } = await api.get<{ items: AiModelAdmin[]; total: number }>(
    "/api/admin/ai/models",
    { params: providerId ? { provider_id: providerId } : undefined },
  );
  return data;
}

export async function createAiModel(body: {
  provider_id: string;
  public_id: string;
  upstream_id: string;
  price_usd_per_1m_in?: number;
  price_usd_per_1m_out?: number;
  hpp_usd_per_1m_in?: number;
  hpp_usd_per_1m_out?: number;
  price_idr_per_1k_in?: number;
  price_idr_per_1k_out?: number;
  hpp_usd_per_1k_in?: number;
  hpp_usd_per_1k_out?: number;
  max_ctx?: number;
  max_tokens_cap?: number;
  enabled?: boolean;
}): Promise<AiModelAdmin> {
  const { data } = await api.post("/api/admin/ai/models", body);
  return data;
}

export async function updateAiModel(
  id: string,
  body: Partial<{
    provider_id: string;
    public_id: string;
    upstream_id: string;
    price_usd_per_1m_in: number;
    price_usd_per_1m_out: number;
    hpp_usd_per_1m_in: number;
    hpp_usd_per_1m_out: number;
    price_idr_per_1k_in: number;
    price_idr_per_1k_out: number;
    hpp_usd_per_1k_in: number;
    hpp_usd_per_1k_out: number;
    max_ctx: number;
    max_tokens_cap: number;
    enabled: boolean;
  }>,
): Promise<AiModelAdmin> {
  const { data } = await api.patch(`/api/admin/ai/models/${id}`, body);
  return data;
}

export async function deleteAiModel(id: string): Promise<void> {
  await api.delete(`/api/admin/ai/models/${id}`);
}

export async function createAiModelUpstream(
  modelId: string,
  body: {
    provider_id: string;
    upstream_id: string;
    hpp_usd_per_1m_in?: number | null;
    hpp_usd_per_1m_out?: number | null;
    max_tokens_cap?: number | null;
    rank?: number;
  },
): Promise<AiModelAdmin> {
  const { data } = await api.post(
    `/api/admin/ai/models/${modelId}/upstreams`,
    body,
  );
  return data;
}

export async function updateAiModelUpstream(
  modelId: string,
  upstreamId: string,
  body: Partial<{
    provider_id: string;
    upstream_id: string;
    hpp_usd_per_1m_in: number | null;
    hpp_usd_per_1m_out: number | null;
    max_tokens_cap: number | null;
    enabled: boolean;
    rank: number;
  }>,
): Promise<AiModelAdmin> {
  const { data } = await api.patch(
    `/api/admin/ai/models/${modelId}/upstreams/${upstreamId}`,
    body,
  );
  return data;
}

export async function deleteAiModelUpstream(
  modelId: string,
  upstreamId: string,
): Promise<AiModelAdmin> {
  const { data } = await api.delete(
    `/api/admin/ai/models/${modelId}/upstreams/${upstreamId}`,
  );
  return data;
}

export interface AiUsageAdmin {
  id: string;
  organization_id: string | null;
  source: string;
  model_public_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  billed_idr: number;
  cogs_idr: number;
  margin_idr?: number;
  billed_usd?: number | null;
  cogs_usd?: number | null;
  fx_rate?: number | null;
  fx_source?: string | null;
  fx_effective_date?: string | null;
  price_usd_per_1m_in?: number | null;
  price_usd_per_1m_out?: number | null;
  hpp_usd_per_1m_in?: number | null;
  hpp_usd_per_1m_out?: number | null;
  http_status: number | null;
  created_at: string;
  request_payload?: Record<string, unknown> | null;
  response_payload?: Record<string, unknown> | null;
}

export async function listAiUsage(params?: {
  org_id?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: AiUsageAdmin[]; total: number }> {
  const { data } = await api.get<{ items: AiUsageAdmin[]; total: number }>(
    "/api/admin/ai/usage",
    { params },
  );
  return data;
}

export async function topupAiWallet(
  orgId: string,
  amountIdr: number,
): Promise<{ organization_id: string; balance_idr: number }> {
  const { data } = await api.post(`/api/admin/ai/wallets/${orgId}/topup`, {
    amount_idr: amountIdr,
  });
  return data;
}

export async function adminAiChat(body: {
  model: string;
  messages: { role: string; content: string }[];
  max_tokens?: number;
}): Promise<Record<string, unknown>> {
  const { data } = await api.post("/api/admin/ai/chat", body);
  return data;
}

export interface AiFxRate {
  id: string;
  base: string;
  quote: string;
  rate: number;
  source: string;
  effective_date: string;
  fetched_at: string;
  created_by: string | null;
}

export interface AiFxStatus {
  rate: number;
  source: string;
  effective_date: string | null;
  fetched_at: string | null;
  using_env_fallback: boolean;
  env_rate: number;
  auto_fetch_enabled: boolean;
  history: AiFxRate[];
}

export async function getAiFx(): Promise<AiFxStatus> {
  const { data } = await api.get<AiFxStatus>("/api/admin/ai/fx");
  return data;
}

export async function refreshAiFx(): Promise<AiFxRate> {
  const { data } = await api.post<AiFxRate>("/api/admin/ai/fx/refresh");
  return data;
}

export async function setAiFxManual(rate: number): Promise<AiFxRate> {
  const { data } = await api.put<AiFxRate>("/api/admin/ai/fx/manual", { rate });
  return data;
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

export interface HppSettingHistoryItem {
  id: string;
  scope: "rate" | "overhead";
  key: string | null;
  amount_from: number | null;
  amount_to: number;
  actor_email: string | null;
  created_at: string;
}

export interface HppSettingHistoryList {
  items: HppSettingHistoryItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface HppOverheadItem {
  amount_idr: number;
  updated_at: string | null;
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

export interface HppLineMargin {
  line: string;
  label: string;
  org_count: number;
  revenue_idr: number;
  cogs_idr: number;
  margin_idr: number;
  margin_pct: number | null;
  host_cogs_capped?: boolean;
  host_scans_raw?: number;
  host_scans_cap?: number;
  unpriced_org_count?: number;
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
  line_margins: HppLineMargin[];
  catalog_seed_skus?: string[];
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

export async function getHppHistory(params?: {
  scope?: "rate" | "overhead";
  key?: string;
  page?: number;
  page_size?: number;
}): Promise<HppSettingHistoryList> {
  const { data } = await api.get<HppSettingHistoryList>(
    "/api/admin/hpp/history",
    { params },
  );
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

export type InvoiceProduct = "scan" | "host" | "uptime" | "guard";

export interface SkuCatalogItem {
  product: InvoiceProduct;
  sku: string;
  label: string;
  active: boolean;
  list_idr: number;
  seats: number;
  invoicable: boolean;
  updated_at: string;
  updated_by?: string | null;
  updated_by_email?: string | null;
}

export interface SkuPriceItem {
  service: "scan" | "host" | "uptime" | "guard";
  sku: string;
  label?: string;
  active?: boolean;
  list_idr: number;
  invoicable: boolean;
}

export interface SkuPriceListResponse {
  items: SkuPriceItem[];
}

export interface BundlePriceItem {
  tier: string;
  label?: string;
  active?: boolean;
  bundle_idr: number;
  alacarte_idr: number;
  saving_idr: number;
  saving_pct: number;
}

export interface AnnualPolicy {
  months_paid: number;
  months_served: number;
}

export interface SkuPricingResponse {
  items: SkuPriceItem[];
  bundles: BundlePriceItem[];
  annual: AnnualPolicy | null;
}

export type SkuTierPriceBody = {
  list_idr: number;
  invoicable: boolean;
};

export interface SkuTierMutationBody {
  code?: string;
  label?: string;
  rank?: number;
  active?: boolean;
  requestable?: boolean;
  sales_led?: boolean;
  is_default?: boolean;
  bundle_idr?: number | null;
  limit_scan?: number;
  limit_host?: number;
  limit_uptime?: number;
  limit_guard?: number;
  allow_status_page?: boolean;
  allow_custom_host?: boolean;
  allow_waf_protect?: boolean;
  allow_siem?: boolean;
  billing_unrestricted?: boolean;
  workspace_editor_limit?: number | null;
  workspace_viewer_limit?: number | null;
  prices?: Partial<Record<InvoiceProduct, SkuTierPriceBody>>;
}

export interface SkuTierHistoryItem {
  id: string;
  sku_code: string;
  action: string;
  actor_email: string | null;
  organization_id?: string | null;
  organization_name?: string | null;
  changes: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
}

export interface SkuTierHistoryList {
  items: SkuTierHistoryItem[];
  total: number;
  page: number;
  page_size: number;
}

export async function getAdminSkuTiers(): Promise<SkuTierInfo[]> {
  const { data } = await api.get<SkuTierInfo[]>("/api/admin/sku-tiers");
  return data;
}

export async function createSkuTier(
  body: SkuTierMutationBody,
): Promise<SkuTierInfo> {
  const { data } = await api.post<SkuTierInfo>("/api/admin/sku-tiers", body);
  return data;
}

export async function updateSkuTier(
  code: string,
  body: SkuTierMutationBody,
): Promise<SkuTierInfo> {
  const { data } = await api.patch<SkuTierInfo>(
    `/api/admin/sku-tiers/${code}`,
    body,
  );
  return data;
}

export async function deactivateSkuTier(code: string): Promise<SkuTierInfo> {
  const { data } = await api.post<SkuTierInfo>(
    `/api/admin/sku-tiers/${code}/deactivate`,
  );
  return data;
}

export async function reactivateSkuTier(code: string): Promise<SkuTierInfo> {
  const { data } = await api.post<SkuTierInfo>(
    `/api/admin/sku-tiers/${code}/reactivate`,
  );
  return data;
}

export async function deleteSkuTier(code: string): Promise<void> {
  await api.delete(`/api/admin/sku-tiers/${code}`);
}

export async function getSkuTierHistory(
  code: string,
  params: { page?: number; page_size?: number } = {},
): Promise<SkuTierHistoryList> {
  const { data } = await api.get<SkuTierHistoryList>(
    `/api/admin/sku-tiers/${code}/history`,
    { params },
  );
  return data;
}

export async function getOrgTierHistory(
  orgId: string,
  params: { page?: number; page_size?: number } = {},
): Promise<SkuTierHistoryList> {
  const { data } = await api.get<SkuTierHistoryList>(
    `/api/admin/orgs/${orgId}/tier-history`,
    { params },
  );
  return data;
}

export interface AdminOrgItem {
  id: string;
  name: string;
  slug: string;
  sku: string;
  sku_label?: string;
  kind: string;
}

export interface InvoiceBankCopy {
  bank_name: string | null;
  bank_account: string | null;
  bank_holder: string | null;
}

export interface InvoiceItem {
  id: string;
  organization_id: string;
  number: string;
  product: InvoiceProduct;
  sku: string;
  seats: number;
  amount_idr: number;
  discount_idr?: number;
  promo_code?: string | null;
  dpp_idr?: number;
  ppn_idr?: number;
  pph23_idr?: number;
  total_idr?: number;
  period_start: string;
  period_end: string;
  due_date?: string;
  sent_at?: string | null;
  status: string;
  bank_ref: string | null;
  notes: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  organization_name?: string | null;
  bank?: InvoiceBankCopy | null;
}

export type PromoKind = "percent" | "fixed";
export type PromoProduct = "scan" | "host" | "uptime" | "guard";
export type PromoCycle = "monthly" | "annual";
export type PromoStatusFilter = "active" | "inactive" | "expired" | "scheduled";

export interface PromoCode {
  id: string;
  code: string;
  description: string;
  kind: PromoKind | string;
  percent_off_bp: number | null;
  amount_idr: number | null;
  min_amount_idr: number;
  max_discount_idr: number | null;
  applies_to_sku: string | null;
  applies_to_product: PromoProduct | null;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  max_redemptions_per_org: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromoCodeListResponse {
  items: PromoCode[];
  total: number;
  page: number;
  page_size: number;
}

export interface PromoCodeCreateInput {
  code: string;
  description?: string;
  kind: PromoKind;
  percent_off_bp?: number | null;
  amount_idr?: number | null;
  min_amount_idr?: number;
  max_discount_idr?: number | null;
  applies_to_sku?: string | null;
  applies_to_product?: PromoProduct | null;
  starts_at?: string | null;
  ends_at?: string | null;
  max_redemptions?: number | null;
  max_redemptions_per_org?: number;
}

export type PromoCodeUpdateInput = Partial<PromoCodeCreateInput>;

export interface PromoValidateInput {
  organization_id: string;
  code: string;
  product: PromoProduct;
  sku: string;
  cycle: PromoCycle;
}

export interface PromoValidateResult {
  valid: boolean;
  description: string;
  discount_idr: number;
  total_idr: number;
}

export interface PromoRedemption {
  id: string;
  promo_code_id: string;
  organization_id: string;
  organization_name: string | null;
  invoice_id: string;
  invoice_number: string | null;
  subscription_request_id: string | null;
  code_snapshot: string;
  discount_idr: number;
  status: string;
  created_at: string;
  released_at: string | null;
}

export interface PromoRedemptionList {
  items: PromoRedemption[];
  total: number;
  page: number;
  page_size: number;
}

export interface PromoHistoryItem {
  id: string;
  promo_code_id: string;
  action: string;
  actor_email: string | null;
  changes: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
}

export interface PromoHistoryList {
  items: PromoHistoryItem[];
  total: number;
  page: number;
  page_size: number;
}

export async function listAdminPromoCodes(params?: {
  page?: number;
  page_size?: number;
  status?: PromoStatusFilter;
  q?: string;
}): Promise<PromoCodeListResponse> {
  const { data } = await api.get<PromoCodeListResponse>(
    "/api/admin/promo-codes",
    { params },
  );
  return data;
}

export async function getAdminPromoCode(id: string): Promise<PromoCode> {
  const { data } = await api.get<PromoCode>(`/api/admin/promo-codes/${id}`);
  return data;
}

export async function createAdminPromoCode(
  body: PromoCodeCreateInput,
): Promise<PromoCode> {
  const { data } = await api.post<PromoCode>("/api/admin/promo-codes", body);
  return data;
}

export async function updateAdminPromoCode(
  id: string,
  body: PromoCodeUpdateInput,
): Promise<PromoCode> {
  const { data } = await api.patch<PromoCode>(
    `/api/admin/promo-codes/${id}`,
    body,
  );
  return data;
}

export async function deactivateAdminPromoCode(id: string): Promise<PromoCode> {
  const { data } = await api.post<PromoCode>(
    `/api/admin/promo-codes/${id}/deactivate`,
  );
  return data;
}

export async function reactivateAdminPromoCode(id: string): Promise<PromoCode> {
  const { data } = await api.post<PromoCode>(
    `/api/admin/promo-codes/${id}/reactivate`,
  );
  return data;
}

export async function deleteAdminPromoCode(id: string): Promise<void> {
  await api.delete(`/api/admin/promo-codes/${id}`);
}

export async function listAdminPromoRedemptions(
  id: string,
  params: { page?: number; page_size?: number } = {},
): Promise<PromoRedemptionList> {
  const { data } = await api.get<PromoRedemptionList>(
    `/api/admin/promo-codes/${id}/redemptions`,
    { params },
  );
  return data;
}

export async function listAdminPromoHistory(
  id: string,
  params: { page?: number; page_size?: number } = {},
): Promise<PromoHistoryList> {
  const { data } = await api.get<PromoHistoryList>(
    `/api/admin/promo-codes/${id}/history`,
    { params },
  );
  return data;
}

export async function validateAdminPromoCode(
  body: PromoValidateInput,
): Promise<PromoValidateResult> {
  const { data } = await api.post<PromoValidateResult>(
    "/api/admin/promo-codes/validate",
    body,
  );
  return data;
}

export async function getSkuCatalog(): Promise<SkuCatalogItem[]> {
  const { data } = await api.get<{ items: SkuCatalogItem[] }>(
    "/api/admin/sku-catalog",
  );
  return data.items;
}

export async function getSkuPrices(): Promise<SkuPriceItem[]> {
  const { data } = await api.get<SkuPriceListResponse>("/api/admin/sku-prices");
  return data.items;
}

export async function getSkuPricing(): Promise<SkuPricingResponse> {
  const { data } = await api.get<SkuPricingResponse>("/api/admin/sku-prices");
  return data;
}

export async function updateSkuCatalog(
  product: InvoiceProduct,
  sku: string,
  data: { list_idr: number; invoicable?: boolean },
): Promise<SkuCatalogItem> {
  const { data: res } = await api.put<SkuCatalogItem>(
    `/api/admin/sku-catalog/${product}/${sku}`,
    data,
  );
  return res;
}

export async function listAdminOrgs(params?: {
  q?: string;
  sku?: string;
  page?: number;
  page_size?: number;
}): Promise<{ items: AdminOrgItem[]; total: number }> {
  const { data } = await api.get<{ items: AdminOrgItem[]; total: number }>(
    "/api/admin/orgs",
    { params },
  );
  return data;
}

export async function listAdminInvoices(params?: {
  status?: string;
  organization_id?: string;
  page?: number;
}): Promise<{ items: InvoiceItem[]; total: number }> {
  const { data } = await api.get<{ items: InvoiceItem[]; total: number }>(
    "/api/admin/invoices",
    { params },
  );
  return data;
}

export async function createAdminInvoice(body: {
  organization_id: string;
  sku: string;
  product?: InvoiceProduct;
  cycle?: "monthly" | "annual";
  notes?: string;
  promo_code?: string | null;
  subscription_request_id?: string | null;
}): Promise<InvoiceItem> {
  const { data } = await api.post<InvoiceItem>("/api/admin/invoices", body);
  return data;
}

export async function sendAdminInvoice(id: string): Promise<InvoiceItem> {
  const { data } = await api.post<InvoiceItem>(
    `/api/admin/invoices/${id}/send`,
  );
  return data;
}

export async function payAdminInvoice(
  id: string,
  bankRef?: string,
): Promise<InvoiceItem> {
  const { data } = await api.post<InvoiceItem>(
    `/api/admin/invoices/${id}/paid`,
    { bank_ref: bankRef || null },
  );
  return data;
}

export async function voidAdminInvoice(id: string): Promise<InvoiceItem> {
  const { data } = await api.post<InvoiceItem>(
    `/api/admin/invoices/${id}/void`,
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

export async function downloadAdminInvoicePdf(
  id: string,
  number: string,
): Promise<void> {
  const resp = await api.get<Blob>(`/api/admin/invoices/${id}/export`, {
    params: { format: "pdf" },
    responseType: "blob",
  });
  const data: unknown = resp.data;
  if (!(data instanceof Blob)) {
    throw new Error("invoice_pdf_not_blob");
  }
  saveBlob(data, `invoice_${number}.pdf`);
}

export const adminApi = {
  getStats: getAdminStats,
  getUsers: getAdminUsers,
  getUserDetail: getAdminUserDetail,
  updateUserCredits,
  resendVerification,
  getHppRates,
  updateHppRate,
  getHppReport,
  getHppOverhead,
  updateHppOverhead,
  getHppHistory,
  listHppCosts,
  createHppCost,
  deleteHppCost,
  getEmailLogs,
  listAiProviders,
  createAiProvider,
  updateAiProvider,
  deleteAiProvider,
  listAiModels,
  createAiModel,
  updateAiModel,
  deleteAiModel,
  listAiUsage,
  topupAiWallet,
  adminAiChat,
  getAiFx,
  refreshAiFx,
  setAiFxManual,
  listBlogPosts,
  createBlogPost,
  updateBlogPost,
  publishBlogPost,
  unpublishBlogPost,
  getSkuCatalog,
  getSkuPrices,
  getSkuPricing,
  updateSkuCatalog,
  getAdminSkuTiers,
  createSkuTier,
  updateSkuTier,
  deactivateSkuTier,
  reactivateSkuTier,
  deleteSkuTier,
  getSkuTierHistory,
  getOrgTierHistory,
  listAdminOrgs,
  listAdminInvoices,
  createAdminInvoice,
  sendAdminInvoice,
  payAdminInvoice,
  voidAdminInvoice,
  downloadAdminInvoicePdf,
  listAdminPromoCodes,
  getAdminPromoCode,
  createAdminPromoCode,
  updateAdminPromoCode,
  deactivateAdminPromoCode,
  reactivateAdminPromoCode,
  deleteAdminPromoCode,
  listAdminPromoRedemptions,
  listAdminPromoHistory,
  validateAdminPromoCode,
};
