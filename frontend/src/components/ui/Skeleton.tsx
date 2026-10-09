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

const COLUMN_BAR_CLASS = [
  "h-4 min-w-0 flex-1",
  "h-4 w-16 shrink-0",
  "hidden h-4 w-24 sm:block",
  "hidden h-4 w-12 md:block",
] as const;

function columnBarClass(index: number): string {
  return COLUMN_BAR_CLASS[index] ?? "hidden h-4 w-16 lg:block";
}

function TableRowSkeleton({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  const barCount = Math.max(1, columns);
  return (
    <div
      className={cn("space-y-2", className)}
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-10 min-h-10 items-center gap-3">
          {Array.from({ length: barCount }).map((__, col) => (
            <Skeleton key={col} className={columnBarClass(col)} />
          ))}
        </div>
      ))}
    </div>
  );
}

export { Skeleton, TableRowSkeleton };
