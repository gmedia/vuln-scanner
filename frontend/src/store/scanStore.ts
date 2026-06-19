import { create } from "zustand";

interface ScanStore {
  activeJobId: string | null;
  progress: number;
  status: string;
  scanType: string | null;
  setActiveScan: (jobId: string, scanType: string) => void;
  setProgress: (progress: number, status: string) => void;
  clearActiveScan: () => void;
}

export const useScanStore = create<ScanStore>((set) => ({
  activeJobId: null,
  progress: 0,
  status: "pending",
  scanType: null,
  setActiveScan: (jobId, scanType) =>
    set({ activeJobId: jobId, scanType, progress: 0, status: "pending" }),
  setProgress: (progress, status) => set({ progress, status }),
  clearActiveScan: () =>
    set({ activeJobId: null, progress: 0, status: "pending", scanType: null }),
}));
