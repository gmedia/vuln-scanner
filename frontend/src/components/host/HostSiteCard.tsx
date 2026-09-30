import { FolderKanban } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { HostHit, HostScan, HostSite } from "@/api/hostProtect";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import HostHitsList from "@/components/host/HostHitsList";
import { HostLiveDot } from "@/components/host/HostChrome";
import { siteRailClass } from "@/components/host/hostChrome";
import { cn } from "@/lib/utils";
import {
  formatHelperPollAt,
  isHelperPollStale,
} from "@/lib/sinexisInstall";

export type HostSiteCardProps = {
  readonly site: HostSite;
  readonly lastScan: HostScan | undefined;
  readonly helperPollAt: string | null;
  readonly activeHits: readonly HostHit[];
  readonly ignoredHits: readonly HostHit[];
  readonly showIgnored: boolean;
  readonly scanPending: boolean;
  readonly onToggleIgnored: () => void;
  readonly onScan: () => void;
  readonly onDelete: () => void;
  readonly onEnabled: (enabled: boolean) => void;
  readonly onInterval: (scan_interval: "daily" | "hourly") => void;
  readonly onAutoQuarantine: (auto_quarantine: boolean) => void;
  readonly onWatch: (watch_on_write: boolean) => void;
  readonly onQuarantine: (id: string) => void;
  readonly onRestore: (id: string) => void;
  readonly onIgnore: (id: string) => void;
};

export default function HostSiteCard({
  site,
  lastScan,
  helperPollAt,
  activeHits,
  ignoredHits,
  showIgnored,
  scanPending,
  onToggleIgnored,
  onScan,
  onDelete,
  onEnabled,
  onInterval,
  onAutoQuarantine,
  onWatch,
  onQuarantine,
  onRestore,
  onIgnore,
}: HostSiteCardProps) {
  const { t } = useTranslation("host");
  const helperWhen = formatHelperPollAt(helperPollAt);
  const helperStale = isHelperPollStale(helperPollAt);
  const lastCount = lastScan?.hit_count ?? 0;
  const siteHits = showIgnored
    ? [...activeHits, ...ignoredHits]
    : activeHits;
  const emptyHitsCopy =
    lastScan?.status === "queued"
      ? t("hitsWaitingAgent")
      : lastScan?.status === "failed"
        ? t("hitsUnreachable")
        : helperStale
          ? t("hitsUnreachable")
          : lastScan?.status === "completed" &&
              activeHits.length === 0 &&
              ignoredHits.length > 0
            ? t("hitsHidden")
            : lastScan?.status === "completed" &&
                activeHits.length === 0 &&
                ignoredHits.length === 0
              ? t("hitsClean")
              : t("hitsEmpty");
  const scanStatusCopy =
    lastScan?.status === "queued"
      ? t("scanQueued")
      : lastScan?.status === "failed"
        ? t("scanFailed", { error: lastScan.error || "failed" })
        : lastScan?.status === "completed" && lastCount === 0 && helperStale
          ? t("hitsUnreachable")
          : lastScan?.status === "completed" && activeHits.length > 0
            ? t("scanCompleted", { count: activeHits.length })
            : lastScan?.status === "completed" &&
                activeHits.length === 0 &&
                ignoredHits.length > 0
              ? t("scanCompletedIgnored", { count: ignoredHits.length })
              : lastScan?.status === "completed"
                ? t("scanCompletedNone")
                : null;
  const needsDecision = activeHits.length > 0;
  const isWaiting = lastScan?.status === "queued";
  const isFailed = lastScan?.status === "failed";
  const completed = lastScan?.status === "completed";
  const railOpts = {
    needsDecision,
    waiting: isWaiting,
    failed: isFailed,
    helperStale,
    completed,
  };
  const siteBadgeVariant = needsDecision
    ? ("critical" as const)
    : isWaiting
      ? ("running" as const)
      : isFailed || helperStale
        ? ("failed" as const)
        : completed
          ? ("completed" as const)
          : ("pending" as const);
  const siteBadgeLabel = scanStatusCopy ?? emptyHitsCopy;

  return (
    <Card
      data-testid={`host-site-card-${site.id}`}
      className={cn(
        "relative overflow-hidden",
        needsDecision && "bg-destructive/[0.03]",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-2 left-0 w-0.5 rounded-full",
          siteRailClass(railOpts),
        )}
        aria-hidden
      />
      <CardHeader className="space-y-3 pl-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40"
                aria-hidden
              >
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
              </span>
              <CardTitle className="text-base leading-tight">
                {site.name}
              </CardTitle>
              {isWaiting ? <HostLiveDot tone="info" /> : null}
              {needsDecision ? <HostLiveDot tone="destructive" /> : null}
              <Badge
                variant={siteBadgeVariant}
                data-testid={`host-site-badge-${site.id}`}
              >
                {siteBadgeLabel}
              </Badge>
              {activeHits.length > 0 ? (
                <Badge variant="critical">
                  {activeHits.length} {t("overviewFilesSuffix")}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">
              {site.root_path}
            </p>
            <p
              className="mt-1 break-all font-mono text-xs text-muted-foreground"
              data-testid="host-site-id"
            >
              {t("siteId")}: {site.id}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="host-copy-site-id"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(site.id)
                    .then(() => toast.success(t("copySiteIdOk")))
                    .catch(() => toast.error(t("copySiteIdFail")));
                }}
              >
                {t("copySiteId")}
              </Button>
              <span
                className={
                  helperStale
                    ? "text-xs font-medium text-destructive"
                    : "text-xs text-muted-foreground"
                }
                data-testid="host-helper-poll"
              >
                {helperWhen
                  ? helperStale
                    ? t("helperStale", { when: helperWhen })
                    : t("helperPolled", { when: helperWhen })
                  : t("helperNeverPolled")}
              </span>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:shrink-0">
            <Button
              size="sm"
              className="w-full min-h-11 sm:min-h-10 sm:flex-1 lg:w-auto"
              data-testid="host-scan"
              disabled={scanPending}
              onClick={onScan}
            >
              {t("scanNow")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full min-h-11 text-destructive hover:text-destructive sm:min-h-10 sm:flex-1 lg:w-auto"
              onClick={() => {
                if (window.confirm(t("confirmDelete"))) onDelete();
              }}
            >
              {t("delete")}
            </Button>
          </div>
        </div>
        {scanStatusCopy ? (
          <p
            className="max-w-prose text-xs text-muted-foreground"
            data-testid="host-scan-status"
          >
            {scanStatusCopy}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 pl-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`host-enabled-${site.id}`}>{t("siteEnabled")}</Label>
            <Select
              value={site.enabled ? "on" : "off"}
              onValueChange={(v) => onEnabled(v === "on")}
            >
              <SelectTrigger
                id={`host-enabled-${site.id}`}
                data-testid="host-enabled-existing"
                aria-label={t("siteEnabled")}
                className="h-10 min-h-10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on">{t("siteEnabledOn")}</SelectItem>
                <SelectItem value="off">{t("siteEnabledOff")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("siteEnabledHint")}</p>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`host-interval-${site.id}`}>{t("scanInterval")}</Label>
            <Select
              value={site.scan_interval ?? "daily"}
              onValueChange={(v) => onInterval(v as "daily" | "hourly")}
            >
              <SelectTrigger
                id={`host-interval-${site.id}`}
                data-testid="host-interval-existing"
                aria-label={t("scanInterval")}
                className="h-10 min-h-10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{t("intervalDaily")}</SelectItem>
                <SelectItem value="hourly">{t("intervalHourly")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("intervalHint")}</p>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`host-auto-quarantine-${site.id}`}>
              {t("autoQuarantine")}
            </Label>
            <Select
              value={site.auto_quarantine ? "on" : "off"}
              onValueChange={(v) => onAutoQuarantine(v === "on")}
            >
              <SelectTrigger
                id={`host-auto-quarantine-${site.id}`}
                data-testid="host-auto-quarantine-existing"
                aria-label={t("autoQuarantine")}
                className="h-10 min-h-10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">{t("autoQuarantineOff")}</SelectItem>
                <SelectItem value="on">{t("autoQuarantineOn")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("autoQuarantineHint")}
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`host-watch-${site.id}`}>{t("watchTitle")}</Label>
            <Select
              value={(site.watch_on_write ?? false) ? "on" : "off"}
              onValueChange={(v) => onWatch(v === "on")}
            >
              <SelectTrigger
                id={`host-watch-${site.id}`}
                data-testid="host-watch-existing"
                aria-label={t("watchTitle")}
                className="h-10 min-h-10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">{t("watchOff")}</SelectItem>
                <SelectItem value="on">{t("watchOn")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("watchHint")}</p>
          </div>
        </div>
      </CardContent>
      <CardContent className="pl-5 pt-0">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium tracking-wide">{t("hitsTitle")}</p>
          {ignoredHits.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              data-testid="host-show-ignored"
              onClick={onToggleIgnored}
            >
              {showIgnored ? t("hideIgnored") : t("showIgnored")}
            </Button>
          ) : null}
        </div>
        {siteHits.length === 0 ? (
          <div
            className="flex min-h-[6rem] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center"
            data-testid="host-hits-empty"
          >
            <p className="max-w-prose text-sm text-muted-foreground">
              {emptyHitsCopy}
            </p>
          </div>
        ) : (
          <HostHitsList
            hits={siteHits}
            onQuarantine={onQuarantine}
            onRestore={onRestore}
            onIgnore={onIgnore}
          />
        )}
      </CardContent>
    </Card>
  );
}
