export const BRAND = {
  name: "Sinexis",
  product: "Sinexis Scan",
  markPrimary: "SINE",
  markAccent: "XIS",
  version: "1.2.0",
  get versionLabel() {
    return `${this.product} v${this.version}`;
  },
  metaTitle: "Sinexis — Security and operations attach",
  metaDescription:
    "Scan exposure, attach schedules, run one thin agent for inventory and alerts, probe availability, publish a status page, and use an AI gateway on the same account.",
  homeAriaLabel: "Sinexis home",
  footerLine: "Sinexis · Security & operations attach",
  sidebarVersion: "Sinexis v1.2.0",
} as const;
