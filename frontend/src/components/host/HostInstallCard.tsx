import { Download, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SiemRail } from "@/components/siem/siemChrome";
import { Button } from "@/components/ui/Button";
import {
  SINEXIS_INSTALL_RAW_URL,
  SINEXIS_INSTALL_WGET,
} from "@/lib/sinexisInstall";

export default function HostInstallCard() {
  const { t } = useTranslation("host");
  return (
    <div
      data-testid="host-install-card"
      className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-4"
    >
      <SiemRail className="bg-primary" />
      <div className="flex flex-col gap-3 pl-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40"
            aria-hidden
          >
            <Terminal className="h-4 w-4 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t("installDetails")}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("installHint")}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <a
            href={SINEXIS_INSTALL_RAW_URL}
            download="sinexis-install.sh"
            rel="noreferrer"
            data-testid="host-install-download"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t("installDownload")}
          </a>
        </Button>
      </div>
      <pre
        className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground"
        data-testid="host-install-wget"
      >
        {SINEXIS_INSTALL_WGET}
      </pre>
      <p className="mt-2 text-xs text-muted-foreground">{t("installCheck")}</p>
    </div>
  );
}
