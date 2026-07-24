import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useStartIpScan } from "@/hooks/useScan";
import { useScanError } from "@/hooks/useScanError";
import { useScanCredit } from "@/hooks/useScanCredit";
import { useScanStore } from "@/store/scanStore";
import { isValidPort } from "@/lib/utils";
import { ScanError } from "./ScanError";

function IpScanForm() {
  const [target, setTarget] = useState("");
  const [ports, setPorts] = useState("1-1000");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const startIpScan = useStartIpScan();
  const handleScanError = useScanError();
  const setActiveScan = useScanStore((s) => s.setActiveScan);
  const {
    creditDisplay,
    costPreview,
    checkAndDeduct,
    refreshAfterScan,
    eligible,
    eligibilityLoading,
  } = useScanCredit("ip");

  const isValidIp = (ip: string) =>
    /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(ip);

  const handleSubmit = async () => {
    setError("");
    if (!target.trim()) {
      setError("IP address is required");
      return;
    }
    if (!isValidIp(target.trim())) {
      setError("Invalid IP address format (e.g. 192.168.1.1)");
      return;
    }
    if (!isValidPort(ports)) {
      setError("Invalid port format. Use start-end (e.g. 1-1000) or comma-separated (e.g. 22,80,443). Ports must be 1-65535.");
      return;
    }

    const { eligible: canScan, error: creditError } = await checkAndDeduct("ip");
    if (!canScan) {
      setError(creditError!);
      return;
    }

    startIpScan.mutate(
      { target: target.trim(), ports: ports.trim() || "1-1000" },
      {
        onSuccess: (data) => {
          setActiveScan(data.id, "ip");
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
    startIpScan.isPending || (!eligibilityLoading && !eligible);

  return (
    <div className="space-y-4">
      {creditDisplay}

      <div>
        <label className="mb-1.5 block font-mono text-xs font-medium text-foreground/70">
          Target IP address
        </label>
        <Input
          type="text"
          placeholder="192.168.1.1"
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={startIpScan.isPending}
          className="border-border bg-background font-mono"
        />
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-xs font-medium text-foreground/70">
          Port range
        </label>
        <Input
          type="text"
          placeholder="1-1000"
          value={ports}
          onChange={(e) => setPorts(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={startIpScan.isPending}
          className="border-border bg-background font-mono"
        />
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          Format: start-end (e.g. 1-1000) or comma-separated (e.g. 22,80,443)
        </p>
      </div>

      {error && <ScanError message={error} />}

      {costPreview}

      <Button
        onClick={handleSubmit}
        disabled={submitDisabled}
        size="lg"
        className="w-full"
      >
        {startIpScan.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Initializing scan...
          </>
        ) : (
          <>
            <Radar className="mr-2 h-4 w-4" />
            Start IP scan
          </>
        )}
      </Button>
    </div>
  );
}

export default IpScanForm;
