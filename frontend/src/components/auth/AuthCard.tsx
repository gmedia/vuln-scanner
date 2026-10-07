import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AUTH_CARD_CLASS } from "@/components/layout/AuthLayout";
import { SiemRail } from "@/components/siem/siemChrome";
import { Card } from "@/components/ui/Card";
import { authRailClass, authWashClass, type AuthTone } from "@/components/auth/authChrome";
import { cn } from "@/lib/utils";

export function AuthCard({
  tone = "primary",
  wash = true,
  children,
  className,
}: {
  readonly tone?: AuthTone;
  readonly wash?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <Card
      className={cn(
        AUTH_CARD_CLASS,
        "relative overflow-hidden pl-4",
        wash ? authWashClass(tone) : undefined,
        className,
      )}
    >
      <SiemRail className={authRailClass(tone)} />
      {children}
    </Card>
  );
}

export function AuthCardBody({
  children,
  className,
  center = false,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly center?: boolean;
}) {
  return (
    <div
      className={cn("px-4 py-6", center && "space-y-4 text-center", className)}
    >
      {children}
    </div>
  );
}

const CHIP_CLASS: Record<AuthTone, string> = {
  primary: "border-primary/30 bg-primary/5",
  success: "border-primary/30 bg-primary/5",
  danger: "border-destructive/30 bg-destructive/5",
  warn: "border-amber-500/30 bg-amber-500/5",
  info: "border-border bg-muted/40",
};

const ICON_CLASS: Record<AuthTone, string> = {
  primary: "text-primary",
  success: "text-primary",
  danger: "text-destructive",
  warn: "text-amber-400",
  info: "text-primary",
};

export function AuthStatusIcon({
  icon: Icon,
  tone,
  spin = false,
}: {
  readonly icon: LucideIcon;
  readonly tone: AuthTone;
  readonly spin?: boolean;
}) {
  return (
    <span
      className={cn(
        "mx-auto flex h-12 w-12 items-center justify-center rounded-md border",
        CHIP_CLASS[tone],
      )}
      aria-hidden
    >
      <Icon
        className={cn("h-6 w-6", ICON_CLASS[tone], spin && "animate-spin")}
      />
    </span>
  );
}

const NOTICE_BORDER: Record<AuthTone, string> = {
  primary: "border-primary/40",
  success: "border-primary/40",
  danger: "border-destructive/40",
  warn: "border-amber-500/40",
  info: "border-border",
};

const NOTICE_TEXT: Record<AuthTone, string> = {
  primary: "text-primary",
  success: "text-primary",
  danger: "text-red-400",
  warn: "text-amber-400",
  info: "text-muted-foreground",
};

export function AuthNotice({
  tone,
  children,
  role,
  className,
}: {
  readonly tone: AuthTone;
  readonly children: ReactNode;
  readonly role?: "alert" | "status";
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border bg-card px-3 py-2 pl-4",
        NOTICE_BORDER[tone],
        authWashClass(tone),
        className,
      )}
    >
      <SiemRail className={authRailClass(tone)} />
      <p
        role={role}
        className={cn("pl-2 text-xs leading-relaxed", NOTICE_TEXT[tone])}
      >
        {children}
      </p>
    </div>
  );
}
