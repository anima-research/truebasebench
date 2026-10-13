/** Small animation helpers for the explainers (DESIGN §2.4 easing tokens, §8 shared mechanics). */

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Sub-progress of t inside [a, b], clamped to 0..1. */
export const seg = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));

/** cubic-bezier(x1, y1, x2, y2) as an easing function (Newton + bisection on x). */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 6; i++) {
      const e = sx(u) - t;
      const d = dx(u);
      if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    if (u < 0 || u > 1 || Math.abs(sx(u) - t) > 1e-4) {
      let lo = 0;
      let hi = 1;
      u = t;
      for (let i = 0; i < 30; i++) {
        if (sx(u) < t) lo = u;
        else hi = u;
        u = (lo + hi) / 2;
      }
    }
    return sy(u);
  };
}

/** --ease-inout: state tweens. */
export const easeInOut = bezier(0.65, 0, 0.35, 1);
/** --ease-settle: marks settling. */
export const easeSettle = bezier(0.2, 0, 0, 1);

/**
 * Staggered sub-progress for item i of n inside a step: each item starts `gap` later (as a fraction of the step),
 * the whole stagger capped at `cap` of the step, each item taking `each` of it.
 */
export function stagger(t: number, i: number, n: number, each = 0.4, cap = 0.6): number {
  const gap = n > 1 ? Math.min(cap / (n - 1), 0.08) : 0;
  return clamp01((t - i * gap) / each);
}

/** Deterministic PRNG (mulberry32) seeded by a string, e.g. a model id. */
export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw an index from unnormalised weights with a uniform u in [0, 1). */
export function drawIndex(weights: number[], u: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = u * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x < 0) return i;
  }
  return weights.length - 1;
}
