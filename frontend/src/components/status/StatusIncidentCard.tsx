import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { deleteIncident, type StatusIncident } from "@/api/statusPage";
import { StatusIncidentQuickUpdate } from "@/components/status/StatusIncidentQuickUpdate";
import { htmlLang, isAppLocale } from "@/i18n/locales";
import i18n from "@/i18n";
import type { ApiError } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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

type Panel = "idle" | "update";

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
  onEdit,
}: {
  readonly incident: StatusIncident;
  readonly canDelete: boolean;
  readonly onDone: () => void;
  readonly onEdit: () => void;
}) {
  const { t } = useTranslation("statusPage");
  const [panel, setPanel] = useState<Panel>("idle");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const open = incident.status !== "resolved";

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
              onSelect={onEdit}
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
