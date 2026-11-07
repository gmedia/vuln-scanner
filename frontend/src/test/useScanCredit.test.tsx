import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useScanCredit } from "@/hooks/useScanCredit";
import { useCreditStore } from "@/store/creditStore";

const { fetchBalance, checkEligibility } = vi.hoisted(() => ({
  fetchBalance: vi.fn(),
  checkEligibility: vi.fn(),
}));

vi.mock("@/store/creditStore", () => ({
  useCreditStore: () => ({
    credits: 100,
    fetchBalance,
    checkEligibility,
  }),
}));

const mockedStore = useCreditStore as unknown as {
  getState?: () => { error: string | null };
};

describe("useScanCredit", () => {
  beforeEach(() => {
    delete mockedStore.getState;
    fetchBalance.mockReset();
    checkEligibility.mockReset();
    fetchBalance.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets cost and eligible from the eligibility result", async () => {
    checkEligibility.mockResolvedValue({
      eligible: true,
      required_credits: 5,
      current_credits: 100,
      scan_type: "ip",
    });

    const { result } = renderHook(() => useScanCredit("ip"));
    await waitFor(() => expect(result.current.eligibilityLoading).toBe(false));

    expect(result.current.cost).toBe(5);
    expect(result.current.eligible).toBe(true);
    expect(result.current.costUnavailable).toBe(false);
  });

  it("marks cost unavailable when eligibility returns null", async () => {
    checkEligibility.mockResolvedValue(null);

    const { result } = renderHook(() => useScanCredit("ip"));
    await waitFor(() => expect(result.current.eligibilityLoading).toBe(false));

    expect(result.current.eligible).toBe(true);
    expect(result.current.costUnavailable).toBe(false);
  });

  it("marks cost unavailable when the eligibility call errored", async () => {
    checkEligibility.mockResolvedValue(null);
    mockedStore.getState = () => ({ error: "Failed to check eligibility" });

    const { result } = renderHook(() => useScanCredit("ip"));
    await waitFor(() => expect(result.current.eligibilityLoading).toBe(false));

    expect(result.current.costUnavailable).toBe(true);
  });

  it("times out eligibility after 8s and keeps submit gated", async () => {
    vi.useFakeTimers();
    checkEligibility.mockImplementation(() => new Promise(() => undefined));

    const { result } = renderHook(() => useScanCredit("ip"));
    expect(result.current.eligibilityLoading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    expect(result.current.eligibilityLoading).toBe(false);
    expect(result.current.eligible).toBe(true);
    expect(result.current.costUnavailable).toBe(false);
  });
});
