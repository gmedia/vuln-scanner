import type { Locator, Page } from "@playwright/test";

export const SCANNER_ROUTES = [
  "/scan/ip",
  "/scan/domain",
  "/scan/mobile",
] as const;

const NOT_SCANNER_ROUTE = SCANNER_ROUTES.map(
  (route) => `:not([href='${route}'])`,
).join("");

// Bare `a[href^='/scan/']` also matches sidebar scanner links, the empty-state
// "Scan IP" CTA, and the hidden mobile card, so scope + require visibility.
export function scanHistoryLinks(page: Page): Locator {
  return page.locator(`main a[href^='/scan/']:visible${NOT_SCANNER_ROUTE}`);
}
