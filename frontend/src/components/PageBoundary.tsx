import { ComponentType, lazy, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorBoundaryFallback } from "@/components/ErrorBoundaryFallback";

/**
 * Wraps a lazy-loaded page component with Suspense + ErrorBoundary.
 * If the page crashes, only that page shows the fallback — the AppShell
 * (nav, sidebar) remains functional so users can navigate away.
 */
export function PageBoundary({
  loader,
}: {
  loader: () => Promise<{ default: ComponentType<unknown> }>;
}) {
  const LazyComponent = lazy(loader);
  return (
    <ErrorBoundary FallbackComponent={ErrorBoundaryFallback}>
      <Suspense fallback={<div>Loading...</div>}>
        <LazyComponent />
      </Suspense>
    </ErrorBoundary>
  );
}
