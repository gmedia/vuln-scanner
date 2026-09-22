import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Inbox as InboxIcon } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
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
    <Button asChild variant="link" size="sm" className="h-auto min-h-0 px-0 text-xs">
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

function statusVariant(status: string): "completed" | "failed" {
  return status === "sent" ? "completed" : "failed";
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

  return (
    <div className="w-full space-y-6" data-testid="inbox-page">
      <PageHeader
        leading={<InboxIcon className="h-6 w-6 shrink-0 text-primary" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm tracking-wide">{t("card")}</CardTitle>
            {data && data.total > 0 ? (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {t("totalCount", { count: data.total })}
              </span>
            ) : null}
          </div>
          <div
            data-testid="inbox-filters"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
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
        </CardHeader>
        <CardContent>
          {isLoading && !data ? (
            <TableRowSkeleton rows={5} />
          ) : !data || data.items.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-12 text-center"
              data-testid="inbox-empty"
            >
              <div className="mb-3 rounded-full bg-muted p-3">
                <InboxIcon className="h-6 w-6 text-muted-foreground opacity-40" />
              </div>
              <p className="text-sm text-foreground">{t("empty")}</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {data.items.map((row: InboxItem) => (
                  <div
                    key={row.id}
                    className="w-full rounded-lg border border-border bg-card p-3 text-left"
                    data-testid="inbox-row"
                  >
                    <p className="font-mono text-xs text-foreground">
                      {row.recipient_masked}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="default" className="text-[11px]">
                        {kindLabel(row.kind, t)}
                      </Badge>
                      <Badge
                        variant={statusVariant(row.status)}
                        className="text-[11px]"
                      >
                        {statusLabel(row.status, t)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatTime(row.created_at)} · {row.attempts}
                    </p>
                    {row.kind === "scan_diff" && row.job_id ? (
                      <div className="mt-2">
                        <ScanJobLink jobId={row.job_id} label={t("openScan")} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="hidden md:block">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[20%] text-[10px] uppercase tracking-wider">
                        {t("colTime")}
                      </TableHead>
                      <TableHead className="w-[16%] text-[10px] uppercase tracking-wider">
                        {t("colKind")}
                      </TableHead>
                      <TableHead className="w-[12%] text-[10px] uppercase tracking-wider">
                        {t("colStatus")}
                      </TableHead>
                      <TableHead className="w-[28%] text-[10px] uppercase tracking-wider">
                        {t("colRecipient")}
                      </TableHead>
                      <TableHead className="w-[14%] text-[10px] uppercase tracking-wider">
                        {t("colJob")}
                      </TableHead>
                      <TableHead className="w-[10%] text-right text-[10px] uppercase tracking-wider">
                        {t("colAttempts")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((row: InboxItem) => (
                      <TableRow key={row.id} data-testid="inbox-row">
                        <TableCell className="text-xs text-muted-foreground">
                          {formatTime(row.created_at)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {kindLabel(row.kind, t)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={statusVariant(row.status)}
                            className="text-[11px]"
                          >
                            {statusLabel(row.status, t)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.recipient_masked}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.kind === "scan_diff" && row.job_id ? (
                            <ScanJobLink jobId={row.job_id} label={t("openScan")} />
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {row.attempts}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 ? (
                <Pagination className="mt-4" data-testid="inbox-pagination">
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Inbox;
