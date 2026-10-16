import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useStartDomainScan } from "@/hooks/useScan";
import { useScanError } from "@/hooks/useScanError";
import { useScanStore } from "@/store/scanStore";
import { ScanError } from "./ScanError";

type ScanErrorState = { key: string; message: string } | null;

function DomainScanForm() {
  const { t } = useTranslation("scan");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<ScanErrorState>(null);
  const navigate = useNavigate();
  const startDomainScan = useStartDomainScan();
  const handleScanError = useScanError();
  const setActiveScan = useScanStore((s) => s.setActiveScan);

  const isValidDomain = (d: string) =>
    /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(d);

  const handleSubmit = async () => {
    setError(null);
    const trimmed = domain.trim();
    if (!trimmed) {
      setError({ key: "errDomainRequired", message: t("errDomainRequired") });
      return;
    }
    if (!isValidDomain(trimmed)) {
      setError({ key: "errDomainFormat", message: t("errDomainFormat") });
      return;
    }

    startDomainScan.mutate(
      { domain: trimmed },
      {
        onSuccess: (data) => {
          setActiveScan(data.id, "domain");
          navigate(`/scan/${data.id}`);
        },
        onError: (err) => {
          setError({ key: "server", message: handleScanError(err) });
        },
      },
    );
  };

  const submitDisabled = startDomainScan.isPending;

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="domain-scan-target" className="mb-1.5 block text-foreground/70">
          {t("domainTargetLabel")}
        </Label>
        <Input
          id="domain-scan-target"
          type="text"
          placeholder="example.com"
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={startDomainScan.isPending}
          className="border-border bg-background font-mono placeholder:text-foreground/50"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t("domainHint")}
        </p>
        <Button
          type="button"
          variant="link"
          size="sm"
          data-testid="try-example-domain"
          className="mt-1 h-auto min-h-0 px-0"
          onClick={() => {
            setDomain("example.com");
            setError(null);
          }}
          disabled={startDomainScan.isPending}
        >
          {t("tryExampleDomain")}
        </Button>
      </div>

      {error && <ScanError message={error.message} errorKey={error.key} />}

      <Button
        data-testid="domain-scan-submit"
        onClick={handleSubmit}
        disabled={submitDisabled}
        className="w-full sm:w-auto"
      >
        {startDomainScan.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("initializingScan")}
          </>
        ) : (
          <>
            <Globe className="mr-2 h-4 w-4" />
            {t("startDomainScan")}
          </>
        )}
      </Button>
    </div>
  );
}

export default DomainScanForm;
