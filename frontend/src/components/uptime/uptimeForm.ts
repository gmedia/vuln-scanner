import type { UptimeCheckType, UptimeCreatePayload } from "@/api/uptime";

export const UPTIME_CHECK_TYPES = [
  "http",
  "tcp",
  "heartbeat",
  "dns",
  "ping",
] as const;

export type UptimeMonitorFormValues = {
  readonly name: string;
  readonly target: string;
  readonly checkType: UptimeCheckType;
  readonly interval: string;
  readonly timeoutSeconds: string;
  readonly expectStatus: string;
  readonly keyword: string;
  readonly keywordInvert: boolean;
  readonly httpMethod: string;
  readonly requestHeaders: string;
  readonly requestBody: string;
  readonly dnsRecord: string;
  readonly expectedValues: string;
  readonly notify: string;
};

export const EMPTY_UPTIME_FORM: UptimeMonitorFormValues = {
  name: "",
  target: "",
  checkType: "http",
  interval: "60",
  timeoutSeconds: "10",
  expectStatus: "",
  keyword: "",
  keywordInvert: false,
  httpMethod: "GET",
  requestHeaders: "",
  requestBody: "",
  dnsRecord: "A",
  expectedValues: "",
  notify: "",
};

export function asUptimeCheckType(value: string): UptimeCheckType {
  for (const item of UPTIME_CHECK_TYPES) {
    if (item === value) return item;
  }
  return "http";
}

export function formFromMonitor(
  monitor: {
    readonly name: string;
    readonly target: string;
    readonly check_type: string;
    readonly interval_seconds: number;
    readonly timeout_seconds: number | null;
    readonly expect_status: number | null;
    readonly keyword: string | null;
    readonly keyword_invert: boolean;
    readonly http_method?: string;
    readonly request_headers?: Record<string, string> | null;
    readonly request_body?: string | null;
    readonly dns_record?: string | null;
    readonly expected_values?: string[] | null;
    readonly notify_email: string | null;
  } | null,
): UptimeMonitorFormValues {
  if (!monitor) return EMPTY_UPTIME_FORM;
  return {
    name: monitor.name,
    target: monitor.target,
    checkType: asUptimeCheckType(monitor.check_type),
    interval: String(monitor.interval_seconds),
    timeoutSeconds: String(monitor.timeout_seconds ?? 10),
    expectStatus:
      monitor.expect_status != null ? String(monitor.expect_status) : "",
    keyword: monitor.keyword ?? "",
    keywordInvert: Boolean(monitor.keyword_invert),
    httpMethod: monitor.http_method ?? "GET",
    requestHeaders: monitor.request_headers
      ? JSON.stringify(monitor.request_headers)
      : "",
    requestBody: monitor.request_body ?? "",
    dnsRecord: monitor.dns_record ?? "A",
    expectedValues: (monitor.expected_values ?? []).join(", "),
    notify: monitor.notify_email ?? "",
  };
}

export type ParseUptimeFormResult =
  | { readonly ok: true; readonly payload: UptimeCreatePayload }
  | { readonly ok: false; readonly reason: "headers" };

export function parseUptimeFormPayload(
  values: UptimeMonitorFormValues,
): ParseUptimeFormResult {
  let headers: Record<string, string> | undefined;
  if (values.requestHeaders.trim()) {
    try {
      headers = JSON.parse(values.requestHeaders) as Record<string, string>;
    } catch {
      return { ok: false, reason: "headers" };
    }
  }
  const timeout = Number(values.timeoutSeconds) || 10;
  const expectRaw = values.expectStatus.trim();
  const expectNum = expectRaw ? Number(expectRaw) : undefined;
  return {
    ok: true,
    payload: {
      name: values.name.trim(),
      check_type: values.checkType,
      target:
        values.checkType === "heartbeat"
          ? "heartbeat://pending"
          : values.target.trim(),
      interval_seconds: Number(values.interval) || 60,
      timeout_seconds: values.checkType === "heartbeat" ? undefined : timeout,
      expect_status:
        values.checkType === "http" &&
        expectNum != null &&
        !Number.isNaN(expectNum)
          ? expectNum
          : undefined,
      keyword: values.keyword.trim() || undefined,
      keyword_invert: values.keywordInvert,
      http_method: values.checkType === "http" ? values.httpMethod : undefined,
      request_headers: headers,
      request_body: values.requestBody.trim() || undefined,
      dns_record: values.checkType === "dns" ? values.dnsRecord : undefined,
      expected_values: values.expectedValues.trim()
        ? values.expectedValues.split(",").map((s) => s.trim())
        : undefined,
      notify_email: values.notify.trim() || undefined,
    },
  };
}
