import { useEffect } from "react";
import { Coins } from "lucide-react";
import { useCreditStore } from "@/store/creditStore";

interface EligibilityResult {
  eligible: boolean;
  error: string | null;
}

export function useScanCredit() {
  const { credits, fetchBalance, checkEligibility } = useCreditStore();

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const creditDisplay = (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
      <span className="font-mono text-xs text-muted-foreground">Available Credits</span>
      <span className="flex items-center gap-1 font-mono text-sm font-bold text-primary">
        <Coins className="h-3.5 w-3.5" />
        {credits}
      </span>
    </div>
  );

  const checkAndDeduct = async (scanType: string): Promise<EligibilityResult> => {
    const eligibility = await checkEligibility(scanType);
    if (!eligibility) {
      return { eligible: false, error: "Failed to check credit eligibility." };
    }
    if (!eligibility.eligible) {
      return {
        eligible: false,
        error: `Insufficient credits. Required: ${eligibility.required_credits}, Available: ${eligibility.current_credits}`,
      };
    }
    return { eligible: true, error: null };
  };

  const refreshAfterScan = () => {
    fetchBalance();
  };

  return { credits, creditDisplay, checkAndDeduct, refreshAfterScan };
}
