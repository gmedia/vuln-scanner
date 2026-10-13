import { describe, it, expect } from "vitest";
import {
  halfEvenRound,
  allocateFixedCost,
  computeScenario,
  type ScenarioInput,
} from "@/lib/hppScenario";

describe("halfEvenRound", () => {
  it("rounds halves to the nearest even integer (Python round parity)", () => {
    expect(halfEvenRound(0.5)).toBe(0);
    expect(halfEvenRound(1.5)).toBe(2);
    expect(halfEvenRound(2.5)).toBe(2);
    expect(halfEvenRound(3.5)).toBe(4);
  });

  it("rounds non-halves normally", () => {
    expect(halfEvenRound(40.4)).toBe(40);
    expect(halfEvenRound(40.6)).toBe(41);
  });

  it("is correct for negatives", () => {
    expect(halfEvenRound(-0.5)).toBe(0);
    expect(halfEvenRound(-1.5)).toBe(-2);
    expect(halfEvenRound(-2.5)).toBe(-2);
  });
});

describe("allocateFixedCost", () => {
  it("allocates pro-rata and hands the remainder to the last active row", () => {
    expect(allocateFixedCost(1_000_000, [10, 20, 30])).toEqual([
      166_666, 333_333, 500_001,
    ]);
  });

  it("returns zeros when there is no volume", () => {
    expect(allocateFixedCost(1000, [0, 0])).toEqual([0, 0]);
  });

  it("returns zeros when the pool is zero", () => {
    expect(allocateFixedCost(0, [5, 5])).toEqual([0, 0]);
  });

  it("skips inactive rows and splits only among active ones", () => {
    expect(allocateFixedCost(100, [0, 4, 6])).toEqual([0, 40, 60]);
  });

  it("gives the whole pool to a single active row", () => {
    expect(allocateFixedCost(1000, [0, 5])).toEqual([0, 1000]);
  });
});

describe("computeScenario", () => {
  it("computes fully-loaded HPP, margin, break-even for a normal row", () => {
    const out = computeScenario({
      fixed_cost_idr: 100_000,
      target_margin_pct: null,
      rows: [
        {
          service: "scan",
          sku: "pro",
          volume: 10,
          unit_cost_idr: 50_000,
          price_idr: 100_000,
        },
      ],
    });

    expect(out.rows).toHaveLength(1);
    const row = out.rows[0];
    expect(row.fixed_cost_idr).toBe(100_000);
    expect(row.hpp_idr).toBe(500_000);
    expect(row.fully_loaded_hpp_idr).toBe(600_000);
    expect(row.fully_loaded_unit_idr).toBe(60_000);
    expect(row.revenue_idr).toBe(1_000_000);
    expect(row.margin_idr).toBe(400_000);
    expect(row.margin_pct).toBe(40);
    expect(row.break_even_volume).toBe(2);
    expect(row.computed).toBe(true);
    expect(row.reason).toBeUndefined();
  });

  it("flags zero_cost when unit cost and fixed share are both zero", () => {
    const out = computeScenario({
      fixed_cost_idr: 0,
      target_margin_pct: null,
      rows: [
        {
          service: "scan",
          volume: 10,
          unit_cost_idr: 0,
          price_idr: 100_000,
        },
      ],
    });

    const row = out.rows[0];
    expect(row.computed).toBe(false);
    expect(row.reason).toBe("zero_cost");
    expect(row.margin_pct).toBeNull();
  });

  it("flags no_volume when volume is zero with a positive unit cost", () => {
    const out = computeScenario({
      fixed_cost_idr: 0,
      target_margin_pct: null,
      rows: [
        {
          service: "host",
          volume: 0,
          unit_cost_idr: 50_000,
          price_idr: 100_000,
        },
      ],
    });

    const row = out.rows[0];
    expect(row.computed).toBe(false);
    expect(row.reason).toBe("no_volume");
    expect(row.margin_pct).toBeNull();
  });

  it("keeps a negative margin when price is below unit cost", () => {
    const out = computeScenario({
      fixed_cost_idr: 0,
      target_margin_pct: null,
      rows: [
        {
          service: "uptime",
          volume: 10,
          unit_cost_idr: 100,
          price_idr: 50,
        },
      ],
    });

    const row = out.rows[0];
    expect(row.computed).toBe(true);
    expect(row.reason).toBe("price_below_unit_cost");
    expect(row.break_even_volume).toBeNull();
    expect(row.margin_idr).toBeLessThan(0);
  });

  it("derives the target price from the requested margin", () => {
    const out = computeScenario({
      fixed_cost_idr: 100_000,
      target_margin_pct: 30,
      rows: [
        {
          service: "guard",
          sku: "multi",
          volume: 10,
          unit_cost_idr: 50_000,
          price_idr: 100_000,
        },
      ],
    });

    // (50_000 + 100_000/10) / (1 - 0.30) = 60_000 / 0.7 = 85_714.28... -> 85_714
    expect(out.rows[0].target_price_idr).toBe(85_714);
  });

  it("sums totals across rows and computes the aggregate margin pct", () => {
    const out = computeScenario({
      fixed_cost_idr: 100_000,
      target_margin_pct: null,
      rows: [
        {
          service: "scan",
          volume: 10,
          unit_cost_idr: 50_000,
          price_idr: 100_000,
        },
        {
          service: "host",
          volume: 10,
          unit_cost_idr: 20_000,
          price_idr: 50_000,
        },
      ],
    });

    expect(out.totals.revenue_idr).toBe(1_500_000);
    expect(out.totals.fully_loaded_hpp_idr).toBe(800_000);
    expect(out.totals.margin_idr).toBe(700_000);
    // 700_000 / 1_500_000 * 100 = 46.666... -> 47
    expect(out.totals.margin_pct).toBe(47);
  });

  it("does not mutate the input rows", () => {
    const input: ScenarioInput = {
      fixed_cost_idr: 100_000,
      target_margin_pct: 25,
      rows: [
        {
          service: "scan",
          sku: "pro",
          volume: 10,
          unit_cost_idr: 50_000,
          price_idr: 100_000,
        },
        {
          service: "host",
          volume: 20,
          unit_cost_idr: 5_000,
          price_idr: 20_000,
        },
      ],
    };
    const snapshot = structuredClone(input);

    computeScenario(input);

    expect(input).toEqual(snapshot);
  });

  it("never throws on hostile numeric input", () => {
    expect(() =>
      computeScenario({
        fixed_cost_idr: Number.NaN,
        target_margin_pct: Number.POSITIVE_INFINITY,
        rows: [
          {
            service: "scan",
            volume: Number.NaN,
            unit_cost_idr: Number.POSITIVE_INFINITY,
            price_idr: -50,
          },
        ],
      }),
    ).not.toThrow();
  });
});
