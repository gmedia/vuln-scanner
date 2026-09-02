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
  authSubtitle:
    "Sinexis — security attach for colo, VPS, and hospitality stacks",
  heroTitle: "Sinexis",
  heroProduct: "Security attach for colo, VPS, and hospitality stacks",
  heroSub:
    "Periodic scan is not 24/7 SIEM. Host Protect reads disk on your VM. One wazuh-agent. Not a human pentest.",
  footerLine: "Sinexis · Scan · Guard · SIEM",
  sidebarVersion: "Sinexis Scan v1.2.0",
} as const;
