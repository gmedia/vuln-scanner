import { TONE_TEXT } from "@/lib/toneColors";

/**
 * The app's single tone vocabulary for rails, washes, and value text.
 * Domain modules keep their own `*Tone` types and map into this table.
 */
export type Tone =
  | "primary"
  | "success"
  | "enabled"
  | "completed"
  | "danger"
  | "critical"
  | "failed"
  | "warn"
  | "pending"
  | "alert"
  | "high"
  | "info"
  | "running"
  | "medium"
  | "low"
  | "idle"
  | "disabled";

const RAIL: Record<Tone, string> = {
  primary: "bg-primary",
  success: "bg-primary",
  enabled: "bg-primary",
  completed: "bg-primary",
  danger: "bg-destructive",
  critical: "bg-destructive",
  failed: "bg-destructive",
  warn: "bg-amber-600",
  pending: "bg-amber-600",
  alert: "bg-orange-600",
  high: "bg-orange-600",
  info: "bg-sky-600",
  running: "bg-sky-600",
  medium: "bg-yellow-700",
  low: "bg-blue-500",
  idle: "bg-border",
  disabled: "bg-border",
};

const WASH: Partial<Record<Tone, string>> = {
  danger: "bg-destructive/[0.04]",
  critical: "bg-destructive/[0.04]",
  failed: "bg-destructive/[0.04]",
  warn: "bg-amber-500/[0.04]",
  success: "bg-primary/5",
  completed: "bg-primary/5",
};

const TEXT: Record<Tone, string> = {
  primary: "text-primary-text",
  success: "text-primary-text",
  enabled: "text-primary-text",
  completed: "text-primary-text",
  danger: "text-destructive",
  critical: "text-destructive",
  failed: "text-destructive",
  warn: TONE_TEXT.amber,
  pending: TONE_TEXT.amber,
  alert: TONE_TEXT.orange,
  high: TONE_TEXT.orange,
  info: TONE_TEXT.sky,
  running: TONE_TEXT.sky,
  medium: TONE_TEXT.yellow,
  low: TONE_TEXT.blue,
  idle: "text-muted-foreground",
  disabled: "text-muted-foreground",
};

export function toneRail(tone: Tone): string {
  return RAIL[tone];
}

export function toneWash(tone: Tone): string | undefined {
  return WASH[tone];
}

export function toneText(tone: Tone): string {
  return TEXT[tone];
}
