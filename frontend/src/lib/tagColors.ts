import type { TagColorValue, TagNamedColor } from "@/api/assets";
import { TAG_COLOR_KEYS } from "@/api/assets";

export const TAG_COLOR_CLASS: Record<TagNamedColor, string> = {
  gray: "border-border bg-secondary text-secondary-foreground",
  green: "border-primary/40 bg-primary/20 text-primary",
  blue: "border-blue-500/40 bg-blue-500/20 text-blue-700 dark:text-blue-400",
  amber:
    "border-yellow-500/40 bg-yellow-500/20 text-yellow-800 dark:text-yellow-400",
  red: "border-red-600/40 bg-red-600/20 text-red-700 dark:text-red-400",
  violet:
    "border-violet-500/40 bg-violet-500/20 text-violet-700 dark:text-violet-400",
};

export const TAG_COLOR_DOT: Record<TagNamedColor, string> = {
  gray: "bg-muted-foreground",
  green: "bg-primary",
  blue: "bg-blue-500",
  amber: "bg-yellow-500",
  red: "bg-red-600",
  violet: "bg-violet-500",
};

export const TAG_NAMED_HEX: Record<TagNamedColor, string> = {
  gray: "#6b7280",
  green: "#22c55e",
  blue: "#3b82f6",
  amber: "#eab308",
  red: "#dc2626",
  violet: "#8b5cf6",
};

export function isNamedTagColor(value: string): value is TagNamedColor {
  return (TAG_COLOR_KEYS as readonly string[]).includes(value);
}

export function tagColorHex(
  tag: string,
  map: Record<string, TagColorValue> | undefined,
): string {
  const key = map?.[tag] ?? "gray";
  if (isNamedTagColor(key)) return TAG_NAMED_HEX[key];
  return key;
}

export function tagColorClass(
  tag: string,
  map: Record<string, TagColorValue> | undefined,
): string {
  const key = map?.[tag] ?? "gray";
  if (isNamedTagColor(key)) return TAG_COLOR_CLASS[key];
  return "border-border text-foreground";
}

export function tagColorStyle(
  tag: string,
  map: Record<string, TagColorValue> | undefined,
): { backgroundColor: string; borderColor: string } | undefined {
  const key = map?.[tag];
  if (!key || isNamedTagColor(key)) return undefined;
  return { backgroundColor: `${key}33`, borderColor: `${key}66` };
}
