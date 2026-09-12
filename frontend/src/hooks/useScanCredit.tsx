import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCreditStore } from "@/store/creditStore";
import { formatCredits } from "@/lib/utils";

const ELIGIBILITY_TIMEOUT_MS = 8_000;

interface EligibilityResult {
  eligible: boolean;
  error: string | null;
}

export function useScanCredit(scanType: string) {
  const { t } = useTranslation("scan");
  const { credits, fetchBalance, checkEligibility } = useCreditStore();
  const [cost, setCost] = useState(0);
  const [eligible, setEligible] = useState(true);
  const [eligibilityLoading, setEligibilityLoading] = useState(true);
  const [costUnavailable, setCostUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const finishUnavailable = () => {
      if (cancelled) return;
      setEligible(true);
      setCostUnavailable(false);
      setEligibilityLoading(false);
    };

    const load = async () => {
      setEligibilityLoading(true);
      setCostUnavailable(false);
      setEligible(true);
      timeoutId = setTimeout(finishUnavailable, ELIGIBILITY_TIMEOUT_MS);
      await fetchBalance();
      const result = await Promise.race([
        checkEligibility(scanType),
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), ELIGIBILITY_TIMEOUT_MS);
        }),
      ]);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (cancelled) return;
      if (result) {
        setCost(result.required_credits);
        setEligible(true);
        setCostUnavailable(false);
      } else {
        setEligible(true);
        setCostUnavailable(false);
      }
      setEligibilityLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [scanType, fetchBalance, checkEligibility]);

  const creditDisplay = (
    <div
      data-testid="scan-credits-chip"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-foreground"
    >
      <Coins className="h-3.5 w-3.5 text-primary" aria-hidden />
      <span className="text-muted-foreground">Credits</span>
      <span className="font-mono font-semibold tabular-nums">{credits}</span>
    </div>
  );

  const balanceAfter = eligibilityLoading ? credits : credits - cost;

  const costPreview = (
    <div data-testid="scan-cost-preview" className="space-y-1 text-xs">
      {eligibilityLoading ? (
        <p className="text-muted-foreground">{t("checkingCost")}</p>
      ) : costUnavailable ? (
        <p className="text-muted-foreground">{t("costUnavailable")}</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            {t("scanCost")}{" "}
            <span className="font-mono font-medium text-foreground tabular-nums">
              {formatCredits(cost)}
            </span>
          </p>
          <p className="text-muted-foreground">
            {t("balanceAfter")}{" "}
            <span className="font-mono font-medium text-foreground tabular-nums">
              {balanceAfter}
            </span>
          </p>
          {!eligible && (
            <p className="text-red-400">
              {t("insufficientCredits", { required: cost, available: credits })}
            </p>
          )}
        </>
      )}
    </div>
  );

  const checkAndDeduct = async (_type: string): Promise<EligibilityResult> => {
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
    costUnavailable,
    creditDisplay,
    costPreview,
    checkAndDeduct,
    refreshAfterScan,
  };
}
