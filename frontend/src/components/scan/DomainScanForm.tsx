import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useStartDomainScan } from "@/hooks/useScan";
import { useScanError } from "@/hooks/useScanError";
import { useScanCredit } from "@/hooks/useScanCredit";
import { useScanStore } from "@/store/scanStore";
import { ScanError } from "./ScanError";

function DomainScanForm() {
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const startDomainScan = useStartDomainScan();
  const handleScanError = useScanError();
  const setActiveScan = useScanStore((s) => s.setActiveScan);
  const {
    creditDisplay,
    costPreview,
    checkAndDeduct,
    refreshAfterScan,
    eligible,
    eligibilityLoading,
  } = useScanCredit("domain");

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

    const { eligible: canScan, error: creditError } = await checkAndDeduct("domain");
    if (!canScan) {
      setError(creditError!);
      return;
    }

    startDomainScan.mutate(
      { domain: trimmed },
      {
        onSuccess: (data) => {
          setActiveScan(data.id, "domain");
          refreshAfterScan();
          navigate(`/scan/${data.id}`);
        },
        onError: (err) => {
          setError(handleScanError(err));
        },
      },
    );
  };

  const submitDisabled =
    startDomainScan.isPending || (!eligibilityLoading && !eligible);

  return (
    <div className="space-y-4">
      {creditDisplay}

      <div>
        <label className="mb-1.5 block font-mono text-xs font-medium text-foreground/70">
          Target domain
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
          className="border-border bg-background font-mono"
        />
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          e.g. example.com, sub.example.com
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="try-example-domain"
          className="mt-2"
          onClick={() => {
            setDomain("example.com");
            setError("");
          }}
          disabled={startDomainScan.isPending}
        >
          Try example.com
        </Button>
      </div>

      {error && <ScanError message={error} />}

      {costPreview}

      <Button
        onClick={handleSubmit}
        disabled={submitDisabled}
        size="lg"
        className="w-full"
      >
        {startDomainScan.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Initializing scan...
          </>
        ) : (
          <>
            <Globe className="mr-2 h-4 w-4" />
            Start domain scan
          </>
        )}
      </Button>
    </div>
  );
}

export default DomainScanForm;
