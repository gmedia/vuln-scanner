import { Skeleton } from "@/components/ui/Skeleton";

export function LandingLoading() {
  return (
    <div
      className="flex min-h-dvh flex-col bg-background"
      data-testid="landing-loading"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <header className="border-b border-border pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-12 w-full max-w-6xl min-w-0 items-center justify-between gap-2 overflow-x-hidden px-4 2xl:max-w-[90rem]">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-sm" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <Skeleton className="hidden h-4 w-10 sm:block" />
            <Skeleton className="hidden h-8 w-8 sm:block" />
            <Skeleton className="hidden h-8 w-8 sm:block" />
            <Skeleton className="hidden h-11 w-20 sm:block" />
            <Skeleton className="hidden h-11 w-24 sm:block" />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="flex flex-col items-center px-4 pt-16 pb-12 sm:pt-20">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center space-y-6 2xl:max-w-4xl">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-10 w-full max-w-xl sm:h-12" />
            <Skeleton className="h-4 w-full max-w-lg" />
            <div className="flex w-full max-w-sm flex-col items-stretch justify-center gap-3 pt-2 sm:max-w-none sm:flex-row sm:items-center">
              <Skeleton className="h-11 w-full sm:w-36" />
              <Skeleton className="h-11 w-full sm:w-28" />
            </div>
          </div>
        </section>

        <section className="px-4 py-12">
          <div className="mx-auto max-w-6xl 2xl:max-w-[90rem]">
            <div className="mb-10 flex flex-col items-center space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-40" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </section>

        <section className="bg-card/50 px-4 py-12">
          <div className="mx-auto max-w-6xl 2xl:max-w-[90rem]">
            <div className="mb-10 flex justify-center">
              <Skeleton className="h-7 w-36" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-auto shrink-0 border-t border-border py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-4 sm:flex-row sm:justify-between 2xl:max-w-[90rem]">
          <Skeleton className="h-3 w-48" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      </footer>
    </div>
  );
}
