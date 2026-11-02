export const PRIMARY_KEY = "__primary__";

export interface RoutePosition {
  readonly position: number | null;
  readonly skipped: boolean;
  readonly degraded: boolean;
}

export interface RouteCandidate {
  readonly key: string;
  readonly rank: number;
  readonly enabled: boolean;
  readonly providerEnabled: boolean;
  readonly providerStatus: string;
}

/** Must mirror backend _load_candidates or the sheet shows an order routing does not use. */
export function routingPositions(
  candidates: readonly RouteCandidate[],
): Map<string, RoutePosition> {
  const usable = candidates.filter(
    (c) => c.enabled && c.providerEnabled && c.providerStatus !== "disabled",
  );
  const ordered = [...usable].sort((a, b) => {
    const da = a.providerStatus === "degraded" ? 1 : 0;
    const db = b.providerStatus === "degraded" ? 1 : 0;
    if (da !== db) return da - db;
    return a.rank - b.rank;
  });
  const result = new Map<string, RoutePosition>();
  ordered.forEach((candidate, index) => {
    result.set(candidate.key, {
      position: index + 1,
      skipped: false,
      degraded: candidate.providerStatus === "degraded",
    });
  });
  for (const candidate of candidates) {
    if (!result.has(candidate.key)) {
      result.set(candidate.key, {
        position: null,
        skipped: true,
        degraded: candidate.providerStatus === "degraded",
      });
    }
  }
  return result;
}
