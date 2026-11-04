import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BRAND } from "@/lib/brand";
import { usePageMeta } from "@/lib/seo";
import type { PageMeta } from "@/lib/seo";

type NodeFs = {
  readFileSync: (path: string, encoding: "utf8") => string;
};

function readIndexHtml(): string {
  const nodeProcess = (
    globalThis as unknown as {
      process: {
        cwd: () => string;
        getBuiltinModule: (id: string) => NodeFs;
      };
    }
  ).process;
  // Vitest's module runner can expose an http origin for import.meta.url; fall
  // back to the checkout path so node:fs always receives a filesystem path.
  const fromImport = new URL("../../index.html", import.meta.url);
  const indexUrl =
    fromImport.protocol === "file:"
      ? fromImport
      : new URL(
          "../../index.html",
          `file://${nodeProcess.cwd()}/src/test/seoMeta.test.ts`,
        );
  return nodeProcess
    .getBuiltinModule("node:fs")
    .readFileSync(indexUrl.pathname, "utf8");
}

function metaContent(attr: "name" | "property", key: string): string | null {
  return (
    document.head
      .querySelector(`meta[${attr}="${key}"]`)
      ?.getAttribute("content") ?? null
  );
}

function canonicalHref(): string | null {
  return (
    document.head
      .querySelector('link[rel="canonical"]')
      ?.getAttribute("href") ?? null
  );
}

function appendMeta(attr: "name" | "property", key: string, content: string) {
  const element = document.createElement("meta");
  element.setAttribute(attr, key);
  element.setAttribute("content", content);
  document.head.appendChild(element);
}

function seedHead(): void {
  document.head
    .querySelectorAll('meta[name], meta[property], link[rel="canonical"]')
    .forEach((element) => element.remove());
  document.title = BRAND.metaTitle;
  appendMeta("name", "description", BRAND.metaDescription);
  appendMeta("property", "og:title", BRAND.metaTitle);
  appendMeta("property", "og:description", BRAND.metaDescription);
  const canonical = document.createElement("link");
  canonical.setAttribute("rel", "canonical");
  canonical.setAttribute("href", "/");
  document.head.appendChild(canonical);
}

function Probe({ meta }: { meta: PageMeta }) {
  usePageMeta(meta);
  return null;
}

describe("static and per-page metadata", () => {
  beforeEach(seedHead);
  afterEach(cleanup);

  it("index.html title and description match BRAND", () => {
    const parsed = new DOMParser().parseFromString(
      readIndexHtml(),
      "text/html",
    );

    expect(parsed.title).toBe(BRAND.metaTitle);
    expect(
      parsed
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    ).toBe(BRAND.metaDescription);
  });

  it("sets page tags, makes the canonical absolute, and restores on unmount", () => {
    const { unmount } = render(
      createElement(Probe, {
        meta: {
          title: "Test page",
          description: "Test description",
          canonical: "/blog/test",
          og: { title: "OG title", description: "OG description" },
        },
      }),
    );

    expect(document.title).toBe("Test page");
    expect(metaContent("name", "description")).toBe("Test description");
    expect(metaContent("property", "og:title")).toBe("OG title");
    expect(metaContent("property", "og:description")).toBe(
      "OG description",
    );
    expect(canonicalHref()).toBe("https://sinexis.app/blog/test");

    unmount();

    expect(document.title).toBe(BRAND.metaTitle);
    expect(metaContent("name", "description")).toBe(BRAND.metaDescription);
    expect(metaContent("property", "og:title")).toBe(BRAND.metaTitle);
    expect(metaContent("property", "og:description")).toBe(
      BRAND.metaDescription,
    );
    expect(canonicalHref()).toBe("/");
  });

  it("falls back to the page title and description for OG tags", () => {
    render(
      createElement(Probe, {
        meta: {
          title: "Fallback page",
          description: "Fallback description",
          canonical: "https://sinexis.app/terms",
        },
      }),
    );

    expect(metaContent("property", "og:title")).toBe("Fallback page");
    expect(metaContent("property", "og:description")).toBe(
      "Fallback description",
    );
    expect(canonicalHref()).toBe("https://sinexis.app/terms");
  });
});
