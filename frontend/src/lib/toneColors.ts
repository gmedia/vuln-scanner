export type ToneHue =
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "blue"
  | "sky"
  | "emerald"
  | "green"
  | "gray"
  | "violet";

// Single source for tone colours. A shade that reads on white cannot read on
// near-black, so every entry pairs a light and a dark value; the ratios are
// measured from the shipped Tailwind v4 (oklch) palette, not from v3 hex.
export const TONE_TEXT: Record<ToneHue, string> = {
  red: "text-red-700 dark:text-red-400",
  orange: "text-orange-800 dark:text-orange-400",
  amber: "text-amber-800 dark:text-amber-400",
  yellow: "text-yellow-800 dark:text-yellow-400",
  blue: "text-blue-700 dark:text-blue-400",
  sky: "text-sky-700 dark:text-sky-400",
  emerald: "text-emerald-800 dark:text-emerald-400",
  green: "text-green-800 dark:text-green-400",
  gray: "text-gray-700 dark:text-gray-400",
  violet: "text-violet-700 dark:text-violet-400",
};

// Text sitting on the hue's own 15-20% tint; only red needs a step darker.
export const TONE_CHIP_TEXT: Record<ToneHue, string> = {
  ...TONE_TEXT,
  red: "text-red-800 dark:text-red-400",
};
