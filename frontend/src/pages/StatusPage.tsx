import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
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
  const [host, setHost] = useState("");
  const [monitorId, setMonitorId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [incTitle, setIncTitle] = useState("");
  const [incBody, setIncBody] = useState("");
  const [incImpact, setIncImpact] = useState("minor");
  const [incStatus, setIncStatus] = useState("investigating");

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

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6" data-testid="status-page">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </div>

      {!page && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            createMut.mutate();
          }}
        >
          <p className="text-sm" data-testid="status-page-empty">
            {t("empty")}
          </p>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="sp-slug">{t("slug")}</Label>
            <Input
              id="sp-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="sp-title">{t("pageTitle")}</Label>
            <Input
              id="sp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <Button type="submit" data-testid="status-page-create">
            {t("create")}
          </Button>
        </form>
      )}

      {page && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={page.published ? "outline" : "default"}
              onClick={() => publishMut.mutate(!page.published)}
              data-testid="status-page-publish"
            >
              {page.published ? t("unpublish") : t("publish")}
            </Button>
            <a
              className="text-sm underline"
              href={publicHref}
              target="_blank"
              rel="noreferrer"
            >
              {t("publicUrl")}: {page.public_path}
            </a>
          </div>

          <div className="space-y-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="sp-host">{t("customHost")}</Label>
              <Input
                id="sp-host"
                value={host || page.custom_hostname || ""}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>
            <p className="text-muted-foreground text-sm">
              {t("cnameHelp", { target: page.cname_target })}
            </p>
            <div className="flex gap-2">
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
              <span className="text-muted-foreground self-center text-sm">
                {page.hostname_status}
              </span>
            </div>
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-medium">{t("addComponent")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
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
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              disabled={!monitorId}
              onClick={() => addCompMut.mutate()}
            >
              {t("addComponent")}
            </Button>
            <ul className="divide-border divide-y">
              {page.components.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between py-2"
                >
                  <span>
                    {c.display_name}{" "}
                    <span className="text-muted-foreground text-sm">
                      {c.state}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => delCompMut.mutate(c.id)}
                  >
                    ×
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium">{t("incidents")}</h2>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="sp-inc-title">{t("pageTitle")}</Label>
              <Input
                id="sp-inc-title"
                value={incTitle}
                onChange={(e) => setIncTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
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
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="sp-inc-body">{t("body")}</Label>
              <Textarea
                id="sp-inc-body"
                value={incBody}
                onChange={(e) => setIncBody(e.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={!incTitle || !incBody}
              onClick={() => incMut.mutate()}
            >
              {t("newIncident")}
            </Button>
            <ul className="space-y-4">
              {page.incidents.map((i) => (
                <li key={i.id} className="border-border rounded-md border p-3">
                  <p className="font-medium">{i.title}</p>
                  <p className="text-muted-foreground text-sm">
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
          </section>
          <p className="text-muted-foreground text-xs">{t("disclaimer")}</p>
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
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2">
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
