import type { ReactNode } from "react";
import { SiemRail } from "@/components/siem/siemChrome";
import { Card } from "@/components/ui/Card";
import {
  profileRailClass,
  profileWashClass,
  type ProfileTone,
} from "@/components/profile/profileChrome";
import { cn } from "@/lib/utils";

export function ProfileShell({
  tone = "primary",
  wash = true,
  children,
  className,
  testid,
}: {
  readonly tone?: ProfileTone;
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
        wash ? profileWashClass(tone) : undefined,
        className,
      )}
    >
      <SiemRail className={profileRailClass(tone)} />
      {children}
    </Card>
  );
}

export function ProfileShellHead({
  title,
  hint,
  icon: Icon,
  children,
  className,
}: {
  readonly title?: string;
  readonly hint?: string;
  readonly icon?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("border-b border-border px-4 py-3", className)}>
      {children ?? (
        <div className="flex items-start gap-3">
          {Icon}
          <div className="min-w-0">
            {title ? (
              <h3 className="text-sm font-medium tracking-wide">{title}</h3>
            ) : null}
            {hint ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProfileShellBody({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={cn("px-4 py-4", className)}>{children}</div>;
}

export function ProfileIconChip({ children }: { readonly children: ReactNode }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground"
      aria-hidden
    >
      {children}
    </span>
  );
}

const NOTICE_BORDER: Record<ProfileTone, string> = {
  primary: "border-primary/40",
  success: "border-primary/40",
  danger: "border-destructive/40",
  warn: "border-amber-500/40",
  idle: "border-border",
};

const NOTICE_TEXT: Record<ProfileTone, string> = {
  primary: "text-foreground",
  success: "text-primary",
  danger: "text-destructive",
  warn: "text-amber-400",
  idle: "text-muted-foreground",
};

export function ProfileNotice({
  tone,
  children,
  role = "status",
}: {
  readonly tone: ProfileTone;
  readonly children: ReactNode;
  readonly role?: "alert" | "status";
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border bg-card px-3 py-2 pl-4",
        NOTICE_BORDER[tone],
        profileWashClass(tone),
      )}
    >
      <SiemRail className={profileRailClass(tone)} />
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
