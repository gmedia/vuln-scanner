import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { useCreditStore } from "@/store/creditStore";

interface EligibilityResult {
  eligible: boolean;
  error: string | null;
}

export function useScanCredit(scanType: string) {
  const { credits, fetchBalance, checkEligibility } = useCreditStore();
  const [cost, setCost] = useState(0);
  const [eligible, setEligible] = useState(true);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setEligibilityLoading(true);
      await fetchBalance();
      const result = await checkEligibility(scanType);
      if (cancelled) return;
      if (result) {
        setCost(result.required_credits);
        setEligible(result.eligible);
      }
      setEligibilityLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [scanType, fetchBalance, checkEligibility]);

  const creditDisplay = (
    <div
      data-testid="scan-credits-chip"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-xs text-foreground"
    >
      <Coins className="h-3.5 w-3.5 text-primary" aria-hidden />
      <span className="text-muted-foreground">Credits</span>
      <span className="font-semibold tabular-nums">{credits}</span>
    </div>
  );

  const balanceAfter = eligibilityLoading ? credits : credits - cost;

  const costPreview = (
    <div data-testid="scan-cost-preview" className="space-y-1 font-mono text-xs">
      {eligibilityLoading ? (
        <p className="text-muted-foreground">Checking cost…</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            Scan cost:{" "}
            <span className="font-medium text-foreground tabular-nums">{cost}</span>{" "}
            credits
          </p>
          <p className="text-muted-foreground">
            Balance after:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {balanceAfter}
            </span>
          </p>
          {!eligible && (
            <p className="text-red-400">
              Insufficient credits. Required: {cost}, Available: {credits}
            </p>
          )}
        </>
      )}
    </div>
  );

  const checkAndDeduct = async (type: string): Promise<EligibilityResult> => {
    const eligibility = await checkEligibility(type);
    if (!eligibility) {
      return { eligible: false, error: "Failed to check credit eligibility." };
    }
    setCost(eligibility.required_credits);
    setEligible(eligibility.eligible);
    if (!eligibility.eligible) {
      return {
        eligible: false,
        error: `Insufficient credits. Required: ${eligibility.required_credits}, Available: ${eligibility.current_credits}`,
      };
    }
    return { eligible: true, error: null };
  };

  const refreshAfterScan = () => {
    void fetchBalance();
  };

  return {
    credits,
    cost,
    eligible,
    eligibilityLoading,
    creditDisplay,
    costPreview,
    checkAndDeduct,
    refreshAfterScan,
  };
}
