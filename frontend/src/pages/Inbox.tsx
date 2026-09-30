import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Activity,
  Inbox as InboxIcon,
  Mail,
  ScanSearch,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/Pagination";
import PageHeader from "@/components/layout/PageHeader";
import { inboxApi, type InboxItem } from "@/api/inbox";
import { useTranslation } from "react-i18next";
import { htmlLang, isAppLocale } from "@/i18n/locales";
import i18n from "@/i18n";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const KIND_ALL = "all";
const STATUS_ALL = "all";
const KINDS = ["scan_diff", "uptime", "host_protect", "host_waf"] as const;

function formatTime(iso: string): string {
  const lng = isAppLocale(i18n.language) ? htmlLang(i18n.language) : "id";
  return new Date(iso).toLocaleString(lng === "en" ? "en-US" : "id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ScanJobLink({ jobId, label }: { jobId: string; label: string }) {
  return (
    <Button
      asChild
      variant="link"
      size="sm"
      className="h-auto min-h-11 px-0 text-xs sm:min-h-0"
    >
      <Link to={`/scan/${jobId}`} data-testid="inbox-job-link">
        {label}
      </Link>
    </Button>
  );
}

function kindLabel(kind: string, t: (k: string) => string): string {
  const map: Record<string, string> = {
    scan_diff: t("kindScanDiff"),
    uptime: t("kindUptime"),
    host_protect: t("kindHostProtect"),
    host_waf: t("kindHostWaf"),
  };
  return map[kind] ?? kind;
}

const STATUS_FALLBACK = {
  statusBounced: "Bounced",
  statusComplained: "Complained",
} as const;

function statusLabel(status: string, t: (k: string) => string): string {
  switch (status) {
    case "sent":
      return t("statusSent");
    case "failed":
      return t("statusFailed");
    case "bounced": {
      const v = t("statusBounced");
      return v === "statusBounced" ? STATUS_FALLBACK.statusBounced : v;
    }
    case "complained": {
      const v = t("statusComplained");
      return v === "statusComplained" ? STATUS_FALLBACK.statusComplained : v;
    }
    default:
      return status;
  }
}

function statusVariant(
  status: string,
): "completed" | "failed" | "high" | "medium" {
  switch (status) {
    case "sent":
      return "completed";
    case "bounced":
      return "high";
    case "complained":
      return "medium";
    default:
      return "failed";
  }
}

function statusRailClass(status: string): string {
  switch (status) {
    case "sent":
      return "bg-primary";
    case "bounced":
      return "bg-orange-500";
    case "complained":
      return "bg-yellow-500";
    default:
      return "bg-destructive";
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "failed":
      return "text-[11px] text-red-700 dark:text-red-400";
    case "bounced":
      return "text-[11px] text-orange-800 dark:text-orange-400";
    case "complained":
      return "text-[11px] text-yellow-800 dark:text-yellow-400";
    default:
      return "text-[11px]";
  }
}

function KindGlyph({ kind }: { kind: string }) {
  const cls = "h-3.5 w-3.5 shrink-0 text-muted-foreground";
  switch (kind) {
    case "scan_diff":
      return <ScanSearch className={cls} aria-hidden />;
    case "uptime":
      return <Activity className={cls} aria-hidden />;
    case "host_protect":
      return <Shield className={cls} aria-hidden />;
    case "host_waf":
      return <ShieldAlert className={cls} aria-hidden />;
    default:
      return <Mail className={cls} aria-hidden />;
  }
}

function InboxRow({
  row,
  t,
}: {
  row: InboxItem;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const problem = row.status !== "sent";
  return (
    <article
      data-testid="inbox-row"
      className={cn(
        "relative grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:py-2.5",
        "border-b border-border last:border-b-0",
        problem
          ? "bg-destructive/[0.04] hover:bg-destructive/[0.07]"
          : "hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-2 left-0 w-0.5 rounded-full",
          statusRailClass(row.status),
        )}
        aria-hidden
      />
      <div className="min-w-0 pl-3">
        <p className="truncate font-mono text-sm text-foreground">
          {row.recipient_masked}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground sm:mt-1">
          <span className="inline-flex items-center gap-1">
            <KindGlyph kind={row.kind} />
            <span className="text-foreground">{kindLabel(row.kind, t)}</span>
          </span>
          <span aria-hidden className="hidden text-border sm:inline">
            ·
          </span>
          <time dateTime={row.created_at} className="font-mono tabular-nums">
            {formatTime(row.created_at)}
          </time>
          <span aria-hidden className="text-border">
            ·
          </span>
          <span className="font-mono tabular-nums">
            {t("attemptsCount", { count: row.attempts })}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-3 sm:justify-end sm:pl-0">
        <Badge
          variant={statusVariant(row.status)}
          className={statusBadgeClass(row.status)}
        >
          {statusLabel(row.status, t)}
        </Badge>
        {row.kind === "scan_diff" && row.job_id ? (
          <ScanJobLink jobId={row.job_id} label={t("openScan")} />
        ) : null}
      </div>
    </article>
  );
}

function Inbox() {
  const { t } = useTranslation("inbox");
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState(KIND_ALL);
  const [status, setStatus] = useState(STATUS_ALL);

  const { data, isLoading } = useQuery({
    queryKey: ["inbox", page, kind, status],
    queryFn: () =>
      inboxApi.list({
        page,
        page_size: PAGE_SIZE,
        kind: kind === KIND_ALL ? undefined : kind,
        status: status === STATUS_ALL ? undefined : status,
      }),
    placeholderData: keepPreviousData,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);
  const filtered = kind !== KIND_ALL || status !== STATUS_ALL;
  const emptyTitle = filtered ? t("emptyFiltered") : t("empty");
  const emptyHint = filtered ? t("emptyFilteredHint") : t("emptyHint");

  let listBody: ReactNode;
  if (isLoading && !data) {
    listBody = (
      <div className="px-4 py-4">
        <TableRowSkeleton rows={5} />
      </div>
    );
  } else if (!data || data.items.length === 0) {
    listBody = (
      <div
        className="m-4 flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center"
        data-testid="inbox-empty"
      >
        <InboxIcon className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-foreground">{emptyTitle}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{emptyHint}</p>
      </div>
    );
  } else {
    listBody = (
      <>
        <div role="list">
          {data.items.map((row: InboxItem) => (
            <InboxRow key={row.id} row={row} t={t} />
          ))}
        </div>
        {totalPages > 1 ? (
          <Pagination
            className="border-t border-border px-4 py-3"
            data-testid="inbox-pagination"
          >
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-disabled={page <= 1}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="px-2 font-mono text-xs tabular-nums text-muted-foreground">
                  {page}/{totalPages}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    setPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={page >= totalPages}
                  aria-disabled={page >= totalPages}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </>
    );
  }

  return (
    <div className="w-full space-y-6" data-testid="inbox-page">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          data && data.total > 0 ? (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {t("totalCount", { count: data.total })}
            </span>
          ) : null
        }
      />

      <div
        data-testid="inbox-filters"
        className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="inbox-kind">{t("kind")}</Label>
          <Select
            value={kind}
            onValueChange={(v) => {
              setKind(v);
              setPage(1);
            }}
          >
            <SelectTrigger
              id="inbox-kind"
              className="h-10 min-h-10"
              aria-label={t("kind")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={KIND_ALL}>{t("all")}</SelectItem>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {kindLabel(k, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="inbox-status">{t("status")}</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger
              id="inbox-status"
              className="h-10 min-h-10"
              aria-label={t("status")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={STATUS_ALL}>{t("all")}</SelectItem>
              <SelectItem value="sent">{t("statusSent")}</SelectItem>
              <SelectItem value="failed">{t("statusFailed")}</SelectItem>
              <SelectItem value="bounced">
                {statusLabel("bounced", t)}
              </SelectItem>
              <SelectItem value="complained">
                {statusLabel("complained", t)}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border pb-4">
          <CardTitle className="text-sm tracking-wide">{t("card")}</CardTitle>
          {data && data.total > 0 ? (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              {t("totalCount", { count: data.total })}
            </span>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">{listBody}</CardContent>
      </Card>
    </div>
  );
}

export default Inbox;
