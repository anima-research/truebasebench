/**
 * Constructed next-token distributions for explainers (a) and (c) (DESIGN §8 a, "Construction").
 * The SHAPE is constructed: p_k ∝ r^k over n candidates. Only H is taken from the bundle (r is found by
 * bisection so the entropy equals it). V of the construction is drawn but never printed as a measurement.
 */

export interface Construction {
  /** probabilities, rank order, sum 1 */
  p: number[];
  r: number;
  /** entropy of the construction (equals the target unless clipped) */
  H: number;
  /** varentropy Var[-log p] of the construction */
  V: number;
  /** true when the target entropy exceeded ln(n) and the uniform distribution was used */
  clipped: boolean;
}

function geo(r: number, n: number): number[] {
  const w = Array.from({ length: n }, (_, k) => r ** k);
  const z = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / z);
}

export function entropy(p: number[]): number {
  let h = 0;
  for (const x of p) if (x > 0) h -= x * Math.log(x);
  return h;
}

export function varentropy(p: number[], H = entropy(p)): number {
  let v = 0;
  for (const x of p) if (x > 0) v += x * (-Math.log(x) - H) ** 2;
  return v;
}

/** Geometric distribution over n candidates whose entropy equals H (nats). */
export function geometricWithEntropy(H: number, n = 64): Construction {
  const maxH = Math.log(n);
  if (!(H > 0)) {
    const p = [1, ...Array(n - 1).fill(0)];
    return { p, r: 0, H: 0, V: 0, clipped: false };
  }
  if (H >= maxH) {
    const p = Array(n).fill(1 / n);
    return { p, r: 1, H: maxH, V: 0, clipped: true };
  }
  let lo = 1e-9;
  let hi = 1 - 1e-12;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (entropy(geo(mid, n)) < H) lo = mid;
    else hi = mid;
  }
  const r = (lo + hi) / 2;
  const p = geo(r, n);
  const h = entropy(p);
  return { p, r, H: h, V: varentropy(p, h), clipped: false };
}
