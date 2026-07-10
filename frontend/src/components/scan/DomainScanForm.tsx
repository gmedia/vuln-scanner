import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, Loader2, Coins } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useStartDomainScan } from "@/hooks/useScan";
import { useScanError } from "@/hooks/useScanError";
import { useScanStore } from "@/store/scanStore";
import { useCreditStore } from "@/store/creditStore";

function DomainScanForm() {
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const startDomainScan = useStartDomainScan();
  const handleScanError = useScanError();
  const setActiveScan = useScanStore((s) => s.setActiveScan);
  const { credits, fetchBalance, checkEligibility } = useCreditStore();

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const isValidDomain = (d: string) =>
    /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(d);

  const handleSubmit = async () => {
    setError("");
    const trimmed = domain.trim();
    if (!trimmed) {
      setError("Domain name is required");
      return;
    }
    if (!isValidDomain(trimmed)) {
      setError("Invalid domain format (e.g. example.com)");
      return;
    }

    const eligibility = await checkEligibility("domain");
    if (!eligibility) {
      setError("Failed to check credit eligibility.");
      return;
    }
    if (!eligibility.eligible) {
      setError(`Insufficient credits. Required: ${eligibility.required_credits}, Available: ${eligibility.current_credits}`);
      return;
    }

    startDomainScan.mutate(
      { domain: trimmed },
      {
        onSuccess: (data) => {
          setActiveScan(data.id, "domain");
          fetchBalance();
          navigate(`/scan/${data.id}`);
        },
        onError: (error) => {
          setError(handleScanError(error));
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
        <span className="font-mono text-xs text-muted-foreground">Available Credits</span>
        <span className="flex items-center gap-1 font-mono text-sm font-bold text-primary">
          <Coins className="h-3.5 w-3.5" />
          {credits}
        </span>
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-xs font-medium text-muted-foreground">
          TARGET DOMAIN
        </label>
        <Input
          type="text"
          placeholder="example.com"
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={startDomainScan.isPending}
          className="font-mono"
        />
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          e.g. example.com, sub.example.com
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2">
          <p className="font-mono text-xs text-red-400">{error}</p>
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={startDomainScan.isPending}
        size="lg"
        className="w-full"
      >
        {startDomainScan.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            INITIALIZING SCAN...
          </>
        ) : (
          <>
            <Globe className="mr-2 h-4 w-4" />
            START DOMAIN SCAN
          </>
        )}
      </Button>
    </div>
  );
}

export default DomainScanForm;
