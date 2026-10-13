import type { Stage } from "../data/types";
import { STAGE_CODE, STAGE_NAME, stageOrder } from "../data/derive";

export const STAGE_VAR: Record<Stage, string> = {
  "pre-anneal": "var(--st-pre)",
  anneal: "var(--st-anl)",
  base: "var(--st-base)",
  "post-trained": "var(--st-post)",
};

/** Stage glyph drawn centred at (x, y) inside an existing SVG. size = nominal width in px. */
export function GlyphShape({
  stage,
  x = 0,
  y = 0,
  size = 7,
  hollow = false,
  color,
}: {
  stage: Stage;
  x?: number;
  y?: number;
  size?: number;
  hollow?: boolean;
  color?: string;
}) {
  const c = color ?? STAGE_VAR[stage];
  const r = size / 2;
  const common = hollow
    ? { fill: "var(--bg)", stroke: c, strokeWidth: 1.5 }
    : { fill: c, stroke: "none" as const };
  switch (stage) {
    case "pre-anneal":
      return <circle cx={x} cy={y} r={hollow ? r - 0.5 : r} {...common} />;
    case "anneal": {
      const d = r * 1.25;
      return <polygon points={`${x},${y - d} ${x + d},${y} ${x},${y + d} ${x - d},${y}`} {...common} />;
    }
    case "base": {
      const s = hollow ? size - 1.2 : size * 0.9;
      return <rect x={x - s / 2} y={y - s / 2} width={s} height={s} {...common} />;
    }
    case "post-trained": {
      const h = size * 1.05;
      return <polygon points={`${x},${y - h * 0.6} ${x + r * 1.15},${y + h * 0.45} ${x - r * 1.15},${y + h * 0.45}`} {...common} />;
    }
  }
}

/** Standalone inline glyph. */
export function Glyph({ stage, size = 8, hollow = false, title }: { stage: Stage; size?: number; hollow?: boolean; title?: string }) {
  const box = size + 4;
  return (
    <svg
      width={box}
      height={box}
      viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ verticalAlign: "-0.15em", flex: "none" }}
    >
      <GlyphShape stage={stage} size={size} hollow={hollow} />
    </svg>
  );
}

export function StageTag({ stage, name = false, size = 8 }: { stage: Stage; name?: boolean; size?: number }) {
  return (
    <span className="stage-tag" title={STAGE_NAME[stage]}>
      <Glyph stage={stage} size={size} />
      <span className="code">{STAGE_CODE[stage]}</span>
      {name ? <span className="ink2">{STAGE_NAME[stage]}</span> : <span className="visually-hidden">{STAGE_NAME[stage]}</span>}
    </span>
  );
}

export function StageLegend({ stages = stageOrder, hollowNote }: { stages?: Stage[]; hollowNote?: string }) {
  return (
    <ul className="legend" aria-label="Stage legend">
      {stageOrder
        .filter((s) => stages.includes(s))
        .map((s) => (
          <li key={s}>
            <Glyph stage={s} size={10} />
            <span className="code">{STAGE_CODE[s]}</span>
            <span>{STAGE_NAME[s]}</span>
          </li>
        ))}
      {hollowNote && (
        <li>
          <Glyph stage="base" size={10} hollow />
          <span>{hollowNote}</span>
        </li>
      )}
    </ul>
  );
}
