import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  RailedShell,
  RailedShellBody,
  RailedShellHead,
} from "@/components/patterns/RailedShell";

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
    <RailedShell railClass={railClass} className={className} testid={testid}>
      {children}
    </RailedShell>
  );
}

export function ScanShellHead({
  icon,
  title,
  aside,
}: {
  readonly icon?: LucideIcon;
  readonly title: ReactNode;
  readonly aside?: ReactNode;
}) {
  return (
    <RailedShellHead
      icon={icon}
      iconChip="sm"
      align="center"
      title={title}
      aside={aside}
    />
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
    <RailedShellBody className={className} testid={testid}>
      {children}
    </RailedShellBody>
  );
}
