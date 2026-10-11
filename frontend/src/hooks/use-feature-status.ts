import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { canManageGuard, getGuardStatus } from "@/api/guard";
import { listMonitors } from "@/api/uptime";
import { useAuthStore } from "@/store/authStore";

export interface FeatureStatus {
  readonly guard: boolean;
  readonly uptime: boolean;
  readonly isGuardAdmin: boolean;
}

const STALE_MS = 60_000;

function isDisabledError(err: unknown, codes: readonly number[]): boolean {
  const status = (err as AxiosError | undefined)?.response?.status;
  return status !== undefined && codes.includes(status);
}

export function useFeatureStatus(): FeatureStatus {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const activeRole = useAuthStore((s) => s.activeRole);
  const isGuardAdmin = canManageGuard(activeRole());

  const guardQ = useQuery({
    queryKey: ["guard", activeOrgId, "status"],
    queryFn: getGuardStatus,
    enabled: !!activeOrgId && isGuardAdmin,
    retry: false,
    staleTime: STALE_MS,
  });

  const uptimeQ = useQuery({
    queryKey: ["uptime"],
    queryFn: listMonitors,
    enabled: !!activeOrgId,
    retry: false,
    staleTime: STALE_MS,
  });

  return {
    guard: isGuardAdmin && !isDisabledError(guardQ.error, [503, 404]),
    uptime: !isDisabledError(uptimeQ.error, [404]),
    isGuardAdmin,
  };
}
