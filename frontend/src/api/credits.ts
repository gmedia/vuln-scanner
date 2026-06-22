import api from "./scans";

export interface CreditInfo {
  credits: number;
  is_admin: boolean;
}

export interface CreditLogItem {
  id: string;
  amount: number;
  type: "credit" | "deduct" | "refund";
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface CreditHistoryResponse {
  items: CreditLogItem[];
  total: number;
}

export interface ScanEligibility {
  eligible: boolean;
  required_credits: number;
  current_credits: number;
  scan_type: string;
}

export async function getCreditBalance(): Promise<CreditInfo> {
  const { data } = await api.get<CreditInfo>("/api/credits/balance");
  return data;
}

export async function getCreditHistory(
  params: { page?: number; page_size?: number }
): Promise<CreditHistoryResponse> {
  const { data } = await api.get<CreditHistoryResponse>("/api/credits/history", { params });
  return data;
}

export async function checkScanEligibility(scanType: string): Promise<ScanEligibility> {
  const { data } = await api.get<ScanEligibility>(`/api/credits/eligibility/${scanType}`);
  return data;
}

export const creditApi = {
  getBalance: getCreditBalance,
  getHistory: getCreditHistory,
  checkEligibility: checkScanEligibility,
};