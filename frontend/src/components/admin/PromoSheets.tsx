import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  adminApi,
  type PromoCode,
  type PromoHistoryItem,
  type PromoRedemption,
} from "@/api/admin";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TableRowSkeleton } from "@/components/ui/Skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatIdr } from "@/components/invoice/invoicePrintFormat";

const PAGE_SIZE = 20;

function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation("admin");
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t("promoPrev")}
      </Button>
      <span className="text-[11px] text-muted-foreground">{t("pageOf", { page, total: pages })}</span>
      <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t("promoNext")}
      </Button>
    </div>
  );
}

export function PromoRedemptionsSheet({
  promo,
  onClose,
}: {
  promo: PromoCode | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("admin");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["admin-promo-redemptions", promo?.id, page],
    queryFn: () =>
      adminApi.listAdminPromoRedemptions(promo!.id, { page, page_size: PAGE_SIZE }),
    enabled: promo != null,
  });
  const items: PromoRedemption[] = q.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / PAGE_SIZE));

  return (
    <Sheet open={promo != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" data-testid="promo-redemptions-sheet">
        <SheetHeader>
          <SheetTitle>{t("promoRedemptionsTitle", { code: promo?.code })}</SheetTitle>
          <SheetDescription>{t("promoRedemptionsHint")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-4" data-testid="promo-redemptions">
          {q.isLoading ? (
            <TableRowSkeleton rows={4} columns={4} />
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("promoRedemptionsEmpty")}</p>
          ) : (
            <>
              <ul className="space-y-2">
                {items.map((row) => (
                  <li key={row.id} className="space-y-1 rounded-md border border-border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-foreground">{row.organization_name ?? "—"}</span>
                      <Badge variant={row.status === "applied" ? "success" : "default"} className="text-[10px] uppercase">
                        {row.status}
                      </Badge>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {row.invoice_number ?? "—"} · {formatIdr(row.discount_idr)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(row.created_at).toLocaleString("id-ID")}
                      {row.released_at
                        ? ` · ${t("promoReleasedAt", { date: new Date(row.released_at).toLocaleString("id-ID") })}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
              <Pager page={page} pages={pages} onPage={setPage} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function PromoHistorySheet({
  promo,
  onClose,
}: {
  promo: PromoCode | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("admin");
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["admin-promo-history", promo?.id, page],
    queryFn: () =>
      adminApi.listAdminPromoHistory(promo!.id, { page, page_size: PAGE_SIZE }),
    enabled: promo != null,
  });
  const items: PromoHistoryItem[] = q.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / PAGE_SIZE));

  return (
    <Sheet open={promo != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" data-testid="promo-history-sheet">
        <SheetHeader>
          <SheetTitle>{t("promoHistoryTitle", { code: promo?.code })}</SheetTitle>
          <SheetDescription>{t("promoHistoryHint")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-4" data-testid="promo-history">
          {q.isLoading ? (
            <TableRowSkeleton rows={4} columns={3} />
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("promoHistoryEmpty")}</p>
          ) : (
            <>
              <ul className="space-y-2">
                {items.map((row) => (
                  <li key={row.id} className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="info" className="text-[10px] uppercase">
                        {row.action}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{row.actor_email ?? "—"}</span>
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {new Date(row.created_at).toLocaleString("id-ID")}
                    </p>
                    <dl className="space-y-1">
                      {Object.entries(row.changes).map(([field, change]) => (
                        <div key={field} className="flex flex-wrap items-baseline gap-1 font-mono text-[11px]">
                          <dt className="text-muted-foreground">{field}:</dt>
                          <dd className="text-foreground">
                            {String(change.from ?? "—")}
                            <span className="mx-1 text-muted-foreground">→</span>
                            {String(change.to ?? "—")}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
              <Pager page={page} pages={pages} onPage={setPage} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
