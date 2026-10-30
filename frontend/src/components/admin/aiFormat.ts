export function formatIdr(n: number | null | undefined): string {
  if (n == null) return "—";
  return `Rp ${n.toLocaleString("id-ID")}`;
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

/** Parses a price input string; returns null for "", whitespace, NaN, Infinity or negative values. */
export function parsePriceInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}
