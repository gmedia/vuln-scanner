export type AuthTone = "primary" | "success" | "danger" | "warn" | "info";

export function authRailClass(tone: AuthTone): string {
  if (tone === "danger") return "bg-destructive";
  if (tone === "warn") return "bg-amber-500";
  if (tone === "info") return "bg-sky-500";
  return "bg-primary";
}

export function authWashClass(tone: AuthTone): string | undefined {
  if (tone === "danger") return "bg-destructive/[0.04]";
  if (tone === "warn") return "bg-amber-500/[0.04]";
  if (tone === "success") return "bg-primary/5";
  return undefined;
}
