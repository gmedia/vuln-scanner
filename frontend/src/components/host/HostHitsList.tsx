import { useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HostHit } from "@/api/hostProtect";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SiemRail } from "@/components/siem/siemChrome";
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
    ? "flex flex-wrap justify-end gap-2"
    : "mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end";
  const full = desktop ? undefined : "w-full sm:w-auto";
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const showMenu =
    hit.status === "open" ||
    hit.class === "webshell" ||
    hit.class === "backdoor";
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
      {showMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className={
                desktop
                  ? "h-9 w-9 p-0"
                  : "h-11 w-11 min-h-11 min-w-11 p-0"
              }
              data-testid={desktop ? "host-actions" : `host-actions-m-${hit.id}`}
              aria-label={t("actionsMenu")}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {hit.status === "open" ? (
              <DropdownMenuItem
                variant="destructive"
                data-testid={desktop ? "host-ignore" : `host-ignore-m-${hit.id}`}
                onSelect={() => setIgnoreOpen(true)}
              >
                {t("ignore")}
              </DropdownMenuItem>
            ) : null}
            {hit.class === "webshell" || hit.class === "backdoor" ? (
              <DropdownMenuItem asChild>
                <Link to="/guard">{t("openGuard")}</Link>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <AlertDialog open={ignoreOpen} onOpenChange={setIgnoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ignoreConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("ignoreConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              data-testid={
                desktop ? "host-ignore-confirm" : `host-ignore-confirm-m-${hit.id}`
              }
              onClick={() => onIgnore(hit.id)}
            >
              {t("ignore")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
              "relative overflow-hidden rounded-lg border border-border bg-card p-3 pl-4",
              (h.class === "webshell" || h.class === "backdoor") &&
                "bg-destructive/[0.04]",
            )}
          >
            <SiemRail className={hitRailClass(h.class)} />
            <p className="min-w-0 break-all font-mono text-xs font-medium text-foreground">
              {h.rel_path}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant={hitClassVariant(h.class)}>{h.class}</Badge>
              <Badge variant="default" className="font-mono">
                {h.engine}
              </Badge>
              <Badge variant={hitStatusVariant(h.status)}>
                {hitStatusLabel(h.status, t)}
              </Badge>
            </div>
            <div>
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
                      "bg-destructive/[0.04]",
                  )}
                >
                  <TableCell className="relative break-all pl-4 font-mono text-xs">
                    <SiemRail className={hitRailClass(h.class)} />
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
                  <TableCell className="text-right">
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
