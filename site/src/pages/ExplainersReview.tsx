/**
 * /explainers: review page that mounts all six methodology explainers in order (not linked from the navigation).
 * A local "Final frames" switch renders them as under reduced motion, without changing the site setting.
 */
import { Suspense, useEffect, useState } from "react";
import { useBundle } from "../data/BundleContext";
import { useReducedMotion } from "../lib/motion";
import { registry } from "../explainers";
import { EXPLAINER_IDS, EXPLAINER_TITLES } from "../explainers/types";
import { Boundary } from "../explainers/ExplainerSlot";

export default function ExplainersReview() {
  const bundle = useBundle();
  const siteReduced = useReducedMotion();
  const [finalFrames, setFinalFrames] = useState(false);
  const reduced = siteReduced || finalFrames;
  useEffect(() => {
    document.title = "Explainers (review) · True Base Bench";
  }, []);
  return (
    <div className="container">
      <div className="reading">
        <nav className="rail" aria-label="Explainers">
          <div className="rail-inner">
            <ol>
              {EXPLAINER_IDS.map((id) => (
                <li key={id}>
                  <a href={`#${id}`}>{EXPLAINER_TITLES[id]}</a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
        <div className="wide">
          <header className="page-head">
            <p className="kicker">Review · not linked from the navigation</p>
            <h1>Methodology explainers</h1>
            <p className="small ink2" style={{ maxWidth: "64ch" }}>
              All six explainers from the Methodology page, mounted with the same props contract ({"{ bundle, reducedMotion }"}). Every number is read
              from the loaded bundle.
            </p>
            <label className="small" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginTop: 8 }}>
              <input type="checkbox" checked={finalFrames} onChange={(e) => setFinalFrames(e.target.checked)} disabled={siteReduced} />
              Final frames (render as under reduced motion){siteReduced ? " · reduced motion is on for the site" : ""}
            </label>
          </header>
          {EXPLAINER_IDS.map((id, i) => {
            const C = registry[id];
            return (
              <section key={id} id={id} style={{ scrollMarginTop: 64 }}>
                <h2 style={{ marginTop: 32 }}>
                  <span className="kicker" style={{ display: "block" }}>
                    §{i + 1} · {id}
                  </span>
                  {EXPLAINER_TITLES[id]}
                </h2>
                {C ? (
                  <Boundary id={id}>
                    <Suspense fallback={<p className="pending">Loading explainer…</p>}>
                      <C key={String(reduced)} bundle={bundle} reducedMotion={reduced} />
                    </Suspense>
                  </Boundary>
                ) : (
                  <p className="pending">Not yet mounted.</p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
