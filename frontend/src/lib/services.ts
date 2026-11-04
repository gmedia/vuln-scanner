/**
 * Public product registry.
 *
 * This is the single frontend source for the product hub, product pages,
 * footer links, and page metadata. `scripts/check-public-registry-sync.mjs`
 * extracts `slug` + `published` from this file and compares them with the
 * derived tuple in `backend/app/api/sitemap_html.py`.
 *
 * Keep `slug` before `published` in every entry: the sync script parses that
 * order, and a reordered entry silently drops out of the sitemap.
 */

export type ServiceStatus = "live" | "limited" | "by_request" | "beta" | "mixed";

export type Capability = {
  /** Leaf i18n key under `services.<slug>.capabilities`. */
  key: string;
  /** Per-capability status; never "mixed". */
  status: ServiceStatus;
  /** Leaf i18n key under `services.<slug>.capabilityNotes`. */
  noteKey?: string;
};

export type ServicePillar = "exposure" | "onbox" | "availability" | "ai";

export type ServiceEntry = {
  /** Stable; used in `/products/:slug` and the sitemap. */
  slug: string;
  nameKey: string;
  summaryKey: string;
  /** Page-level editorial status. */
  status: ServiceStatus;
  pillar: ServicePillar;
  order: number;
  published: boolean;
  metaTitleKey: string;
  metaDescriptionKey: string;
  capabilities: readonly Capability[];
  /** Related product slugs; at most two, and every slug must exist. */
  related: readonly string[];
};

export const STATUS_LABEL_KEYS: Record<ServiceStatus, string> = {
  live: "status.live",
  limited: "status.limited",
  by_request: "status.byRequest",
  beta: "status.beta",
  mixed: "status.mixed",
};

export const SERVICES: readonly ServiceEntry[] = [
  {
    slug: "scan",
    nameKey: "services.scan.name",
    summaryKey: "services.scan.summary",
    status: "live",
    pillar: "exposure",
    order: 1,
    published: true,
    metaTitleKey: "services.scan.metaTitle",
    metaDescriptionKey: "services.scan.metaDescription",
    capabilities: [
      { key: "scan", status: "live" },
      { key: "attach", status: "live" },
      { key: "assets", status: "live" },
    ],
    related: ["guard", "uptime"],
  },
  {
    slug: "guard",
    nameKey: "services.guard.name",
    summaryKey: "services.guard.summary",
    status: "live",
    pillar: "onbox",
    order: 2,
    published: true,
    metaTitleKey: "services.guard.metaTitle",
    metaDescriptionKey: "services.guard.metaDescription",
    capabilities: [
      { key: "guard", status: "live" },
      {
        key: "siem",
        status: "by_request",
        noteKey: "siem",
      },
    ],
    related: ["host", "scan"],
  },
  {
    slug: "host",
    nameKey: "services.host.name",
    summaryKey: "services.host.summary",
    status: "mixed",
    pillar: "onbox",
    order: 3,
    published: true,
    metaTitleKey: "services.host.metaTitle",
    metaDescriptionKey: "services.host.metaDescription",
    capabilities: [
      {
        key: "hostProtect",
        status: "live",
        noteKey: "hostProtect",
      },
      {
        key: "hostWaf",
        status: "limited",
        noteKey: "hostWaf",
      },
    ],
    related: ["guard", "uptime"],
  },
  {
    slug: "uptime",
    nameKey: "services.uptime.name",
    summaryKey: "services.uptime.summary",
    status: "live",
    pillar: "availability",
    order: 4,
    published: true,
    metaTitleKey: "services.uptime.metaTitle",
    metaDescriptionKey: "services.uptime.metaDescription",
    capabilities: [
      { key: "uptime", status: "live" },
      {
        key: "statusPage",
        status: "live",
        noteKey: "statusPage",
      },
    ],
    related: ["scan", "guard"],
  },
  {
    slug: "ai-gateway",
    nameKey: "services.ai-gateway.name",
    summaryKey: "services.ai-gateway.summary",
    status: "beta",
    pillar: "ai",
    order: 5,
    published: true,
    metaTitleKey: "services.ai-gateway.metaTitle",
    metaDescriptionKey: "services.ai-gateway.metaDescription",
    capabilities: [
      {
        key: "aiGateway",
        status: "beta",
        noteKey: "aiGateway",
      },
    ],
    related: ["scan", "guard"],
  },
];

export const PILLARS: readonly {
  id: ServicePillar;
  titleKey: string;
  blurbKey: string;
  slugs: readonly string[];
}[] = [
  {
    id: "exposure",
    titleKey: "pillars.exposure.title",
    blurbKey: "pillars.exposure.blurb",
    slugs: ["scan"],
  },
  {
    id: "onbox",
    titleKey: "pillars.onbox.title",
    blurbKey: "pillars.onbox.blurb",
    slugs: ["guard", "host"],
  },
  {
    id: "availability",
    titleKey: "pillars.availability.title",
    blurbKey: "pillars.availability.blurb",
    slugs: ["uptime"],
  },
  {
    id: "ai",
    titleKey: "pillars.ai.title",
    blurbKey: "pillars.ai.blurb",
    slugs: ["ai-gateway"],
  },
];

const SERVICES_BY_SLUG = new Map(SERVICES.map((service) => [service.slug, service]));

export function getService(slug: string): ServiceEntry | undefined {
  return SERVICES_BY_SLUG.get(slug);
}

export function statusLabelKey(status: ServiceStatus): string {
  return STATUS_LABEL_KEYS[status];
}

export function capabilityLabelKey(slug: string, capability: Capability): string {
  return `services.${slug}.capabilities.${capability.key}`;
}

export function capabilityNoteKey(
  slug: string,
  capability: Capability,
): string | undefined {
  if (!capability.noteKey) return undefined;
  return `services.${slug}.capabilityNotes.${capability.noteKey}`;
}
