import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { History, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { creditApi, type CreditLogItem } from "@/api/credits";
import { useCreditStore } from "@/store/creditStore";

const PAGE_SIZE = 20;

const TYPE_COLORS: Record<string, string> = {
  credit: "bg-green-600 text-green-100",
  deduct: "bg-red-600 text-red-100",
  refund: "bg-blue-600 text-blue-100",
};

type FilterType = "all" | "credit" | "deduct" | "refund";

function startOfDay(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getTime();
}

function endOfDay(dateStr: string): number {
  return new Date(`${dateStr}T23:59:59.999`).getTime();
}

function CreditHistory() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const credits = useCreditStore((s) => s.credits);
  const fetchBalance = useCreditStore((s) => s.fetchBalance);

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  const { data, isLoading } = useQuery({
    queryKey: ["credit-history", page],
    queryFn: () => creditApi.getHistory({ page, page_size: PAGE_SIZE }),
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
        .filter((i) => i.amount > 0)
        .reduce((sum, i) => sum + i.amount, 0),
    [filteredItems],
  );

  const periodDebits = useMemo(
    () =>
      filteredItems
        .filter((i) => i.amount < 0)
        .reduce((sum, i) => sum + Math.abs(i.amount), 0),
    [filteredItems],
  );

  const hasServerData = Boolean(data && data.items.length > 0);
  const filtersActive =
    typeFilter !== "all" || Boolean(dateFrom) || Boolean(dateTo) || Boolean(search.trim());

  const resetPage = () => setPage(1);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <History className="h-6 w-6 text-primary" />
        <h2 className="font-mono text-lg font-bold tracking-wide text-foreground">
          Credit history
        </h2>
      </div>

      <div
        data-testid="credit-history-summary"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Current balance
          </p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
            {credits}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Period credits
          </p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-green-400">
            +{periodCredits}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Period debits
          </p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-red-400">
            -{periodDebits}
          </p>
        </div>
      </div>

      <div
        data-testid="credit-history-filters"
        className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex min-w-[140px] flex-1 flex-col gap-1">
          <label
            htmlFor="credit-type-filter"
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            Type
          </label>
          <select
            id="credit-type-filter"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as FilterType);
              resetPage();
            }}
            className="flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All</option>
            <option value="credit">credit</option>
            <option value="deduct">deduct</option>
            <option value="refund">refund</option>
          </select>
        </div>
        <div className="flex min-w-[140px] flex-1 flex-col gap-1">
          <label
            htmlFor="credit-date-from"
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            From
          </label>
          <Input
            id="credit-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              resetPage();
            }}
            className="h-10"
          />
        </div>
        <div className="flex min-w-[140px] flex-1 flex-col gap-1">
          <label
            htmlFor="credit-date-to"
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            To
          </label>
          <Input
            id="credit-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              resetPage();
            }}
            className="h-10"
          />
        </div>
        <div className="flex min-w-[180px] flex-[2] flex-col gap-1">
          <label
            htmlFor="credit-search"
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
          >
            Search
          </label>
          <Input
            id="credit-search"
            type="text"
            placeholder="Search description"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            className="h-10"
          />
        </div>
        <p className="w-full font-mono text-xs text-muted-foreground">
          Filters apply to the current page
          {hasServerData && filtersActive
            ? ` · Showing ${filteredItems.length} of ${data?.items.length ?? 0}`
            : null}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="font-mono text-sm tracking-wide">
            Transactions
          </CardTitle>
          {data && data.total > 0 && (
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {data.total} total
            </span>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 rounded-full bg-muted p-3">
                <History className="h-6 w-6 text-muted-foreground opacity-40" />
              </div>
              <p className="font-mono text-sm text-foreground">
                No transactions yet
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Credit adjustments will appear here.
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 rounded-full bg-muted p-3">
                <History className="h-6 w-6 text-muted-foreground opacity-40" />
              </div>
              <p className="font-mono text-sm text-foreground">
                No matching transactions
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Try adjusting filters on this page.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Type
                    </th>
                    <th className="px-3 py-2 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Amount
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredItems.map((item) => (
                    <TransactionRow key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="font-mono text-xs"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="font-mono text-xs"
                aria-label="Next page"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TransactionRow({ item }: { item: CreditLogItem }) {
  const isPositive = item.amount > 0;

  return (
    <tr className="transition-colors hover:bg-muted/50">
      <td className="px-3 py-3">
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(item.created_at).toLocaleString()}
        </span>
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] uppercase ${TYPE_COLORS[item.type]}`}
        >
          {item.type}
        </span>
      </td>
      <td className="px-3 py-3 text-right">
        <span
          className={`font-mono text-xs font-bold tabular-nums ${
            isPositive ? "text-green-400" : "text-red-400"
          }`}
        >
          {isPositive ? "+" : ""}
          {item.amount}
        </span>
      </td>
      <td className="px-3 py-3">
        {item.reference_id ? (
          <Link
            to={`/scan/${item.reference_id}`}
            className="block max-w-[300px] truncate font-mono text-xs text-primary underline-offset-2 hover:underline"
          >
            {item.description || "View scan"}
          </Link>
        ) : (
          <span className="block max-w-[300px] truncate font-mono text-xs text-foreground">
            {item.description || "—"}
          </span>
        )}
      </td>
    </tr>
  );
}

export default CreditHistory;
