import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SiemRail } from "@/components/siem/siemChrome";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  adminRailClass,
  adminWashClass,
  kpiTone,
  kpiValueClass,
  type AdminKpiKind,
  type AdminTone,
} from "@/components/admin/adminChrome";
import { cn } from "@/lib/utils";

export function AdminShell({
  tone = "primary",
  wash = true,
  children,
  className,
  testid,
}: {
  readonly tone?: AdminTone;
  readonly wash?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
  readonly testid?: string;
}) {
  return (
    <Card
      data-testid={testid}
      className={cn(
        "relative overflow-hidden pl-4",
        wash ? adminWashClass(tone) : undefined,
        className,
      )}
    >
      <SiemRail className={adminRailClass(tone)} />
      {children}
    </Card>
  );
}

export function AdminIconChip({ icon: Icon }: { readonly icon: LucideIcon }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40"
      aria-hidden
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
    </span>
  );
}

export function AdminShellHead({
  icon,
  title,
  hint,
  aside,
  children,
  className,
}: {
  readonly icon?: LucideIcon;
  readonly title?: string;
  readonly hint?: string;
  readonly aside?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("border-b border-border px-4 py-3", className)}>
      {children ?? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <AdminIconChip icon={icon} /> : null}
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

export function AdminShellBody({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={cn("px-4 py-4", className)}>{children}</div>;
}

export function AdminKpiTile({
  kind,
  label,
  value,
  icon: Icon,
  isLoading,
}: {
  readonly kind: AdminKpiKind;
  readonly label: string;
  readonly value: number;
  readonly icon: LucideIcon;
  readonly isLoading: boolean;
}) {
  const tone = kpiTone(kind);
  return (
    <div
      data-testid={`admin-kpi-${kind}`}
      className="relative min-w-0 overflow-hidden rounded-lg border border-border bg-card px-4 py-3 pl-4"
    >
      <SiemRail className={adminRailClass(tone)} />
      <div className="flex items-center gap-2 pl-2">
        <Icon
          className={cn("h-3.5 w-3.5 shrink-0", kpiValueClass(tone))}
          aria-hidden
        />
        <span className="min-w-0 truncate text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      {isLoading ? (
        <Skeleton className="mt-1.5 ml-2 h-8 w-20" />
      ) : (
        <span
          className={cn(
            "mt-1 block pl-2 font-mono text-2xl font-bold tracking-tight tabular-nums",
            kpiValueClass(tone),
          )}
        >
          {value.toLocaleString()}
        </span>
      )}
    </div>
  );
}

const NOTICE_BORDER: Record<AdminTone, string> = {
  primary: "border-primary/40",
  success: "border-primary/40",
  danger: "border-destructive/40",
  warn: "border-amber-500/40",
  info: "border-sky-500/40",
  alert: "border-orange-500/40",
  idle: "border-border",
};

const NOTICE_TEXT: Record<AdminTone, string> = {
  primary: "text-foreground",
  success: "text-primary",
  danger: "text-red-400",
  warn: "text-amber-400",
  info: "text-foreground",
  alert: "text-orange-400",
  idle: "text-muted-foreground",
};

export function AdminNotice({
  tone,
  children,
  role,
}: {
  readonly tone: AdminTone;
  readonly children: ReactNode;
  readonly role?: "alert" | "status";
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border bg-card px-3 py-2 pl-4",
        NOTICE_BORDER[tone],
        adminWashClass(tone),
      )}
    >
      <SiemRail className={adminRailClass(tone)} />
      <p
        role={role}
        className={cn("pl-2 text-xs leading-relaxed", NOTICE_TEXT[tone])}
      >
        {children}
      </p>
    </div>
  );
}
