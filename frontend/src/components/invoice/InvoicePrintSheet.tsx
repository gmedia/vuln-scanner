import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BRAND } from "@/lib/brand";
import {
  formatIdr,
  formatPeriod,
  seatsForSku,
  statusModifier,
} from "@/components/invoice/invoicePrintFormat";

export type InvoicePrintBank = {
  bank_name: string | null;
  bank_account: string | null;
  bank_holder: string | null;
} | null;

export type InvoicePrintData = {
  number: string;
  sku: string;
  product: "scan" | "host";
  amount_idr: number;
  period_start: string;
  period_end: string;
  status: string;
  bank_ref: string | null;
  bank?: InvoicePrintBank;
  organization_name?: string | null;
  created_at?: string;
};

export function InvoicePrintSheet({
  invoice,
  billTo,
}: {
  invoice: InvoicePrintData | null;
  billTo?: string | null;
}) {
  const { t } = useTranslation("workspace");
  if (!invoice) return null;

  const showBank = invoice.status === "sent";
  const bank = showBank ? invoice.bank : null;
  const to = billTo ?? invoice.organization_name ?? "—";
  const skuLabel = invoice.sku.toUpperCase();
  const seats = seatsForSku(invoice.sku);
  const amount = formatIdr(invoice.amount_idr);
  const issued = formatPeriod(invoice.created_at ?? invoice.period_start);
  const period = `${formatPeriod(invoice.period_start)} – ${formatPeriod(invoice.period_end)}`;
  const statusKey = `invoicePrintStatus_${invoice.status}`;
  const statusText = t(statusKey, { defaultValue: invoice.status });

  return (
    <article
      className="invoice-print-sheet hidden"
      data-testid="invoice-print-sheet"
      aria-label={invoice.number}
    >
      <header className="inv-header">
        <p className="invoice-print-brand">
          {BRAND.markPrimary}
          <span className="invoice-print-accent">{BRAND.markAccent}</span>
        </p>
        <div className="inv-meta">
          <h1 className="inv-kicker">{t("invoicePrintTitle")}</h1>
          <p className="inv-number">{invoice.number}</p>
          <p className={`inv-status ${statusModifier(invoice.status)}`}>
            {statusText}
          </p>
          <p className="inv-issued">
            <span className="inv-label">{t("invoicePrintIssued")}</span> {issued}
          </p>
        </div>
      </header>

      <section className="inv-parties">
        <div className="inv-party">
          <h2 className="inv-label">{t("invoicePrintFrom")}</h2>
          <p className="inv-party-name">{BRAND.name}</p>
          <p className="inv-party-body">{BRAND.product}</p>
        </div>
        <div className="inv-party">
          <h2 className="inv-label">{t("invoicePrintBillTo")}</h2>
          <p className="inv-party-name">{to}</p>
        </div>
      </section>

      <table className="inv-items">
        <thead>
          <tr>
            <th scope="col">{t("invoicePrintDescription")}</th>
            <th scope="col" className="num">
              {t("invoicePrintSeats")}
            </th>
            <th scope="col" className="num">
              {t("invoicePrintAmount")}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <p className="item-title">
                {t(`invoicePrintItem_${invoice.product}`, {
                  sku: skuLabel,
                  defaultValue: t("invoicePrintItem", { sku: skuLabel }),
                })}
              </p>
              <p className="item-period">{period}</p>
            </td>
            <td className="num">{seats}</td>
            <td className="num">{amount}</td>
          </tr>
        </tbody>
      </table>

      <section className="inv-totals" aria-label={t("invoicePrintTotal")}>
        <p className="inv-totals-row">
          <span>{t("invoicePrintSubtotal")}</span>
          <span className="num">{amount}</span>
        </p>
        <p className="inv-totals-row inv-totals-grand">
          <span>{t("invoicePrintTotal")}</span>
          <span className="num">{amount}</span>
        </p>
        {invoice.status === "paid" ? (
          <p className="inv-totals-row">
            <span>{t("invoicePrintAmountPaid")}</span>
            <span className="num">{amount}</span>
          </p>
        ) : (
          <p className="inv-totals-row">
            <span>{t("invoicePrintAmountDue")}</span>
            <span className="num">{amount}</span>
          </p>
        )}
        {invoice.status === "paid" && invoice.bank_ref ? (
          <p className="inv-totals-row">
            <span>{t("invoicePrintRef")}</span>
            <span className="num">{invoice.bank_ref}</span>
          </p>
        ) : null}
      </section>

      {showBank ? (
        <section className="inv-pay" data-testid="invoice-print-bank">
          <h2 className="inv-label">{t("invoicePrintPay")}</h2>
          <dl className="inv-pay-fields">
            <div>
              <dt>{t("invoicePrintBankName")}</dt>
              <dd>{bank?.bank_name ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("invoicePrintBankAccount")}</dt>
              <dd>{bank?.bank_account ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("invoicePrintBankHolder")}</dt>
              <dd>{bank?.bank_holder ?? "—"}</dd>
            </div>
          </dl>
          <p className="inv-pay-hint">
            {t("invoicePrintPayHint", { number: invoice.number })}
          </p>
        </section>
      ) : null}

      <footer className="inv-footer" data-testid="invoice-print-footer">
        {t(`invoicePrintFooter_${invoice.product}`, {
          defaultValue: t("invoicePrintFooter"),
        })}
      </footer>
    </article>
  );
}

export function useInvoicePrint(): {
  printing: InvoicePrintData | null;
  startPrint: (invoice: InvoicePrintData) => void;
} {
  const [printing, setPrinting] = useState<InvoicePrintData | null>(null);

  useEffect(() => {
    if (!printing) return;
    document.body.classList.add("invoice-printing");
    const id = window.requestAnimationFrame(() => {
      window.print();
    });
    const done = () => {
      document.body.classList.remove("invoice-printing");
      setPrinting(null);
    };
    window.addEventListener("afterprint", done);
    return () => {
      document.body.classList.remove("invoice-printing");
      window.cancelAnimationFrame(id);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  return { printing, startPrint: setPrinting };
}
