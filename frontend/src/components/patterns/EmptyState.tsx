import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Centered "nothing here yet" panel.
 *
 * `island` is the canonical look: hairline border, muted wash, icon, title.
 * `bare` is the same stack without the border (full-page not-found states).
 * `dashed` marks a section that will fill in later (no baseline yet).
 */
export type EmptyStateVariant = "island" | "bare" | "dashed" | "inline";
export type EmptyStateSize = "none" | "sm" | "md" | "lg";

export type EmptyStateProps = {
  readonly icon?: LucideIcon;
  readonly title: ReactNode;
  readonly hint?: ReactNode;
  readonly action?: ReactNode;
  readonly testId?: string;
  readonly variant?: EmptyStateVariant;
  readonly size?: EmptyStateSize;
  readonly titleTone?: "muted" | "strong";
  readonly titleClassName?: string;
  readonly hintClassName?: string;
  readonly hintTestId?: string;
  readonly className?: string;
  readonly iconClassName?: string;
};

const SIZE: Record<EmptyStateSize, string> = {
  none: "",
  sm: "min-h-[8rem] gap-2 px-6 py-8",
  md: "min-h-[12rem] gap-3 px-6 py-12 md:min-h-[16rem] md:py-16",
  lg: "min-h-[16rem] gap-3 px-6 py-16 md:py-20",
};

const VARIANT: Record<EmptyStateVariant, string> = {
  island: "rounded-xl border border-border bg-muted/40",
  bare: "",
  dashed: "rounded-lg border border-dashed border-border bg-muted/30",
  inline: "",
};

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  testId,
  variant = "island",
  size = "sm",
  titleTone = "strong",
  titleClassName,
  hintClassName,
  hintTestId,
  className,
  iconClassName,
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        SIZE[size],
        VARIANT[variant],
        className,
      )}
    >
      {Icon ? (
        <Icon
          className={cn("h-8 w-8 text-muted-foreground", iconClassName)}
          aria-hidden
        />
      ) : null}
      <p
        className={cn(
          "text-sm",
          titleTone === "strong"
            ? "font-medium text-foreground"
            : "text-muted-foreground",
          titleClassName,
        )}
      >
        {title}
      </p>
      {hint ? (
        <p
          data-testid={hintTestId}
          className={cn(
            "max-w-md text-xs text-muted-foreground",
            hintClassName,
          )}
        >
          {hint}
        </p>
      ) : null}
      {action}
    </div>
  );
}
