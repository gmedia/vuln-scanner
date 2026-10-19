import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SiemRail } from "@/components/siem/siemChrome";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

/**
 * A bordered surface with a 2px status rail down its left edge.
 *
 * `OpsShell`, `ScanShell`, `AdminShell`, `WorkspaceShell`, `ProfileShell`, and
 * `AuthCard` are thin adapters over this. They keep their public props; this
 * module owns the markup. Use `frame="plain"` when the caller supplies its own
 * card frame (scan detail shells) instead of the kit `Card`.
 */
export type RailedShellProps = {
  readonly railClass: string;
  readonly wash?: string | null;
  readonly children: ReactNode;
  readonly className?: string;
  readonly testid?: string;
  readonly frame?: "card" | "plain";
};

export function RailedShell({
  railClass,
  wash,
  children,
  className,
  testid,
  frame = "card",
}: RailedShellProps) {
  const classes = cn("relative overflow-hidden pl-4", wash, className);

  if (frame === "plain") {
    return (
      <div
        data-testid={testid}
        className={cn(
          "rounded-lg border border-border bg-card",
          classes,
        )}
      >
        <SiemRail className={railClass} />
        {children}
      </div>
    );
  }

  return (
    <Card data-testid={testid} className={classes}>
      <SiemRail className={railClass} />
      {children}
    </Card>
  );
}

export type RailedShellHeadProps = {
  readonly icon?: LucideIcon;
  readonly iconNode?: ReactNode;
  readonly iconChip?: "sm" | "md" | "none";
  readonly align?: "center" | "start";
  readonly title?: ReactNode;
  readonly hint?: string;
  readonly aside?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
};

const CHIP: Record<"sm" | "md", string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
};

const CHIP_ICON: Record<"sm" | "md", string> = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

export function RailedShellHead({
  icon: Icon,
  iconNode,
  iconChip = "none",
  align = "center",
  title,
  hint,
  aside,
  children,
  className,
}: RailedShellHeadProps) {
  const chip =
    iconChip === "none" || !Icon ? null : (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md border border-border bg-muted/40",
          CHIP[iconChip],
        )}
        aria-hidden
      >
        <Icon className={cn(CHIP_ICON[iconChip], "text-muted-foreground")} />
      </span>
    );

  const leading = iconChip === "none" ? (iconNode ?? null) : chip;

  return (
    <div className={cn("border-b border-border px-4 py-3", className)}>
      {children ?? (
        <div
          className={cn(
            "flex flex-wrap justify-between gap-3",
            align === "start" ? "items-start" : "items-center",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 gap-2",
              align === "start" ? "items-start gap-3" : "items-center",
            )}
          >
            {leading}
            <div className="min-w-0">
              {title ? (
                <h3 className="text-sm font-medium tracking-wide">{title}</h3>
              ) : null}
              {hint ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
              ) : null}
            </div>
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
      )}
    </div>
  );
}

export function RailedShellBody({
  children,
  className,
  testid,
  flush = false,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly testid?: string;
  readonly flush?: boolean;
}) {
  return (
    <div
      data-testid={testid}
      className={cn(flush ? "p-0" : "px-4 py-4", className)}
    >
      {children}
    </div>
  );
}

export function RailedIconChip({
  icon: Icon,
}: {
  readonly icon: LucideIcon;
}) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40"
      aria-hidden
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
    </span>
  );
}
