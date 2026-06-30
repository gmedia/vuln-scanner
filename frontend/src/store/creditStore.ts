import { create } from "zustand";
import { creditApi, type ScanEligibility } from "@/api/credits";

interface CreditStore {
  credits: number;
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  fetchBalance: () => Promise<void>;
  checkEligibility: (scanType: string) => Promise<ScanEligibility | null>;
}

export const useCreditStore = create<CreditStore>((set, _get) => ({
  credits: 0,
  isAdmin: false,
  isLoading: false,
  error: null,

  fetchBalance: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await creditApi.getBalance();
      set({ credits: data.credits, isAdmin: data.is_admin, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch credits";
      set({ error: message, isLoading: false });
    }
  },

  checkEligibility: async (scanType: string) => {
    try {
      const data = await creditApi.checkEligibility(scanType);
      set({ credits: data.current_credits });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to check eligibility";
      set({ error: message });
      return null;
    }
  },
}));