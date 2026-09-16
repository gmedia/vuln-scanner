import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { StatusIncident } from "@/api/statusPage";
import { StatusIncidentActions } from "@/components/status/StatusIncidentActions";
import { StatusIncidentQuickUpdate } from "@/components/status/StatusIncidentQuickUpdate";
import {
  formatStartedAt,
  impactBadge,
  statusBadge,
} from "@/components/status/statusIncidentDisplay";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type Panel = "idle" | "update";

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
  const open = incident.status !== "resolved";

  return (
    <div
      className="rounded-lg border border-border bg-card p-3"
      data-testid={`status-incident-card-${incident.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-medium text-foreground">
          {incident.title}
        </p>
        <StatusIncidentActions
          incident={incident}
          canDelete={canDelete}
          testIdPrefix="status-incident"
          onEdit={onEdit}
          onPostUpdate={() => setPanel("update")}
          onDone={onDone}
        />
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
    </div>
  );
}
