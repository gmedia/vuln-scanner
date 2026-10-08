import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SiemRail } from "@/components/siem/siemChrome";
import { Card } from "@/components/ui/Card";
import {
  workspaceRailClass,
  workspaceWashClass,
  type WorkspaceTone,
} from "@/components/workspace/workspaceChrome";
import { cn } from "@/lib/utils";

export function WorkspaceShell({
  tone = "primary",
  wash = true,
  children,
  className,
  testid,
}: {
  readonly tone?: WorkspaceTone;
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
        wash ? workspaceWashClass(tone) : undefined,
        className,
      )}
    >
      <SiemRail className={workspaceRailClass(tone)} />
      {children}
    </Card>
  );
}

export function WorkspaceIconChip({ icon: Icon }: { readonly icon: LucideIcon }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40"
      aria-hidden
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
    </span>
  );
}

export function WorkspaceShellHead({
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
            {icon ? <WorkspaceIconChip icon={icon} /> : null}
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

export function WorkspaceShellBody({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={cn("px-4 py-4", className)}>{children}</div>;
}

const NOTICE_BORDER: Record<WorkspaceTone, string> = {
  primary: "border-primary/40",
  success: "border-primary/40",
  danger: "border-destructive/40",
  warn: "border-amber-500/40",
  info: "border-sky-500/40",
  idle: "border-border",
};

const NOTICE_TEXT: Record<WorkspaceTone, string> = {
  primary: "text-foreground",
  success: "text-primary",
  danger: "text-destructive",
  warn: "text-amber-400",
  info: "text-foreground",
  idle: "text-muted-foreground",
};

export function WorkspaceNotice({
  tone,
  children,
  role,
}: {
  readonly tone: WorkspaceTone;
  readonly children: ReactNode;
  readonly role?: "alert" | "status";
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border bg-card px-3 py-2 pl-4",
        NOTICE_BORDER[tone],
        workspaceWashClass(tone),
      )}
    >
      <SiemRail className={workspaceRailClass(tone)} />
      <div
        role={role}
        className={cn(
          "flex items-start gap-2 pl-2 text-xs leading-relaxed",
          NOTICE_TEXT[tone],
        )}
      >
        {children}
      </div>
    </div>
  );
}
