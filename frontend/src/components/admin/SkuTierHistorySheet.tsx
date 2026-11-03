import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { toast } from "sonner";

import {
  getOrgTierHistory,
  getSkuTierHistory,
  type SkuTierHistoryItem,
} from "@/api/admin";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const HISTORY_PAGE_SIZE = 20;

const HISTORY_ACTION_KEYS: Record<string, string> = {
  created: "tierHistoryActionCreated",
  updated: "tierHistoryActionUpdated",
  deactivated: "tierHistoryActionDeactivated",
  reactivated: "tierHistoryActionReactivated",
  deleted: "tierHistoryActionDeleted",
  price_updated: "tierHistoryActionPriceUpdated",
  assigned: "tierHistoryActionAssigned",
};

const HISTORY_ACTION_VARIANTS: Record<
  string,
  "default" | "info" | "success" | "pending" | "failed"
> = {
  created: "success",
  updated: "info",
  deactivated: "pending",
  reactivated: "success",
  deleted: "failed",
  price_updated: "info",
  assigned: "info",
};

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

function formatHistoryValue(field: string, value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (
    (field === "bundle_idr" || field.endsWith(".list_idr")) &&
    typeof value === "number"
  ) {
    return value.toLocaleString("id-ID");
  }
  return String(value);
}

function HistoryEntry({
  entry,
  locale,
  t,
}: {
  readonly entry: SkuTierHistoryItem;
  readonly locale: string;
  readonly t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const actionKey = HISTORY_ACTION_KEYS[entry.action];
  return (
    <li
      className="space-y-2 rounded-md border border-border bg-muted/30 p-3"
      data-testid="sku-tier-history-entry"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            variant={HISTORY_ACTION_VARIANTS[entry.action] ?? "default"}
            className="text-[10px] uppercase"
          >
            {actionKey ? t(actionKey) : entry.action}
          </Badge>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatHistoryTime(entry.created_at, locale)}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {entry.actor_email ?? "—"}
        </span>
      </div>
      {entry.organization_name ? (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="sku-tier-history-org"
        >
          {entry.organization_name}
        </p>
      ) : null}
      <dl className="space-y-1">
        {Object.entries(entry.changes).map(([field, change]) => (
          <div
            key={field}
            className="flex flex-wrap items-baseline gap-1 font-mono text-[11px]"
          >
            <dt className="text-muted-foreground">{field}:</dt>
            <dd className="text-foreground">
              {formatHistoryValue(field, change.from)}
              <span className="mx-1 text-muted-foreground">→</span>
              {formatHistoryValue(field, change.to)}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

export type SkuTierHistoryScope =
  | { kind: "tier"; code: string; label: string }
  | { kind: "org"; orgId: string; label: string };

/**
 * Read-only append-only change log for one SKU tier or one organization.
 *
 * Shared by the "Tier & Fitur" table, the "Harga" catalog rows and the orgs
 * drill-down so a tier move can be traced from the screen it was made on.
 * Pagination mirrors `GET /api/admin/email-logs` (`page` + `page_size`,
 * `items` + `total`).
 */
export default function SkuTierHistorySheet({
  open,
  onOpenChange,
  scope,
  page,
  onPageChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly scope: SkuTierHistoryScope;
  readonly page: number;
  readonly onPageChange: (page: number) => void;
}) {
  const { t, i18n } = useTranslation("admin");
  const dateLocale = i18n.language === "en" ? "en-US" : "id-ID";
  const scopeId = scope.kind === "tier" ? scope.code : scope.orgId;
  const historyQ = useQuery({
    queryKey: ["sku-tier-history", scope.kind, scopeId, page],
    queryFn: () =>
      scope.kind === "tier"
        ? getSkuTierHistory(scope.code, {
            page,
            page_size: HISTORY_PAGE_SIZE,
          })
        : getOrgTierHistory(scope.orgId, {
            page,
            page_size: HISTORY_PAGE_SIZE,
          }),
    enabled: open && scopeId !== "",
  });

  useEffect(() => {
    if (historyQ.isError) {
      toast.error(t("tierHistoryError"));
    }
  }, [historyQ.isError, t]);

  const items = historyQ.data?.items ?? [];
  const total = historyQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg"
        data-testid="sku-tier-history-dialog"
      >
        <SheetHeader>
          <SheetTitle>
            {scope.kind === "tier"
              ? t("tierHistoryTitle", { label: scope.label })
              : t("tierHistoryOrgTitle", { name: scope.label })}
          </SheetTitle>
          <SheetDescription>
            {scope.kind === "tier"
              ? t("tierHistoryDescription")
              : t("tierHistoryOrgDescription")}
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
                    t={t}
                  />
                ))}
              </ul>
              <div className="flex items-center justify-between gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="sku-tier-history-prev"
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
                  data-testid="sku-tier-history-next"
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
              data-testid="sku-tier-history-empty"
            >
              {t("tierHistoryEmpty")}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
