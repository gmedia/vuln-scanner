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
  const { creditDisplay, checkAndDeduct, refreshAfterScan } = useScanCredit();

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

    const { eligible, error: creditError } = await checkAndDeduct("domain");
    if (!eligible) {
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
        onError: (error) => {
          setError(handleScanError(error));
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {creditDisplay}

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

      {error && <ScanError message={error} />}

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
