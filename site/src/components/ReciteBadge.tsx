import { memoValue, recitation, recitationAnchors, type Recitation } from "../data/derive";
import { useBundle } from "../data/BundleContext";
import type { Model } from "../data/types";
import { fmt } from "../lib/numfmt";

/** Three short lines: a recitation mark (not colour-only; the word "recites" sits beside it). */
export function ReciteGlyph({ state, size = 10 }: { state: Exclude<Recitation, null>; size?: number }) {
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 10 10" aria-hidden="true" style={{ display: "inline-block", verticalAlign: "-1px" }}>
      {[2, 5, 8].map((y, i) => (
        <line key={y} x1={1} x2={i === 1 ? 7 : 9} y1={y} y2={y} stroke="currentColor" strokeWidth={state === "flagged" ? 1.8 : 1.2} strokeDasharray={state === "elevated" ? "2 1.5" : undefined} />
      ))}
    </svg>
  );
}

export function reciteTitle(bundle: Parameters<typeof recitation>[0], m: Model): string | null {
  const st = recitation(bundle, m);
  if (!st) return null;
  const [one, zero] = recitationAnchors(bundle);
  const v = memoValue(m);
  return st === "flagged"
    ? `recites Wikipedia verbatim: ${fmt(v, "pct")} of tokens (flag at ≥${fmt(zero, "pct")}); a validation probe, not a term of the score`
    : `elevated Wikipedia recitation: ${fmt(v, "pct")} of tokens (above ${fmt(one, "pct")}, below the ${fmt(zero, "pct")} flag); a validation probe, not a term of the score`;
}

/** Inline badge: glyph + word, with the value and anchors in the tooltip. Renders nothing when the row is not flagged. */
export function ReciteBadge({ m, size = 10 }: { m: Model; size?: number }) {
  const bundle = useBundle();
  const st = recitation(bundle, m);
  if (!st) return null;
  return (
    <span className={`recite ${st}`} title={reciteTitle(bundle, m) ?? undefined}>
      <ReciteGlyph state={st} size={size} /> {st === "flagged" ? "recites" : "elevated"}
    </span>
  );
}
