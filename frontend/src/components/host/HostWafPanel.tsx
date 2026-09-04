import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
import type { HostSite } from "@/api/hostProtect";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { useAuthStore } from "@/store/authStore";

export default function HostWafPanel({ sites }: { sites: HostSite[] }) {
  const { t } = useTranslation("host");
  const qc = useQueryClient();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
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
    queryKey: ["host-waf", activeOrgId, "events", selected],
    queryFn: () => listHostWafEvents(selected || undefined),
    enabled: !!activeOrgId && !featureOff,
    retry: false,
  });

  const policyForSite = (policiesQ.data ?? []).find(
    (p) => p.site_id === selected,
  );
  const mode: HostWafPolicy["mode"] = policyForSite?.mode ?? "off";
  const selectedSite = sites.find((s) => s.id === selected);
  const canProtect =
    sites.length === 0 ||
    (selectedSite ? (selectedSite.sku ?? "multi") === "multi" : true);

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
        <p className="text-sm text-muted-foreground" data-testid="host-waf-off">
          {t("wafFeatureOff")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="host-waf-panel">
      <p className="text-sm text-muted-foreground">{t("wafHint")}</p>
      {sites.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("wafNeedSite")}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="host-waf-site">{t("wafSite")}</Label>
              <Select value={selected} onValueChange={setSiteId}>
                <SelectTrigger
                  id="host-waf-site"
                  data-testid="host-waf-site"
                  aria-label={t("wafSite")}
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
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">{t("wafOff")}</SelectItem>
                  <SelectItem value="detect">{t("wafDetect")}</SelectItem>
                  {canProtect ? (
                    <SelectItem value="protect">{t("wafProtect")}</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              data-testid="host-waf-simulate"
              disabled={!selected || mode === "off" || simMut.isPending}
              onClick={() => simMut.mutate()}
            >
              {t("wafSimulate")}
            </Button>
            <Button
              variant="outline"
              data-testid="host-waf-copy-snippet"
              disabled={!selected || copyMut.isPending}
              onClick={() => copyMut.mutate()}
            >
              {t("wafCopySnippet")}
            </Button>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground" data-testid="host-waf-simulate-hint">
        {t("wafSimulateHint")}
      </p>
      <h3 className="text-sm font-medium">{t("wafEvents")}</h3>
      <p className="text-xs text-muted-foreground" data-testid="host-waf-events-hint">
        {t("wafEventsHint")}
      </p>
      {(eventsQ.data ?? []).length === 0 ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="host-waf-events-empty"
        >
          {t("wafEventsEmpty")}
        </p>
      ) : (
        <Table data-testid="host-waf-events">
          <TableHeader>
            <TableRow>
              <TableHead>{t("wafColAction")}</TableHead>
              <TableHead>{t("wafColRule")}</TableHead>
              <TableHead>{t("wafColMethod")}</TableHead>
              <TableHead>{t("colPath")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(eventsQ.data ?? []).map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.action}</TableCell>
                <TableCell>{e.rule_id}</TableCell>
                <TableCell>{e.method}</TableCell>
                <TableCell>{e.path}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
