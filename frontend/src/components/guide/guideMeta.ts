import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BookOpen,
  CalendarClock,
  FileText,
  Globe,
  Layers,
  LayoutDashboard,
  LogIn,
  Radar,
  Server,
  Shield,
  Siren,
  Smartphone,
  Users,
} from "lucide-react";

export const TOC_IDS = [
  "mulai",
  "scan-ip",
  "scan-domain",
  "scan-mobile",
  "hasil",
  "jadwal",
  "aset",
  "workspace",
  "kredit",
  "guard",
  "siem",
  "uptime",
  "status-page",
  "host",
  "tips",
] as const;

export type TocId = (typeof TOC_IDS)[number];

export const GUIDE_GROUPS = [
  {
    id: "scan",
    ids: ["mulai", "scan-ip", "scan-domain", "scan-mobile", "hasil"],
  },
  { id: "attach", ids: ["jadwal", "aset", "workspace", "kredit"] },
  { id: "runtime", ids: ["guard", "siem", "uptime", "status-page", "host"] },
  { id: "limits", ids: ["tips"] },
] as const;

export type GuideGroupId = (typeof GUIDE_GROUPS)[number]["id"];
export type GuideGroup = (typeof GUIDE_GROUPS)[number];

export const GROUP_ICONS: Record<GuideGroupId, LucideIcon> = {
  scan: Radar,
  attach: CalendarClock,
  runtime: Shield,
  limits: BookOpen,
};

export function groupAnchor(group: GuideGroup): TocId {
  return group.ids[0];
}

export function groupContains(group: GuideGroup, id: TocId): boolean {
  return (group.ids as readonly TocId[]).includes(id);
}

export const ICON_BY_ID: Record<TocId, LucideIcon> = {
  mulai: LogIn,
  "scan-ip": Radar,
  "scan-domain": Globe,
  "scan-mobile": Smartphone,
  hasil: LayoutDashboard,
  jadwal: CalendarClock,
  aset: Server,
  workspace: Users,
  kredit: Layers,
  guard: Shield,
  siem: Siren,
  uptime: Activity,
  "status-page": FileText,
  host: Server,
  tips: BookOpen,
};

export function tocIndex(id: TocId): string {
  return String(TOC_IDS.indexOf(id) + 1).padStart(2, "0");
}

export function isTocId(id: string): id is TocId {
  return (TOC_IDS as readonly string[]).includes(id);
}
