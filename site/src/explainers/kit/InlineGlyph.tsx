import type { Stage } from "../../data/types";
import { GlyphShape } from "../../components/Glyph";

/** Stage glyph for inline use inside explainer figures (the figure CSS makes bare svgs block-level). */
export function InlineGlyph({ stage, hollow = false, size = 8 }: { stage: Stage; hollow?: boolean; size?: number }) {
  const box = size + 4;
  return (
    <svg width={box} height={box} viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`} aria-hidden="true" style={{ display: "inline-block", verticalAlign: "-0.1em" }}>
      <GlyphShape stage={stage} size={size} hollow={hollow} />
    </svg>
  );
}
