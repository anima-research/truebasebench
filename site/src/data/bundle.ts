/**
 * Accessors (DESIGN §6.2). get(model, "fingerprint.F_calib_gap") -> number | null, null-safe at any depth.
 * path(model, key) -> provenance string "models[id].key". resolvePath(bundle, path) reads a provenance path.
 */
import type { Bundle, Model } from "./types";

export type Key = string | (string | number)[];

function segs(key: Key): (string | number)[] {
  if (Array.isArray(key)) return key;
  // dotted, with optional [n] or ["k"] segments: tail.tf_fresh["s>10"], selfboot.reliability.bins[3][2]
  const out: (string | number)[] = [];
  const re = /([^.[\]]+)|\[(\d+)\]|\["([^"]*)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(key))) out.push(m[1] ?? (m[2] !== undefined ? parseInt(m[2], 10) : m[3]));
  return out;
}

export function getAny(root: unknown, key: Key): unknown {
  let cur: unknown = root;
  for (const s of segs(key)) {
    if (cur === null || cur === undefined || typeof cur !== "object") return null;
    cur = (cur as Record<string | number, unknown>)[s];
  }
  return cur === undefined ? null : cur;
}

export function get(model: Model | null | undefined, key: Key): number | null {
  const v = getAny(model, key);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function fp(model: Model | null | undefined, k: string): number | null {
  return get(model, ["fingerprint", k]);
}

/** Provenance string for a field: models[olmo2-7b_instruct].fingerprint.F_calib_gap */
export function path(model: Model | string, key: Key): string {
  const id = typeof model === "string" ? model : model.id;
  const k = Array.isArray(key)
    ? key.map((s, i) => (typeof s === "number" ? `[${s}]` : /^[\w]+$/.test(s) ? (i ? "." : "") + s : `["${s}"]`)).join("")
    : key;
  return `models[${id}]${k.startsWith("[") ? "" : "."}${k}`;
}

/** Read a provenance path: "models[<id>].a.b", "reference.x", or any bundle key path. */
export function resolvePath(bundle: Bundle, p: string): unknown {
  const m = /^models\[([^\]]+)\]\.?(.*)$/.exec(p);
  if (m) {
    const model = bundle.models.find((x) => x.id === m[1]);
    if (!model) return null;
    return m[2] ? getAny(model, m[2]) : model;
  }
  return getAny(bundle, p);
}

export function byId(bundle: Bundle, id: string): Model | undefined {
  return bundle.models.find((m) => m.id === id);
}

export function families(bundle: Bundle): string[] {
  return Array.from(new Set(bundle.models.map((m) => m.family))).sort((a, b) => a.localeCompare(b));
}
