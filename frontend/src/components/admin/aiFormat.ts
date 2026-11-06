export function formatIdr(n: number | null | undefined): string {
  if (n == null) return "—";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export function formatLatencyMs(ms: number | null | undefined): string {
  return ms == null ? "—" : `${ms} ms`;
}

export function formatTps(tps: number | null | undefined): string {
  return tps == null ? "—" : tps.toFixed(1);
}

export function formatAiTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale === "en" ? "en-US" : "id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type AiPriceUnit = "idr_1k" | "usd_1m";

/** IDR per 1,000 tokens -> USD per 1,000,000 tokens. Returns 0 when usdIdr <= 0. */
export function idrPer1kToUsdPer1m(idrPer1k: number, usdIdr: number): number {
  if (usdIdr <= 0) return 0;
  return (idrPer1k * 1000) / usdIdr;
}

/** USD per 1,000,000 tokens -> IDR per 1,000 tokens, rounded to whole IDR (storage is an integer). */
export function usdPer1mToIdrPer1k(usdPer1m: number, usdIdr: number): number {
  if (usdIdr <= 0) return 0;
  return Math.round((usdPer1m * usdIdr) / 1000);
}

/** "$0.15" / "$150.00" — en-US USD, minimumFractionDigits 2, maximumFractionDigits 4. */
export function formatUsdPer1m(usd: number): string {
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/** Unit-aware price cell: null/undefined -> "—"; idr_1k -> formatIdr(); usd_1m -> formatUsdPer1m(converted). */
export function formatPricePerTokens(
  idrPer1k: number | null | undefined,
  unit: AiPriceUnit,
  usdIdr: number,
): string {
  if (idrPer1k == null) return "—";
  if (unit === "idr_1k") return formatIdr(idrPer1k);
  const usd = idrPer1kToUsdPer1m(idrPer1k, usdIdr);
  // Cell display keeps cents; sub-cent precision is a model-config detail, not a price.
  return formatUsdPer1m(Math.round(usd * 100) / 100);
}

/** A stored FX snapshot older than this many UTC days is stale for pricing. */
export const FX_STALE_DAYS = 7;

const FX_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Whole UTC days between `effectiveDate` (YYYY-MM-DD) and `now`; null when unparseable. */
export function fxRateAgeDays(
  effectiveDate: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (effectiveDate == null || !FX_DATE_RE.test(effectiveDate)) return null;
  const year = Number(effectiveDate.slice(0, 4));
  const month = Number(effectiveDate.slice(5, 7));
  const day = Number(effectiveDate.slice(8, 10));
  const dateUtc = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(dateUtc);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    return null;
  }
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.max(Math.floor((todayUtc - dateUtc) / 86_400_000), 0);
}

/** Parses a price input string; returns null for "", whitespace, NaN, Infinity or negative values. */
export function parsePriceInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}
