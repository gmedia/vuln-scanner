import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SiemRail } from "@/components/siem/siemChrome";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export function ScanShell({
  railClass,
  children,
  className,
  testid,
}: {
  readonly railClass: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly testid?: string;
}) {
  return (
    <Card
      data-testid={testid}
      className={cn("relative overflow-hidden pl-4", className)}
    >
      <SiemRail className={railClass} />
      {children}
    </Card>
  );
}

export function ScanShellHead({
  icon: Icon,
  title,
  aside,
}: {
  readonly icon?: LucideIcon;
  readonly title: ReactNode;
  readonly aside?: ReactNode;
}) {
  return (
    <div className="border-b border-border px-4 py-3">
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
          <h3 className="text-sm font-medium tracking-wide">{title}</h3>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </div>
  );
}

export function ScanShellBody({
  children,
  className,
  testid,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly testid?: string;
}) {
  return (
    <div data-testid={testid} className={cn("px-4 py-4", className)}>
      {children}
    </div>
  );
}
