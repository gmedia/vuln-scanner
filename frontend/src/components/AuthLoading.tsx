import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

const maxWidthClass = {
  sm: "max-w-md 2xl:max-w-lg",
  md: "max-w-lg 2xl:max-w-xl",
  lg: "max-w-2xl 2xl:max-w-3xl",
} as const;

export function AuthLoading({
  fields = 2,
  maxWidth = "lg",
}: {
  fields?: 2 | 3;
  maxWidth?: keyof typeof maxWidthClass;
}) {
  return (
    <div
      className="flex min-h-dvh items-start justify-center bg-background px-4 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] sm:items-center sm:py-10"
      data-testid="auth-loading"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className={cn("w-full", maxWidthClass[maxWidth])}>
        <div className="mb-5 flex flex-col items-center gap-1.5 text-center sm:mb-6">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-sm" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="hidden h-4 w-56 sm:block" />
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        </div>
        <div className="mb-4 flex justify-center px-1">
          <Skeleton className="h-7 w-40 2xl:h-8" />
        </div>
        <div className="flex flex-col rounded-lg border border-border bg-card">
          <div className="space-y-4 p-6 pt-6">
            <Skeleton className="h-11 w-full rounded-md" />
            <div className="min-h-[1.25rem]" />
            {Array.from({ length: fields }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            ))}
            <Skeleton className="h-11 w-full rounded-md" />
            <div className="flex flex-col items-center gap-2 pt-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
