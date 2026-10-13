import { useEffect, useState } from "react";

/**
 * Scroll-spy for a page rail: the id of the last of `ids` whose element has scrolled to within `offset` px of the
 * top of the viewport (the first id before any has). Works for section elements and for headings alike, and stays
 * on a section while its heading is above the fold. Used by the model page, the reading pages and Findings.
 */
export function useScrollSpy(ids: string[], offset = 120): string {
  const [active, setActive] = useState(ids[0] ?? "");
  const key = ids.join("\u0000");
  useEffect(() => {
    if (typeof window === "undefined" || !ids.length) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let cur = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= offset) cur = id;
      }
      // at the very bottom the last short section can never reach the offset: mark it current
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) cur = ids[ids.length - 1];
      setActive(cur);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [key, offset]);
  return active;
}
