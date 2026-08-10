export const BRAND = {
  name: "Sinexis",
  product: "Sinexis Scan",
  markPrimary: "SINE",
  markAccent: "XIS",
  version: "1.2.0",
  get versionLabel() {
    return `${this.product} v${this.version}`;
  },
  metaTitle: "Sinexis Scan",
  metaDescription:
    "Sinexis Scan — security attach scanning for IP, domain, and mobile. Powered by the VulnScanner engine.",
  homeAriaLabel: "Sinexis home",
  authSubtitle: "Sinexis Scan — vulnerability scanning for your stack",
  heroTitle: "Sinexis",
  heroProduct: "Sinexis Scan",
  heroSub:
    "Security attach for teams that already run servers — Sinexis Scan, powered by the VulnScanner engine (IP, domain & mobile).",
  footerLine:
    "Sinexis Scan v1.2.0 · powered by VulnScanner engine · IP, domain & mobile",
  sidebarVersion: "Sinexis Scan v1.2.0",
} as const;
