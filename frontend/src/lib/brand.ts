export const BRAND = {
  name: "Sinexis",
  product: "Sinexis Scan",
  markPrimary: "SINE",
  markAccent: "XIS",
  version: "1.2.0",
  get versionLabel() {
    return `${this.product} v${this.version}`;
  },
  metaTitle: "Sinexis — Security attach for colo & VPS",
  metaDescription:
    "Find exposure on IP, domain, and mobile. Schedule attach scans, share in a workspace, then Guard on the same account. Not a SIEM. Not a second agent.",
  homeAriaLabel: "Sinexis home",
  authSubtitle:
    "Sinexis — security attach for colo, VPS, and hospitality stacks",
  heroTitle: "Sinexis",
  heroProduct: "Security attach for colo, VPS, and hospitality stacks",
  heroSub:
    "Find exposure on IP, domain, and mobile. Schedule attach scans, share in a workspace, then run Guard and SIEM on the same account — credits included.",
  footerLine: "Sinexis · Scan · Guard · SIEM",
  sidebarVersion: "Sinexis Scan v1.2.0",
} as const;
