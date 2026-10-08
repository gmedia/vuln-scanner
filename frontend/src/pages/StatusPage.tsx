import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Radio, FileText, Globe, Layers, Siren } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import {
  OpsShell,
  OpsShellBody,
  OpsShellHead,
} from "@/components/ops/OpsShell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { listMonitors } from "@/api/uptime";
import type { ApiError } from "@/lib/utils";
import { canManageMembers } from "@/api/orgs";
import { useAuthStore } from "@/store/authStore";
import { StatusComponentBoard } from "@/components/status/StatusComponentBoard";
import { StatusCopyRecord } from "@/components/status/StatusCopyRecord";
import { StatusHealthHero } from "@/components/status/StatusHealthHero";
import { StatusIncidentList } from "@/components/status/StatusIncidentList";
import { StatusIncidentSheet } from "@/components/status/StatusIncidentSheet";
import { StatusKpiRow, StatusKpiSkeleton } from "@/components/status/StatusKpiRow";
import {
  HOSTNAME_STATUS_KEYS,
  hostnameRailClass,
  hostnameStatusVariant,
  incidentsListRailClass,
} from "@/components/status/statusChrome";
import { SiemEmptyIsland } from "@/components/siem/SiemEmptyIsland";
import { SiemRail } from "@/components/siem/siemChrome";
import {
  addComponent,
  attachHostname,
  checkHostname,
  createIncident,
  deleteComponent,
  detachHostname,
  getStatusPage,
  patchIncident,
  patchStatusPage,
  replaceHostname,
  upsertStatusPage,
  type StatusIncident,
} from "@/api/statusPage";

function apiDetail(err: unknown, fallback: string): string {
  const detail = (err as ApiError).response?.data?.detail;
  return typeof detail === "string" && detail.trim() ? detail : fallback;
}

type CopyField = "cname" | "txt-name" | "txt-value";

export default function StatusPage() {
  const { t } = useTranslation("statusPage");
  const qc = useQueryClient();
  const organizations = useAuthStore((s) => s.organizations);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const orgRole = organizations.find((o) => o.id === activeOrgId)?.role;
  const canDeleteIncident = canManageMembers(orgRole);
  const pageQ = useQuery({ queryKey: ["status-page"], queryFn: getStatusPage });
  const monQ = useQuery({
    queryKey: ["uptime-monitors"],
    queryFn: listMonitors,
  });
  const page = pageQ.data ?? null;

  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string | null>(null);
  const [host, setHost] = useState<string | null>(null);
  const [monitorId, setMonitorId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [incOpen, setIncOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState<StatusIncident | null>(
    null,
  );
  const [copiedField, setCopiedField] = useState<CopyField | null>(null);

  const slugDraft = editSlug ?? page?.slug ?? "";
  const titleDraft = editTitle ?? page?.title ?? "";
  const hostDraft = host ?? page?.custom_hostname ?? "";

  const invalidate = () => qc.invalidateQueries({ queryKey: ["status-page"] });

  const copyRecord = async (field: CopyField, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1500);
    } catch {
      void 0;
    }
  };

  const createMut = useMutation({
    mutationFn: () => upsertStatusPage({ slug, title }),
    onSuccess: invalidate,
    onError: () => toast.error("Could not save status page"),
  });
  const publishMut = useMutation({
    mutationFn: (published: boolean) => patchStatusPage({ published }),
    onSuccess: invalidate,
  });
  const attachMut = useMutation({
    mutationFn: () => attachHostname(hostDraft.trim()),
    onSuccess: () => {
      setHost(null);
      invalidate();
      toast.success(t("attachHost"));
    },
    onError: (err) => toast.error(apiDetail(err, t("attachHost"))),
  });
  const replaceMut = useMutation({
    mutationFn: () => replaceHostname(hostDraft.trim()),
    onSuccess: () => {
      setHost(null);
      invalidate();
      toast.success(t("updateHost"));
    },
    onError: (err) => toast.error(apiDetail(err, t("updateHost"))),
  });
  const detachMut = useMutation({
    mutationFn: detachHostname,
    onSuccess: () => {
      setHost(null);
      invalidate();
      toast.success(t("detachHost"));
    },
    onError: (err) => toast.error(apiDetail(err, t("detachHost"))),
  });
  const identityMut = useMutation({
    mutationFn: () =>
      patchStatusPage({ slug: slugDraft, title: titleDraft.trim() }),
    onSuccess: () => {
      setEditSlug(null);
      setEditTitle(null);
      invalidate();
      toast.success(t("saveIdentity"));
    },
    onError: (err) => toast.error(apiDetail(err, t("saveIdentity"))),
  });
  const checkMut = useMutation({
    mutationFn: checkHostname,
    onSuccess: () => {
      invalidate();
      toast.success(t("checkHost"));
    },
    onError: (err) => toast.error(apiDetail(err, t("checkHost"))),
  });
  const addCompMut = useMutation({
    mutationFn: () =>
      addComponent({
        monitor_id: monitorId,
        display_name: displayName || "Component",
      }),
    onSuccess: () => {
      setDisplayName("");
      invalidate();
    },
  });
  const delCompMut = useMutation({
    mutationFn: deleteComponent,
    onSuccess: invalidate,
  });
  const incMut = useMutation({
    mutationFn: (payload: {
      title: string;
      impact: string;
      status: string;
      body: string;
    }) => createIncident(payload),
    onSuccess: () => {
      setIncOpen(false);
      setEditingIncident(null);
      invalidate();
    },
  });
  const saveIncMut = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { title: string; impact: string };
    }) => patchIncident(id, payload),
    onSuccess: () => {
      setIncOpen(false);
      setEditingIncident(null);
      invalidate();
    },
  });

  const monitors = monQ.data ?? [];
  const publicHref = useMemo(() => {
    if (!page) return "";
    return `${window.location.origin}${page.public_path}`;
  }, [page]);

  const downCount =
    page?.components.filter((c) => c.state === "down").length ?? 0;
  const upCount = page?.components.filter((c) => c.state === "up").length ?? 0;
  const hostStatusKey = page
    ? HOSTNAME_STATUS_KEYS[page.hostname_status]
    : undefined;

  return (
    <div className="space-y-6" data-testid="status-page">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          page ? (
            <>
              <Button
                variant={page.published ? "outline" : "default"}
                onClick={() => publishMut.mutate(!page.published)}
                data-testid="status-page-publish"
              >
                {page.published ? t("unpublish") : t("publish")}
              </Button>
              <Button variant="outline" asChild>
                <a href={publicHref} target="_blank" rel="noreferrer">
                  {t("openPublic")}
                </a>
              </Button>
            </>
          ) : null
        }
      />

      {pageQ.isLoading && !page ? <StatusKpiSkeleton /> : null}

      {!page && !pageQ.isLoading ? (
        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-muted/40 px-6 py-12 text-center md:min-h-[16rem] md:py-16">
          <Radio className="h-8 w-8 text-muted-foreground" aria-hidden />
          <form
            className="flex w-full max-w-lg flex-col items-center gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate();
            }}
          >
            <div className="space-y-2" data-testid="status-page-empty">
              <p className="text-balance text-sm font-medium text-foreground">
                {t("empty")}
              </p>
              <p className="text-balance text-sm text-muted-foreground">
                {t("emptyHint")}
              </p>
            </div>
            <div className="grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="sp-slug">{t("slug")}</Label>
                <Input
                  id="sp-slug"
                  className="h-10 min-h-10"
                  placeholder={t("slug")}
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="sp-title">{t("pageTitle")}</Label>
                <Input
                  id="sp-title"
                  className="h-10 min-h-10"
                  placeholder={t("pageTitle")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button
              type="submit"
              data-testid="status-page-create"
              className="min-h-11 w-full sm:w-auto"
            >
              {t("emptyCta")}
            </Button>
          </form>
        </div>
      ) : null}

      {page ? (
        <>
          <StatusHealthHero
            title={page.title}
            published={page.published}
            overall={page.overall}
          />

          <StatusKpiRow
            published={page.published}
            publishedLabel={t("visibilityOn")}
            unpublishedLabel={t("visibilityOff")}
            upCount={upCount}
            downCount={downCount}
            publicPath={page.public_path}
            hostnameStatus={page.hostname_status}
            hostnameLabel={
              hostStatusKey ? t(hostStatusKey) : page.hostname_status
            }
          />

          <OpsShell railClass="bg-primary" testid="status-identity-shell">
            <OpsShellHead icon={FileText} title={t("pageIdentity")} />
            <OpsShellBody className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("publicUrlHelp")}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="sp-edit-title">{t("pageTitle")}</Label>
                  <Input
                    id="sp-edit-title"
                    data-testid="status-page-title"
                    className="h-10 min-h-10"
                    placeholder={t("pageTitle")}
                    value={titleDraft}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="sp-edit-slug">{t("slug")}</Label>
                  <Input
                    id="sp-edit-slug"
                    data-testid="status-page-slug"
                    className="h-10 min-h-10"
                    placeholder={t("slug")}
                    value={slugDraft}
                    onChange={(e) => setEditSlug(e.target.value)}
                  />
                </div>
                <div className="flex min-w-0 flex-col justify-end gap-1.5">
                  <Button
                    type="button"
                    className="h-10 min-h-10 w-full"
                    data-testid="status-page-save-slug"
                    disabled={identityMut.isPending || !titleDraft.trim()}
                    onClick={() => identityMut.mutate()}
                  >
                    {t("saveIdentity")}
                  </Button>
                </div>
              </div>
            </OpsShellBody>
          </OpsShell>

          <OpsShell railClass={hostnameRailClass(page.hostname_status)} testid="status-host-shell">
            <OpsShellHead icon={Globe} title={t("customHost")} />
            <OpsShellBody className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="sp-host">{t("customHost")}</Label>
                  <Input
                    id="sp-host"
                    data-testid="status-page-host"
                    className="h-10 min-h-10"
                    value={hostDraft}
                    onChange={(e) => setHost(e.target.value)}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label>{t("hostnameStatus")}</Label>
                  <div className="flex h-10 min-h-10 items-center">
                    <Badge variant={hostnameStatusVariant(page.hostname_status)}>
                      {hostStatusKey ? t(hostStatusKey) : page.hostname_status}
                    </Badge>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("cnameHelp", { target: page.cname_target })}
              </p>
              {page.hostname_status === "pending_txt" ? (
                <div className="relative space-y-3 overflow-hidden rounded-lg border border-primary/40 bg-primary/5 p-3 pl-4 text-sm">
                  <SiemRail className="bg-primary" />
                  <p className="font-medium">{t("txtCard")}</p>
                  {page.custom_hostname ? (
                    <StatusCopyRecord
                      label="CNAME"
                      display={t("cnameRecord", {
                        host: page.custom_hostname,
                        target: page.cname_target,
                      })}
                      testId="status-copy-cname"
                      copied={copiedField === "cname"}
                      onCopy={() => void copyRecord("cname", page.cname_target)}
                      copyLabel={t("copyCname")}
                      copiedLabel={t("copied")}
                    />
                  ) : null}
                  {page.txt_name && page.txt_value ? (
                    <>
                      <StatusCopyRecord
                        label="TXT"
                        display={page.txt_name}
                        testId="status-copy-txt-name"
                        copied={copiedField === "txt-name"}
                        onCopy={() =>
                          void copyRecord("txt-name", page.txt_name ?? "")
                        }
                        copyLabel={t("copyTxtName")}
                        copiedLabel={t("copied")}
                      />
                      <StatusCopyRecord
                        label="TXT"
                        display={page.txt_value}
                        testId="status-copy-txt-value"
                        copied={copiedField === "txt-value"}
                        onCopy={() =>
                          void copyRecord("txt-value", page.txt_value ?? "")
                        }
                        copyLabel={t("copyTxtValue")}
                        copiedLabel={t("copied")}
                      />
                    </>
                  ) : (
                    <p className="text-muted-foreground">{t("txtPending")}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{t("noAaaa")}</p>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {page.custom_hostname ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={replaceMut.isPending || !hostDraft.trim()}
                      onClick={() => replaceMut.mutate()}
                    >
                      {t("updateHost")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={detachMut.isPending}
                      onClick={() => detachMut.mutate()}
                    >
                      {t("detachHost")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={checkMut.isPending}
                      onClick={() => checkMut.mutate()}
                    >
                      {t("checkHost")}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={attachMut.isPending || !hostDraft.trim()}
                    onClick={() => attachMut.mutate()}
                  >
                    {t("attachHost")}
                  </Button>
                )}
              </div>
            </OpsShellBody>
          </OpsShell>

          <OpsShell railClass="bg-primary" testid="status-components-shell">
            <OpsShellHead icon={Layers} title={t("components")} />
            <OpsShellBody className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label>{t("monitor")}</Label>
                  <Select value={monitorId} onValueChange={setMonitorId}>
                    <SelectTrigger className="h-10 min-h-10">
                      <SelectValue placeholder={t("monitor")} />
                    </SelectTrigger>
                    <SelectContent>
                      {monitors.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="sp-dn">{t("displayName")}</Label>
                  <Input
                    id="sp-dn"
                    className="h-10 min-h-10"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="flex min-w-0 flex-col justify-end gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={!monitorId}
                    onClick={() => addCompMut.mutate()}
                  >
                    {t("addComponent")}
                  </Button>
                </div>
              </div>
              <StatusComponentBoard
                components={page.components}
                removing={delCompMut.isPending}
                onRemove={(id) => delCompMut.mutate(id)}
              />
            </OpsShellBody>
          </OpsShell>

          <OpsShell
            testid="status-incidents-shell"
            railClass={incidentsListRailClass(
              page.incidents.map((i) => i.status),
            )}
          >
            <OpsShellHead
              icon={Siren}
              title={t("incidents")}
              aside={
                <Button
                  type="button"
                  size="sm"
                  data-testid="status-incident-add"
                  onClick={() => {
                    if (incOpen) {
                      setEditingIncident(null);
                      setIncOpen(false);
                    } else {
                      setEditingIncident(null);
                      setIncOpen(true);
                    }
                  }}
                >
                  {t("newIncident")}
                </Button>
              }
            />
            <OpsShellBody
              flush={page.incidents.length === 0}
              className={page.incidents.length === 0 ? undefined : "space-y-4"}
            >
              <StatusIncidentSheet
                open={incOpen}
                editing={editingIncident}
                busy={incMut.isPending || saveIncMut.isPending}
                onOpenChange={(next) => {
                  if (!next) {
                    setEditingIncident(null);
                    setIncOpen(false);
                  } else {
                    setIncOpen(true);
                  }
                }}
                onCreate={(payload) => incMut.mutate(payload)}
                onSaveEdit={(payload) => {
                  if (!editingIncident) return;
                  saveIncMut.mutate({ id: editingIncident.id, payload });
                }}
              />
              {page.incidents.length === 0 ? (
                <div className="m-4">
                  <SiemEmptyIsland icon={Radio} title={t("noIncidents")} />
                </div>
              ) : (
                <StatusIncidentList
                  incidents={page.incidents}
                  canDelete={canDeleteIncident}
                  onDone={invalidate}
                  onEdit={(i) => {
                    setEditingIncident(i);
                    setIncOpen(true);
                  }}
                />
              )}
            </OpsShellBody>
          </OpsShell>
          <p className="text-xs text-muted-foreground">{t("disclaimer")}</p>
        </>
      ) : null}
    </div>
  );
}
