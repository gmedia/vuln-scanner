export function creditTypeRailClass(type: string): string {
  if (type === "deduct") return "bg-destructive";
  if (type === "refund") return "bg-blue-500";
  return "bg-primary";
}

export function creditListRailClass(
  types: readonly string[],
  net: number,
): string {
  if (types.length === 0) return "bg-border";
  return net >= 0 ? "bg-primary" : "bg-destructive";
}
