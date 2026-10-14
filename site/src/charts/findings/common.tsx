/**
 * Shared helpers for the findings charts (cross-cutting; finding implementers import, they do not edit).
 *   rowLabel      family-disambiguated row labels with a middle ellipsis
 *   tipTitle/tipLines  the one tooltip order every findings chart follows:
 *                 'family · label' / 'CODE stage name' / '<metric> <value> [lo, hi] 95% CI, n docs' / path
 *   CiWhisker, MedianTick, RangeBand, TagText  in-figure marks drawn from tokens only
 */
import type { ReactNode } from "react";
import { Num } from "../../components/Num";
import { ciBounds, ciKind } from "../../data/ci";
import { STAGE_CODE, STAGE_NAME } from "../../data/derive";
import type { Model } from "../../data/types";
import { fmtNum, type Fmt } from "../../lib/numfmt";
import { withCI } from "../TailPriorCharts";

/** "DeepSeek V3 Base (…)" → "DeepSeek V3 B…(…)": overflow keeps both ends. */
export function middleEllipsis(s: string, max: number): string {
  if (max < 3 || s.length <= max) return s;
  const head = Math.ceil((max - 1) / 2);
  const tail = max - 1 - head;
  return s.slice(0, head) + "…" + (tail > 0 ? s.slice(s.length - tail) : "");
}

const famPrefix = (family: string, n: number) => family.split(/\s+/).slice(0, n).join(" ");
const stripParens = (s: string) => s.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();

/**
 * Row label for a model among the rows of one chart: family tokens are added one at a time until the family is
 * unique among `among` ('DeepSeek V3 Base' / 'DeepSeek V4 Base', 'Gemma 4 Base' / 'Gemma 2 base'); parentheticals
 * are stripped from the label only while the result stays unique; overflow uses a middle ellipsis.
 */
export function rowLabel(m: Model, among: Model[], max = 22): string {
  const fams = Array.from(new Set(among.map((x) => x.family)));
  const prefixOf = (family: string) => {
    const n = family.split(/\s+/).length;
    let k = 1;
    while (k < n && fams.some((f) => f !== family && famPrefix(f, k).toLowerCase() === famPrefix(family, k).toLowerCase())) k++;
    return famPrefix(family, k);
  };
  const full = (x: Model) => `${prefixOf(x.family)} ${x.label}`;
  const short = (x: Model) => `${prefixOf(x.family)} ${stripParens(x.label)}`;
  const mine = short(m).toLowerCase();
  const collides = among.some((x) => x.id !== m.id && (short(x).toLowerCase() === mine || full(x).toLowerCase() === mine));
  return middleEllipsis(collides ? full(m) : short(m), max);
}

export function tipTitle(m: Model): string {
  return `${m.family} · ${m.label}`;
}

/** Tooltip lines after the title: stage line, then '<metric> <value>' with the interval when the bundle has one. */
export function tipLines(m: Model, metricName: string, value: number | null | undefined, fmtKind: Fmt, ciKey?: string): string[] {
  const b = ciKey ? ciBounds(m, ciKey) : null;
  const kind = ciKey ? ciKind(m, ciKey) : null;
  const v = withCI(value ?? null, b, fmtKind) + (b && kind ? ` ${kind}` : "");
  return [`${STAGE_CODE[m.stage]} ${STAGE_NAME[m.stage]}`, metricName ? `${metricName} ${v}` : v];
}

/** 1px --ink-3 interval line through a glyph, no caps; draw it before the glyph so it sits behind. */
export function CiWhisker({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2?: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2 ?? y1} stroke="var(--ink-3)" strokeWidth={1} />;
}

/** Leaderboard ladder-strip idiom: a 1px --ink tick 14px tall with the value printed under it. */
export function MedianTick({ x, y, value, fmt, label }: { x: number; y: number; value: number; fmt: Fmt; label?: string }) {
  return (
    <g aria-hidden="true">
      <line x1={x} x2={x} y1={y - 7} y2={y + 7} stroke="var(--ink)" strokeWidth={1} />
      <text x={x} y={y + 18} textAnchor="middle" className="halo" style={{ fontSize: 11, fill: "var(--ink-2)" }}>
        {label ? `${label} ` : ""}
        {fmtNum(value, fmt)}
      </text>
    </g>
  );
}

/**
 * A --band rect with a halo label. With `num`, the label carries a live <Num derived> (through a foreignObject),
 * so the band's width is a provenance-bearing number like every other value on the page.
 */
export function RangeBand({
  x,
  y,
  width,
  height,
  label,
  num,
  labelAt = "top",
  labelWidth = 240,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  num?: { path: string; value: number | null; fmt: Fmt; derived?: string };
  labelAt?: "top" | "bottom";
  /** width of the live-Num label's box (the text is one line; the box only needs to hold it) */
  labelWidth?: number;
}) {
  const ly = labelAt === "top" ? y + 11 : y + height - 4;
  // the Num label's box is 20px tall: the .num span raises the line box, and 16px clipped its descenders
  return (
    <g>
      <rect x={x} y={y} width={Math.max(0, width)} height={Math.max(0, height)} fill="var(--band)" />
      {label && !num && (
        <text x={x + 4} y={ly} className="halo" style={{ fontSize: 11, fill: "var(--ink-3)" }}>
          {label}
        </text>
      )}
      {num && (
        <foreignObject x={x + 2} y={ly - 13} width={labelWidth} height={20}>
          <span className="band-label">
            {label ? `${label} ` : ""}
            <Num path={num.path} value={num.value} fmt={num.fmt} derived={num.derived} />
          </span>
        </foreignObject>
      )}
    </g>
  );
}

/** In-figure tag ('exception', 'distilled', 'base outlier'): 11px italic --ink-3, after the row's value label. */
export function TagText({ x, y, children, anchor = "start" }: { x: number; y: number; children: ReactNode; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} dy="0.32em" textAnchor={anchor} className="tag">
      {children}
    </text>
  );
}
