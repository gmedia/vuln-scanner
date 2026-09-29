import { useEffect, useState } from "react";
import { TOC_IDS, isTocId, type TocId } from "@/components/guide/guideMeta";

export function useActiveGuideSection() {
  const [activeId, setActiveId] = useState<TocId>(TOC_IDS[0]);

  useEffect(() => {
    const nodes = TOC_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (nodes.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const mainEl = nodes[0]?.closest("main");
    const mainOverflows =
      mainEl instanceof HTMLElement &&
      mainEl.scrollHeight > mainEl.clientHeight + 1;
    const scrollRoot = mainOverflows ? mainEl : null;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0]?.target.id;
        if (first && isTocId(first)) {
          setActiveId(first);
          return;
        }
        const readingY = 56 + 24;
        let bestId: TocId = TOC_IDS[0];
        let bestDist = Number.POSITIVE_INFINITY;
        for (const node of nodes) {
          const dist = Math.abs(node.getBoundingClientRect().top - readingY);
          if (dist < bestDist) {
            bestDist = dist;
            bestId = isTocId(node.id) ? node.id : TOC_IDS[0];
          }
        }
        setActiveId(bestId);
      },
      {
        root: scrollRoot,
        rootMargin: "-56px 0px -50% 0px",
        threshold: [0, 0.1, 0.25],
      },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return activeId;
}
