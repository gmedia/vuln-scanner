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
    "Find internet-facing exposure, schedule attach scans, then Guard on the box. Host Protect does not invent malware. Not a SIEM. Not a second agent.",
  homeAriaLabel: "Sinexis home",
  footerLine: "Sinexis · Scan · Guard",
  sidebarVersion: "Sinexis v1.2.0",
} as const;
