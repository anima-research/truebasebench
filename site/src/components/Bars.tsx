import { fmt, fmtNum, isNum } from "../lib/numfmt";
import { linear } from "../lib/scale";

/** Monochrome score bar on a track, 0–1 (DESIGN §7.1). Null shows a hatched track. */
export function ScoreBar({
  value,
  width = 90,
  height = 8,
  ticks = false,
  title,
  range,
}: {
  value: number | null;
  width?: number;
  height?: number;
  ticks?: boolean;
  title?: string;
  /** 95% interval in score units (ramp applied to the CI bounds): drawn as a thin whisker with end caps */
  range?: [number, number] | null;
}) {
  const id = "hatch";
  const cl = (x: number) => Math.max(0, Math.min(1, x)) * width;
  const wy = height / 2;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={title ?? (isNum(value) ? fmt(value, "score") : "not measured")}
      style={{ display: "block", flex: "none" }}
    >
      {title && <title>{title}</title>}
      <rect width={width} height={height} fill={isNum(value) ? "var(--track)" : `url(#${id})`} />
      {isNum(value) && <rect width={Math.max(0, Math.min(1, value)) * width} height={height} fill="var(--bar)" />}
      {isNum(value) && range && isNum(range[0]) && isNum(range[1]) && (
        <g className="whisker" aria-hidden="true">
          <line x1={cl(range[0])} x2={cl(range[1])} y1={wy} y2={wy} stroke="var(--ink-2)" strokeWidth={1} />
          <line x1={cl(range[0])} x2={cl(range[0])} y1={wy - 2.5} y2={wy + 2.5} stroke="var(--ink-2)" strokeWidth={1} />
          <line x1={cl(range[1])} x2={cl(range[1])} y1={wy - 2.5} y2={wy + 2.5} stroke="var(--ink-2)" strokeWidth={1} />
        </g>
      )}
      {ticks &&
        [0.5, 1].map((t) => (
          <line key={t} x1={t * width - (t === 1 ? 0.5 : 0)} x2={t * width - (t === 1 ? 0.5 : 0)} y1={-2} y2={height + 2} stroke="var(--rule-strong)" />
        ))}
    </svg>
  );
}

/** Shared SVG defs (hatch pattern). Mounted once in the app shell. */
export function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--bg-plate)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--rule-strong)" strokeWidth="1.5" />
        </pattern>
        <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--ink)" />
        </marker>
        <marker id="arrow-2" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-2)" />
        </marker>
        {/* head for tagged (exception) arrows drawn in --ink-3 */}
        <marker id="arrow-3" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-3)" />
        </marker>
      </defs>
    </svg>
  );
}

/**
 * RampCell (DESIGN §5): the raw feature on its ramp's own axis. Track shaded --band from the 1-anchor outward,
 * a tick at the 0-anchor, the value as a 2px --ink tick.
 */
export function RampCell({
  value,
  good,
  bad,
  width = 64,
  height = 10,
  title,
}: {
  value: number | null;
  good: number;
  bad: number;
  width?: number;
  height?: number;
  title?: string;
}) {
  // Axis spans from the good anchor outward past the bad anchor, oriented so "good" is on the right.
  const span = bad - good;
  const lo = good - span * 0.25;
  const hi = bad + span * 0.25;
  const s = linear([hi, lo], [0, width]); // bad side on the left
  const clamp = (x: number) => Math.max(0, Math.min(width, x));
  const goodX = s(good);
  const badX = s(bad);
  return (
    <svg width={width} height={height} role="img" aria-label={title} style={{ display: "block", flex: "none" }}>
      {title && <title>{title}</title>}
      <rect width={width} height={height} fill="var(--track)" />
      <rect x={Math.min(goodX, width)} width={Math.max(0, width - goodX)} height={height} fill="var(--band)" />
      <line x1={badX} x2={badX} y1={0} y2={height} stroke="var(--rule-strong)" strokeWidth={1} />
      <line x1={goodX} x2={goodX} y1={0} y2={height} stroke="var(--rule-strong)" strokeWidth={1} strokeDasharray="2 1" />
      {isNum(value) ? (
        <line x1={clamp(s(value))} x2={clamp(s(value))} y1={-1} y2={height + 1} stroke="var(--ink)" strokeWidth={2} />
      ) : (
        <rect width={width} height={height} fill="url(#hatch)" />
      )}
    </svg>
  );
}

/** Bar growing from a 1px zero line; sign carried by direction and the label. */
export function DivergingBar({
  value,
  max,
  width = 160,
  height = 10,
  band,
  ghosts = [],
}: {
  value: number | null;
  max: number;
  width?: number;
  height?: number;
  band?: number;
  ghosts?: (number | null)[];
}) {
  const s = linear([-max, max], [0, width]);
  return (
    <svg width={width} height={height + 4} role="img" aria-label={fmt(value, "gap")} style={{ display: "block", flex: "none" }}>
      {band !== undefined && <rect x={s(-band)} width={s(band) - s(-band)} y={0} height={height + 4} fill="var(--band)" />}
      {isNum(value) && (
        <rect x={Math.min(s(0), s(value))} width={Math.abs(s(value) - s(0))} y={2} height={height} fill="var(--bar)" />
      )}
      <line x1={s(0)} x2={s(0)} y1={0} y2={height + 4} stroke="var(--zero)" strokeWidth={1} />
      {ghosts.map((g, i) => (isNum(g) ? <line key={i} x1={s(g)} x2={s(g)} y1={0} y2={height + 4} stroke="var(--ink-2)" strokeWidth={1.5} strokeDasharray="2 1" /> : null))}
    </svg>
  );
}

export function BarWithValue({ value, width = 64, kind = "score" as const }: { value: number | null; width?: number; kind?: "score" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <ScoreBar value={value} width={width} height={6} />
      <span className="small ink2">{fmtNum(value, kind)}</span>
    </span>
  );
}
