import type { ReactNode } from "react";
import {
  RailedNotice,
  RailedShell,
  RailedShellBody,
  RailedShellHead,
} from "@/components/patterns/RailedShell";
import {
  profileRailClass,
  profileWashClass,
  type ProfileTone,
} from "@/components/profile/profileChrome";
import { TONE_TEXT } from "@/lib/toneColors";

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
    <RailedShell
      railClass={profileRailClass(tone)}
      wash={wash ? profileWashClass(tone) : undefined}
      className={className}
      testid={testid}
    >
      {children}
    </RailedShell>
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
    <RailedShellHead
      iconNode={Icon}
      iconChip="none"
      align="start"
      title={title}
      hint={hint}
      className={className}
    >
      {children}
    </RailedShellHead>
  );
}

export function ProfileShellBody({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <RailedShellBody className={className}>{children}</RailedShellBody>;
}

export function ProfileIconChip({
  children,
}: {
  readonly children: ReactNode;
}) {
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
  success: "text-primary-text",
  danger: "text-destructive",
  warn: TONE_TEXT.amber,
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
    <RailedNotice
      railClass={profileRailClass(tone)}
      borderClass={NOTICE_BORDER[tone]}
      wash={profileWashClass(tone)}
      textClass={NOTICE_TEXT[tone]}
      role={role}
    >
      {children}
    </RailedNotice>
  );
}
