import { toneRail } from "@/lib/toneMap";

export function creditTypeRailClass(type: string): string {
  if (type === "deduct") return toneRail("danger");
  if (type === "refund") return toneRail("low");
  return toneRail("primary");
}

export function creditListRailClass(
  types: readonly string[],
  net: number,
): string {
  if (types.length === 0) return toneRail("idle");
  return net >= 0 ? toneRail("primary") : toneRail("danger");
}
