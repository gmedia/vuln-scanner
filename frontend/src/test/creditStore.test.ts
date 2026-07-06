import { describe, it, expect, beforeEach, vi } from "vitest";
import { useCreditStore } from "@/store/creditStore";

vi.mock("@/api/credits", () => ({
  creditApi: {
    getBalance: vi.fn(),
    checkEligibility: vi.fn(),
  },
}));

import { creditApi } from "@/api/credits";

const mockedCreditApi = creditApi as unknown as {
  getBalance: ReturnType<typeof vi.fn>;
  checkEligibility: ReturnType<typeof vi.fn>;
};

describe("creditStore", () => {
  beforeEach(() => {
    useCreditStore.setState({
      credits: 0,
      isAdmin: false,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe("fetchBalance", () => {
    it("sets credits and isAdmin on success", async () => {
      mockedCreditApi.getBalance.mockResolvedValueOnce({
        credits: 42,
        is_admin: true,
      });

      await useCreditStore.getState().fetchBalance();

      expect(useCreditStore.getState().credits).toBe(42);
      expect(useCreditStore.getState().isAdmin).toBe(true);
      expect(useCreditStore.getState().isLoading).toBe(false);
    });

    it("sets isLoading to true during fetch", async () => {
      mockedCreditApi.getBalance.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve({ credits: 0, is_admin: false }), 100)),
      );

      const promise = useCreditStore.getState().fetchBalance();
      expect(useCreditStore.getState().isLoading).toBe(true);
      await promise;
    });

    it("sets error on failure", async () => {
      mockedCreditApi.getBalance.mockRejectedValueOnce(new Error("Network error"));

      await useCreditStore.getState().fetchBalance();

      expect(useCreditStore.getState().error).toBe("Network error");
      expect(useCreditStore.getState().isLoading).toBe(false);
    });

    it("clears previous error on new fetch", async () => {
      useCreditStore.setState({ error: "old error" });
      mockedCreditApi.getBalance.mockResolvedValueOnce({ credits: 10, is_admin: false });

      await useCreditStore.getState().fetchBalance();

      expect(useCreditStore.getState().error).toBeNull();
    });
  });

  describe("checkEligibility", () => {
    it("returns eligibility data on success", async () => {
      const eligibilityData = {
        eligible: true,
        required_credits: 5,
        current_credits: 42,
        scan_type: "ip",
      };
      mockedCreditApi.checkEligibility.mockResolvedValueOnce(eligibilityData);

      const result = await useCreditStore.getState().checkEligibility("ip");

      expect(result).toEqual(eligibilityData);
      expect(useCreditStore.getState().credits).toBe(42);
      expect(mockedCreditApi.checkEligibility).toHaveBeenCalledWith("ip");
    });

    it("returns null and sets error on failure", async () => {
      mockedCreditApi.checkEligibility.mockRejectedValueOnce(new Error("Insufficient credits"));

      const result = await useCreditStore.getState().checkEligibility("domain");

      expect(result).toBeNull();
      expect(useCreditStore.getState().error).toBe("Insufficient credits");
    });
  });
});
