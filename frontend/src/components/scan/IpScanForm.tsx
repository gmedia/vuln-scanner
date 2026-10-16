import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Radar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useStartIpScan } from "@/hooks/useScan";
import { useScanError } from "@/hooks/useScanError";
import { useScanStore } from "@/store/scanStore";
import { isValidPort } from "@/lib/utils";
import { ScanError } from "./ScanError";

type ScanErrorState = { key: string; message: string } | null;

function IpScanForm() {
  const { t } = useTranslation("scan");
  const [target, setTarget] = useState("");
  const [ports, setPorts] = useState("1-1000");
  const [error, setError] = useState<ScanErrorState>(null);
  const navigate = useNavigate();
  const startIpScan = useStartIpScan();
  const handleScanError = useScanError();
  const setActiveScan = useScanStore((s) => s.setActiveScan);

  const isValidIp = (ip: string) =>
    /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(ip);

  const handleSubmit = async () => {
    setError(null);
    if (!target.trim()) {
      setError({ key: "errIpRequired", message: t("errIpRequired") });
      return;
    }
    if (!isValidIp(target.trim())) {
      setError({ key: "errIpFormat", message: t("errIpFormat") });
      return;
    }
    if (!isValidPort(ports)) {
      setError({ key: "errIpPorts", message: t("errIpPorts") });
      return;
    }

    startIpScan.mutate(
      { target: target.trim(), ports: ports.trim() || "1-1000" },
      {
        onSuccess: (data) => {
          setActiveScan(data.id, "ip");
          navigate(`/scan/${data.id}`);
        },
        onError: (err) => {
          setError({ key: "server", message: handleScanError(err) });
        },
      },
    );
  };

  const submitDisabled = startIpScan.isPending;

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="ip-scan-target" className="mb-1.5 block text-foreground/70">
          {t("ipTargetLabel")}
        </Label>
        <Input
          id="ip-scan-target"
          type="text"
          placeholder="192.168.1.1"
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={startIpScan.isPending}
          className="border-border bg-background font-mono"
        />
      </div>

      <div>
        <Label htmlFor="ip-scan-ports" className="mb-1.5 block text-foreground/70">
          {t("ipPortLabel")}
        </Label>
        <Input
          id="ip-scan-ports"
          type="text"
          placeholder="1-1000"
          value={ports}
          onChange={(e) => setPorts(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={startIpScan.isPending}
          className="border-border bg-background font-mono"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t("ipPortHint")}
        </p>
      </div>

      {error && <ScanError message={error.message} errorKey={error.key} />}

      <Button
        data-testid="ip-scan-submit"
        onClick={handleSubmit}
        disabled={submitDisabled}
        className="w-full sm:w-auto"
      >
        {startIpScan.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("initializingScan")}
          </>
        ) : (
          <>
            <Radar className="mr-2 h-4 w-4" />
            {t("startIpScan")}
          </>
        )}
      </Button>
    </div>
  );
}

export default IpScanForm;
