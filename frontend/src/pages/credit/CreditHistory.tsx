import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { creditApi, type CreditLogItem } from "@/api/credits";

const PAGE_SIZE = 20;

const TYPE_COLORS: Record<string, string> = {
  credit: "bg-green-600 text-green-100",
  deduct: "bg-red-600 text-red-100",
  refund: "bg-blue-600 text-blue-100",
};

function CreditHistory() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["credit-history", page],
    queryFn: () => creditApi.getHistory({ page, page_size: PAGE_SIZE }),
  });

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <History className="h-6 w-6 text-primary" />
        <h2 className="font-mono text-lg font-bold tracking-wide text-foreground">
          CREDIT HISTORY
        </h2>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="font-mono text-sm tracking-wide">
            TRANSACTIONS
          </CardTitle>
          {data && data.total > 0 && (
            <span className="font-mono text-[10px] text-muted-foreground shrink-0">
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
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Amount
                    </th>
                    <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data?.items.map((item) => (
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
          {new Date(item.created_at).toLocaleDateString()}
        </span>
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] uppercase ${TYPE_COLORS[item.type]}`}
        >
          {item.type}
        </span>
      </td>
      <td className="px-3 py-3">
        <span
          className={`font-mono text-xs font-bold ${
            isPositive ? "text-green-400" : "text-red-400"
          }`}
        >
          {isPositive ? "+" : ""}
          {item.amount}
        </span>
      </td>
      <td className="px-3 py-3">
        <span className="font-mono text-xs text-foreground truncate max-w-[300px] block">
          {item.description || "—"}
        </span>
      </td>
    </tr>
  );
}

export default CreditHistory;