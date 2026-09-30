import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { HostHit } from "@/api/hostProtect";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  hitClassVariant,
  hitRailClass,
  hitStatusVariant,
} from "@/components/host/hostChrome";
import { cn } from "@/lib/utils";

export type HostHitsListProps = {
  readonly hits: readonly HostHit[];
  readonly onQuarantine: (id: string) => void;
  readonly onRestore: (id: string) => void;
  readonly onIgnore: (id: string) => void;
};

function hitStatusLabel(
  status: string,
  t: (k: string) => string,
): string {
  if (status === "pending_quarantine") return t("statusPendingQuarantine");
  if (status === "pending_restore") return t("statusPendingRestore");
  if (status === "ignored") return t("statusIgnored");
  return status;
}

function HitActions({
  hit,
  desktop,
  onQuarantine,
  onRestore,
  onIgnore,
  t,
}: {
  readonly hit: HostHit;
  readonly desktop: boolean;
  readonly onQuarantine: (id: string) => void;
  readonly onRestore: (id: string) => void;
  readonly onIgnore: (id: string) => void;
  readonly t: (k: string) => string;
}) {
  const wrap = desktop
    ? "flex flex-wrap gap-2"
    : "mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap";
  const full = desktop ? undefined : "w-full sm:w-auto";
  return (
    <div className={wrap}>
      {(hit.status === "open" || hit.status === "restored") && (
        <Button
          size="sm"
          variant="outline"
          className={full}
          data-testid={desktop ? "host-quarantine" : `host-quarantine-m-${hit.id}`}
          onClick={() => onQuarantine(hit.id)}
        >
          {t("quarantine")}
        </Button>
      )}
      {hit.status === "quarantined" && (
        <Button
          size="sm"
          variant="outline"
          className={full}
          data-testid={desktop ? "host-restore" : `host-restore-m-${hit.id}`}
          onClick={() => onRestore(hit.id)}
        >
          {t("restore")}
        </Button>
      )}
      {hit.status === "open" && (
        <Button
          size="sm"
          variant="ghost"
          className={full}
          data-testid={desktop ? "host-ignore" : `host-ignore-m-${hit.id}`}
          onClick={() => onIgnore(hit.id)}
        >
          {t("ignore")}
        </Button>
      )}
      {(hit.class === "webshell" || hit.class === "backdoor") && (
        <Button size="sm" variant="ghost" className={full} asChild>
          <Link to="/guard">{t("openGuard")}</Link>
        </Button>
      )}
    </div>
  );
}

export default function HostHitsList({
  hits,
  onQuarantine,
  onRestore,
  onIgnore,
}: HostHitsListProps) {
  const { t } = useTranslation("host");
  return (
    <div data-testid="host-hits">
      <div className="space-y-2 md:hidden">
        {hits.map((h) => (
          <div
            key={h.id}
            className={cn(
              "relative rounded-lg border border-border bg-card p-3",
              (h.class === "webshell" || h.class === "backdoor") &&
                "bg-destructive/[0.04]",
            )}
          >
            <span
              className={cn(
                "absolute inset-y-2 left-0 w-0.5 rounded-full",
                hitRailClass(h.status, h.class),
              )}
              aria-hidden
            />
            <p className="min-w-0 break-all pl-3 font-mono text-xs font-medium text-foreground">
              {h.rel_path}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-3">
              <Badge variant={hitClassVariant(h.class)}>{h.class}</Badge>
              <Badge variant="default" className="font-mono">
                {h.engine}
              </Badge>
              <Badge variant={hitStatusVariant(h.status)}>
                {hitStatusLabel(h.status, t)}
              </Badge>
            </div>
            <div className="pl-3">
              <HitActions
                hit={h}
                desktop={false}
                onQuarantine={onQuarantine}
                onRestore={onRestore}
                onIgnore={onIgnore}
                t={t}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%] text-[10px] uppercase tracking-wider">
                  {t("colPath")}
                </TableHead>
                <TableHead className="w-[15%] text-[10px] uppercase tracking-wider">
                  {t("colClass")}
                </TableHead>
                <TableHead className="w-[15%] text-[10px] uppercase tracking-wider">
                  {t("colEngine")}
                </TableHead>
                <TableHead className="w-[15%] text-[10px] uppercase tracking-wider">
                  {t("colStatus")}
                </TableHead>
                <TableHead className="w-[15%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {hits.map((h) => (
                <TableRow
                  key={h.id}
                  className={cn(
                    "h-12 hover:bg-muted/50",
                    (h.class === "webshell" || h.class === "backdoor") &&
                      "border-l-2 border-l-destructive bg-destructive/[0.04]",
                    h.status === "open" &&
                      h.class !== "webshell" &&
                      h.class !== "backdoor" &&
                      "border-l-2 border-l-destructive",
                    h.status === "quarantined" &&
                      "border-l-2 border-l-primary/50",
                  )}
                >
                  <TableCell className="break-all font-mono text-xs">
                    {h.rel_path}
                  </TableCell>
                  <TableCell>
                    <Badge variant={hitClassVariant(h.class)}>{h.class}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="default" className="font-mono">
                      {h.engine}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={hitStatusVariant(h.status)}>
                      {hitStatusLabel(h.status, t)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <HitActions
                      hit={h}
                      desktop
                      onQuarantine={onQuarantine}
                      onRestore={onRestore}
                      onIgnore={onIgnore}
                      t={t}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
