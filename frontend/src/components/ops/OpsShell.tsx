import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SiemRail } from "@/components/siem/siemChrome";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export function OpsShell({
  railClass,
  wash,
  children,
  className,
  testid,
}: {
  readonly railClass: string;
  readonly wash?: string | null;
  readonly children: ReactNode;
  readonly className?: string;
  readonly testid?: string;
}) {
  return (
    <Card
      data-testid={testid}
      className={cn(
        "relative overflow-hidden pl-4",
        wash ?? undefined,
        className,
      )}
    >
      <SiemRail className={railClass} />
      {children}
    </Card>
  );
}

export function OpsShellHead({
  icon: Icon,
  title,
  hint,
  aside,
  children,
  className,
}: {
  readonly icon?: LucideIcon;
  readonly title?: ReactNode;
  readonly hint?: string;
  readonly aside?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("border-b border-border px-4 py-3", className)}>
      {children ?? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {Icon ? (
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40"
                aria-hidden
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            ) : null}
            <div className="min-w-0">
              <h3 className="text-sm font-medium tracking-wide">{title}</h3>
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

export function OpsShellBody({
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
