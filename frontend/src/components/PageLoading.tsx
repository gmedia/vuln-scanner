import { Skeleton, TableRowSkeleton } from "@/components/ui/Skeleton";

export function PageLoading() {
  return (
    <div
      className="w-full space-y-4 p-1"
      data-testid="page-loading"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <Skeleton className="hidden h-11 w-32 sm:block" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
      <div className="rounded-lg border border-border p-4">
        <TableRowSkeleton rows={5} />
      </div>
    </div>
  );
}
