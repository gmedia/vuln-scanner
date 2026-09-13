export function formatIdr(n: number | null | undefined): string {
  if (n == null) return "—";
  return `Rp ${n.toLocaleString("id-ID")}`;
}
