import { describe, expect, it } from "vitest";

import {
  PILLARS,
  SERVICES,
  capabilityLabelKey,
  capabilityNoteKey,
  getService,
} from "@/lib/services";
import enProducts from "@/locales/en/products.json";
import idProducts from "@/locales/id/products.json";

type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

function flattenKeys(value: Json, prefix = ""): string[] {
  if (Array.isArray(value) || typeof value !== "object" || value === null) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child as Json, prefix ? `${prefix}.${key}` : key),
  );
}

function lookup(root: Json, path: string): Json | undefined {
  return path.split(".").reduce<Json | undefined>((current, part) => {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, Json>)[part];
  }, root);
}

describe("public product registry", () => {
  it("keeps slugs unique and URL-safe", () => {
    const slugs = SERVICES.map((service) => service.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("pins the page-level status map", () => {
    expect(
      Object.fromEntries(SERVICES.map((service) => [service.slug, service.status])),
    ).toEqual({
      scan: "live",
      guard: "live",
      host: "mixed",
      uptime: "live",
      "ai-gateway": "beta",
    });
  });

  it("pins the per-capability status map", () => {
    expect(
      Object.fromEntries(
        SERVICES.map((service) => [
          service.slug,
          Object.fromEntries(
            service.capabilities.map((capability) => [
              capability.key,
              capability.status,
            ]),
          ),
        ]),
      ),
    ).toEqual({
      scan: { scan: "live", attach: "live", assets: "live" },
      guard: { guard: "live", siem: "by_request" },
      host: { hostProtect: "live", hostWaf: "limited" },
      uptime: { uptime: "live", statusPage: "live" },
      "ai-gateway": { aiGateway: "beta" },
    });
  });

  it("marks every shipped product as published", () => {
    for (const service of SERVICES) {
      expect(service.published, service.slug).toBe(true);
    }
  });

  it("maps every service to exactly one pillar", () => {
    const pillarSlugs = PILLARS.flatMap((pillar) => [...pillar.slugs]);
    expect(pillarSlugs.sort()).toEqual(
      SERVICES.map((service) => service.slug).sort(),
    );
    for (const service of SERVICES) {
      expect(
        PILLARS.some((pillar) => pillar.slugs.includes(service.slug)),
        service.slug,
      ).toBe(true);
    }
  });

  it("keeps related products valid and capped at two", () => {
    for (const service of SERVICES) {
      expect(service.related.length, service.slug).toBeLessThanOrEqual(2);
      expect(service.related, service.slug).not.toContain(service.slug);
      for (const related of service.related) {
        expect(getService(related), `${service.slug} -> ${related}`).toBeDefined();
      }
    }
  });

  it("keeps EN and ID locale key shapes in parity", () => {
    const enKeys = flattenKeys(enProducts as Json).sort();
    const idKeys = flattenKeys(idProducts as Json).sort();
    expect(idKeys).toEqual(enKeys);
  });

  it("resolves every registry key in both locales", () => {
    for (const service of SERVICES) {
      const keys = [
        service.nameKey,
        service.summaryKey,
        service.metaTitleKey,
        service.metaDescriptionKey,
        `services.${service.slug}.intro`,
        `services.${service.slug}.whatItDoes`,
        `services.${service.slug}.doesNotDo`,
        `services.${service.slug}.steps`,
        `services.${service.slug}.requirements`,
        ...service.capabilities.map((capability) =>
          capabilityLabelKey(service.slug, capability),
        ),
        ...service.capabilities.flatMap((capability) => {
          const noteKey = capabilityNoteKey(service.slug, capability);
          return noteKey ? [noteKey] : [];
        }),
      ];
      for (const key of keys) {
        expect(lookup(enProducts as Json, key), `en:${key}`).toBeDefined();
        expect(lookup(idProducts as Json, key), `id:${key}`).toBeDefined();
      }
    }
  });

  it("keeps meta titles and descriptions unique per slug", () => {
    for (const locale of [enProducts, idProducts]) {
      const titles = SERVICES.map((service) =>
        lookup(locale as Json, service.metaTitleKey),
      );
      const descriptions = SERVICES.map((service) =>
        lookup(locale as Json, service.metaDescriptionKey),
      );
      for (const value of [...titles, ...descriptions]) {
        expect(typeof value).toBe("string");
        expect((value as string).length).toBeGreaterThan(10);
      }
      expect(new Set(titles).size).toBe(titles.length);
      expect(new Set(descriptions).size).toBe(descriptions.length);
    }
  });

  it("looks up services by slug", () => {
    expect(getService("host")?.status).toBe("mixed");
    expect(getService("unknown")).toBeUndefined();
  });
});
