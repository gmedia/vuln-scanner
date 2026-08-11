import { describe, it, expect } from "vitest";
import {
  buildEnrollCurlExample,
  GUARD_AGENT_INSTALL_INTRO,
  GUARD_AGENT_INSTALL_STEPS,
  GUARD_HOST_SETUP_STEPS,
  resolveApiBaseUrl,
} from "@/lib/guardEnrollHost";

describe("guardEnrollHost", () => {
  it("prefers VITE_API_URL over window origin", () => {
    expect(
      resolveApiBaseUrl("https://api.example.test/", "https://ui.example.test"),
    ).toBe("https://api.example.test");
  });

  it("falls back to window origin when env empty", () => {
    expect(resolveApiBaseUrl("", "https://app.example.test/")).toBe(
      "https://app.example.test",
    );
    expect(resolveApiBaseUrl(undefined, undefined)).toBe("");
  });

  it("builds enroll curl with placeholders", () => {
    const curl = buildEnrollCurlExample(
      "https://app.example.test",
      "tok_demo",
      "host-a",
    );
    expect(curl).toContain("POST 'https://app.example.test/api/guard/enroll'");
    expect(curl).toContain('"token":"tok_demo"');
    expect(curl).toContain('"agent_name":"host-a"');
    expect(curl).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });

  it("uses APP_ORIGIN placeholder when base empty", () => {
    const curl = buildEnrollCurlExample("");
    expect(curl).toContain("https://<APP_ORIGIN>/api/guard/enroll");
    expect(curl).toContain("<ENROLL_TOKEN>");
    expect(curl).toContain("<AGENT_NAME>");
  });

  it("exposes six host setup steps covering enroll and sync", () => {
    expect(GUARD_HOST_SETUP_STEPS).toHaveLength(6);
    const blob = GUARD_HOST_SETUP_STEPS.join(" ");
    expect(blob).toMatch(/enroll/i);
    expect(blob).toMatch(/Sync/);
    expect(blob).toMatch(/agent_key/);
    expect(blob).not.toMatch(/103\./);
  });

  it("exposes generic agent install steps without secrets or lab IPs", () => {
    expect(GUARD_AGENT_INSTALL_STEPS.length).toBeGreaterThanOrEqual(7);
    expect(GUARD_AGENT_INSTALL_INTRO).toMatch(/install_hint/i);
    const blob = GUARD_AGENT_INSTALL_STEPS.join(" ");
    expect(blob).toMatch(/manager_host/);
    expect(blob).toMatch(/wazuh-agent/i);
    expect(blob).toMatch(/systemctl/);
    expect(blob).toMatch(/agent_key/);
    expect(blob).not.toMatch(/103\./);
    expect(blob).toMatch(/Jangan buka password Manager/i);
    expect(blob).not.toMatch(/@gmedia|@.*\.id\b/i);
    expect(blob).not.toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
  });
});
