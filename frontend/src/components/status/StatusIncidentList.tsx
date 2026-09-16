import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StatusIncident } from "@/api/statusPage";
import { StatusIncidentActions } from "@/components/status/StatusIncidentActions";
import { StatusIncidentCard } from "@/components/status/StatusIncidentCard";
import { StatusIncidentQuickUpdate } from "@/components/status/StatusIncidentQuickUpdate";
import { StatusIncidentUpdates } from "@/components/status/StatusIncidentUpdates";
import {
  formatStartedAt,
  impactBadge,
  statusBadge,
} from "@/components/status/statusIncidentDisplay";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";

export function StatusIncidentList({
  incidents,
  canDelete,
  onDone,
  onEdit,
}: {
  readonly incidents: readonly StatusIncident[];
  readonly canDelete: boolean;
  readonly onDone: () => void;
  readonly onEdit: (incident: StatusIncident) => void;
}) {
  const { t } = useTranslation("statusPage");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  return (
    <>
      <ul
        className="space-y-2 md:hidden"
        data-testid="status-incidents-list-mobile"
      >
        {incidents.map((i) => (
          <li key={i.id}>
            <StatusIncidentCard
              incident={i}
              canDelete={canDelete}
              onDone={onDone}
              onEdit={() => onEdit(i)}
            />
          </li>
        ))}
      </ul>
      <div
        className="hidden overflow-x-auto md:block"
        data-testid="status-incidents-list-desktop"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("incidentTitle")}</TableHead>
              <TableHead>{t("impact")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("colStarted")}</TableHead>
              <TableHead className="text-right">{t("colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents.map((i) => (
              <Fragment key={i.id}>
                <TableRow data-testid={`status-incident-row-${i.id}`}>
                  <TableCell className="font-medium">{i.title}</TableCell>
                  <TableCell>
                    <Badge variant={impactBadge(i.impact)}>{i.impact}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadge(i.status)}>{i.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                    {formatStartedAt(i.started_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end">
                      <StatusIncidentActions
                        incident={i}
                        canDelete={canDelete}
                        testIdPrefix="status-incident-row"
                        onEdit={() => onEdit(i)}
                        onPostUpdate={() => setUpdatingId(i.id)}
                        onDone={onDone}
                      />
                    </div>
                  </TableCell>
                </TableRow>
                {i.updates.length > 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="bg-muted/30">
                      <StatusIncidentUpdates
                        incidentId={i.id}
                        updates={i.updates}
                        testIdPrefix="status-incident-row"
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            ))}
          </TableBody>
        </Table>
        {updatingId ? (
          <div className="border-t border-border p-3">
            <StatusIncidentQuickUpdate
              incidentId={updatingId}
              onDone={() => {
                setUpdatingId(null);
                onDone();
              }}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
