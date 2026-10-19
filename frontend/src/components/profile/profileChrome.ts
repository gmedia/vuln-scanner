import { toneRail, toneWash } from "@/lib/toneMap";

export type ProfileTone = "primary" | "success" | "danger" | "warn" | "idle";

export function profileRailClass(tone: ProfileTone): string {
  return toneRail(tone);
}

export function profileWashClass(tone: ProfileTone): string | undefined {
  return toneWash(tone);
}

export function verificationTone(verified: boolean): ProfileTone {
  return verified ? "success" : "warn";
}

export function accessTone(isAdmin: boolean): ProfileTone {
  return isAdmin ? "primary" : "idle";
}

export function creditsTone(credits: number): ProfileTone {
  return credits > 0 ? "primary" : "idle";
}

export function formTone(input: {
  readonly cooldown: number;
  readonly error: boolean;
  readonly success: boolean;
}): ProfileTone {
  if (input.success) return "success";
  if (input.cooldown > 0) return "warn";
  if (input.error) return "danger";
  return "primary";
}
