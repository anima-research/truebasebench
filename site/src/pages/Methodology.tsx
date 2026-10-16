import { useMemo, type ReactNode } from "react";
import source from "../content/methodology.md?raw";
import { ReadingPage } from "../components/ReadingPage";
import { useBundle } from "../data/BundleContext";
import { RAMPS, SOURCES, SUB_META } from "../data/method";
import { SUB_KEYS, type Model } from "../data/types";
import { Num } from "../components/Num";
import { preAnnealBand, quantControl, quantControls, recitationAnchors, recitedList, specimenPair } from "../data/derive";
import { isScored, scoredKeys } from "../data/scoring";
import { ProbePanels, probeStat } from "../charts/ProbeCharts";
import { fmtC, TempCurves } from "../charts/TempCharts";
import { StageDotStrip } from "../charts/ModelCharts";
import { get } from "../data/bundle";
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

function QuantPairsTable() {
  const bundle = useBundle();
  const pairs = quantControls(bundle);
  if (!pairs.length) return <p className="pending">No quantisation-control pair in this bundle.</p>;
  const g = (m: Model) => fp(m, "F_calib_gap");
  const r3 = (m: Model) => (m.tailmass?.ratio3 ?? null) as number | null;
  return (
    <div className="tbl-scroll">
      <table className="tbl">
        <caption>Quantisation controls: the same checkpoint at its released precision and with experts re-quantised to MXFP4.</caption>
        <thead>
          <tr>
            <th scope="col">family</th>
            <th scope="col" className="n nw">gap, release</th>
            <th scope="col" className="n nw">gap, MXFP4</th>
            <th scope="col" className="n nw">offset</th>
            <th scope="col" className="n nw">tail ratio 10⁻³, release → MXFP4</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map(({ control, release }) => (
            <tr key={control.id}>
              <th scope="row" style={{ background: "none" }}>{release.family}</th>
              <td className="n"><Num path={path(release, "fingerprint.F_calib_gap")} fmt="gap" /></td>
              <td className="n"><Num path={path(control, "fingerprint.F_calib_gap")} fmt="gap" /></td>
              <td className="n">
                {g(control) !== null && g(release) !== null ? (
                  <Num path={`${path(control, "fingerprint.F_calib_gap")} − ${path(release, "fingerprint.F_calib_gap")}`} value={(g(control) as number) - (g(release) as number)} fmt="signed" derived={`${control.label} minus ${release.label}`} />
                ) : "—"}
              </td>
              <td className="n nw">
                {r3(release) !== null && r3(control) !== null ? (
                  <>
                    <Num path={path(release, "tailmass.ratio3")} fmt="num2" /> → <Num path={path(control, "tailmass.ratio3")} fmt="num2" />
                  </>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
      "quant-pairs": () => <QuantPairsTable />,
      temp: () => {
        const A = sp?.A;
        const B = sp?.B;
        const pair = [A, B].filter((m): m is NonNullable<typeof m> => !!m && !!m.temp);
        const withTemp = bundle.models.filter((m) => m.temp && typeof m.temp.C === "number");
        return (
          <Plate
            label="Plate T · Temperature-scaling cost"
            caption="Left: CE(T) − CE_min for the specimen pair over the five measured temperatures (log-T axis); points measured, curve a quadratic in log T through them, the tick on the axis the minimiser T*, the dotted line the tangent at T = 1, whose slope is the calibration gap on this pass (exact: dCE/dlogT = mean(H − s)); the measured central difference printed under the panel is the O(h²) check, a few thousandths steeper because the curve is asymmetric. Right: C for every checkpoint on a log axis, by stage, with 95% document-bootstrap whiskers; hollow glyphs with ≥ sat at the edge of the temperature grid, so their C is a lower bound."
            sources={["models[*].temp.CE_T", "models[*].temp.C", "models[*].temp.T_star", "models[*].temp.T_star_at_bound", "models[*].temp.C_ci95", "models[*].temp.gap_pass", "models[*].temp.slope_central"]}
            data={{
              columns: ["checkpoint", "stage", "C (nats/token)", "95% CI", "T*", "at bound", "CE(0.8)", "CE(0.9)", "CE(1)", "CE(1.1)", "CE(1.25)", "gap on pass = dCE/dlogT at 1", "measured central difference", "F_calib_gap (tf_fresh)"],
              numeric: [false, false, true, false, true, false, true, true, true, true, true, true, true, true],
              rows: withTemp.map((m) => [
                `${m.family} · ${m.label}`,
                m.stage,
                fmtC(m.temp),
                m.temp!.C_ci95 ? `[${(m.temp!.C_ci95[0] ?? NaN).toFixed(4)}, ${(m.temp!.C_ci95[1] ?? NaN).toFixed(4)}]` : "—",
                (m.temp!.T_star ?? NaN).toFixed(3),
                m.temp!.T_star_at_bound ? "yes" : "no",
                ...["0.8", "0.9", "1.0", "1.1", "1.25"].map((k) => (m.temp!.CE_T?.[k] ?? NaN).toFixed(4)),
                (m.temp!.gap_pass ?? NaN).toFixed(4),
                (m.temp!.slope_central ?? NaN).toFixed(4),
                (fp(m, "F_calib_gap") ?? NaN).toFixed(4),
              ]),
            }}
          >
            <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
              <div style={{ minWidth: 0 }}>
                {pair.length ? <TempCurves models={pair} labels={pair.map((m, i) => `${i === 0 && m.id === A?.id ? "A" : "B"} · ${m.label}`)} /> : <p className="small ink3">Specimen pair not measured.</p>}
                {pair.map((m) => (
                  <p key={m.id} className="small ink2" style={{ margin: "4px 0 0" }}>
                    {m.label}: slope at T = 1 = gap on this pass <Num path={path(m, "temp.gap_pass")} fmt="signed" /> (measured central difference{" "}
                    <Num path={path(m, "temp.slope_central")} fmt="signed" />); T* <Num path={path(m, "temp.T_star")} fmt="num2" />; C{" "}
                    <Num path={path(m, "temp.C")} fmt="raw" />
                  </p>
                ))}
              </div>
              <div style={{ minWidth: 0 }}>
                <StageDotStrip
                  bundle={bundle}
                  value={(m) => get(m, "temp.C")}
                  valuePath={(m) => path(m, "temp.C")}
                  fmtKind="raw"
                  axisTitle="temperature-scaling cost C, nats/token (log axis)"
                  logScale
                  boundOf={(m) => !!m.temp?.T_star_at_bound}
                  ci={(m) => (m.temp?.C_ci95 && typeof m.temp.C_ci95[0] === "number" && typeof m.temp.C_ci95[1] === "number" && m.temp.C_ci95[0] > 0 ? [m.temp.C_ci95[0], m.temp.C_ci95[1]] : null)}
                  metricName="C"
                  labelIds={pair.map((m) => m.id)}
                />
              </div>
            </div>
          </Plate>
        );
      },
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
    const temps = {
      base: bundle.models.filter((m) => m.stage !== "post-trained" && typeof m.temp?.C === "number"),
      post: bundle.models.filter((m) => m.stage === "post-trained" && typeof m.temp?.C === "number"),
    };
    /** "lo–hi" of a temp field over a group, each end a Num pointing at the model that sets it. */
    const rangeNum = (ms: typeof temps.base, key: string, f: Fmt) => {
      const v = (m: (typeof ms)[number]) => get(m, key);
      const ok = ms.filter((m) => v(m) !== null);
      if (!ok.length) return <>—</>;
      const lo = ok.reduce((a, m) => (v(m)! < v(a)! ? m : a));
      const hi = ok.reduce((a, m) => (v(m)! > v(a)! ? m : a));
      return (
        <>
          <Num path={path(lo, key)} fmt={f} />–<Num path={path(hi, key)} fmt={f} />
        </>
      );
    };
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
      "temp-a": () => <>{sp ? name(sp.A) : "—"}</>,
      "temp-b": () => <>{sp ? name(sp.B) : "—"}</>,
      "temp-a-C": () => (sp?.A.temp ? <Num path={path(sp.A, "temp.C")} fmt="raw" /> : <>—</>),
      "temp-b-C": () => (sp?.B.temp ? <Num path={path(sp.B, "temp.C")} fmt="raw" /> : <>—</>),
      "temp-a-range": () => {
        const r = sp?.A.temp?.T_star_domain_range;
        return r && typeof r[0] === "number" && typeof r[1] === "number" ? (
          <>
            <Num path={path(sp!.A, "temp.T_star_domain_range[0]")} fmt="num2" />–<Num path={path(sp!.A, "temp.T_star_domain_range[1]")} fmt="num2" />
          </>
        ) : (
          <>—</>
        );
      },
      "temp-base-range": () => rangeNum(temps.base, "temp.C", "raw"),
      "temp-base-tstar": () => rangeNum(temps.base, "temp.T_star", "num2"),
      "temp-n-base": () => <>{temps.base.length}</>,
      "temp-post-range": () => rangeNum(temps.post, "temp.C", "raw"),
      "temp-n-post": () => <>{temps.post.length}</>,
      "temp-n-bound": () => <>{temps.post.filter((m) => m.temp?.T_star_at_bound).length}</>,
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
