import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableRowSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("space-y-2", className)}
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-10 min-h-10 items-center gap-3">
          <Skeleton className="h-4 min-w-0 flex-1" />
          <Skeleton className="h-4 w-16 shrink-0" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="hidden h-4 w-12 md:block" />
        </div>
      ))}
    </div>
  );
}

export { Skeleton, TableRowSkeleton };
