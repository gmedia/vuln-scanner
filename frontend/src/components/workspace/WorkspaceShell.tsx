import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  RailedShell,
  RailedShellBody,
  RailedShellHead,
} from "@/components/patterns/RailedShell";
import { SiemRail } from "@/components/siem/siemChrome";
import {
  workspaceRailClass,
  workspaceWashClass,
  type WorkspaceTone,
} from "@/components/workspace/workspaceChrome";
import { cn } from "@/lib/utils";
import { TONE_TEXT } from "@/lib/toneColors";

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
    <RailedShell
      railClass={workspaceRailClass(tone)}
      wash={wash ? workspaceWashClass(tone) : undefined}
      className={className}
      testid={testid}
    >
      {children}
    </RailedShell>
  );
}

export function WorkspaceIconChip({
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
    <RailedShellHead
      icon={icon}
      iconChip="md"
      align="start"
      title={title}
      hint={hint}
      aside={aside}
      className={className}
    >
      {children}
    </RailedShellHead>
  );
}

export function WorkspaceShellBody({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <RailedShellBody className={className}>{children}</RailedShellBody>;
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
  success: "text-primary-text",
  danger: "text-destructive",
  warn: TONE_TEXT.amber,
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
