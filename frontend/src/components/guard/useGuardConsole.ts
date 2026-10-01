import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  canManageGuard,
  createEnrollToken,
  disableGuardAgent,
  enableGuard,
  getGuardStatus,
  issueHostAgentToken,
  linkGuardAgentAsset,
  listEnrollTokens,
  listGuardAgents,
  listGuardAlerts,
  revokeEnrollToken,
  syncGuard,
  type GuardEnrollTokenMeta,
} from "@/api/guard";
import { listAssets } from "@/api/assets";
import { apiDetail } from "@/components/siem/siemErrors";
import {
  buildEnrollCurlExample,
  resolveApiBaseUrl,
} from "@/lib/guardEnrollHost";
import { useAuthStore } from "@/store/authStore";

export function useGuardConsole() {
  const { t, i18n } = useTranslation("guard");
  const dateLocale = i18n.language.startsWith("en") ? "en" : "id";
  const queryClient = useQueryClient();
  const activeRole = useAuthStore((s) => s.activeRole);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const canAdmin = canManageGuard(activeRole());
  const [tokenLabel, setTokenLabel] = useState("");
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);
  const [showAllTokens, setShowAllTokens] = useState(false);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [hostTokenPlain, setHostTokenPlain] = useState<string | null>(null);
  const [hostTokenAgentId, setHostTokenAgentId] = useState<string | null>(null);
  const [hostTokenCopied, setHostTokenCopied] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const apiBase = resolveApiBaseUrl(
    import.meta.env.VITE_API_URL as string | undefined,
    typeof window !== "undefined" ? window.location.origin : undefined,
  );
  const enrollCurl = buildEnrollCurlExample(
    apiBase,
    rawToken ?? "<ENROLL_TOKEN>",
    "<AGENT_NAME>",
  );

  const statusQ = useQuery({
    queryKey: ["guard", activeOrgId, "status"],
    queryFn: getGuardStatus,
    enabled: !!activeOrgId,
  });
  const enabled = statusQ.data?.enabled ?? false;
  const agentsQ = useQuery({
    queryKey: ["guard", activeOrgId, "agents"],
    queryFn: listGuardAgents,
    enabled: !!activeOrgId && enabled,
  });
  const alertsQ = useQuery({
    queryKey: ["guard", activeOrgId, "alerts"],
    queryFn: () => listGuardAlerts(50),
    enabled: !!activeOrgId && enabled,
  });
  const tokensQ = useQuery({
    queryKey: ["guard", activeOrgId, "tokens"],
    queryFn: listEnrollTokens,
    enabled: !!activeOrgId && enabled && canAdmin,
  });
  const assetsQ = useQuery({
    queryKey: ["assets", activeOrgId],
    queryFn: () => listAssets(),
    enabled: !!activeOrgId && enabled && canAdmin,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["guard"] });
  };

  const enableMut = useMutation({
    mutationFn: enableGuard,
    onSuccess: () => {
      setActionError(null);
      toast.success(t("enabledToast"));
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("enableFail"))),
  });
  const syncMut = useMutation({
    mutationFn: syncGuard,
    onSuccess: () => {
      setActionError(null);
      toast.success(t("syncDone"));
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("syncFail"))),
  });
  const tokenMut = useMutation({
    mutationFn: () => createEnrollToken(tokenLabel.trim() || undefined),
    onSuccess: (data) => {
      setRawToken(data.token);
      setTokenLabel("");
      setActionError(null);
      toast.success(t("tokenCreated"));
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("tokenCreateFail"))),
  });
  const hostTokenMut = useMutation({
    mutationFn: (agentId: string) => issueHostAgentToken(agentId),
    onSuccess: (data) => {
      setHostTokenPlain(data.token);
      setHostTokenAgentId(data.agent_id);
      setHostTokenCopied(false);
      setActionError(null);
      toast.success(t("hostTokenCreated"));
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("hostTokenCreateFail"))),
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeEnrollToken(id),
    onSuccess: () => {
      setActionError(null);
      toast.success(t("tokenRevoked"));
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("tokenRevokeFail"))),
  });
  const linkMut = useMutation({
    mutationFn: ({
      agentId,
      assetId,
    }: {
      agentId: string;
      assetId: string | null;
    }) => linkGuardAgentAsset(agentId, assetId),
    onSuccess: (data) => {
      toast.success(
        data.asset_id ? t("assetLinkedToast") : t("assetUnlinkedToast"),
      );
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (e) => setActionError(apiDetail(e, t("assetLinkFail"))),
  });
  const disableMut = useMutation({
    mutationFn: (agentId: string) => disableGuardAgent(agentId),
    onSuccess: () => {
      setActionError(null);
      toast.success(t("disabledToast"));
      invalidate();
    },
    onError: (e) => setActionError(apiDetail(e, t("disableFail"))),
  });

  const tokens = tokensQ.data ?? [];
  const tokenExpired = (tok: GuardEnrollTokenMeta) =>
    new Date(tok.expires_at).getTime() < nowMs;
  const sortedTokens = [...tokens].sort((a, b) => {
    const rank = (tok: GuardEnrollTokenMeta) => {
      if (tok.revoked_at) return 3;
      if (tokenExpired(tok)) return 2;
      if (tok.used_at) return 1;
      return 0;
    };
    return rank(a) - rank(b);
  });
  const visibleTokens = showAllTokens ? sortedTokens : sortedTokens.slice(0, 5);
  const unusedCount = tokens.filter(
    (tok) => !tok.revoked_at && !tok.used_at && !tokenExpired(tok),
  ).length;

  return {
    t,
    dateLocale,
    canAdmin,
    tokenLabel,
    setTokenLabel,
    rawToken,
    actionError,
    curlCopied,
    setCurlCopied,
    showAllTokens,
    setShowAllTokens,
    showTechDetails,
    setShowTechDetails,
    hostTokenPlain,
    hostTokenAgentId,
    hostTokenCopied,
    setHostTokenCopied,
    nowMs,
    enrollCurl,
    statusQ,
    agentsQ,
    alertsQ,
    tokensQ,
    assetsQ,
    enabled,
    enableMut,
    syncMut,
    tokenMut,
    hostTokenMut,
    revokeMut,
    linkMut,
    disableMut,
    tokens,
    visibleTokens,
    unusedCount,
    tokenExpired,
  };
}
