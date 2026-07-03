import { ComponentType, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorBoundaryFallback } from "@/components/ErrorBoundaryFallback";

/**
 * Wraps a lazy-loaded page component with Suspense + ErrorBoundary.
 * If the page crashes, only that page shows the fallback — the AppShell
 * (nav, sidebar) remains functional so users can navigate away.
 */
export function PageBoundary({
  component: Component,
}: {
  component: ComponentType<unknown>;
}) {
  return (
    <ErrorBoundary FallbackComponent={ErrorBoundaryFallback}>
      <Suspense fallback={<div>Loading...</div>}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}
