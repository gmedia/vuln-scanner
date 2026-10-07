import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SiemRail } from "@/components/siem/siemChrome";
import { cn } from "@/lib/utils";

export function ScheduleShell({
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
    <div
      data-testid={testid}
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card pl-4",
        wash,
        className,
      )}
    >
      <SiemRail className={railClass} />
      {children}
    </div>
  );
}

export function ScheduleShellHead({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("border-b border-border px-4 py-3", className)}>
      {children}
    </div>
  );
}

export function ScheduleIconChip({ icon: Icon }: { readonly icon: LucideIcon }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40"
      aria-hidden
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
    </span>
  );
}
