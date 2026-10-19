import { toneRail, toneWash } from "@/lib/toneMap";

export type AuthTone = "primary" | "success" | "danger" | "warn" | "info";

export function authRailClass(tone: AuthTone): string {
  return toneRail(tone);
}

export function authWashClass(tone: AuthTone): string | undefined {
  return toneWash(tone);
}
