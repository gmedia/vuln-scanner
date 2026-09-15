import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export type InvoicePrintBank = {
  bank_name: string | null;
  bank_account: string | null;
  bank_holder: string | null;
} | null;

export type InvoicePrintData = {
  number: string;
  sku: string;
  product: string;
  amount_idr: number;
  period_start: string;
  period_end: string;
  status: string;
  bank_ref: string | null;
  bank?: InvoicePrintBank;
  organization_name?: string | null;
};

function formatIdr(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function formatPeriod(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

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

  return (
    <div
      className="invoice-print-sheet hidden"
      data-testid="invoice-print-sheet"
    >
      <p className="invoice-print-brand">
        SINE<span className="invoice-print-accent">XIS</span>
      </p>
      <h1>{t("invoicePrintTitle")}</h1>
      <p>
        <strong>{t("invoicePrintNumber")}</strong>{" "}
        <span className="font-mono">{invoice.number}</span>
      </p>
      <p>
        <strong>{t("invoicePrintBillTo")}</strong> {to}
      </p>
      <p>
        <strong>{t("invoicePrintSku")}</strong> {invoice.sku.toUpperCase()} (
        {invoice.product})
      </p>
      <p>
        <strong>{t("invoicePrintPeriod")}</strong>{" "}
        {formatPeriod(invoice.period_start)} —{" "}
        {formatPeriod(invoice.period_end)}
      </p>
      <p>
        <strong>{t("invoicePrintStatus")}</strong> {invoice.status}
      </p>
      <p>
        <strong>{t("invoicePrintAmount")}</strong>{" "}
        <span className="font-mono tabular-nums">
          {formatIdr(invoice.amount_idr)}
        </span>
      </p>
      {showBank ? (
        <p data-testid="invoice-print-bank">
          {t("billingBank", {
            name: bank?.bank_name ?? "—",
            account: bank?.bank_account ?? "—",
            holder: bank?.bank_holder ?? "—",
          })}
        </p>
      ) : null}
      {invoice.status === "paid" && invoice.bank_ref ? (
        <p>
          <strong>{t("invoicePrintRef")}</strong> {invoice.bank_ref}
        </p>
      ) : null}
    </div>
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
