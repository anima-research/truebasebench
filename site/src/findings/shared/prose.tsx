/** Prose helpers shared by the finding sections: model-field Nums, definition Nums, and read-off → numbers list. */
import { Num } from "../../components/Num";
import { path } from "../../data/bundle";
import type { Model } from "../../data/types";
import { FINDING_DEFS } from "../../findings";
import type { Fmt } from "../../lib/numfmt";
import type { FindingNumber } from "./types";

export { joinNodes as joinList } from "../../components/Finding";

/** A model field as a <Num>. */
export function N({ m, k, f }: { m: Model; k: string; f: Fmt }) {
  return <Num path={path(m, k)} fmt={f} />;
}

/** A finding definition (FINDING_DEFS) as a <Num def>. */
export function Def({ name, f }: { name: keyof typeof FINDING_DEFS; f: Fmt }) {
  return <Num path={`findings.${name}`} value={FINDING_DEFS[name]} fmt={f} def />;
}

/** A count derived from the bundle (checkpoints or pairs matching a predicate) as a <Num derived>, so counts carry provenance like values. */
export function Count({ n, of }: { n: number; of: string }) {
  return <Num path={`count(${of})`} value={n} fmt="count" derived={of} />;
}

export interface ReadOff {
  model: Model;
  key: string;
  fmt: Fmt;
  what: string;
}

export const modelHref = (m: Model) => `/model/${encodeURIComponent(m.id)}`;

/**
 * 'Family label' for headlines and standfirsts, with the label's parentheticals dropped ('TrueBase (10T, pre-anneal)' →
 * 'TrueBase'): a headline names the stage in its own words, so the bundle's parenthetical would repeat it. Pass
 * `keepParens` when the parenthetical carries the point (e.g. 'base (distilled)').
 */
export function proseLabel(m: Model, keepParens = false): string {
  const label = keepParens ? m.label : m.label.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return `${m.family} ${label}`;
}

/** Read-off items → numbers-list rows ('family · label, what' linking to the model page), de-duplicated. */
export function numbersOf(items: ReadOff[]): FindingNumber[] {
  const seen = new Set<string>();
  const out: FindingNumber[] = [];
  for (const i of items) {
    const k = i.model.id + i.key;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label: `${i.model.family} · ${i.model.label}, ${i.what}`, path: path(i.model, i.key), fmt: i.fmt, href: modelHref(i.model) });
  }
  return out;
}
