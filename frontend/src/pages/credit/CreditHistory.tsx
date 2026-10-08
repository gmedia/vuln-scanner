import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Coins, History, Receipt } from "lucide-react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  OpsShell,
  OpsShellBody,
  OpsShellHead,
} from "@/components/ops/OpsShell";
import { SiemRail } from "@/components/siem/siemChrome";
import {
  creditListRailClass,
  creditTypeRailClass,
} from "@/components/credit/creditChrome";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { creditApi, type CreditLogItem } from "@/api/credits";
import { useCreditStore } from "@/store/creditStore";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const TYPE_COLORS: Record<string, string> = {
  credit: "bg-green-600/15 text-green-700 dark:text-green-300",
  deduct: "bg-red-600/15 text-red-700 dark:text-red-300",
  refund: "bg-blue-600/15 text-blue-700 dark:text-blue-300",
};

type FilterType = "all" | "credit" | "deduct" | "refund";

function startOfDay(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getTime();
}

function endOfDay(dateStr: string): number {
  return new Date(`${dateStr}T23:59:59.999`).getTime();
}

function signedLedgerAmount(item: CreditLogItem): number {
  const mag = Math.abs(item.amount);
  return item.type === "deduct" ? -mag : mag;
}

function formatLedgerStamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function StatTile({
  label,
  value,
  emphasize = false,
  valueClassName,
  railClass = "bg-primary",
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
  valueClassName?: string;
  railClass?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-md border border-border bg-card px-4 py-3 pl-4">
      <SiemRail className={railClass} />
      <p className="pl-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div
        className={cn(
          "mt-1 pl-1 font-mono text-lg font-bold tabular-nums text-foreground",
          emphasize && "text-xl tracking-tight",
          valueClassName,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyIsland({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <div className="m-4 flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-6 py-8 text-center">
      <History className="h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] uppercase",
        TYPE_COLORS[type] ?? TYPE_COLORS.credit,
      )}
    >
      {type}
    </span>
  );
}

function AmountFigure({ item, size = "sm" }: { item: CreditLogItem; size?: "sm" | "md" }) {
  const signed = signedLedgerAmount(item);
  const isPositive = signed > 0;
  return (
    <span
      className={cn(
        "inline-flex min-w-[4.5rem] items-center justify-end font-mono font-bold tabular-nums",
        size === "md" ? "text-sm" : "text-xs",
        isPositive
          ? "text-green-700 dark:text-green-300"
          : "text-red-700 dark:text-red-300",
      )}
    >
      {isPositive ? "+" : ""}
      {signed.toLocaleString()}
    </span>
  );
}

function DescriptionCell({ item }: { item: CreditLogItem }) {
  const text = item.description || (item.reference_id ? "View scan" : "—");
  if (item.reference_id) {
    return (
      <Link
        to={`/scan/${item.reference_id}`}
        className="block max-w-[300px] truncate text-sm text-primary underline-offset-2 hover:underline 2xl:max-w-none 2xl:overflow-visible 2xl:whitespace-normal"
      >
        {text}
      </Link>
    );
  }
  return (
    <span className="block max-w-[300px] truncate text-sm text-foreground 2xl:max-w-none 2xl:overflow-visible 2xl:whitespace-normal">
      {text}
    </span>
  );
}

function LedgerMobileCard({ item }: { item: CreditLogItem }) {
  const stamp = formatLedgerStamp(item.created_at);
  return (
    <article className="relative rounded-lg border border-border bg-card p-3 pl-4">
      <span
        className={cn(
          "absolute inset-y-2 left-0 w-0.5 rounded-full",
          creditTypeRailClass(item.type),
        )}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3">
        <TypeBadge type={item.type} />
        <AmountFigure item={item} size="md" />
      </div>
      <p className="mt-2 break-words text-sm text-foreground">
        {item.reference_id ? (
          <Link
            to={`/scan/${item.reference_id}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {item.description || "View scan"}
          </Link>
        ) : (
          (item.description || "—")
        )}
      </p>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
        {stamp.date}
        <span className="text-border"> · </span>
        {stamp.time}
      </p>
    </article>
  );
}

function TransactionRow({ item }: { item: CreditLogItem }) {
  const stamp = formatLedgerStamp(item.created_at);
  const signed = signedLedgerAmount(item);
  const isPositive = signed > 0;

  return (
    <TableRow className="relative">
      <TableCell className="relative py-2.5 pl-4">
        <span
          className={cn(
            "absolute inset-y-1.5 left-0 w-0.5 rounded-full",
            creditTypeRailClass(item.type),
          )}
          aria-hidden
        />
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-xs tabular-nums text-foreground">
            {stamp.date}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {stamp.time}
          </span>
        </div>
      </TableCell>
      <TableCell className="py-2.5">
        <TypeBadge type={item.type} />
      </TableCell>
      <TableCell className="py-2.5 text-right">
        <span
          className={cn(
            "inline-flex min-w-[4.5rem] items-center justify-end rounded-full px-2.5 py-0.5 font-mono text-xs font-bold tabular-nums",
            isPositive
              ? "bg-green-600/15 text-green-700 dark:text-green-400"
              : "bg-red-600/15 text-red-700 dark:text-red-400",
          )}
        >
          {isPositive ? "+" : ""}
          {signed.toLocaleString()}
        </span>
      </TableCell>
      <TableCell className="py-2.5">
        <DescriptionCell item={item} />
      </TableCell>
    </TableRow>
  );
}

function CreditHistory() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const credits = useCreditStore((s) => s.credits);
  const fetchBalance = useCreditStore((s) => s.fetchBalance);
  const activeOrgId = useAuthStore((s) => s.activeOrgId);

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance, activeOrgId]);

  const { data, isLoading } = useQuery({
    queryKey: ["credit-history", activeOrgId, page],
    queryFn: () => creditApi.getHistory({ page, page_size: PAGE_SIZE }),
    enabled: !!activeOrgId,
    placeholderData: keepPreviousData,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) return false;

      const created = new Date(item.created_at).getTime();
      if (dateFrom && created < startOfDay(dateFrom)) return false;
      if (dateTo && created > endOfDay(dateTo)) return false;

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const desc = (item.description ?? "").toLowerCase();
        if (!desc.includes(q)) return false;
      }

      return true;
    });
  }, [data?.items, typeFilter, dateFrom, dateTo, search]);

  const periodCredits = useMemo(
    () =>
      filteredItems
        .filter((i) => i.type !== "deduct")
        .reduce((sum, i) => sum + Math.abs(i.amount), 0),
    [filteredItems],
  );

  const periodDebits = useMemo(
    () =>
      filteredItems
        .filter((i) => i.type === "deduct")
        .reduce((sum, i) => sum + Math.abs(i.amount), 0),
    [filteredItems],
  );

  const periodNet = periodCredits - periodDebits;

  const hasServerData = Boolean(data && data.items.length > 0);
  const filtersActive =
    typeFilter !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(search.trim());

  const resetPage = () => setPage(1);

  const clearFilters = () => {
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  };

  let listBody: ReactNode;
  if (isLoading && !data) {
    listBody = (
      <div className="px-4 py-4">
        <TableRowSkeleton rows={5} />
      </div>
    );
  } else if (!data || data.items.length === 0) {
    listBody = (
      <EmptyIsland
        title="No transactions yet"
        hint="Credit adjustments will appear here."
      />
    );
  } else if (filteredItems.length === 0) {
    listBody = (
      <EmptyIsland
        title="No matching transactions"
        hint="Try adjusting filters on this page."
      />
    );
  } else {
    listBody = (
      <>
        <div className="space-y-2 p-4 md:hidden">
          {filteredItems.map((item) => (
            <LedgerMobileCard key={item.id} item={item} />
          ))}
        </div>
        <div className="hidden md:block">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[22%] pl-4 text-[10px] uppercase tracking-wider">
                  Date
                </TableHead>
                <TableHead className="w-[14%] text-[10px] uppercase tracking-wider">
                  Type
                </TableHead>
                <TableHead className="w-[14%] text-right text-[10px] uppercase tracking-wider">
                  Amount
                </TableHead>
                <TableHead className="w-[50%] text-[10px] uppercase tracking-wider">
                  Description
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => (
                <TransactionRow key={item.id} item={item} />
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    );
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="Credit history"
        description="Personal scan credits — top-ups, charges, and refunds."
      />

      <OpsShell railClass="bg-primary" testid="credit-history-identity">
        <div className="flex flex-col gap-4 px-4 py-4 pl-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
            >
              <Coins className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Wallet
              </p>
              <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-foreground sm:text-4xl">
                {credits.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                scan credits on this account
                {hasServerData ? (
                  <>
                    <span className="text-border"> · </span>
                    <span
                      className={cn(
                        "font-mono tabular-nums",
                        periodNet >= 0
                          ? "text-green-700 dark:text-green-300"
                          : "text-red-700 dark:text-red-300",
                      )}
                    >
                      {periodNet >= 0 ? "+" : ""}
                      {periodNet.toLocaleString()} net on this page
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/profile">Profile</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings/workspace">Workspace</Link>
            </Button>
          </div>
        </div>
        <div
          data-testid="credit-history-summary"
          className="grid grid-cols-1 gap-3 border-t border-border px-4 py-4 sm:grid-cols-3"
        >
          <StatTile
            label="Current balance"
            value={credits.toLocaleString()}
            emphasize
          />
          <StatTile
            label="Period credits"
            value={`+${periodCredits.toLocaleString()}`}
            valueClassName="text-green-700 dark:text-green-400"
            railClass="bg-primary"
          />
          <StatTile
            label="Period debits"
            value={`-${periodDebits.toLocaleString()}`}
            valueClassName="text-red-700 dark:text-red-400"
            railClass="bg-destructive"
          />
        </div>
      </OpsShell>

      <OpsShell railClass="bg-border" testid="credit-history-filters">
        <OpsShellBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="credit-type-filter">Type</Label>
          <Select
            value={typeFilter}
            onValueChange={(value) => {
              setTypeFilter(value as FilterType);
              resetPage();
            }}
          >
            <SelectTrigger
              id="credit-type-filter"
              aria-label="Type"
              className="h-10 min-h-10"
            >
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
              <SelectItem value="deduct">Deduct</SelectItem>
              <SelectItem value="refund">Refund</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="credit-date-from">From</Label>
          <DatePicker
            id="credit-date-from"
            value={dateFrom}
            onChange={(value) => {
              setDateFrom(value);
              resetPage();
            }}
            placeholder="From date"
            aria-label="From"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="credit-date-to">To</Label>
          <DatePicker
            id="credit-date-to"
            value={dateTo}
            onChange={(value) => {
              setDateTo(value);
              resetPage();
            }}
            placeholder="To date"
            aria-label="To"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="credit-search">Search</Label>
          <Input
            id="credit-search"
            type="text"
            placeholder="Search description"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            className="h-10 min-h-10"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2 lg:col-span-4">
          <p className="text-xs text-muted-foreground">
            Filters apply to loaded rows on this page
            {hasServerData && filtersActive
              ? ` · Showing ${filteredItems.length} of ${data?.items.length ?? 0}`
              : null}
          </p>
          {filtersActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 text-xs"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
        </OpsShellBody>
      </OpsShell>

      <OpsShell
        railClass={creditListRailClass(
          filteredItems.map((i) => i.type),
          periodNet,
        )}
        testid="credit-history-list-shell"
      >
        <OpsShellHead
          icon={Receipt}
          title="Transactions"
          aside={
            data && data.total > 0 ? (
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                {data.total} total
              </span>
            ) : null
          }
        />
        <OpsShellBody flush>
          {listBody}

          {!isLoading && totalPages > 1 && (
            <Pagination className="border-t border-border px-4 py-3">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="px-2 font-mono text-xs tabular-nums text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </OpsShellBody>
      </OpsShell>
    </div>
  );
}

export default CreditHistory;
