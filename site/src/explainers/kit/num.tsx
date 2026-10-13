/** Small shared helpers for explainer prose and data tables. */
import { Num } from "../../components/Num";
import { get, path, type Key } from "../../data/bundle";
import type { Bundle, Model } from "../../data/types";
import { fmt, type Fmt } from "../../lib/numfmt";
import type { PlateNumber } from "./Shell";

/** fingerprint key as an accessor key (bracketed in provenance when it contains . | / < >) */
export const fk = (k: string): Key => ["fingerprint", k];

/** <Num> for one model field. */
export function N({ m, k, f }: { m: Model; k: Key; f: Fmt }) {
  return <Num path={path(m, k)} fmt={f} />;
}

/** Plain-text formatted value (for aria-live summaries, aria-labels and data tables). */
export function tx(m: Model, k: Key, f: Fmt): string {
  return fmt(get(m, k), f);
}

export function pn(label: string, m: Model, k: Key, f: Fmt): PlateNumber {
  return { label, path: path(m, k), fmt: f };
}

/** Pick ids that exist and are eligible; fall back to the first eligible models. */
export function resolveIds(bundle: Bundle, ids: (string | null | undefined)[], eligible: (m: Model) => boolean): Model[] {
  const ok = bundle.models.filter(eligible);
  const used = new Set<string>();
  return ids.map((id) => {
    let m = ok.find((x) => x.id === id && !used.has(x.id));
    if (!m) m = ok.find((x) => !used.has(x.id));
    if (m) used.add(m.id);
    return m ?? ok[0];
  });
}

/** Short display label: "Family · label". */
export const full = (m: Model) => `${m.family} · ${m.label}`;
