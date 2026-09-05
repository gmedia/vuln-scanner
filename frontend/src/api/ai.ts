import api from "@/api/scans";
import type { AxiosError } from "axios";

export function isAiDisabledError(err: unknown): boolean {
  const status = (err as AxiosError | undefined)?.response?.status;
  return status === 404;
}

export interface AiWallet {
  organization_id: string;
  balance_idr: number;
  currency: string;
}

export interface AiPublicModel {
  public_id: string;
  price_idr_per_1k_in: number;
  price_idr_per_1k_out: number;
  max_ctx: number;
  max_tokens_cap: number;
}

export interface AiKey {
  id: string;
  name: string;
  prefix: string;
  is_active: boolean;
  rate_limit_rpm: number;
  created_at: string;
  last_used_at: string | null;
  key?: string | null;
}

export interface AiUsage {
  id: string;
  source: string;
  model_public_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  billed_idr: number;
  created_at: string;
}

export async function getAiWallet(): Promise<AiWallet> {
  const { data } = await api.get<AiWallet>("/api/ai/wallet");
  return data;
}

export async function listAiModels(): Promise<{
  items: AiPublicModel[];
  total: number;
}> {
  const { data } = await api.get("/api/ai/models");
  return data;
}

export async function listAiKeys(): Promise<{ items: AiKey[]; total: number }> {
  const { data } = await api.get("/api/ai/keys");
  return data;
}

export async function createAiKey(name: string): Promise<AiKey> {
  const { data } = await api.post<AiKey>("/api/ai/keys", { name });
  return data;
}

export async function revokeAiKey(id: string): Promise<AiKey> {
  const { data } = await api.delete<AiKey>(`/api/ai/keys/${id}`);
  return data;
}

export async function listAiUsage(limit = 50): Promise<{
  items: AiUsage[];
  total: number;
}> {
  const { data } = await api.get("/api/ai/usage", { params: { limit } });
  return data;
}
