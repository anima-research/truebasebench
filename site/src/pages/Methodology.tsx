import { useMemo, type ReactNode } from "react";
import source from "../content/methodology.md?raw";
import { ReadingPage } from "../components/ReadingPage";
import { useBundle } from "../data/BundleContext";
import { RAMPS, SOURCES, SUB_META } from "../data/method";
import { SUB_KEYS } from "../data/types";
import { Num } from "../components/Num";
import { preAnnealBand, quantControl, recitationAnchors, recitedList, specimenPair } from "../data/derive";
import { isScored, scoredKeys } from "../data/scoring";
import { ProbePanels, probeStat } from "../charts/ProbeCharts";
import { Plate } from "../components/Plate";
import { PROBE_META } from "../data/method";
import { fp, path } from "../data/bundle";
import type { MethodologyValue } from "../content/slots";
import type { Fmt } from "../lib/numfmt";

const SECTION_OF: Record<string, string> = { calib: "#calibration-gap", spread: "#calibration-gap", memo: "#verbatim-runs", prior: "#prior" };

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
            <th scope="col" className="nw">
              scored
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
              <td className="small">{isScored(bundle, k) ? "yes" : <span className="probe-tag">probe</span>}</td>
              <td className="mono small">
                <a href={SECTION_OF[k]}>{SOURCES[k].join(" → ")}</a>
              </td>
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
  const probes = useMemo(() => ({ memo: probeStat(bundle, "memo"), kl: probeStat(bundle, "KL_few") }), [bundle]);
  const blocks = useMemo(
    () => ({
      anchors: () => <AnchorsTable />,
      probes: () => (
        <Plate
          label="Plate P · Validation probes against the overall score"
          caption="Each glyph is one checkpoint; x is its overall score (a mean of calib, spread and prior only), y a statistic that is not in the score. Spearman ρ in each panel is computed from the bundle. Hover or focus a glyph for its values; click to open the model."
          sources={["models[*].score", "models[*].subscores.memo.value", "models[*].surnames.KL_few"]}
          data={{
            columns: ["checkpoint", "stage", "overall", PROBE_META.memo.name, PROBE_META.KL_few.name],
            numeric: [false, false, true, true, true],
            rows: bundle.models.map((m) => [
              `${m.family} · ${m.label}`,
              m.stage,
              m.score === null ? "—" : m.score.toFixed(3),
              probes.memo.pairs.find((p) => p.m.id === m.id)?.y.toFixed(4) ?? "—",
              probes.kl.pairs.find((p) => p.m.id === m.id)?.y.toFixed(3) ?? "—",
            ]),
          }}
        >
          <ProbePanels bundle={bundle} stats={[probes.memo, probes.kl]} />
        </Plate>
      ),
    }),
    [bundle, probes],
  );
  const values = useMemo<Record<MethodologyValue, () => ReactNode>>(() => {
    const band = preAnnealBand(bundle);
    const scored = scoredKeys(bundle);
    const qc = quantControl(bundle);
    /** Plain-language reading of a Spearman ρ between the score and a probe (negative = the score predicts it). */
    const verdict = (r: number | null) => (r === null ? "cannot be assessed" : r <= -0.5 ? "the score orders it" : r <= -0.3 ? "the score orders it weakly" : r < 0.3 ? "the score does not order it" : "the score orders it the wrong way");
    const rho = (s: { rho: number | null; n: number }, what: string, p: string) =>
      s.rho === null ? <>—</> : <Num path={p} value={s.rho} fmt="num2" derived={`Spearman ρ between models[*].score and ${what} over ${s.n} checkpoints`} />;
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
      "n-scored": () => <>{scored.length === 3 ? "three" : scored.length === 4 ? "four" : scored.length}</>,
      "scored-list": () => <>{scored.map((k) => SUB_META[k].name.toLowerCase()).join(", ")}</>,
      "rho-memo": () => rho(probes.memo, "models[*].subscores.memo.value", "models[*].subscores.memo.value"),
      "n-memo": () => <>{probes.memo.n}</>,
      "rho-kl": () => rho(probes.kl, "models[*].surnames.KL_few", "models[*].surnames.KL_few"),
      "n-kl": () => <>{probes.kl.n}</>,
      "quant-control": () => <>{qc ? `${qc.control.family} ${qc.control.label}` : "—"}</>,
      "quant-release": () => <>{qc ? `${qc.release.family} ${qc.release.label}` : "—"}</>,
      "quant-control-gap": () => (qc ? <Num path={path(qc.control, "fingerprint.F_calib_gap")} fmt="gap" /> : <>—</>),
      "quant-release-gap": () => (qc ? <Num path={path(qc.release, "fingerprint.F_calib_gap")} fmt="gap" /> : <>—</>),
      "memo-verdict": () => <>{verdict(probes.memo.rho)}</>,
      "kl-verdict": () => <>{verdict(probes.kl.rho)}</>,
      "recite-anchor": () => <Num path="method.RAMPS.memo[1]" value={recitationAnchors(bundle)[1]} fmt="pct" def />,
      "recite-elevated-anchor": () => <Num path="method.RAMPS.memo[0]" value={recitationAnchors(bundle)[0]} fmt="pct" def />,
      "recite-n": () => <>{recitedList(bundle).length}</>,
      "recite-list": () => {
        const list = recitedList(bundle);
        if (!list.length) return <>none in this bundle</>;
        return (
          <>
            {list.map((x, i) => (
              <span key={x.model.id}>
                {i ? ", " : ""}
                {x.model.family} {x.model.label} (<Num path={path(x.model, "subscores.memo.value")} value={x.value} fmt="pct" derived="X_runfrac_wiki (fallback verbatim_run_frac_wiki)" />)
              </span>
            ))}
          </>
        );
      },
      "quant-delta": () =>
        qc && fp(qc.control, "F_calib_gap") !== null && fp(qc.release, "F_calib_gap") !== null ? (
          <Num path={path(qc.control, "fingerprint.F_calib_gap")} value={fp(qc.control, "F_calib_gap")! - fp(qc.release, "F_calib_gap")!} fmt="gap" derived={`F_calib_gap(control) − F_calib_gap(${qc.release.id})`} />
        ) : (
          <>—</>
        ),
    };
  }, [bundle, sp, probes]);
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
