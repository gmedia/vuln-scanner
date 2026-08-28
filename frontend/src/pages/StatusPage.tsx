import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
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
import {
  addComponent,
  addIncidentUpdate,
  createIncident,
  deleteComponent,
  getStatusPage,
  patchStatusPage,
  upsertStatusPage,
  verifyHostname,
} from "@/api/statusPage";

function stateBadgeVariant(state: string | null) {
  if (state === "up") return "completed" as const;
  if (state === "down") return "critical" as const;
  return "info" as const;
}

export default function StatusPage() {
  const { t } = useTranslation("statusPage");
  const qc = useQueryClient();
  const pageQ = useQuery({ queryKey: ["status-page"], queryFn: getStatusPage });
  const monQ = useQuery({
    queryKey: ["uptime-monitors"],
    queryFn: listMonitors,
  });
  const page = pageQ.data ?? null;

  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [host, setHost] = useState("");
  const [monitorId, setMonitorId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [incTitle, setIncTitle] = useState("");
  const [incBody, setIncBody] = useState("");
  const [incImpact, setIncImpact] = useState("minor");
  const [incStatus, setIncStatus] = useState("investigating");

  useEffect(() => {
    if (page?.slug) setEditSlug(page.slug);
  }, [page?.slug]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["status-page"] });

  const createMut = useMutation({
    mutationFn: () => upsertStatusPage({ slug, title }),
    onSuccess: invalidate,
    onError: () => toast.error("Could not save status page"),
  });
  const publishMut = useMutation({
    mutationFn: (published: boolean) => patchStatusPage({ published }),
    onSuccess: invalidate,
  });
  const hostMut = useMutation({
    mutationFn: () => patchStatusPage({ custom_hostname: host || null }),
    onSuccess: invalidate,
  });
  const slugMut = useMutation({
    mutationFn: () => patchStatusPage({ slug: editSlug }),
    onSuccess: () => {
      invalidate();
      toast.success(t("savePublicUrl"));
    },
    onError: () => toast.error("Could not save public URL"),
  });
  const verifyMut = useMutation({
    mutationFn: verifyHostname,
    onSuccess: invalidate,
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
    mutationFn: () =>
      createIncident({
        title: incTitle,
        impact: incImpact,
        status: incStatus,
        body: incBody,
      }),
    onSuccess: () => {
      setIncTitle("");
      setIncBody("");
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {page ? (
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        ) : null}
      </div>

      {!page && (
        <Card>
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
              <p className="text-sm text-muted-foreground" data-testid="status-page-empty">
                {t("empty")}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="sp-slug">{t("slug")}</Label>
                  <Input
                    id="sp-slug"
                    className="h-10 min-h-10"
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
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
              </div>
              <Button type="submit" data-testid="status-page-create" className="min-h-11 w-full sm:w-auto">
                {t("create")}
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
                {t("publicUrl")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("publicUrlHelp")}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="sp-edit-slug">{t("slug")}</Label>
                  <Input
                    id="sp-edit-slug"
                    data-testid="status-page-slug"
                    className="h-10 min-h-10"
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value)}
                  />
                </div>
                <div className="flex min-w-0 flex-col justify-end gap-1.5">
                  <Button
                    type="button"
                    className="h-10 min-h-10 w-full"
                    data-testid="status-page-save-slug"
                    disabled={slugMut.isPending}
                    onClick={() => slugMut.mutate()}
                  >
                    {t("savePublicUrl")}
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
                    className="h-10 min-h-10"
                    value={host || page.custom_hostname || ""}
                    onChange={(e) => setHost(e.target.value)}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label>{t("hostnameStatus")}</Label>
                  <p className="flex h-10 min-h-10 items-center font-mono text-sm text-foreground">
                    {page.hostname_status}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("cnameHelp", { target: page.cname_target })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => hostMut.mutate()}
                >
                  {t("save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => verifyMut.mutate()}
                >
                  {t("verifyDns")}
                </Button>
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
                            variant="outline"
                            size="sm"
                            className="text-destructive"
                            onClick={() => delCompMut.mutate(c.id)}
                          >
                            {t("remove")}
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
            <CardHeader>
              <CardTitle className="text-sm tracking-wide">
                {t("incidents")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex min-w-0 flex-col gap-1.5 lg:col-span-2">
                  <Label htmlFor="sp-inc-title">{t("incidentTitle")}</Label>
                  <Input
                    id="sp-inc-title"
                    className="h-10 min-h-10"
                    value={incTitle}
                    onChange={(e) => setIncTitle(e.target.value)}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label>{t("impact")}</Label>
                  <Select value={incImpact} onValueChange={setIncImpact}>
                    <SelectTrigger className="h-10 min-h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["none", "minor", "major", "critical"].map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label>{t("status")}</Label>
                  <Select value={incStatus} onValueChange={setIncStatus}>
                    <SelectTrigger className="h-10 min-h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "investigating",
                        "identified",
                        "monitoring",
                        "resolved",
                      ].map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
                  <Label htmlFor="sp-inc-body">{t("body")}</Label>
                  <Textarea
                    id="sp-inc-body"
                    value={incBody}
                    onChange={(e) => setIncBody(e.target.value)}
                  />
                </div>
              </div>
              <Button
                type="button"
                disabled={!incTitle || !incBody}
                onClick={() => incMut.mutate()}
              >
                {t("newIncident")}
              </Button>
              {page.incidents.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noIncidents")}</p>
              ) : (
                <ul className="space-y-3">
                  {page.incidents.map((i) => (
                    <li
                      key={i.id}
                      className="rounded-md border border-border bg-card p-4"
                    >
                      <p className="font-medium text-foreground">{i.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {i.status} · {i.impact}
                      </p>
                      <IncidentQuickUpdate
                        incidentId={i.id}
                        onDone={invalidate}
                        addUpdate={addIncidentUpdate}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{t("disclaimer")}</p>
        </>
      )}
    </div>
  );
}

function IncidentQuickUpdate({
  incidentId,
  onDone,
  addUpdate,
}: {
  incidentId: string;
  onDone: () => void;
  addUpdate: typeof addIncidentUpdate;
}) {
  const { t } = useTranslation("statusPage");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("monitoring");
  const mut = useMutation({
    mutationFn: () => addUpdate(incidentId, { body, status }),
    onSuccess: () => {
      setBody("");
      onDone();
    },
  });
  return (
    <div className="mt-3 space-y-2">
      <Label htmlFor={`inc-upd-${incidentId}`}>{t("body")}</Label>
      <Textarea
        id={`inc-upd-${incidentId}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-10 min-h-10 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["investigating", "identified", "monitoring", "resolved"].map(
              (v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={!body}
          onClick={() => mut.mutate()}
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
