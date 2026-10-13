import { useMemo, type ReactNode } from "react";
import source from "../content/methodology.md?raw";
import { ReadingPage } from "../components/ReadingPage";
import { useBundle } from "../data/BundleContext";
import { RAMPS, SOURCES, SUB_META } from "../data/method";
import { SUB_KEYS } from "../data/types";
import { Num } from "../components/Num";
import { preAnnealBand, specimenPair } from "../data/derive";
import { fp, path } from "../data/bundle";
import type { MethodologyValue } from "../content/slots";
import type { Fmt } from "../lib/numfmt";

const WHY: Record<string, string> = {
  calib: "pre-anneal checkpoints sit near 0; post-training pushes the gap negative",
  spread: "pre-anneal checkpoints are near-zero in every post-cutoff domain",
  memo: "annealing on up-weighted sources raises the share of Wikipedia recited verbatim",
  prior: "instruction data in the mix shows up as chat markers in bare-BOS samples",
};

function AnchorsTable() {
  const bundle = useBundle();
  const ramps = (bundle.reference.ramps as Record<string, [number, number]> | null | undefined) ?? RAMPS;
  const f = (k: string): Fmt => (SUB_META[k as keyof typeof SUB_META].unit === "share" ? "pct" : k === "calib" ? "signed" : "num3");
  return (
    <div className="tbl-scroll">
      <table className="tbl">
        <caption>Ramp anchors ({bundle.reference.ramps ? "from reference.ramps" : "definitions in src/data/method.ts, mirroring docs/vh_truebase.py"}).</caption>
        <thead>
          <tr>
            <th scope="col" className="nw">
              sub-score
            </th>
            <th scope="col">feature (fallback)</th>
            <th scope="col" className="n nw">
              1 at
            </th>
            <th scope="col" className="n nw">
              0 at
            </th>
            <th scope="col">why this anchor</th>
          </tr>
        </thead>
        <tbody>
          {SUB_KEYS.map((k) => (
            <tr key={k}>
              <th scope="row" style={{ background: "none" }}>
                {SUB_META[k].name}
              </th>
              <td className="mono small">{SOURCES[k].join(" → ")}</td>
              <td className="n">
                <Num path={`method.RAMPS.${k}[0]`} value={ramps[k]?.[0] ?? null} fmt={f(k)} def unit={false} />
              </td>
              <td className="n">
                <Num path={`method.RAMPS.${k}[1]`} value={ramps[k]?.[1] ?? null} fmt={f(k)} def unit={false} />
              </td>
              <td className="small ink2">
                {WHY[k]}
                {k === "calib" ? "; positive gaps are clipped to 1" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Methodology() {
  const bundle = useBundle();
  const sp = specimenPair(bundle);
  const blocks = useMemo(() => ({ anchors: () => <AnchorsTable /> }), []);
  const values = useMemo<Record<MethodologyValue, () => ReactNode>>(() => {
    const band = preAnnealBand(bundle);
    const pre = bundle.models.filter((m) => m.stage === "pre-anneal" && fp(m, "F_gap_domain_min") !== null);
    const domMin = pre.reduce<(typeof pre)[number] | null>((a, m) => (!a || fp(m, "F_gap_domain_min")! < fp(a, "F_gap_domain_min")! ? m : a), null);
    const name = (m: { family: string; label: string }) => `${m.family} ${m.label}`;
    return {
      "pre-band": () =>
        band ? <Num path={path(band.model, "fingerprint.F_calib_gap")} value={band.band} fmt="nats" derived="max |F_calib_gap| over pre-anneal checkpoints" /> : <>—</>,
      "pre-domain-min": () => (domMin ? <Num path={path(domMin, "fingerprint.F_gap_domain_min")} fmt="gap" /> : <>—</>),
      "spec-a": () => <>{sp ? name(sp.A) : "—"}</>,
      "spec-b": () => <>{sp ? name(sp.B) : "—"}</>,
      "spec-a-gap": () => (sp ? <Num path={path(sp.A, "fingerprint.F_calib_gap")} fmt="gap" /> : <>—</>),
      "spec-b-gap": () => (sp ? <Num path={path(sp.B, "fingerprint.F_calib_gap")} fmt="gap" /> : <>—</>),
    };
  }, [bundle, sp]);
  return (
    <ReadingPage
      source={source}
      blocks={blocks}
      values={values}
      docTitle="Methodology · True Base Bench"
      before={
        sp ? (
          <p className="small ink2" style={{ marginBottom: 16 }}>
            Specimens: A = {sp.A.label} vs B = {sp.B.label} of {sp.A.family} (computed: the family with the most rungs that has both a pre-anneal and a
            post-trained rung).
          </p>
        ) : null
      }
    />
  );
}
