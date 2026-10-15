import { cva } from "class-variance-authority";
import { TONE_CHIP_TEXT } from "@/lib/toneColors";

export const badgeVariants = cva(
  "inline-flex items-center rounded px-2 py-0.5 text-xs font-mono font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground border border-border",
        critical: `bg-red-600/20 ${TONE_CHIP_TEXT.red} border border-red-600/40`,
        high: `bg-orange-500/20 ${TONE_CHIP_TEXT.orange} border border-orange-500/40`,
        medium: `bg-yellow-500/20 ${TONE_CHIP_TEXT.yellow} border border-yellow-500/40`,
        low: `bg-blue-500/20 ${TONE_CHIP_TEXT.blue} border border-blue-500/40`,
        info: `bg-gray-500/20 ${TONE_CHIP_TEXT.gray} border border-gray-500/40`,
        success:
          "bg-primary/15 text-foreground dark:bg-primary/20 dark:text-primary-text border border-primary/40",
        pending: `bg-yellow-500/20 ${TONE_CHIP_TEXT.yellow} border border-yellow-500/40`,
        running: `bg-blue-500/20 ${TONE_CHIP_TEXT.blue} border border-blue-500/40 animate-pulse`,
        completed:
          "bg-primary/15 text-foreground dark:bg-primary/20 dark:text-primary-text border border-primary/40",
        failed: `bg-red-600/20 ${TONE_CHIP_TEXT.red} border border-red-600/40`,
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);
