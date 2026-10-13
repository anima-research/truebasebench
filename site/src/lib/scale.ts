/** Minimal linear/log scales and tick generation for the hand-written SVG charts. */

export interface Scale {
  (x: number): number;
  domain: [number, number];
  range: [number, number];
  ticks(n?: number): number[];
  invert(y: number): number;
}

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const s = ((x: number) => r0 + (x - d0) * k) as Scale;
  s.domain = domain;
  s.range = range;
  s.ticks = (n = 5) => niceTicks(Math.min(d0, d1), Math.max(d0, d1), n);
  s.invert = (y: number) => (k === 0 ? d0 : d0 + (y - r0) / k);
  return s;
}

export function log10Scale(domain: [number, number], range: [number, number]): Scale {
  const l = linear([Math.log10(domain[0]), Math.log10(domain[1])], range);
  const s = ((x: number) => l(Math.log10(Math.max(x, 1e-300)))) as Scale;
  s.domain = domain;
  s.range = range;
  s.ticks = () => {
    const out: number[] = [];
    for (let e = Math.ceil(Math.log10(domain[0]) - 1e-9); e <= Math.floor(Math.log10(domain[1]) + 1e-9); e++) out.push(10 ** e);
    return out;
  };
  s.invert = (y: number) => 10 ** l.invert(y);
  return s;
}

export function niceStep(span: number, n: number): number {
  const raw = span / Math.max(1, n);
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  const m = f >= 7.5 ? 10 : f >= 3.5 ? 5 : f >= 1.5 ? 2 : 1;
  return m * p;
}

export function niceTicks(lo: number, hi: number, n = 5): number[] {
  if (!(hi > lo)) return [lo];
  const step = niceStep(hi - lo, n);
  const out: number[] = [];
  const start = Math.ceil(lo / step - 1e-9) * step;
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(12));
  return out;
}

export function extent(xs: (number | null | undefined)[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of xs) {
    if (typeof x !== "number" || !Number.isFinite(x)) continue;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return lo <= hi ? [lo, hi] : null;
}

/** 1-D beeswarm: returns a vertical offset slot (0, +1, −1, +2, −2 ...) per item, capped at maxSlots. */
export function beeswarm(xs: number[], minGap: number, maxSlots = 3): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const slots = new Array<number>(xs.length).fill(0);
  const placed: { x: number; slot: number }[] = [];
  const cand = [0, 1, -1, 2, -2, 3, -3].slice(0, Math.max(1, maxSlots * 2 - 1));
  for (const [x, i] of order) {
    let chosen = cand[cand.length - 1];
    for (const c of cand) {
      if (!placed.some((p) => p.slot === c && Math.abs(p.x - x) < minGap)) {
        chosen = c;
        break;
      }
    }
    slots[i] = chosen;
    placed.push({ x, slot: chosen });
  }
  return slots;
}

/** Approximate width of 11px IBM Plex Sans Condensed text (no DOM measurement; used only for layout decisions). */
export function textWidth(s: string, px = 11): number {
  return s.length * px * 0.5;
}

/** Greedy word wrap of a chart text line to a pixel budget, using textWidth. */
export function wrapText(s: string, maxPx: number, px = 11): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(next, px) > maxPx) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** x / text-anchor for a label centred at cx with half-width hw, kept inside [minX, maxX]. */
export function clampLabel(cx: number, hw: number, minX: number, maxX: number): { x: number; textAnchor: "start" | "middle" | "end" } {
  if (cx - hw < minX) return { x: minX, textAnchor: "start" };
  if (cx + hw > maxX) return { x: maxX, textAnchor: "end" };
  return { x: cx, textAnchor: "middle" };
}
