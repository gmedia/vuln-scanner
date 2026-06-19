import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useStartDomainScan } from "@/hooks/useScan";
import { useScanStore } from "@/store/scanStore";

function DomainScanForm() {
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const startDomainScan = useStartDomainScan();
  const setActiveScan = useScanStore((s) => s.setActiveScan);

  const isValidDomain = (d: string) =>
    /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(d);

  const handleSubmit = () => {
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

    startDomainScan.mutate(
      { domain: trimmed },
      {
        onSuccess: (data) => {
          setActiveScan(data.id, "domain");
          navigate(`/scan/${data.id}`);
        },
        onError: () => {
          setError("Failed to start scan. Check your connection.");
        },
      },
    );
  };

  return (
    <div className="space-y-4">
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
