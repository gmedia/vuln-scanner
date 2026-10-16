import { describe, it, expect } from "vitest";
import { resources } from "@/i18n";

// In-page copy names a page the way the operator sees it ("the HPP page"),
// never by its developer route path ("/admin/hpp"). guide.json is excluded:
// the /guide handbook intentionally documents routes, API endpoints, and shell
// commands.
const ROUTE_PATH = /(?<![A-Za-z0-9])\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)+/;

describe("i18n catalogs", () => {
  it("keeps id and en keys in parity per namespace", () => {
    const nss = Object.keys(resources.en) as Array<keyof typeof resources.en>;
    for (const ns of nss) {
      const enKeys = Object.keys(resources.en[ns]).sort();
      const idKeys = Object.keys(resources.id[ns]).sort();
      expect(idKeys, ns).toEqual(enKeys);
    }
  });

  it("keeps in-page copy free of raw route paths", () => {
    const nss = Object.keys(resources.en) as Array<keyof typeof resources.en>;
    for (const ns of nss) {
      if (ns === "guide") continue;
      for (const lang of ["en", "id"] as const) {
        for (const [key, value] of Object.entries(resources[lang][ns])) {
          expect(ROUTE_PATH.test(value), `${lang}/${ns}:${key}`).toBe(false);
        }
      }
    }
  });
});
