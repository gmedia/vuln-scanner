export const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-red-100",
  high: "bg-orange-500 text-orange-100",
  medium: "bg-yellow-500 text-yellow-100",
  low: "bg-blue-500 text-blue-100",
  info: "bg-gray-500 text-gray-100",
};

export const SEVERITY_BORDER: Record<string, string> = {
  critical: "border-l-red-600",
  high: "border-l-orange-500",
  medium: "border-l-yellow-500",
  low: "border-l-blue-500",
  info: "border-l-gray-500",
};

export const SCAN_TYPES = ["ip", "domain", "apk", "ipa"] as const;
export const SCAN_TYPE_LABELS: Record<string, string> = {
  ip: "IP Address",
  domain: "Domain",
  apk: "APK",
  ipa: "IPA",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};
