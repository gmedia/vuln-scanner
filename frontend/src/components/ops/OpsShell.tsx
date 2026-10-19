import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  RailedShell,
  RailedShellBody,
  RailedShellHead,
} from "@/components/patterns/RailedShell";

export function OpsShell({
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
    <RailedShell
      railClass={railClass}
      wash={wash}
      className={className}
      testid={testid}
    >
      {children}
    </RailedShell>
  );
}

export function OpsShellHead({
  icon,
  title,
  hint,
  aside,
  children,
  className,
}: {
  readonly icon?: LucideIcon;
  readonly title?: ReactNode;
  readonly hint?: string;
  readonly aside?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <RailedShellHead
      icon={icon}
      iconChip="sm"
      align="center"
      title={title}
      hint={hint}
      aside={aside}
      className={className}
    >
      {children}
    </RailedShellHead>
  );
}

export function OpsShellBody({
  children,
  className,
  testid,
  flush = false,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly testid?: string;
  readonly flush?: boolean;
}) {
  return (
    <RailedShellBody className={className} testid={testid} flush={flush}>
      {children}
    </RailedShellBody>
  );
}
