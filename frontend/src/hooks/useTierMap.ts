import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getSkuTiers,
  type SkuTierFeatures,
  type SkuTierInfo,
  type SkuTierWorkspaceLimits,
} from "@/api/subscription";

const NO_FEATURES: SkuTierFeatures = {
  allow_status_page: false,
  allow_custom_host: false,
  allow_waf_protect: false,
  allow_siem: false,
  billing_unrestricted: false,
  sales_led: false,
  requestable: false,
};

const UNLIMITED_SEATS: SkuTierWorkspaceLimits = {
  editor: null,
  viewer: null,
};

export interface TierMap {
  tiers: SkuTierInfo[];
  byCode: Map<string, SkuTierInfo>;
  label: (code?: string | null) => string;
  features: (code?: string | null) => SkuTierFeatures;
  workspaceLimits: (code?: string | null) => SkuTierWorkspaceLimits;
}

export function tierMapFrom(tiers: SkuTierInfo[]): TierMap {
  const byCode = new Map(tiers.map((tier) => [tier.code, tier]));
  return {
    tiers,
    byCode,
    label: (code) => {
      if (!code) return "—";
      return byCode.get(code)?.label ?? code;
    },
    features: (code) =>
      (code ? byCode.get(code)?.features : undefined) ?? NO_FEATURES,
    workspaceLimits: (code) =>
      (code ? byCode.get(code)?.workspace_limits : undefined) ??
      UNLIMITED_SEATS,
  };
}

export function useTierMap(): TierMap & { isLoading: boolean } {
  const query = useQuery({
    queryKey: ["sku-tiers"],
    queryFn: getSkuTiers,
    staleTime: 5 * 60_000,
  });
  const map = useMemo(
    () => tierMapFrom(Array.isArray(query.data) ? query.data : []),
    [query.data],
  );
  return { ...map, isLoading: query.isLoading };
}
