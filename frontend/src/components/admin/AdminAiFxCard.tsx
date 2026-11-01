import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import type { AiFxStatus } from "@/api/admin";
import { AdminAiField } from "@/components/admin/AdminAiField";
import {
  FX_STALE_DAYS,
  formatIdr,
  fxRateAgeDays,
  parsePriceInput,
} from "@/components/admin/aiFormat";
import { Button } from "@/components/ui/Button";
import { toneText } from "@/lib/toneMap";
import { cn } from "@/lib/utils";

export function AdminAiFxCard({
  fx,
  loading,
  refreshing,
  saving,
  onRefresh,
  onSaveManual,
  refreshDisabled,
}: {
  readonly fx: AiFxStatus | undefined;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly saving: boolean;
  readonly onRefresh: () => void;
  readonly onSaveManual: (rate: number) => void;
  readonly refreshDisabled: boolean;
}) {
  const { t } = useTranslation("admin");
  const [manual, setManual] = useState("");
  const manualRate = parsePriceInput(manual);
  const history = fx?.history.slice(0, 5) ?? [];
  const ageDays = fxRateAgeDays(fx?.effective_date);
  const showStale =
    fx !== undefined &&
    !fx.using_env_fallback &&
    ageDays !== null &&
    ageDays > FX_STALE_DAYS;

  return (
    <section
      className="rounded-lg border border-border bg-card p-3"
      data-testid="admin-ai-fx-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t("aiFxTitle")}</p>
          <p className="mt-1 font-mono text-lg tabular-nums text-foreground">
            {formatIdr(fx?.rate)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              / 1 USD
            </span>
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={refreshDisabled || refreshing || loading}
        >
          {t("aiFxRefresh")}
        </Button>
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
        <div className="flex min-w-0 gap-1">
          <dt className="shrink-0 text-muted-foreground">{t("aiFxSource")}:</dt>
          <dd className="min-w-0 break-all font-mono">{fx?.source ?? "—"}</dd>
        </div>
        <div className="flex min-w-0 gap-1">
          <dt className="shrink-0 text-muted-foreground">{t("aiFxEnvRate")}:</dt>
          <dd className="min-w-0 break-all font-mono">{formatIdr(fx?.env_rate)}</dd>
        </div>
        <div className="flex min-w-0 gap-1">
          <dt className="shrink-0 text-muted-foreground">{t("aiFxEffective")}:</dt>
          <dd className="min-w-0 break-all font-mono">
            {fx?.effective_date ?? "—"}
          </dd>
        </div>
      </dl>

      {showStale ? (
        <p
          data-testid="admin-ai-fx-stale"
          className={cn("mt-2 flex items-start gap-1.5 text-xs", toneText("warn"))}
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{t("aiFxStale", { days: ageDays })}</span>
        </p>
      ) : null}

      {fx?.using_env_fallback ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("aiFxFallbackNote")}</p>
      ) : null}
      {fx && !fx.auto_fetch_enabled ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("aiFxAutoOff")}</p>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <AdminAiField
            id="ai-fx-manual"
            label={t("aiFxManualLabel")}
            value={manual}
            onChange={setManual}
          />
        </div>
        <Button
          type="button"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => {
            if (manualRate != null) onSaveManual(manualRate);
          }}
          disabled={manualRate == null || saving}
        >
          {t("aiFxManualSave")}
        </Button>
      </div>

      {history.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
          {history.map((row) => (
            <li key={row.id} className="font-mono tabular-nums">
              {row.effective_date} · {row.source} · {formatIdr(row.rate)}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2 text-xs text-muted-foreground">{t("aiFxCogsNote")}</p>
    </section>
  );
}
