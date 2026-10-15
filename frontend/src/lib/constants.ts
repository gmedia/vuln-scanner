export const SCAN_TYPES = ["ip", "domain", "apk", "ipa"] as const;
export const SCAN_TYPE_LABELS: Record<string, string> = {
  ip: "IP Address",
  domain: "Domain",
  apk: "APK / AAB",
  ipa: "IPA",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};
