import { useEffect } from "react";

export const SITE_ORIGIN = "https://sinexis.app";

export type PageMetaOg = {
  title?: string;
  description?: string;
  image?: string;
};

export type PageMeta = {
  title: string;
  description: string;
  canonical: string;
  og?: PageMetaOg;
  /**
   * Optional indexing policy. Omit it to leave the existing robots tag alone;
   * public product pages set `index`, and unknown product slugs set `noindex`.
   */
  robots?: "index" | "noindex";
};

export function absoluteUrl(canonical: string): string {
  if (canonical.startsWith("/")) {
    return `${SITE_ORIGIN}${canonical}`;
  }
  return canonical;
}

type MetaAttr = "name" | "property";

type MetaSnapshot = {
  attr: MetaAttr;
  key: string;
  element: HTMLMetaElement | null;
};

function findMeta(attr: MetaAttr, key: string): HTMLMetaElement | null {
  return document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
}

function snapshotMeta(attr: MetaAttr, key: string): MetaSnapshot {
  return { attr, key, element: findMeta(attr, key) };
}

function writeMeta(snapshot: MetaSnapshot, content: string): void {
  let element = snapshot.element ?? findMeta(snapshot.attr, snapshot.key);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(snapshot.attr, snapshot.key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function restoreMeta(
  snapshot: MetaSnapshot,
  originalContent: string | null,
): void {
  if (snapshot.element) {
    if (originalContent === null) {
      snapshot.element.removeAttribute("content");
    } else {
      snapshot.element.setAttribute("content", originalContent);
    }
    return;
  }
  findMeta(snapshot.attr, snapshot.key)?.remove();
}

function findCanonical(): HTMLLinkElement | null {
  return document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
}

/**
 * Set per-route head metadata while a page is mounted.
 *
 * The original title/description/OG/canonical are snapshotted and restored on
 * unmount, including removing tags that `index.html` never had.
 */
export function usePageMeta({
  title,
  description,
  canonical,
  og,
  robots,
}: PageMeta): void {
  const ogTitle = og?.title;
  const ogDescription = og?.description;
  const ogImage = og?.image;

  useEffect(() => {
    const originalTitle = document.title;
    const descriptionSnapshot = snapshotMeta("name", "description");
    const originalDescription =
      descriptionSnapshot.element?.getAttribute("content") ?? null;
    const robotsSnapshot = snapshotMeta("name", "robots");
    const originalRobots =
      robotsSnapshot.element?.getAttribute("content") ?? null;
    const ogTitleSnapshot = snapshotMeta("property", "og:title");
    const originalOgTitle =
      ogTitleSnapshot.element?.getAttribute("content") ?? null;
    const ogDescriptionSnapshot = snapshotMeta("property", "og:description");
    const originalOgDescription =
      ogDescriptionSnapshot.element?.getAttribute("content") ?? null;
    const ogImageSnapshot = snapshotMeta("property", "og:image");
    const originalOgImage =
      ogImageSnapshot.element?.getAttribute("content") ?? null;
    const originalCanonicalElement = findCanonical();
    const originalCanonical =
      originalCanonicalElement?.getAttribute("href") ?? null;

    document.title = title;
    writeMeta(descriptionSnapshot, description);
    writeMeta(ogTitleSnapshot, ogTitle ?? title);
    writeMeta(ogDescriptionSnapshot, ogDescription ?? description);
    if (ogImage) {
      writeMeta(ogImageSnapshot, absoluteUrl(ogImage));
    }
    if (robots) {
      writeMeta(robotsSnapshot, robots);
    }
    const href = absoluteUrl(canonical);
    if (originalCanonicalElement) {
      originalCanonicalElement.setAttribute("href", href);
    } else {
      const link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      link.setAttribute("href", href);
      document.head.appendChild(link);
    }

    return () => {
      document.title = originalTitle;
      restoreMeta(descriptionSnapshot, originalDescription);
      restoreMeta(ogTitleSnapshot, originalOgTitle);
      restoreMeta(ogDescriptionSnapshot, originalOgDescription);
      if (ogImage) {
        restoreMeta(ogImageSnapshot, originalOgImage);
      }
      if (robots) {
        restoreMeta(robotsSnapshot, originalRobots);
      }
      if (originalCanonicalElement) {
        if (originalCanonical === null) {
          originalCanonicalElement.removeAttribute("href");
        } else {
          originalCanonicalElement.setAttribute("href", originalCanonical);
        }
      } else {
        findCanonical()?.remove();
      }
    };
  }, [title, description, canonical, ogTitle, ogDescription, ogImage, robots]);
}
