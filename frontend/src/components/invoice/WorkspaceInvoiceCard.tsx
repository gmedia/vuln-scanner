import { CalendarDays, Download, Landmark, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { seatsForSku } from "@/components/invoice/invoicePrintFormat";
import type { OrgInvoiceItem } from "@/api/orgs";

function invoiceStatusVariant(
  status: string,
): "success" | "pending" | "info" | "failed" {
  if (status === "paid") return "success";
  if (status === "sent") return "pending";
  if (status === "void") return "failed";
  return "info";
}

function formatShortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function WorkspaceInvoiceCard({
  invoice,
  onPrint,
  onDownload,
}: {
  invoice: OrgInvoiceItem;
  onPrint: () => void;
  onDownload: () => void;
}) {
  const { t, i18n } = useTranslation("workspace");
  const locale = i18n.language === "en" ? "en-US" : "id-ID";
  const showActions = invoice.status === "sent" || invoice.status === "paid";
  const showBank = invoice.status === "sent";
  const statusText = t(`invoicePrintStatus_${invoice.status}`, {
    defaultValue: invoice.status,
  });
  const itemLabel = t(`invoicePrintItem_${invoice.product}`, {
    sku: invoice.sku.toUpperCase(),
    defaultValue: t("invoicePrintItem", { sku: invoice.sku.toUpperCase() }),
  });
  const period = `${formatShortDate(invoice.period_start, locale)} – ${formatShortDate(invoice.period_end, locale)}`;
  const issued = formatShortDate(
    invoice.created_at ?? invoice.period_start,
    locale,
  );

  return (
    <li
      data-testid={`workspace-invoice-${invoice.id}`}
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium text-foreground">
            {itemLabel}
          </p>
          <p className="break-all font-mono text-xs text-muted-foreground">
            {invoice.number}
          </p>
        </div>
        <Badge
          variant={invoiceStatusVariant(invoice.status)}
          data-status={invoice.status}
          className="shrink-0 text-[10px] uppercase"
        >
          {statusText}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-3 px-4 pb-3 text-xs sm:grid-cols-3">
        <div className="min-w-0 space-y-0.5">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("invoicePrintSku")}
          </dt>
          <dd className="font-mono uppercase text-foreground">
            {invoice.sku} · {seatsForSku(invoice.sku)} {t("invoicePrintSeats")}
          </dd>
        </div>
        <div className="col-span-2 min-w-0 space-y-0.5 sm:col-span-2">
          <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
            {t("invoicePrintPeriod")}
          </dt>
          <dd className="truncate text-foreground" title={period}>
            {period}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-3 border-t border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("invoicePrintAmount")}
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
            Rp {invoice.amount_idr.toLocaleString("id-ID")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("invoicePrintIssued")} {issued}
          </p>
        </div>
        {showActions ? (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="no-print min-h-11 w-full bg-card sm:w-auto"
              data-testid="invoice-print"
              aria-label={invoice.number}
              onClick={onPrint}
            >
              <Printer className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden />
              {t("invoicePrint")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="no-print min-h-11 w-full bg-card sm:w-auto"
              data-testid="invoice-pdf"
              aria-label={`${invoice.number} pdf`}
              onClick={onDownload}
            >
              <Download className="mr-1 h-3.5 w-3.5 shrink-0" aria-hidden />
              {t("invoicePdf")}
            </Button>
          </div>
        ) : null}
      </div>

      {showBank ? (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
            <Landmark
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("billingBank", {
                name: invoice.bank?.bank_name ?? "—",
                account: invoice.bank?.bank_account ?? "—",
                holder: invoice.bank?.bank_holder ?? "—",
              })}
            </p>
          </div>
        </div>
      ) : null}

      {invoice.status === "paid" && invoice.bank_ref ? (
        <div className="border-t border-border px-4 py-2.5">
          <p className="font-mono text-xs text-muted-foreground">
            {t("invoicePrintRef")}: {invoice.bank_ref}
          </p>
        </div>
      ) : null}

      {invoice.notes?.trim() ? (
        <div className="border-t border-border px-4 py-2.5">
          <p className="text-xs text-muted-foreground">{invoice.notes}</p>
        </div>
      ) : null}
    </li>
  );
}
