import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  startIpScan,
  startDomainScan,
  startMobileScan,
  getScan,
  getScanFinding,
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
    enabled: !!activeOrgId,
  });
}

export function useScanDetail(jobId: string | null) {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: ["scan-detail", activeOrgId, jobId],
    queryFn: () => getScan(jobId!),
    enabled: !!jobId && !!activeOrgId,
  });
}

export function useScanFindings(jobId: string | null, page = 1, limit = 50) {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: ["scan-findings", activeOrgId, jobId, page, limit],
    queryFn: () => getScanFindings(jobId!, page, limit),
    enabled: !!jobId && !!activeOrgId,
  });
}

export function useScanFinding(
  jobId: string | null,
  findingId: string | null,
  enabled = true,
) {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: ["scan-finding", activeOrgId, jobId, findingId],
    queryFn: () => getScanFinding(jobId!, findingId!),
    enabled: !!jobId && !!findingId && !!activeOrgId && enabled,
  });
}

export function useScanDiff(jobId: string | null, enabled = true) {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  return useQuery({
    queryKey: ["scan-diff", activeOrgId, jobId],
    queryFn: () => getScanDiff(jobId!),
    enabled: !!jobId && !!activeOrgId && enabled,
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
