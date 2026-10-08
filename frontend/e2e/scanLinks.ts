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
// "Scan IP" CTA, the attention-strip link, and the hidden mobile card. Only
// scan-history rows carry `data-status`, so require it plus visibility.
const ROW = `main a[href^='/scan/'][data-status]:visible${NOT_SCANNER_ROUTE}`;

export function scanHistoryLinks(page: Page): Locator {
  return page.locator(ROW);
}

export function completedScanLinks(page: Page): Locator {
  return page.locator(`${ROW}[data-status='completed']`);
}
