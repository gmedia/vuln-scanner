import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Radar, Loader2, Coins } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useStartIpScan } from "@/hooks/useScan";
import { useScanError } from "@/hooks/useScanError";
import { useScanStore } from "@/store/scanStore";
import { useCreditStore } from "@/store/creditStore";
import { isValidPort } from "@/lib/utils";

function IpScanForm() {
  const [target, setTarget] = useState("");
  const [ports, setPorts] = useState("1-1000");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const startIpScan = useStartIpScan();
  const handleScanError = useScanError();
  const setActiveScan = useScanStore((s) => s.setActiveScan);
  const { credits, fetchBalance, checkEligibility } = useCreditStore();

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

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

    const eligibility = await checkEligibility("ip");
    if (!eligibility) {
      setError("Failed to check credit eligibility.");
      return;
    }
    if (!eligibility.eligible) {
      setError(`Insufficient credits. Required: ${eligibility.required_credits}, Available: ${eligibility.current_credits}`);
      return;
    }

    startIpScan.mutate(
      { target: target.trim(), ports: ports.trim() || "1-1000" },
      {
        onSuccess: (data) => {
          setActiveScan(data.id, "ip");
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
          TARGET IP ADDRESS
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
          className="font-mono"
        />
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-xs font-medium text-muted-foreground">
          PORT RANGE
        </label>
        <Input
          type="text"
          placeholder="1-1000"
          value={ports}
          onChange={(e) => setPorts(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={startIpScan.isPending}
          className="font-mono"
        />
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
          Format: start-end (e.g. 1-1000) or comma-separated (e.g. 22,80,443)
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-600/30 bg-red-600/10 px-3 py-2">
          <p className="font-mono text-xs text-red-400">{error}</p>
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={startIpScan.isPending}
        size="lg"
        className="w-full"
      >
        {startIpScan.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            INITIALIZING SCAN...
          </>
        ) : (
          <>
            <Radar className="mr-2 h-4 w-4" />
            START IP SCAN
          </>
        )}
      </Button>
    </div>
  );
}

export default IpScanForm;
