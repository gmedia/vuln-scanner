// Pure HPP (harga pokok penjualan / cost-of-goods) scenario math.
//
// Mirrors the backend report semantics so the admin simulator can preview a
// scenario client-side. No React, no network, no side effects: given an input
// it returns a fresh output and never mutates its arguments.

export type ScenarioService = "scan" | "host" | "uptime" | "guard";
export type ScenarioSku = "basic" | "pro" | "multi";
export type ScenarioReason =
  | "zero_cost"
  | "no_volume"
  | "price_below_unit_cost";

export interface ScenarioRowInput {
  service: ScenarioService;
  sku?: ScenarioSku;
  volume: number;
  unit_cost_idr: number;
  price_idr: number;
}

export interface ScenarioRowOutput {
  service: ScenarioService;
  sku?: ScenarioSku;
  volume: number;
  unit_cost_idr: number;
  price_idr: number;
  fixed_cost_idr: number; // allocated share of the global pool
  hpp_idr: number; // volume * unit_cost
  fully_loaded_hpp_idr: number; // hpp + fixed share
  fully_loaded_unit_idr: number; // floor(fully / volume), 0 if volume 0
  revenue_idr: number; // volume * price
  margin_idr: number; // revenue - fully_loaded
  margin_pct: number | null; // halfEvenRound(margin*100/revenue) or null
  break_even_volume: number | null; // ceil(fixed / (price-unit_cost)) if price>unit_cost else null
  target_price_idr: number | null; // price to hit target margin, else null
  computed: boolean;
  reason?: ScenarioReason;
}

export interface ScenarioInput {
  fixed_cost_idr: number;
  target_margin_pct: number | null;
  rows: readonly ScenarioRowInput[];
}

export interface ScenarioTotals {
  revenue_idr: number;
  fully_loaded_hpp_idr: number;
  margin_idr: number;
  margin_pct: number | null;
}

export interface ScenarioOutput {
  rows: ScenarioRowOutput[];
  totals: ScenarioTotals;
}

/**
 * Banker's rounding (round half to even) to match Python's built-in round().
 * Correct for negatives, e.g. -0.5 -> 0, -1.5 -> -2, -2.5 -> -2.
 */
export function halfEvenRound(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Coerce an arbitrary numeric input to a non-negative integer.
 * Non-finite values (NaN / Infinity / -Infinity) become 0 so the caller never
 * throws on hostile input.
 */
function safeFloor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * Pro-rata allocation of a fixed-cost pool across per-row volumes.
 *
 * Mirrors the real report: every active row except the last receives
 * `floor(total * v_i / totalVolume)`; the last active row absorbs the integer
 * remainder so the shares sum exactly to the (floored, non-negative) total.
 * Rows with zero volume receive zero. Returns a fresh array in input order.
 */
export function allocateFixedCost(
  totalIdr: number,
  volumes: readonly number[],
): number[] {
  const total = safeFloor(totalIdr);
  const v = volumes.map(safeFloor);
  const result = new Array<number>(volumes.length).fill(0);

  let totalVolume = 0;
  for (const value of v) totalVolume += value;

  if (total <= 0 || totalVolume <= 0) return result;

  let lastActive = -1;
  for (let i = 0; i < v.length; i += 1) {
    if (v[i] > 0) lastActive = i;
  }

  let allocated = 0;
  for (let i = 0; i < v.length; i += 1) {
    if (v[i] <= 0) continue;
    if (i === lastActive) {
      result[i] = total - allocated;
    } else {
      const share = Math.floor((total * v[i]) / totalVolume);
      result[i] = share;
      allocated += share;
    }
  }

  return result;
}

/**
 * Compute a fully-loaded HPP scenario: allocate the shared fixed-cost pool
 * across rows, then derive per-row HPP, margin, break-even and target price,
 * plus aggregate totals.
 *
 * Never throws and never mutates `input`.
 */
export function computeScenario(input: ScenarioInput): ScenarioOutput {
  const shares = allocateFixedCost(
    input.fixed_cost_idr,
    input.rows.map((row) => row.volume),
  );

  const targetMarginPct = input.target_margin_pct;

  const rows: ScenarioRowOutput[] = input.rows.map((row, i) => {
    const volume = safeFloor(row.volume);
    const unitCost = safeFloor(row.unit_cost_idr);
    const price = safeFloor(row.price_idr);
    const fixed = shares[i];

    const hpp = volume * unitCost;
    const fully = hpp + fixed;
    const fullyUnit = volume > 0 ? Math.floor(fully / volume) : 0;
    const revenue = volume * price;
    const margin = revenue - fully;

    let marginPct: number | null =
      revenue > 0 ? halfEvenRound((margin * 100) / revenue) : null;

    let breakEven: number | null =
      price > unitCost ? Math.ceil(fixed / (price - unitCost)) : null;

    let targetPrice: number | null =
      targetMarginPct != null && targetMarginPct < 100 && volume > 0
        ? halfEvenRound(
            (unitCost + fixed / volume) / (1 - targetMarginPct / 100),
          )
        : null;

    let computed: boolean;
    let reason: ScenarioReason | undefined;
    if (unitCost + fixed === 0) {
      computed = false;
      reason = "zero_cost";
    } else if (volume === 0) {
      computed = false;
      reason = "no_volume";
    } else if (price <= unitCost) {
      computed = true;
      reason = "price_below_unit_cost";
    } else {
      computed = true;
      reason = undefined;
    }

    // Un-computable rows drop the derived ratios; raw IDR fields stay intact.
    if (!computed) {
      marginPct = null;
      breakEven = null;
      targetPrice = null;
    }

    return {
      service: row.service,
      sku: row.sku,
      volume,
      unit_cost_idr: unitCost,
      price_idr: price,
      fixed_cost_idr: fixed,
      hpp_idr: hpp,
      fully_loaded_hpp_idr: fully,
      fully_loaded_unit_idr: fullyUnit,
      revenue_idr: revenue,
      margin_idr: margin,
      margin_pct: marginPct,
      break_even_volume: breakEven,
      target_price_idr: targetPrice,
      computed,
      reason,
    };
  });

  let revenueTotal = 0;
  let fullyTotal = 0;
  for (const row of rows) {
    revenueTotal += row.revenue_idr;
    fullyTotal += row.fully_loaded_hpp_idr;
  }
  const marginTotal = revenueTotal - fullyTotal;

  return {
    rows,
    totals: {
      revenue_idr: revenueTotal,
      fully_loaded_hpp_idr: fullyTotal,
      margin_idr: marginTotal,
      margin_pct:
        revenueTotal > 0
          ? halfEvenRound((marginTotal * 100) / revenueTotal)
          : null,
    },
  };
}
