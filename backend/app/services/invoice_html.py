from __future__ import annotations

import html
from datetime import datetime

from app.models.invoice import SCAN_SKU_SEATS, OrgInvoice

_PRODUCT_LABEL = {
    "scan": "Sinexis Scan",
    "host": "Sinexis Host Protect",
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
) -> str:
    product = _PRODUCT_LABEL.get(inv.product, inv.product)
    seats = SCAN_SKU_SEATS.get(inv.sku, 1)
    number = _esc(inv.number)
    bill_to = _esc(org_name or "—")
    amount = _esc(_idr(inv.amount_idr))
    period = _esc(f"{_day(inv.period_start)} – {_day(inv.period_end)}")
    issued = _esc(_day(inv.created_at))
    status = _esc(inv.status)
    item = _esc(f"{product} — {inv.sku.upper()}")
    bank_block = ""
    if inv.status == "sent" and bank is not None:
        bank_block = f"""
<section>
<h2>Payment</h2>
<p>Bank {_esc(bank.get("bank_name") or "—")}</p>
<p>Account {_esc(bank.get("bank_account") or "—")}</p>
<p>Account holder {_esc(bank.get("bank_holder") or "—")}</p>
<p>Quote {number} as the transfer reference.</p>
</section>"""
    ref_line = ""
    if inv.status == "paid" and inv.bank_ref:
        ref_line = f"<p>Bank ref {_esc(inv.bank_ref)}</p>"
    due_label = "Amount paid" if inv.status == "paid" else "Amount due"
    return f"""<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<title>Invoice {number}</title>
<style>
:root {{ --foreground: hsl(0 0% 7%); --muted: hsl(0 0% 45%); --border: hsl(0 0% 90%); --primary: hsl(142 71% 45%); }}
body {{ margin: 0; padding: 24px; font-family: ui-sans-serif, system-ui, sans-serif; color: var(--foreground); }}
.brand {{ font-family: ui-monospace, monospace; font-weight: 700; letter-spacing: 0.08em; }}
.brand span {{ color: var(--primary); }}
h1 {{ font-size: 1.25rem; border-bottom: 1px solid var(--border); padding-bottom: 8px; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
th, td {{ border-bottom: 1px solid var(--border); padding: 8px; text-align: left; font-size: 0.875rem; }}
.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
.muted {{ color: var(--muted); font-size: 12px; }}
@page {{ size: A4; margin: 16mm; }}
</style></head><body>
<p class="brand">SINE<span>XIS</span></p>
<h1>Invoice</h1>
<p>{number}</p>
<p>Status {status}</p>
<p>Issued {issued}</p>
<p>From Sinexis</p>
<p>Bill to {bill_to}</p>
<table>
<tr><th>Description</th><th class="num">Seats</th><th class="num">Amount</th></tr>
<tr><td>{item}<br><span class="muted">{period}</span></td><td class="num">{seats}</td><td class="num">{amount}</td></tr>
</table>
<p>Subtotal <span class="num">{amount}</span></p>
<p>Total <span class="num">{amount}</span></p>
<p>{due_label} <span class="num">{amount}</span></p>
{ref_line}
{bank_block}
<p class="muted">Thank you. {_esc(product)} — bank transfer, no self-serve upgrade.</p>
</body></html>"""
