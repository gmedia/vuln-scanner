import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { listGuardAgents } from "@/api/guard";
import {
  createHostSite,
  deleteHostSite,
  enqueueHostScan,
  isHostProtectDisabledError,
  ignoreHostHit,
  listHostHits,
  listHostSites,
  quarantineHostHit,
  restoreHostHit,
  type HostSite,
} from "@/api/hostProtect";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import HostWafPanel from "@/components/host/HostWafPanel";
import { useAuthStore } from "@/store/authStore";

export function mapHostError(message: string): string {
  if (/limit/i.test(message)) return "limit";
  return message;
}

export default function HostProtect() {
  const { t } = useTranslation("host");
  const qc = useQueryClient();
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rootPath, setRootPath] = useState("");
  const [agentId, setAgentId] = useState("");
  const [cmsHint, setCmsHint] = useState<"wordpress" | "laravel" | "unknown">(
    "unknown",
  );

  const sitesQ = useQuery({
    queryKey: ["host", activeOrgId, "sites"],
    queryFn: listHostSites,
    enabled: !!activeOrgId,
    retry: false,
  });

  const featureOff = sitesQ.isError && isHostProtectDisabledError(sitesQ.error);
  const featureOn = sitesQ.isSuccess;

  const agentsQ = useQuery({
    queryKey: ["guard", activeOrgId, "agents"],
    queryFn: listGuardAgents,
    enabled: !!activeOrgId && featureOn,
  });

  const hitsQ = useQuery({
    queryKey: ["host", activeOrgId, "hits"],
    queryFn: () => listHostHits(),
    enabled: !!activeOrgId && featureOn,
  });

  const items = sitesQ.data ?? [];
  const sku = items[0]?.sku ?? "multi";
  const limit = items[0]?.sku_limit ?? 10;
  const atCap = items.length >= limit;
  const agents = agentsQ.data ?? [];
  const selectedAgentId = agentId || agents[0]?.id || "";

  const createMut = useMutation({
    mutationFn: createHostSite,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["host"] });
      setName("");
      setRootPath("");
      setAgentId("");
      setOpen(false);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const detail = String(err.response?.data?.detail ?? "");
      toast.error(
        mapHostError(detail) === "limit"
          ? t("limitReached")
          : detail || t("createFail"),
      );
    },
  });

  const delMut = useMutation({
    mutationFn: deleteHostSite,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host"] }),
  });

  const scanMut = useMutation({
    mutationFn: enqueueHostScan,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host"] }),
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(String(err.response?.data?.detail ?? t("scanFail")));
    },
  });

  const qMut = useMutation({
    mutationFn: quarantineHostHit,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host"] }),
  });
  const rMut = useMutation({
    mutationFn: restoreHostHit,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host"] }),
  });
  const iMut = useMutation({
    mutationFn: ignoreHostHit,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["host"] }),
  });

  if (!activeOrgId) {
    return (
      <div className="space-y-6" data-testid="host-page">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("pickOrg")}</p>
      </div>
    );
  }

  if (featureOff) {
    return (
      <div className="space-y-6" data-testid="host-page">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Card>
          <CardContent className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <Shield className="h-10 w-10 text-foreground/50" aria-hidden />
            <p className="text-sm font-medium text-foreground">{t("title")}</p>
            <p
              className="max-w-md text-sm text-muted-foreground"
              data-testid="host-feature-off"
            >
              {t("featureOff")}
            </p>
            <Button variant="outline" asChild>
              <Link to="/guide">Guide</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="host-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("skuLabel", { sku, count: items.length, limit })}
          </p>
        </div>
        <Button
          data-testid="host-add"
          disabled={atCap || agents.length === 0}
          onClick={() => setOpen((v) => !v)}
        >
          {t("add")}
        </Button>
      </div>

      {agents.length === 0 && !agentsQ.isLoading ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="host-no-agents"
        >
          {t("noAgents")}
        </p>
      ) : null}

      {open ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("add")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="host-name">{t("name")}</Label>
              <Input
                id="host-name"
                data-testid="host-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="host-root">{t("rootPath")}</Label>
              <Input
                id="host-root"
                data-testid="host-root"
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="host-agent">{t("guardAgent")}</Label>
              <Select value={selectedAgentId} onValueChange={setAgentId}>
                <SelectTrigger
                  id="host-agent"
                  data-testid="host-agent"
                  aria-label={t("guardAgent")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="host-cms">{t("cmsHint")}</Label>
              <Select
                value={cmsHint}
                onValueChange={(v) =>
                  setCmsHint(v as "wordpress" | "laravel" | "unknown")
                }
              >
                <SelectTrigger
                  id="host-cms"
                  data-testid="host-cms"
                  aria-label={t("cmsHint")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">{t("cmsUnknown")}</SelectItem>
                  <SelectItem value="wordpress">{t("cmsWordpress")}</SelectItem>
                  <SelectItem value="laravel">{t("cmsLaravel")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                data-testid="host-save"
                disabled={
                  !name.trim() ||
                  !rootPath.trim() ||
                  !selectedAgentId ||
                  createMut.isPending
                }
                onClick={() =>
                  createMut.mutate({
                    name: name.trim(),
                    root_path: rootPath.trim(),
                    guard_agent_id: selectedAgentId,
                    cms_hint: cmsHint,
                  })
                }
              >
                {t("save")}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="malware">
        <TabsList>
          <TabsTrigger value="malware" data-testid="host-tab-malware">
            {t("tabMalware")}
          </TabsTrigger>
          <TabsTrigger value="waf" data-testid="host-tab-waf">
            {t("tabWaf")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="malware" className="space-y-6">
          {items.length === 0 && !sitesQ.isLoading ? (
            <Card data-testid="host-empty">
              <CardContent className="flex min-h-[8rem] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
                <p className="text-sm font-medium text-foreground">
                  {t("empty")}
                </p>
                <p className="max-w-md text-sm text-muted-foreground">
                  {t("emptyHint")}
                </p>
                <Button
                  variant="outline"
                  className="mt-2"
                  data-testid="host-empty-cta"
                  disabled={atCap || agents.length === 0}
                  onClick={() => setOpen(true)}
                >
                  {t("emptyCta")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {items.map((s: HostSite) => (
                <li key={s.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {s.root_path}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid="host-scan"
                          onClick={() => scanMut.mutate(s.id)}
                        >
                          {t("scanNow")}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(t("confirmDelete")))
                              delMut.mutate(s.id);
                          }}
                        >
                          {t("delete")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <div>
            <h2 className="mb-2 text-lg font-medium">{t("hitsTitle")}</h2>
            {(hitsQ.data ?? []).length === 0 ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="host-hits-empty"
              >
                {t("hitsEmpty")}
              </p>
            ) : (
              <Table data-testid="host-hits">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colPath")}</TableHead>
                    <TableHead>{t("colClass")}</TableHead>
                    <TableHead>{t("colEngine")}</TableHead>
                    <TableHead>{t("colStatus")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(hitsQ.data ?? []).map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>{h.rel_path}</TableCell>
                      <TableCell>{h.class}</TableCell>
                      <TableCell>{h.engine}</TableCell>
                      <TableCell>{h.status}</TableCell>
                      <TableCell className="flex flex-wrap gap-2">
                        {(h.status === "open" || h.status === "restored") && (
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid="host-quarantine"
                            onClick={() => qMut.mutate(h.id)}
                          >
                            {t("quarantine")}
                          </Button>
                        )}
                        {h.status === "quarantined" && (
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid="host-restore"
                            onClick={() => rMut.mutate(h.id)}
                          >
                            {t("restore")}
                          </Button>
                        )}
                        {h.status === "open" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            data-testid="host-ignore"
                            onClick={() => iMut.mutate(h.id)}
                          >
                            {t("ignore")}
                          </Button>
                        )}
                        {(h.class === "webshell" || h.class === "backdoor") && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href="/siem">{t("openSiem")}</a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
        <TabsContent value="waf">
          <HostWafPanel sites={items} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
