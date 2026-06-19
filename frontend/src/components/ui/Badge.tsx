import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded px-2 py-0.5 text-xs font-mono font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-muted text-muted-foreground border border-border",
        critical:
          "bg-red-600/20 text-red-400 border border-red-600/40",
        high:
          "bg-orange-500/20 text-orange-400 border border-orange-500/40",
        medium:
          "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40",
        low:
          "bg-blue-500/20 text-blue-400 border border-blue-500/40",
        info:
          "bg-gray-500/20 text-gray-400 border border-gray-500/40",
        success:
          "bg-primary/20 text-primary border border-primary/40",
        pending:
          "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40",
        running:
          "bg-blue-500/20 text-blue-400 border border-blue-500/40 animate-pulse",
        completed:
          "bg-primary/20 text-primary border border-primary/40",
        failed:
          "bg-red-600/20 text-red-400 border border-red-600/40",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { Badge, badgeVariants };
