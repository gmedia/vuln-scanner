import { describe, it, expect } from "vitest";
import {
  buildEnrollCurlExample,
  GUARD_AGENT_INSTALL_INTRO_KEY,
  GUARD_AGENT_INSTALL_STEP_KEYS,
  GUARD_DISTRO_INSTALL_FOOTER_KEY,
  GUARD_DISTRO_INSTALL_GUIDES,
  GUARD_ENROLL_PATH_VARS,
  GUARD_HOST_SETUP_STEP_KEYS,
  resolveApiBaseUrl,
} from "@/lib/guardEnrollHost";
import enGuardEnroll from "@/locales/en/guardEnroll.json";
import idGuardEnroll from "@/locales/id/guardEnroll.json";

const en = enGuardEnroll as Record<string, string>;
const id = idGuardEnroll as Record<string, string>;

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

  it("exposes six host setup step keys that exist in both catalogs", () => {
    expect(GUARD_HOST_SETUP_STEP_KEYS).toHaveLength(6);
    for (const key of GUARD_HOST_SETUP_STEP_KEYS) {
      expect(en[key], `en:${key}`).toBeTruthy();
      expect(id[key], `id:${key}`).toBeTruthy();
    }
  });

  it("exposes eight agent install step keys that exist in both catalogs", () => {
    expect(GUARD_AGENT_INSTALL_STEP_KEYS).toHaveLength(8);
    for (const key of GUARD_AGENT_INSTALL_STEP_KEYS) {
      expect(en[key], `en:${key}`).toBeTruthy();
      expect(id[key], `id:${key}`).toBeTruthy();
    }
    expect(en[GUARD_AGENT_INSTALL_INTRO_KEY]).toMatch(/install_hint/i);
    expect(id[GUARD_AGENT_INSTALL_INTRO_KEY]).toMatch(/install_hint/i);
  });

  it("interpolates every path so the catalog stays route-free", () => {
    expect(GUARD_ENROLL_PATH_VARS.enrollPath).toBe("/api/guard/enroll");
    const routePath = /(?<![A-Za-z0-9])\/[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)+/;
    for (const [lang, catalog] of [
      ["en", en],
      ["id", id],
    ] as const) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(routePath.test(value), `${lang}:${key}`).toBe(false);
      }
    }
    // The rendered sentence must still carry the real path.
    const rendered = en.hostStep3.replace(
      "{{enrollPath}}",
      GUARD_ENROLL_PATH_VARS.enrollPath,
    );
    expect(rendered).toContain("/api/guard/enroll");
  });

  it("keeps install copy free of secrets and lab IPs in both languages", () => {
    const keys = [
      ...GUARD_HOST_SETUP_STEP_KEYS,
      ...GUARD_AGENT_INSTALL_STEP_KEYS,
      GUARD_AGENT_INSTALL_INTRO_KEY,
      GUARD_DISTRO_INSTALL_FOOTER_KEY,
    ];
    for (const catalog of [en, id]) {
      const blob = keys.map((key) => catalog[key]).join(" ");
      expect(blob).toMatch(/agent_key/);
      expect(blob).toMatch(/manager_host/);
      expect(blob).not.toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
      expect(blob).not.toMatch(/@gmedia|@.*\.id\b/i);
      expect(blob).not.toMatch(/password\s*=/i);
    }
  });

  it("exposes distro-specific host commands without secrets or lab IPs", () => {
    expect(GUARD_DISTRO_INSTALL_GUIDES.length).toBeGreaterThanOrEqual(3);
    const ids = GUARD_DISTRO_INSTALL_GUIDES.map((guide) => guide.id);
    expect(ids).toContain("debian-ubuntu");
    expect(ids).toContain("rhel-family");
    expect(ids).toContain("suse");

    const blob = [
      ...GUARD_DISTRO_INSTALL_GUIDES.flatMap((guide) => [
        guide.title,
        en[guide.blurbKey] ?? "",
        ...guide.commands,
      ]),
      en[GUARD_DISTRO_INSTALL_FOOTER_KEY],
    ].join("\n");
    expect(blob).toMatch(/apt-get install -y wazuh-agent/);
    expect(blob).toMatch(/dnf install -y wazuh-agent/);
    expect(blob).toMatch(/zypper install -y wazuh-agent/);
    expect(blob).toMatch(/manage_agents/);
    expect(blob).toMatch(/<MANAGER_HOST>/);
    expect(blob).not.toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
    expect(blob).not.toMatch(/@gmedia|password\s*=/i);
  });

  it("has a blurb key in both catalogs for every distro", () => {
    for (const guide of GUARD_DISTRO_INSTALL_GUIDES) {
      expect(en[guide.blurbKey], `en:${guide.blurbKey}`).toBeTruthy();
      expect(id[guide.blurbKey], `id:${guide.blurbKey}`).toBeTruthy();
    }
  });
});
