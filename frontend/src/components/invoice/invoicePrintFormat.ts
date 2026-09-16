const SKU_SEATS: Readonly<Record<string, number>> = {
  basic: 1,
  pro: 3,
  multi: 10,
};

export function seatsForSku(sku: string): number {
  return SKU_SEATS[sku.toLowerCase()] ?? 1;
}

export function formatIdr(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export function formatPeriod(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

export function statusModifier(status: string): string {
  switch (status) {
    case "paid":
      return "inv-status--paid";
    case "sent":
      return "inv-status--sent";
    case "void":
      return "inv-status--void";
    default:
      return "inv-status--draft";
  }
}
