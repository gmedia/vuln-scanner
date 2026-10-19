import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { StatTile } from "@/components/patterns/StatTile";
import {
  RailedIconChip,
  RailedNotice,
  RailedShell,
  RailedShellBody,
  RailedShellHead,
} from "@/components/patterns/RailedShell";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  adminRailClass,
  adminWashClass,
  kpiTone,
  kpiValueClass,
  type AdminKpiKind,
  type AdminTone,
} from "@/components/admin/adminChrome";
import { TONE_TEXT } from "@/lib/toneColors";

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
    <RailedShell
      railClass={adminRailClass(tone)}
      wash={wash ? adminWashClass(tone) : undefined}
      className={className}
      testid={testid}
    >
      {children}
    </RailedShell>
  );
}

export function AdminIconChip({ icon }: { readonly icon: LucideIcon }) {
  return <RailedIconChip icon={icon} />;
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

export function AdminShellBody({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <RailedShellBody className={className}>{children}</RailedShellBody>;
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
    <StatTile
      testid={`admin-kpi-${kind}`}
      label={label}
      icon={Icon}
      iconClassName={kpiValueClass(tone)}
      value={value.toLocaleString()}
      railClass={adminRailClass(tone)}
      valueClassName="text-2xl tracking-tight"
      labelClassName="font-normal"
      isLoading={isLoading}
      skeleton={<Skeleton className="mt-1.5 ml-2 h-8 w-20" />}
    />
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
  success: "text-primary-text",
  danger: TONE_TEXT.red,
  warn: TONE_TEXT.amber,
  info: "text-foreground",
  alert: TONE_TEXT.orange,
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
    <RailedNotice
      railClass={adminRailClass(tone)}
      borderClass={NOTICE_BORDER[tone]}
      wash={adminWashClass(tone)}
      textClass={NOTICE_TEXT[tone]}
      role={role}
      layout="paragraph"
    >
      {children}
    </RailedNotice>
  );
}
