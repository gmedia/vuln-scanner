from __future__ import annotations

import html
from datetime import datetime

from app.i18n import DEFAULT_LOCALE, AppLocale, t
from app.models.invoice import PRODUCT_SEATS, OrgInvoice

_SELLER = "Sinexis"
_SELLER_PRODUCT = "Sinexis Scan"

_PRODUCT_LABEL = {
    "scan": "Sinexis Scan",
    "host": "Sinexis Host Protect",
    "uptime": "Sinexis Uptime",
    "guard": "Sinexis Guard",
}


def _esc(value: object) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def _day(value: datetime | None) -> str:
    if value is None:
        return "—"
    return value.strftime("%Y-%m-%d")


def _idr(amount: int) -> str:
    return f"Rp {amount:,}".replace(",", ".")


def render_invoice_html(
    inv: OrgInvoice,
    *,
    org_name: str | None,
    bank: dict[str, str | None] | None,
    locale: AppLocale = DEFAULT_LOCALE,
) -> str:
    def label(key: str) -> str:
        return _esc(t(locale, "invoice", key))

    product = _PRODUCT_LABEL.get(inv.product, inv.product)
    seats = PRODUCT_SEATS.get(inv.product, PRODUCT_SEATS["scan"]).get(inv.sku, 1)
    number = _esc(inv.number)
    bill_to = _esc(org_name or "—")
    amount = _esc(_idr(inv.amount_idr))
    period = _esc(f"{_day(inv.period_start)} – {_day(inv.period_end)}")
    issued = _esc(_day(inv.created_at))
    status = _esc(t(locale, "invoice", f"status_{inv.status}"))
    item = _esc(f"{product} — {inv.sku.upper()}")
    bank_block = ""
    if inv.status == "sent":
        pay_hint = _esc(t(locale, "invoice", "payHint", number=inv.number))
        bank_block = f"""
    <section class="inv-pay">
      <h2 class="inv-label">{label("pay")}</h2>
      <dl class="inv-pay-fields">
        <div><dt>{label("bankName")}</dt><dd>{_esc((bank or {}).get("bank_name") or "—")}</dd></div>
        <div><dt>{label("bankAccount")}</dt><dd>{_esc((bank or {}).get("bank_account") or "—")}</dd></div>
        <div><dt>{label("bankHolder")}</dt><dd>{_esc((bank or {}).get("bank_holder") or "—")}</dd></div>
      </dl>
      <p class="inv-pay-hint">{pay_hint}</p>
    </section>"""
    ref_line = ""
    if inv.status == "paid" and inv.bank_ref:
        bank_ref = _esc(inv.bank_ref)
        ref_line = f'<p class="inv-totals-row"><span>{label("ref")}</span><span class="num">{bank_ref}</span></p>'
    due_label = label("amountPaid" if inv.status == "paid" else "amountDue")
    return f"""<!DOCTYPE html>
<html lang="{locale}">
<head>
  <meta charset="utf-8">
  <title>{label("title")} {number}</title>
  <style>
    @page {{ size: A4; margin: 16mm; }}
    html, body {{ background: #fff; color: hsl(0 0% 7%); }}
    body {{ margin: 0; font: 400 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
    .invoice-print-sheet {{ background: #fff; color: hsl(0 0% 7%); }}
    .invoice-print-brand {{ margin: 0; font: 700 22px/1 ui-monospace, "SFMono-Regular", Menlo, monospace;
      letter-spacing: 0.08em; }}
    .invoice-print-accent {{ color: hsl(142 71% 45%); }}
    .inv-header {{ display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;
      padding-bottom: 20px; margin-bottom: 32px; border-bottom: 1px solid hsl(0 0% 90%); }}
    .inv-meta {{ text-align: right; }}
    .inv-kicker {{ margin: 0; font-size: 11px; font-weight: 600; line-height: 1.3;
      letter-spacing: 0.14em; text-transform: uppercase; color: hsl(0 0% 26%); }}
    .inv-number {{ margin: 2px 0 0; font: 600 16px/1.2 ui-monospace, "SFMono-Regular", Menlo, monospace;
      font-variant-numeric: tabular-nums; }}
    .inv-status {{ display: inline-block; margin: 8px 0 0; padding: 2px 8px;
      border: 1px solid hsl(0 0% 90%); border-radius: 999px; background: hsl(0 0% 96%);
      color: hsl(0 0% 26%); font-size: 10px; font-weight: 700; line-height: 1.3; }}
    .inv-status--paid {{ background: #dcfce7; color: #166534; }}
    .inv-issued {{ margin: 12px 0 0; font-size: 11px; color: hsl(0 0% 26%);
      font-variant-numeric: tabular-nums; }}
    .inv-label {{ margin: 0 0 8px; color: hsl(0 0% 26%); font-size: 10px;
      font-weight: 600; line-height: 1.3; letter-spacing: 0.10em; text-transform: uppercase; }}
    .inv-issued .inv-label {{ display: inline; margin: 0 8px 0 0; }}
    .inv-parties {{ display: flex; gap: 32px; margin-bottom: 32px; }}
    .inv-party {{ flex: 1; min-width: 0; }}
    .inv-party-name {{ margin: 0 0 4px; font-size: 14px; font-weight: 600; line-height: 1.4;
      overflow-wrap: break-word; }}
    .inv-party-body {{ margin: 0; font-size: 11px; color: hsl(0 0% 26%); }}
    .inv-items {{ width: 100%; border-collapse: collapse; margin-bottom: 24px; }}
    .inv-items thead {{ display: table-header-group; }}
    .inv-items th {{ padding: 8px 0 8px 12px; color: hsl(0 0% 26%); font-size: 10px;
      font-weight: 600; line-height: 1.3; letter-spacing: 0.10em; text-transform: uppercase;
      text-align: left; border-bottom: 1px solid hsl(0 0% 7%); }}
    .inv-items td {{ padding: 12px 0 12px 12px; vertical-align: top;
      border-bottom: 1px solid hsl(0 0% 90%); }}
    .inv-items th:first-child, .inv-items td:first-child {{ padding-left: 0; }}
    .inv-items .num, .inv-totals .num {{ text-align: right; white-space: nowrap;
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-variant-numeric: tabular-nums; }}
    tr {{ break-inside: avoid; page-break-inside: avoid; }}
    .item-title {{ margin: 0; font-weight: 600; }}
    .item-period {{ margin: 4px 0 0; color: hsl(0 0% 26%); font-size: 11px;
      line-height: 1.4; font-variant-numeric: tabular-nums; }}
    .inv-totals {{ width: 260px; margin: 0 0 32px auto; }}
    .inv-totals-row {{ display: flex; justify-content: space-between; gap: 24px;
      margin: 0; padding: 8px 0; color: hsl(0 0% 26%); border-bottom: 1px solid hsl(0 0% 90%); }}
    .inv-totals-grand {{ margin-top: 4px; padding-top: 12px; border-top: 2px solid hsl(0 0% 7%);
      border-bottom: 0; color: hsl(0 0% 7%); font-size: 16px; font-weight: 700; line-height: 1.2; }}
    .inv-pay {{ break-inside: avoid; page-break-inside: avoid; padding: 16px; margin-bottom: 32px;
      background: hsl(0 0% 96%); border: 1px solid hsl(0 0% 90%); }}
    .inv-pay-fields {{ margin: 0; }}
    .inv-pay-fields div {{ display: flex; gap: 12px; margin-top: 4px; }}
    .inv-pay-fields dt {{ width: 120px; flex: none; color: hsl(0 0% 26%); }}
    .inv-pay-fields dd {{ margin: 0; font-weight: 600; font-variant-numeric: tabular-nums;
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; }}
    .inv-pay-hint {{ margin: 12px 0 0; font-size: 11px; color: hsl(0 0% 26%); }}
    .inv-footer {{ padding-top: 16px; border-top: 1px solid hsl(0 0% 90%);
      color: hsl(0 0% 26%); font-size: 10px; font-weight: 400; line-height: 1.5; }}
  </style>
</head>
<body>
  <article class="invoice-print-sheet" aria-label="{number}">
    <header class="inv-header">
      <p class="invoice-print-brand">SINE<span class="invoice-print-accent">XIS</span></p>
      <div class="inv-meta">
        <h1 class="inv-kicker">{label("title")}</h1>
        <p class="inv-number">{number}</p>
        <p class="inv-status{' inv-status--paid' if inv.status == 'paid' else ''}">{status}</p>
        <p class="inv-issued"><span class="inv-label">{label("issued")}</span> {issued}</p>
      </div>
    </header>
    <section class="inv-parties">
      <div class="inv-party">
        <h2 class="inv-label">{label("from")}</h2>
        <p class="inv-party-name">{_esc(_SELLER)}</p>
        <p class="inv-party-body">{_esc(_SELLER_PRODUCT)}</p>
      </div>
      <div class="inv-party">
        <h2 class="inv-label">{label("billTo")}</h2>
        <p class="inv-party-name">{bill_to}</p>
      </div>
    </section>
    <table class="inv-items">
      <thead><tr>
        <th scope="col">{label("description")}</th>
        <th scope="col" class="num">{label("seats")}</th>
        <th scope="col" class="num">{label("amount")}</th>
      </tr></thead>
      <tbody><tr>
        <td><p class="item-title">{item}</p><p class="item-period">{period}</p></td>
        <td class="num">{seats}</td><td class="num">{amount}</td>
      </tr></tbody>
    </table>
    <section class="inv-totals" aria-label="{label("total")}">
      <p class="inv-totals-row"><span>{label("subtotal")}</span><span class="num">{amount}</span></p>
      <p class="inv-totals-row inv-totals-grand"><span>{label("total")}</span><span class="num">{amount}</span></p>
      <p class="inv-totals-row"><span>{due_label}</span><span class="num">{amount}</span></p>
      {ref_line}
    </section>
    {bank_block}
    <footer class="inv-footer">{_esc(t(locale, "invoice", "footer", product=product))}</footer>
  </article>
</body>
</html>"""
