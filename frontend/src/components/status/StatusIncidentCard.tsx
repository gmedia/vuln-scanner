import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { deleteIncident, patchIncident, type StatusIncident } from "@/api/statusPage";
import { StatusIncidentQuickUpdate } from "@/components/status/StatusIncidentQuickUpdate";
import { htmlLang, isAppLocale } from "@/i18n/locales";
import i18n from "@/i18n";
import type { ApiError } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const IMPACTS = ["none", "minor", "major", "critical"] as const;

type Panel = "idle" | "edit" | "update";

function apiDetail(err: unknown, fallback: string): string {
  const detail = (err as ApiError).response?.data?.detail;
  return typeof detail === "string" && detail.trim() ? detail : fallback;
}

function formatStartedAt(iso: string): string {
  const lng = isAppLocale(i18n.language) ? htmlLang(i18n.language) : "id";
  return new Date(iso).toLocaleString(lng === "en" ? "en-US" : "id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function impactBadge(impact: string) {
  if (impact === "critical") return "critical" as const;
  if (impact === "major") return "high" as const;
  if (impact === "minor") return "medium" as const;
  return "info" as const;
}

function statusBadge(status: string) {
  if (status === "resolved") return "completed" as const;
  if (status === "investigating") return "pending" as const;
  if (status === "identified") return "high" as const;
  return "info" as const;
}

export function StatusIncidentCard({
  incident,
  canDelete,
  onDone,
}: {
  readonly incident: StatusIncident;
  readonly canDelete: boolean;
  readonly onDone: () => void;
}) {
  const { t } = useTranslation("statusPage");
  const [panel, setPanel] = useState<Panel>("idle");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [title, setTitle] = useState(incident.title);
  const [impact, setImpact] = useState(incident.impact);
  const open = incident.status !== "resolved";

  const saveMut = useMutation({
    mutationFn: () =>
      patchIncident(incident.id, { title: title.trim(), impact }),
    onSuccess: () => {
      setPanel("idle");
      onDone();
    },
    onError: (err) => toast.error(apiDetail(err, t("saveIncident"))),
  });
  const delMut = useMutation({
    mutationFn: () => deleteIncident(incident.id),
    onSuccess: onDone,
    onError: (err) => toast.error(apiDetail(err, t("deleteIncident"))),
  });

  return (
    <div
      className="rounded-lg border border-border bg-card p-3"
      data-testid={`status-incident-card-${incident.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-medium text-foreground">
          {incident.title}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 w-11 min-h-11 min-w-11 shrink-0 p-0 md:h-9 md:w-9 md:min-h-9 md:min-w-9"
              data-testid={`status-incident-menu-${incident.id}`}
              aria-label={t("actionsMenu")}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              data-testid={`status-incident-edit-${incident.id}`}
              onSelect={() => {
                setTitle(incident.title);
                setImpact(incident.impact);
                setPanel("edit");
              }}
            >
              {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid={`status-incident-update-${incident.id}`}
              onSelect={() => setPanel("update")}
            >
              {t("postUpdate")}
            </DropdownMenuItem>
            {canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  data-testid={`status-incident-delete-${incident.id}`}
                  onSelect={() => setDeleteOpen(true)}
                >
                  {t("deleteIncident")}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant={impactBadge(incident.impact)}>{incident.impact}</Badge>
        <Badge variant={statusBadge(incident.status)}>{incident.status}</Badge>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">
          {formatStartedAt(incident.started_at)}
        </span>
        {open ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid={`status-incident-post-update-${incident.id}`}
            onClick={() => setPanel("update")}
          >
            {t("postUpdate")}
          </Button>
        ) : null}
      </div>
      {panel === "edit" ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={`inc-title-${incident.id}`}>
                {t("incidentTitle")}
              </Label>
              <Input
                id={`inc-title-${incident.id}`}
                data-testid={`status-incident-title-${incident.id}`}
                className="h-10 min-h-10"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label>{t("impact")}</Label>
              <Select value={impact} onValueChange={setImpact}>
                <SelectTrigger className="h-10 min-h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMPACTS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              data-testid={`status-incident-save-${incident.id}`}
              disabled={!title.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {t("saveIncident")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPanel("idle")}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {panel === "update" ? (
        <StatusIncidentQuickUpdate
          incidentId={incident.id}
          onDone={() => {
            setPanel("idle");
            onDone();
          }}
        />
      ) : null}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteIncident")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteIncidentConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid={`status-incident-delete-confirm-${incident.id}`}
              onClick={() => delMut.mutate()}
            >
              {t("deleteIncident")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
