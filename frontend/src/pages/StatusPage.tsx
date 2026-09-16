import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Copy, Trash2 } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
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
import { listMonitors } from "@/api/uptime";
import type { ApiError } from "@/lib/utils";
import { canManageMembers } from "@/api/orgs";
import { useAuthStore } from "@/store/authStore";
import { StatusIncidentList } from "@/components/status/StatusIncidentList";
import { StatusIncidentSheet } from "@/components/status/StatusIncidentSheet";
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

function stateBadgeVariant(state: string | null) {
  if (state === "up") return "completed" as const;
  if (state === "down") return "critical" as const;
  return "info" as const;
}

const HOSTNAME_STATUS_KEYS: Record<string, string> = {
  pending_txt: "statusPendingTxt",
  active: "statusActive",
  failed: "statusFailed",
  none: "statusNone",
};

function hostnameStatusVariant(status: string) {
  if (status === "active") return "completed" as const;
  if (status === "failed") return "failed" as const;
  if (status === "pending_txt") return "pending" as const;
  return "info" as const;
}

type CopyField = "cname" | "txt-name" | "txt-value";

function CopyRecordRow({
  label,
  display,
  testId,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  display: string;
  testId: string;
  copied: boolean;
  onCopy: () => void;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 break-all font-mono text-xs text-foreground">
          {display}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-11 w-11 shrink-0 p-0"
        data-testid={testId}
        onClick={onCopy}
        title={copied ? copiedLabel : copyLabel}
        aria-label={copied ? copiedLabel : copyLabel}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}

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

      {!page && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-sm tracking-wide">{t("create")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate();
              }}
            >
              <div
                className="space-y-2"
                data-testid="status-page-empty"
              >
                <p className="text-sm font-medium text-foreground">{t("empty")}</p>
                <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <Button type="submit" data-testid="status-page-create" className="min-h-11 w-full sm:w-auto">
                {t("emptyCta")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {page && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("statPublished")}
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {page.published ? t("visibilityOn") : t("visibilityOff")}
              </p>
            </div>
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("statComponents")}
              </p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
                {upCount} {t("stateUp")} · {downCount} {t("stateDown")}
              </p>
            </div>
            <div className="rounded-md border border-border bg-card px-4 py-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("publicUrl")}
              </p>
              <p className="mt-1 truncate font-mono text-sm text-foreground">
                {page.public_path}
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm tracking-wide">
                {t("pageIdentity")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm tracking-wide">
                {t("customHost")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                      {HOSTNAME_STATUS_KEYS[page.hostname_status]
                        ? t(HOSTNAME_STATUS_KEYS[page.hostname_status])
                        : page.hostname_status}
                    </Badge>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("cnameHelp", { target: page.cname_target })}
              </p>
              {page.hostname_status === "pending_txt" ? (
                <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">{t("txtCard")}</p>
                  {page.custom_hostname ? (
                    <CopyRecordRow
                      label="CNAME"
                      display={t("cnameRecord", {
                        host: page.custom_hostname,
                        target: page.cname_target,
                      })}
                      testId="status-copy-cname"
                      copied={copiedField === "cname"}
                      onCopy={() =>
                        void copyRecord("cname", page.cname_target)
                      }
                      copyLabel={t("copyCname")}
                      copiedLabel={t("copied")}
                    />
                  ) : null}
                  {page.txt_name && page.txt_value ? (
                    <>
                      <CopyRecordRow
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
                      <CopyRecordRow
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm tracking-wide">
                {t("components")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
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
              {page.components.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noComponents")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("displayName")}</TableHead>
                      <TableHead>{t("status")}</TableHead>
                      <TableHead className="text-right">{t("colActions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.components.map((c) => (
                      <TableRow
                        key={c.id}
                        className={
                          c.state === "down"
                            ? "border-l-2 border-l-destructive"
                            : undefined
                        }
                      >
                        <TableCell className="font-medium">
                          {c.display_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant={stateBadgeVariant(c.state)}>
                            {c.state ?? t("stateUnknown")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-11 w-11 min-h-11 min-w-11 p-0 md:h-9 md:w-9 md:min-h-9 md:min-w-9"
                            data-testid={`status-component-remove-${c.id}`}
                            aria-label={t("remove")}
                            disabled={delCompMut.isPending}
                            onClick={() => delCompMut.mutate(c.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm tracking-wide">
                {t("incidents")}
              </CardTitle>
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
            </CardHeader>
            <CardContent className="space-y-4">
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
                <p className="text-sm text-muted-foreground">{t("noIncidents")}</p>
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
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{t("disclaimer")}</p>
        </>
      )}
    </div>
  );
}
