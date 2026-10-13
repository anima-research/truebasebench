import { wrapText, type Scale } from "../lib/scale";

/** Horizontal axis at y. Ticks 11px --ink-3, axis line --rule-strong, optional gridlines up to gridTop. */
export function XAxis({
  scale,
  y,
  ticks,
  format = (v) => String(v),
  title,
  gridTop,
  titleOffset = 30,
}: {
  scale: Scale;
  y: number;
  ticks?: number[];
  format?: (v: number) => string;
  title?: string;
  gridTop?: number;
  titleOffset?: number;
}) {
  const t = ticks ?? scale.ticks(5);
  const [r0, r1] = scale.range;
  return (
    <g aria-hidden="true">
      {gridTop !== undefined &&
        t.map((v) => <line key={"g" + v} x1={scale(v)} x2={scale(v)} y1={gridTop} y2={y} stroke="var(--rule)" strokeWidth={1} />)}
      <line x1={Math.min(r0, r1)} x2={Math.max(r0, r1)} y1={y} y2={y} stroke="var(--rule-strong)" />
      {t.map((v) => (
        <g key={v} transform={`translate(${scale(v)},${y})`}>
          <line y2={4} stroke="var(--rule-strong)" />
          <text y={16} textAnchor="middle">
            {format(v)}
          </text>
        </g>
      ))}
      {title && (
        <text x={Math.min(r0, r1)} y={y + titleOffset} textAnchor="start" style={{ fill: "var(--ink-2)" }}>
          {/* wraps to the axis length (+ the usual right pad) so a long title never runs off a narrow chart */}
          {wrapText(title, Math.abs(r1 - r0) + 12).map((l, i) => (
            <tspan key={i} x={Math.min(r0, r1)} dy={i ? 14 : 0}>
              {l}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}

/** Vertical axis at x. */
export function YAxis({
  scale,
  x,
  ticks,
  format = (v) => String(v),
  title,
  gridRight,
}: {
  scale: Scale;
  x: number;
  ticks?: number[];
  format?: (v: number) => string;
  title?: string;
  gridRight?: number;
}) {
  const t = ticks ?? scale.ticks(5);
  const [r0, r1] = scale.range;
  return (
    <g aria-hidden="true">
      {gridRight !== undefined &&
        t.map((v) => <line key={"g" + v} x1={x} x2={gridRight} y1={scale(v)} y2={scale(v)} stroke="var(--rule)" />)}
      <line x1={x} x2={x} y1={Math.min(r0, r1)} y2={Math.max(r0, r1)} stroke="var(--rule-strong)" />
      {t.map((v) => (
        <g key={v} transform={`translate(${x},${scale(v)})`}>
          <line x2={-4} stroke="var(--rule-strong)" />
          <text x={-7} dy="0.32em" textAnchor="end">
            {format(v)}
          </text>
        </g>
      ))}
      {title && (
        <text x={x - 4} y={Math.min(r0, r1) - 10} textAnchor="start" style={{ fill: "var(--ink-2)" }}>
          {title}
        </text>
      )}
    </g>
  );
}

/** Extra height (px) a chart must add below its x axis when the title wraps to more than one line. */
export function xTitleExtra(title: string, axisLen: number): number {
  return (wrapText(title, axisLen + 12).length - 1) * 14;
}
