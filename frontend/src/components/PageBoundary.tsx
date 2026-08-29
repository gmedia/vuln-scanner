import { ComponentType, ReactNode, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorBoundaryFallback } from "@/components/ErrorBoundaryFallback";
import { PageLoading } from "@/components/PageLoading";

/**
 * Wraps a lazy-loaded page component with Suspense + ErrorBoundary.
 * If the page crashes, only that page shows the fallback — the AppShell
 * (nav, sidebar) remains functional so users can navigate away.
 */
export function PageBoundary({
  component: Component,
  fallback,
}: {
  component: ComponentType<unknown>;
  fallback?: ReactNode;
}) {
  return (
    <ErrorBoundary FallbackComponent={ErrorBoundaryFallback}>
      <Suspense fallback={fallback ?? <PageLoading />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}
