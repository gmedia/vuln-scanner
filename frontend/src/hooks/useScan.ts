import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  startIpScan,
  startDomainScan,
  startMobileScan,
  getScan,
  getScanFindings,
  getScanDiff,
  getScanHistory,
} from "@/api/scans";
import { useAuthStore } from "@/store/authStore";

export function useScanHistory(page = 1, limit = 20, scanType?: string) {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: ["scan-history", activeOrgId, page, limit, scanType],
    queryFn: () => getScanHistory(page, limit, scanType),
  });
}

export function useScanDetail(jobId: string | null) {
  return useQuery({
    queryKey: ["scan-detail", jobId],
    queryFn: () => getScan(jobId!),
    enabled: !!jobId,
  });
}

export function useScanFindings(jobId: string | null) {
  return useQuery({
    queryKey: ["scan-findings", jobId],
    queryFn: () => getScanFindings(jobId!),
    enabled: !!jobId,
  });
}

export function useScanDiff(jobId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["scan-diff", jobId],
    queryFn: () => getScanDiff(jobId!),
    enabled: !!jobId && enabled,
  });
}

export function useStartIpScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ target, ports }: { target: string; ports?: string }) =>
      startIpScan(target, ports),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scan-history"] });
    },
  });
}

export function useStartDomainScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ domain }: { domain: string }) => startDomainScan(domain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scan-history"] });
    },
  });
}

export function useStartMobileScan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      platform,
    }: {
      file: File;
      platform: "android" | "ios";
    }) => startMobileScan(file, platform),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scan-history"] });
    },
  });
}
