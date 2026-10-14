/**
 * /findings: a thin page (cross-cutting owner). Header, rail, chip row and status strip here; each section is its own
 * component under src/findings/sections (F1 … F7, Ladders) rendered through the shell in components/Finding.tsx.
 */
import { useEffect, useMemo, useRef, type ComponentType } from "react";
import source from "../content/findings.md?raw";
import { Markdown, sectionsOf, splitTitle } from "../components/Markdown";
import { Num } from "../components/Num";
import { FINDING_IDS } from "../content/slots";
import { useBundle } from "../data/BundleContext";
import { familiesOf, specimenPair } from "../data/derive";
import { allFindings, type Check } from "../findings";
import type { SectionProps } from "../findings/shared/types";
import F1 from "../findings/sections/F1";
import F2 from "../findings/sections/F2";
import F3 from "../findings/sections/F3";
import F4 from "../findings/sections/F4";
import F5 from "../findings/sections/F5";
import F6 from "../findings/sections/F6";
import F7 from "../findings/sections/F7";
import Ladders from "../findings/sections/Ladders";
import { useScrollSpy } from "../lib/useScrollSpy";

const SECTIONS: Record<string, ComponentType<SectionProps>> = { f1: F1, f2: F2, f3: F3, f4: F4, f5: F5, f6: F6, f7: F7, ladders: Ladders };
/** one word per finding for the phone chip row ('F1 Calibration') */
const SHORT: Record<string, string> = { f1: "Calibration", f2: "Anneals", f3: "Distillation", f4: "Collapse", f5: "Surnames", f6: "Tail", f7: "Reliability" };

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

const fIndex = (id: string): number | null => {
  const m = /^f(\d)$/.exec(id);
  return m ? Number(m[1]) : null;
};

function statusOf(checks: Record<string, Check>): "holds" | "Data note" | "pending" {
  const cs = Object.values(checks);
  if (cs.some((c) => !c.ok)) return "Data note";
  if (cs.some((c) => c.pending)) return "pending";
  return "holds";
}

export default function Findings() {
  const bundle = useBundle();
  const F = useMemo(() => allFindings(bundle), [bundle]);
  const { title, intro, sections } = useMemo(() => {
    const t = splitTitle(source);
    return { title: t.title, ...sectionsOf(t.body) };
  }, []);
  const activeId = useScrollSpy(sections.map((s) => s.id));
  const sp = specimenPair(bundle);
  // keep the active chip visible in the scroll-snapped row (scrollLeft only: never scroll the page)
  const chipRow = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const ul = chipRow.current;
    const li = ul?.querySelector<HTMLElement>('a[aria-current="true"]')?.parentElement;
    if (!ul || !li) return;
    const lo = li.offsetLeft - 8;
    const hi = li.offsetLeft + li.offsetWidth + 8 - ul.clientWidth;
    if (ul.scrollLeft > lo) ul.scrollLeft = lo;
    else if (ul.scrollLeft < hi) ul.scrollLeft = hi;
  }, [activeId]);
  const titleOf = (id: string) => sections.find((s) => s.id === id)?.title ?? id;
  const railLabel = (s: { id: string; title: string }) => {
    const n = fIndex(s.id);
    return n ? `F${n} · ${s.title}` : s.title;
  };
  const chipLabel = (s: { id: string; title: string }) => {
    const n = fIndex(s.id);
    return n ? `F${n} ${SHORT[s.id] ?? s.title}` : s.id === "ladders" ? "Ladders" : s.title;
  };

  return (
    <div className="container">
      <div className="reading">
        <nav className="rail" aria-label="Findings">
          <div className="rail-inner">
            <ol>
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} aria-current={activeId === s.id ? "true" : undefined}>
                    {railLabel(s)}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
        <div className="wide">
          <header className="page-head">
            <h1>{title ?? "Findings"}</h1>
            <ul className="chiprow" aria-label="Findings" ref={chipRow}>
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} aria-current={activeId === s.id ? "true" : undefined}>
                    {chipLabel(s)}
                  </a>
                </li>
              ))}
            </ul>
            {sp && (
              <p className="small ink2" style={{ margin: "8px 0 16px" }}>
                Specimens: A = {sp.A.label} vs B = {sp.B.label} of {sp.A.family} (computed: the family with the most rungs that has both a pre-anneal and a post-trained
                rung).
              </p>
            )}
            {/* the same register as Methodology's intro: serif prose, no lede */}
            <div className="prose">
              <p>
                {WORDS[FINDING_IDS.length] ?? FINDING_IDS.length} results from <Num path="n_models" fmt="count" /> checkpoints in{" "}
                <Num path="count(distinct models[*].family)" value={familiesOf(bundle).length} fmt="count" derived="distinct families in the bundle" /> families. Each is
                a claim computed from the bundle and tested by a check; when a check fails, a Data note under the claim says what no longer holds. Every number is read
                live from the bundle and links to the field it came from.
              </p>
            </div>
            <Markdown source={intro} />
            <dl className="statlist fd-status" aria-label="Status of each finding">
              {FINDING_IDS.map((f) => {
                const state = statusOf(F[f].checks);
                return (
                  <div key={f} style={{ display: "contents" }}>
                    <dt>
                      <a href={`#${f}`}>
                        F{fIndex(f)} · {titleOf(f)}
                      </a>
                    </dt>
                    <dd className={state === "holds" ? undefined : "flag"}>{state}</dd>
                  </div>
                );
              })}
            </dl>
          </header>
          {sections.map((s) => {
            const Section = SECTIONS[s.id];
            return Section ? (
              <Section key={s.id} bundle={bundle} F={F} section={s} />
            ) : (
              <section key={s.id} id={s.id} className="finding" aria-labelledby={`${s.id}-h`}>
                <h2 id={`${s.id}-h`}>{s.title}</h2>
                <Markdown source={s.body} />
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
