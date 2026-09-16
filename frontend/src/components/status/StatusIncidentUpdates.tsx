import { useTranslation } from "react-i18next";
import type { StatusIncidentUpdate } from "@/api/statusPage";
import {
  formatStartedAt,
  statusBadge,
} from "@/components/status/statusIncidentDisplay";
import { Badge } from "@/components/ui/Badge";

export function StatusIncidentUpdates({
  incidentId,
  updates,
  testIdPrefix,
}: {
  readonly incidentId: string;
  readonly updates: readonly StatusIncidentUpdate[];
  readonly testIdPrefix: string;
}) {
  const { t } = useTranslation("statusPage");
  if (updates.length === 0) {
    return null;
  }
  return (
    <div
      className="mt-3 space-y-3 border-t border-border pt-3"
      data-testid={`${testIdPrefix}-updates-${incidentId}`}
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {t("updates")}
      </p>
      {updates.map((update) => (
        <div
          key={update.id}
          className="border-l-2 border-border pl-3"
          data-testid={`${testIdPrefix}-update-${update.id}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">
              {formatStartedAt(update.created_at)}
            </span>
            <Badge variant={statusBadge(update.status)}>{update.status}</Badge>
          </div>
          <p className="mt-1 break-words text-sm text-foreground">{update.body}</p>
        </div>
      ))}
    </div>
  );
}
