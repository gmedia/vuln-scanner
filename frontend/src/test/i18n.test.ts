import { describe, it, expect } from "vitest";
import { resources } from "@/i18n";

describe("i18n catalogs", () => {
  it("keeps id and en keys in parity per namespace", () => {
    const nss = Object.keys(resources.en) as Array<keyof typeof resources.en>;
    for (const ns of nss) {
      const enKeys = Object.keys(resources.en[ns]).sort();
      const idKeys = Object.keys(resources.id[ns]).sort();
      expect(idKeys, ns).toEqual(enKeys);
    }
  });
});
