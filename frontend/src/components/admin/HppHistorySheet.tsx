import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { toast } from "sonner";

import { getHppHistory, type HppSettingHistoryItem } from "@/api/admin";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const HPP_HISTORY_PAGE_SIZE = 20;

export type HppHistoryScope = "rate" | "overhead";

function formatHistoryTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAmount(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("id-ID");
}

function HistoryEntry({
  entry,
  locale,
}: {
  readonly entry: HppSettingHistoryItem;
  readonly locale: string;
}) {
  return (
    <li
      className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
      data-testid="hpp-history-entry"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {entry.key ? (
            <Badge variant="default" className="text-[10px] uppercase">
              {entry.key}
            </Badge>
          ) : null}
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatHistoryTime(entry.created_at, locale)}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {entry.actor_email ?? "—"}
        </span>
      </div>
      <p className="font-mono text-[11px] tabular-nums">
        <span className="text-muted-foreground">
          {formatAmount(entry.amount_from)}
        </span>
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="text-foreground">{formatAmount(entry.amount_to)}</span>
      </p>
    </li>
  );
}

/**
 * Read-only append-only change log for the HPP rates or the monthly overhead.
 *
 * Mirrors `SkuTierHistorySheet`: the same `page` / `page_size` pagination and
 * the same visual language, but HPP changes are a single amount transition
 * instead of a per-field diff. It is intentionally a separate component — the
 * SKU sheet's action badges and `changes` map have no equivalent here.
 */
export default function HppHistorySheet({
  open,
  onOpenChange,
  scope,
  page,
  onPageChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly scope: HppHistoryScope;
  readonly page: number;
  readonly onPageChange: (page: number) => void;
}) {
  const { t, i18n } = useTranslation("admin");
  const dateLocale = i18n.language === "en" ? "en-US" : "id-ID";
  const historyQ = useQuery({
    queryKey: ["hpp-history", scope, page],
    queryFn: () =>
      getHppHistory({
        scope,
        page,
        page_size: HPP_HISTORY_PAGE_SIZE,
      }),
    enabled: open,
  });

  useEffect(() => {
    if (historyQ.isError) {
      toast.error(t("tierHistoryError"));
    }
  }, [historyQ.isError, t]);

  const items = historyQ.data?.items ?? [];
  const total = historyQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / HPP_HISTORY_PAGE_SIZE));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg"
        data-testid="hpp-history-dialog"
      >
        <SheetHeader>
          <SheetTitle>
            {scope === "rate"
              ? t("hppHistoryRatesTitle")
              : t("hppHistoryOverheadTitle")}
          </SheetTitle>
          <SheetDescription>
            {scope === "rate"
              ? t("hppHistoryRatesDescription")
              : t("hppHistoryOverheadDescription")}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-4">
          {historyQ.isLoading ? (
            <p className="text-xs text-muted-foreground">
              {t("tierHistoryLoading")}
            </p>
          ) : items.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">
                {t("tierHistoryTotal", { total })}
              </p>
              <ul className="space-y-2">
                {items.map((entry) => (
                  <HistoryEntry
                    key={entry.id}
                    entry={entry}
                    locale={dateLocale}
                  />
                ))}
              </ul>
              <div className="flex items-center justify-between gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="hpp-history-prev"
                  disabled={page <= 1}
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                >
                  {t("tierHistoryPrev")}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  {t("tierHistoryPage", { page, pages })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="hpp-history-next"
                  disabled={page >= pages}
                  onClick={() => onPageChange(page + 1)}
                >
                  {t("tierHistoryNext")}
                </Button>
              </div>
            </>
          ) : (
            <p
              className="text-xs text-muted-foreground"
              data-testid="hpp-history-empty"
            >
              {t("tierHistoryEmpty")}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
