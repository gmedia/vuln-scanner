import type { TagColorKey } from "@/api/assets";

export const TAG_COLOR_CLASS: Record<TagColorKey, string> = {
  gray: "border-border bg-secondary text-secondary-foreground",
  green: "border-primary/40 bg-primary/20 text-primary",
  blue: "border-blue-500/40 bg-blue-500/20 text-blue-700 dark:text-blue-400",
  amber:
    "border-yellow-500/40 bg-yellow-500/20 text-yellow-800 dark:text-yellow-400",
  red: "border-red-600/40 bg-red-600/20 text-red-700 dark:text-red-400",
  violet:
    "border-violet-500/40 bg-violet-500/20 text-violet-700 dark:text-violet-400",
};

export const TAG_COLOR_DOT: Record<TagColorKey, string> = {
  gray: "bg-muted-foreground",
  green: "bg-primary",
  blue: "bg-blue-500",
  amber: "bg-yellow-500",
  red: "bg-red-600",
  violet: "bg-violet-500",
};

export function tagColorClass(
  tag: string,
  map: Record<string, TagColorKey> | undefined,
): string {
  const key = map?.[tag] ?? "gray";
  return TAG_COLOR_CLASS[key];
}
