export type ProfileTone = "primary" | "success" | "danger" | "warn" | "idle";

export function profileRailClass(tone: ProfileTone): string {
  if (tone === "danger") return "bg-destructive";
  if (tone === "warn") return "bg-amber-500";
  if (tone === "idle") return "bg-border";
  return "bg-primary";
}

export function profileWashClass(tone: ProfileTone): string | undefined {
  if (tone === "danger") return "bg-destructive/[0.04]";
  if (tone === "warn") return "bg-amber-500/[0.04]";
  if (tone === "success") return "bg-primary/5";
  return undefined;
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
