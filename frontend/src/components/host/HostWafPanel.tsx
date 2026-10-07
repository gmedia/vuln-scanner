import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Activity, FileText, Info, Shield } from "lucide-react";
import { toast } from "sonner";
import {
  fetchHostWafSnippet,
  isHostWafDisabledError,
  listHostWafEvents,
  listHostWafPolicies,
  simulateHostWaf,
  upsertHostWafPolicy,
  type HostWafPolicy,
} from "@/api/hostWaf";
import type { GuardAgent } from "@/api/guard";
import type { HostSite } from "@/api/hostProtect";
import {
  formatHelperPollAt,
  isHelperPollStale,
} from "@/lib/sinexisInstall";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { SiemEmptyIsland } from "@/components/siem/SiemEmptyIsland";
import { SiemRail } from "@/components/siem/siemChrome";
import {
  HOST_WAF_EVENTS_PAGE_SIZE,
  HostWafEventsList,
} from "@/components/host/HostWafEventsList";
import {
  wafModeBadgeVariant,
  wafModeRailClass,
} from "@/components/host/hostChrome";
import { useAuthStore } from "@/store/authStore";

export default function HostWafPanel({
  sites,
  agents,
}: {
  sites: HostSite[];
  agents: GuardAgent[];
}) {
  const { t } = useTranslation("host");
  const qc = useQueryClient();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [eventsPage, setEventsPage] = useState(1);
  const selected = siteId || sites[0]?.id || "";

  const policiesQ = useQuery({
    queryKey: ["host-waf", activeOrgId, "policies"],
    queryFn: listHostWafPolicies,
    enabled: !!activeOrgId,
    retry: false,
  });

  const featureOff =
    policiesQ.isError && isHostWafDisabledError(policiesQ.error);

  const eventsQ = useQuery({
    queryKey: ["host-waf", activeOrgId, "events", selected, eventsPage],
    queryFn: () =>
      listHostWafEvents(selected || undefined, {
        page: eventsPage,
        limit: HOST_WAF_EVENTS_PAGE_SIZE,
      }),
    enabled: !!activeOrgId && !featureOff,
    retry: false,
    placeholderData: keepPreviousData,
  });

  const policyForSite = (policiesQ.data ?? []).find(
    (p) => p.site_id === selected,
  );
  const mode: HostWafPolicy["mode"] = policyForSite?.mode ?? "off";
  const selectedSite = sites.find((s) => s.id === selected);
  const siteAgent = agents.find((a) => a.id === selectedSite?.guard_agent_id);
  const pollIso = siteAgent?.last_helper_poll_at ?? null;
  const pollLabel = formatHelperPollAt(pollIso);
  const pollStale = isHelperPollStale(pollIso);
  const canProtect =
    sites.length === 0 ||
    (selectedSite ? (selectedSite.sku ?? "multi") === "multi" : true);
  const labRoot = selectedSite?.root_path ?? "";
  const labName = (selectedSite?.name ?? "").toLowerCase();
  const isLabSite =
    Boolean(selectedSite) &&
    !labRoot.toLowerCase().includes("erp") &&
    !labRoot.toLowerCase().includes("sx-erpstg") &&
    (/^\/var\/www\/host-(waf|protect)-fixture/.test(labRoot) ||
      labRoot.startsWith("/srv/www/host-waf-fixture") ||
      labName.startsWith("lab-host-waf"));
  const showSimulate = Boolean(selected) && isLabSite;

  const saveMut = useMutation({
    mutationFn: (next: HostWafPolicy["mode"]) =>
      upsertHostWafPolicy(selected, {
        mode: next,
        engine: policyForSite?.engine ?? "mock",
        paranoia: policyForSite?.paranoia ?? 1,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host-waf"] }),
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(String(err.response?.data?.detail ?? t("wafSaveFail")));
    },
  });

  const simMut = useMutation({
    mutationFn: () => simulateHostWaf(selected),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host-waf"] }),
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(String(err.response?.data?.detail ?? t("wafSimFail")));
    },
  });

  const copyMut = useMutation({
    mutationFn: async () => {
      const snip = await fetchHostWafSnippet(selected);
      await navigator.clipboard.writeText(snip.content);
    },
    onSuccess: () => toast.success(t("wafCopyOk")),
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(String(err.response?.data?.detail ?? t("wafCopyFail")));
    },
  });

  if (featureOff) {
    return (
      <div data-testid="host-waf-panel">
        <SiemEmptyIsland
          icon={Shield}
          title={t("wafFeatureOff")}
          testId="host-waf-off"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="host-waf-panel">
      <p className="max-w-prose text-sm text-muted-foreground">{t("wafHint")}</p>
      {sites.length === 0 ? (
        <SiemEmptyIsland icon={Shield} title={t("wafNeedSite")} />
      ) : (
        <>
          <div className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-4 pl-4">
            <SiemRail className={wafModeRailClass(mode)} />
            <div className="grid grid-cols-1 gap-3 pl-2 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="host-waf-site">{t("wafSite")}</Label>
                <Select
                  value={selected}
                  onValueChange={(id) => {
                    setSiteId(id);
                    setEventsPage(1);
                  }}
                >
                  <SelectTrigger
                    id="host-waf-site"
                    data-testid="host-waf-site"
                    aria-label={t("wafSite")}
                    className="h-10 min-h-10"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="host-waf-mode">{t("wafMode")}</Label>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Select
                      value={mode}
                      onValueChange={(v) =>
                        saveMut.mutate(v as HostWafPolicy["mode"])
                      }
                      disabled={!selected || saveMut.isPending}
                    >
                      <SelectTrigger
                        id="host-waf-mode"
                        data-testid="host-waf-mode"
                        aria-label={t("wafMode")}
                        className="h-10 min-h-10"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">{t("wafOff")}</SelectItem>
                        <SelectItem value="detect">
                          {t("wafDetect")}
                        </SelectItem>
                        {canProtect ? (
                          <SelectItem value="protect">
                            {t("wafProtect")}
                          </SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                  </div>
                  <Badge
                    variant={wafModeBadgeVariant(mode)}
                    className="shrink-0"
                  >
                    {mode === "off"
                      ? t("wafOff")
                      : mode === "detect"
                        ? t("wafDetect")
                        : t("wafProtect")}
                  </Badge>
                </div>
                {!canProtect ? (
                  <p
                    className="text-xs text-muted-foreground"
                    data-testid="host-waf-protect-locked"
                  >
                    {t("wafProtectLocked")}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 pl-2">
              {showSimulate ? (
                <Button
                  variant="outline"
                  data-testid="host-waf-simulate"
                  disabled={mode === "off" || simMut.isPending}
                  onClick={() => simMut.mutate()}
                  className="w-full sm:w-auto"
                >
                  {t("wafSimulate")}
                </Button>
              ) : null}
              <Button
                variant="outline"
                data-testid="host-waf-copy-snippet"
                disabled={!selected || copyMut.isPending}
                onClick={() => copyMut.mutate()}
                className="w-full sm:w-auto"
              >
                {t("wafCopySnippet")}
              </Button>
            </div>
          </div>
          {selected ? (
            <div className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-4 pl-4">
              <SiemRail className="bg-sky-500" />
              <div className="space-y-2 pl-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <p
                    className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground"
                    data-testid="host-waf-site-id"
                  >
                    {t("siteId")}: {selected}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="host-waf-copy-site-id"
                    disabled={!selected}
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(selected)
                        .then(() => toast.success(t("copySiteIdOk")))
                        .catch(() => toast.error(t("copySiteIdFail")));
                    }}
                    className="w-full shrink-0 sm:w-auto"
                  >
                    {t("copySiteId")}
                  </Button>
                </div>
                <p
                  className="max-w-prose text-xs text-muted-foreground"
                  data-testid="host-waf-site-id-hint"
                >
                  {t("siteIdHint", { id: selected })}
                </p>
              </div>
            </div>
          ) : null}
          <div className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-4 pl-4">
            <SiemRail className="bg-border" />
            <ul className="space-y-2 pl-2">
              <li className="flex items-start gap-2">
                <Info
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <p
                  className="max-w-prose text-xs text-muted-foreground"
                  data-testid="host-waf-copy-hint"
                >
                  {t("wafCopyHint")}
                </p>
              </li>
              <li className="flex items-start gap-2">
                <FileText
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <p
                  className="max-w-prose text-xs text-muted-foreground"
                  data-testid="host-waf-snippet-status"
                >
                  {t("wafSnippetNotIncluded")}
                </p>
              </li>
              <li className="flex items-start gap-2">
                <Activity
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <p
                  className={
                    pollStale
                      ? "max-w-prose text-xs font-medium text-destructive"
                      : "max-w-prose text-xs text-muted-foreground"
                  }
                  data-testid="host-waf-helper-poll"
                >
                  {pollLabel
                    ? pollStale
                      ? t("wafHelperStale", { when: pollLabel })
                      : t("wafHelperPolled", { when: pollLabel })
                    : t("wafHelperNever")}
                </p>
              </li>
            </ul>
          </div>
        </>
      )}
      {mode === "off" ? (
        <p
          className="max-w-prose text-xs text-muted-foreground"
          data-testid="host-waf-simulate-hint"
        >
          {showSimulate ? t("wafSimulateHint") : t("wafSimulateProdHint")}
        </p>
      ) : null}
      <HostWafEventsList
        events={eventsQ.data?.items ?? []}
        page={eventsQ.data?.page ?? eventsPage}
        pages={eventsQ.data?.pages ?? 0}
        onPageChange={setEventsPage}
      />
    </div>
  );
}
