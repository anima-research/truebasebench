import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useBundle, useLoaded } from "../data/BundleContext";
import { byId, fp, get, path } from "../data/bundle";
import { CI_KEY, defaultCompare, fmtParams, nAvailable, params, preAnnealBand, ranked } from "../data/derive";
import { ciBounds } from "../data/ci";
import { fmtMass, oodRows, PriorMassBars, TAIL_KS, tailLabel, TailMassRows, TailReliabilityDiagram, withCI } from "../charts/TailPriorCharts";
import { describe, GROUPS } from "../data/glossary";
import { SUB_META } from "../data/method";
import { meanOfStored } from "../data/scoring";
import { SUB_KEYS, type Model, type TailKey } from "../data/types";
import { NotFound } from "../App";
import { Glyph, StageLegend } from "../components/Glyph";
import { Num } from "../components/Num";
import { DataNote, NullPlate, Plate, SourceLine } from "../components/Plate";
import { ScoreBar, DivergingBar } from "../components/Bars";
import { CopyButton, downloadJson } from "../components/CopyButton";
import { TransferPlot } from "../charts/TransferPlot";
import { DotRows, domainRows, Gauge, HBars, Kv, ReliabilityDiagram, SiblingRail, StageDotStrip } from "../charts/ModelCharts";
import { TopNamesChart, topNamesOf } from "../charts/TopNames";
import { cmpNullsLast, fmt, fmtNum, isNum, MINUS, type Fmt } from "../lib/numfmt";
import { useWidth } from "../components/Chart";
import { useScrollSpy } from "../lib/useScrollSpy";
import methodologySource from "../content/methodology.md?raw";
import { headingsOf } from "../components/Markdown";
import { extent } from "../lib/scale";
import { Chevron } from "../components/Plate";

const SECTIONS = [
  { id: "ramps", n: 1, title: "Sub-score ramps", explainer: "score" },
  { id: "calibration", n: 2, title: "Calibration on unseen text", explainer: "calibration-gap" },
  { id: "tail", n: 3, title: "Tail", explainer: "tail" },
  { id: "tail-mass", n: 4, title: "Tail reliability", explainer: "tail-mass" },
  { id: "prior-mass", n: 5, title: "Prior mass on chat openers", explainer: "prior-exact" },
  { id: "ood", n: 6, title: "Out-of-distribution genres", explainer: "ood" },
  { id: "surnames", n: 7, title: "Surnames", explainer: "surnames" },
  { id: "genres", n: 8, title: "Rare genres", explainer: "verbatim-runs" },
  { id: "samples", n: 9, title: "Own samples", explainer: "lexical" },
  { id: "fingerprint", n: 10, title: "Full fingerprint", explainer: "pipeline" },
];
const SEC = Object.fromEntries(SECTIONS.map((x) => [x.id, x])) as Record<string, (typeof SECTIONS)[number]>;
const SECTION_IDS = SECTIONS.map((s) => s.id);
/** Methodology h2 text by anchor id, read from the page's own markdown, so the link names what the reader will find. */
const METHOD_HEADINGS: Record<string, string> = Object.fromEntries(headingsOf(methodologySource, 2).map((h) => [h.id, h.text]));

function Section({ id, n, title, explainer, children }: { id: string; n: number; title: string; explainer: string; children: React.ReactNode }) {
  return (
    <section id={id} className="section" aria-labelledby={`h-${id}`}>
      <div className="with-margin">
        <div className="wm-main">
          <p className="kicker">§{n}</p>
          <h2 id={`h-${id}`}>{title}</h2>
        </div>
        <aside className="wm-margin">
          <Link className="margin-link" to={`/methodology#${explainer}`}>
            Explained in Methodology: {METHOD_HEADINGS[explainer] ?? explainer} →
          </Link>
        </aside>
      </div>
      {children}
    </section>
  );
}

function Rail({ active }: { active: string }) {
  return (
    <nav className="rail" aria-label="Sections">
      <div className="rail-inner">
        <ol>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} aria-current={active === s.id ? "true" : undefined}>
                §{s.n} {s.title}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

/** "any model…" type-ahead combobox over label, family and id. */
export function ModelCombo({ models, onPick, label = "Add a model to compare" }: { models: Model[]; onPick: (m: Model) => void; label?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const ql = q.trim().toLowerCase();
  const hits = models.filter((m) => !ql || `${m.label} ${m.family} ${m.id}`.toLowerCase().includes(ql)).slice(0, 12);
  const listId = useRef("combo-" + Math.random().toString(36).slice(2)).current;
  const pick = (m: Model) => {
    onPick(m);
    setQ("");
    setOpen(false);
  };
  return (
    <span className="combo">
      <input
        type="search"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && hits[idx] ? `${listId}-${idx}` : undefined}
        placeholder="any model…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIdx((i) => Math.min(hits.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIdx((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && hits[idx]) {
            e.preventDefault();
            pick(hits[idx]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && hits.length > 0 && (
        <ul id={listId} role="listbox">
          {hits.map((m, i) => (
            <li
              key={m.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === idx}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
            >
              <Glyph stage={m.stage} /> {m.family} · {m.label}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

const TAIL_ROWS: { key: string; label: string; kind: Fmt; rate: boolean }[] = [
  { key: "s>7", label: "s > 7 nats", kind: "pct", rate: true },
  { key: "s>10", label: "s > 10 nats", kind: "pct", rate: true },
  { key: "rank>100", label: "rank > 100", kind: "pct", rate: true },
  { key: "rank>1000", label: "rank > 1000", kind: "pct", rate: true },
  { key: "CE", label: "CE", kind: "nats", rate: false },
  { key: "H", label: "H", kind: "nats", rate: false },
  { key: "s_p99", label: "s, 99th pct", kind: "nats", rate: false },
  { key: "gap_hiH", label: "gap where H > 4", kind: "gap", rate: false },
];
const TAIL_PASSES: { key: TailKey; label: string }[] = [
  { key: "tf", label: "tf (Pile)" },
  { key: "tf_fresh", label: "tf_fresh (post-cutoff)" },
  { key: "tf_weird", label: "tf_weird (rare genres)" },
];

export default function ModelPage() {
  const bundle = useBundle();
  const { file } = useLoaded();
  const { id = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const model = byId(bundle, decodeURIComponent(id));
  const active = useScrollSpy(SECTION_IDS);

  useEffect(() => {
    if (model) document.title = `${model.label} · ${model.family} · True Base Bench`;
  }, [model]);

  const compare: Model[] = useMemo(() => {
    if (!model) return [];
    const raw = sp.get("compare");
    if (raw === null) {
      const d = defaultCompare(bundle, model);
      return d ? [d] : [];
    }
    return raw
      .split(",")
      .map((x) => byId(bundle, x))
      .filter((m): m is Model => !!m && m.id !== model.id)
      .slice(0, 3);
  }, [bundle, model, sp]);

  if (!model)
    return (
      <>
        <NotFound />
        <p className="container">
          No checkpoint with id <code>{decodeURIComponent(id)}</code> in {file}. <Link to="/">Back to the leaderboard</Link>.
        </p>
      </>
    );

  const setCompare = (ms: Model[]) => {
    const n = new URLSearchParams(sp);
    n.set("compare", ms.map((m) => m.id).join(","));
    setSp(n, { replace: true });
  };
  const rk = ranked(bundle).find((r) => r.model.id === model.id)!;
  const nAvail = nAvailable(model);
  const arith = meanOfStored(model.subscores);
  const diff = arith.mean !== null && model.score !== null ? arith.mean - model.score : null;
  const band = preAnnealBand(bundle);
  const both = [model, ...compare];
  const rel = model.selfboot?.reliability ?? null;
  const s = model.surnames;
  const effMax = isNum(bundle.reference.census_entropy_top2000) ? Math.exp(bundle.reference.census_entropy_top2000) : null;
  const P = (k: string) => path(model, k);
  const lexKeys = ["ttr", "hapax", "distinct4"] as const;  // zipf_slope and gzip_ratio stay in the bundle only (no stage signal)
  const topNames = topNamesOf(model, bundle);

  return (
    <div className="container">
      <div className="reading">
        <Rail active={active} />
        <div className="wide">
          <header className="page-head">
            <nav className="crumb" aria-label="Breadcrumb">
              <Link to="/">Leaderboard</Link> / <Link to={`/?family=${encodeURIComponent(model.family)}`}>{model.family}</Link>
            </nav>
            <h1>{model.label}</h1>
            <div className="mp-sub">
              <span>{model.family}</span>
              <span>·</span>
              <span>{fmtParams(params(model))}</span>
              <span>·</span>
              <span className="stage-tag">
                <Glyph stage={model.stage} size={10} /> {model.stage}
              </span>
            </div>
            <div className="mp-id">
              <code>{model.id}</code>
              <CopyButton text={model.id} label="Copy id" />
            </div>
            <div className="mp-overall">
              <span className="big">
                <Num path={P("score")} fmt="score" />
              </span>
              <ScoreBar value={model.score} width={240} height={10} ticks title={`overall ${fmtNum(model.score, "score")}`} />
              <span className="ink2">
                rank {rk.tie ? "=" : ""}
                {rk.rank} of {bundle.models.length} · mean of {nAvail} sub-scores
              </span>
            </div>
            <p className="small ink3" style={{ marginTop: 6 }}>
              1 = indistinguishable from a pre-anneal checkpoint. The score is distance from a true base, not capability.
            </p>
            <ul className="chiprow" aria-label="Sections">
              {SECTIONS.map((x) => (
                <li key={x.id}>
                  <a href={`#${x.id}`} aria-current={active === x.id ? "true" : undefined}>
                    §{x.n} {x.title}
                  </a>
                </li>
              ))}
            </ul>
          </header>

          <Plate label={`Plate M1 · ${model.family} ladder`} caption="Rungs in ladder order; parallel releases stack. This checkpoint sits on the highlighted band." sources={["models[*].order", "models[*].score"]}>
            <SiblingRail bundle={bundle} model={model} />
          </Plate>

          <div className="compare-row" role="group" aria-label="Compare with">
            <span className="ink2">Compare with</span>
            {compare.map((c) => (
              <span key={c.id} className="compare-chip">
                <Glyph stage={c.stage} hollow /> {c.family === model.family ? c.label : `${c.family} · ${c.label}`}
                <button type="button" aria-label={`Remove ${c.label} from comparison`} onClick={() => setCompare(compare.filter((x) => x.id !== c.id))}>
                  ×
                </button>
              </span>
            ))}
            {compare.length < 3 && (
              <ModelCombo models={bundle.models.filter((m) => m.id !== model.id && !compare.some((c) => c.id === m.id))} onPick={(m) => setCompare([...compare, m])} />
            )}
            {sp.get("compare") !== null && (
              <button
                type="button"
                className="linkbtn small"
                onClick={() => {
                  const n = new URLSearchParams(sp);
                  n.delete("compare");
                  setSp(n, { replace: true });
                }}
              >
                reset to default
              </button>
            )}
          </div>
          <StageLegend stages={Array.from(new Set(both.map((m) => m.stage)))} hollowNote={compare.length ? "hollow = compare model" : undefined} />

          {/* §1 */}
          <Section {...SEC.ramps}>
            <Plate
              label="Plate M2 · Raw features on their ramps"
              caption="Each sub-score is a clipped linear ramp between a true-base anchor (1) and a post-trained anchor (0). Shaded zones are clipped. Hollow glyphs on the x axis are compare models."
              sources={SUB_KEYS.map((k) => path(model, `subscores.${k}`))}
              data={{
                columns: ["sub-score", "feature (source)", "value", "score", ...compare.map((c) => c.label)],
                numeric: [false, false, true, true, ...compare.map(() => true)],
                rows: SUB_KEYS.map((k) => [
                  SUB_META[k].name,
                  model.subscores?.[k]?.source ?? "—",
                  fmtNum(model.subscores?.[k]?.value ?? null, "raw"),
                  fmtNum(model.subscores?.[k]?.score ?? null, "score"),
                  ...compare.map((c) => fmtNum(c.subscores?.[k]?.score ?? null, "score")),
                ]),
              }}
            >
              <div className="ramps-grid">
                {SUB_KEYS.map((k) => {
                  const src = model.subscores?.[k]?.source;
                  return (
                    <div key={k}>
                      <h3 style={{ fontFamily: "var(--f-sans)", fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {SUB_META[k].name}
                        {src && (
                          <span className="src-chip" title="subscores.source">
                            {src}
                            {src !== SUB_META[k].feature ? (k === "calib" ? " (Pile fallback)" : " (fallback)") : ""}
                          </span>
                        )}
                      </h3>
                      {model.subscores?.[k]?.score === null || !model.subscores?.[k] ? (
                        <NullPlate>Not measured for this checkpoint; the overall is the mean of the {nAvail} available.</NullPlate>
                      ) : (
                        <>
                          <TransferPlot k={k} model={model} compare={compare} width={300} height={64} />
                          {ciBounds(model, CI_KEY[k]) && (
                            <p className="small ink2" style={{ margin: "4px 0 0" }}>
                              input {withCI(model.subscores[k]?.value, ciBounds(model, CI_KEY[k]), SUB_META[k].unit === "share" ? "pct" : k === "calib" ? "gap" : "nats")}
                              <span className="ink3"> · 95% CI, {model.ci?.[CI_KEY[k]]?.n_docs ?? model.ci?.[CI_KEY[k]]?.n} {k === "prior" ? "samples" : "documents"}</span>
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="arith">
                ({arith.parts.map((p) => (p === null ? "—" : fmtNum(p, "score"))).join(" + ")}) / {arith.n} = {fmtNum(arith.mean, "score")}
                {diff !== null && Math.abs(diff) <= 1e-9 ? <span className="ink3"> · matches bundle score</span> : null}
              </p>
              {diff !== null && Math.abs(diff) > 1e-9 && <DataNote>recomputed differs from the bundle score by {fmt(diff, "raw")}.</DataNote>}
            </Plate>
          </Section>

          {/* §2 */}
          <Section {...SEC.calibration}>
            {rel ? (
              <div className="with-margin">
                <div className="wm-main">
                  <Plate
                    label="Plate M3 · Top-1 reliability on post-cutoff text"
                    caption="x = mean top-1 confidence per bin, y = accuracy; glyph area ∝ positions in the bin. Points below the diagonal are over-confident. The key is named selfboot but it is computed on teacher-forced post-cutoff text."
                    sources={[P("selfboot.reliability.bins"), ...compare.map((c) => path(c, "selfboot.reliability.bins"))]}
                    data={{
                      columns: ["bin", "positions", "confidence", "accuracy", ...compare.map((c) => `${c.label} acc.`)],
                      numeric: [false, true, true, true, ...compare.map(() => true)],
                      rows: (rel.bins ?? []).map((b) => [
                        `${fmtNum(b[0], "num2")}–${fmtNum(b[1], "num2")}`,
                        fmt(b[2], "count"),
                        fmtNum(b[3], "num3"),
                        fmtNum(b[4], "num3"),
                        // bins are matched on their lower edge: vh_selfboot.py skips empty bins, so indices can differ
                        ...compare.map((c) => fmtNum(binAt(c, b[0])?.[4] ?? null, "num3")),
                      ]),
                    }}
                  >
                    <ReliabilityDiagram model={model} compare={compare} />
                  </Plate>
                </div>
                <aside className="wm-margin">
                  <Kv
                    items={[
                      ["ECE", <Num path={P("selfboot.reliability.ECE")} fmt="num3" />],
                      ["top-1 accuracy", <Num path={P("selfboot.reliability.top1_acc")} fmt="pct" />],
                      ["mean top-1 p", <Num path={P("selfboot.reliability.mean_p1")} fmt="num3" />],
                      ["share p1 > 0.9", <Num path={P('selfboot.reliability["frac_p1>0.9"]')} fmt="pct" />],
                      ["acc − conf | p1 > 0.9", <Num path={P('selfboot.reliability["acc_minus_conf_p1>0.9"]')} fmt="signed" />],
                    ]}
                  />
                </aside>
              </div>
            ) : (
              <NullPlate>Reliability not measured for this checkpoint.</NullPlate>
            )}
            <Kv
              items={[
                ["F_calib_gap (post-cutoff)", <><Num path={P("fingerprint.F_calib_gap")} fmt="gap" />{ciSpan(model, "calib_gap", "gap")}</>],
                ...(ciBounds(model, "ECE") ? ([["ECE, 95% CI", <span className="ink2">{withCI(model.ci?.ECE?.value, ciBounds(model, "ECE"), "num3")}</span>]] as [React.ReactNode, React.ReactNode][]) : []),
                ["calib_gap (Pile)", <Num path={P("fingerprint.calib_gap")} fmt="gap" />],
                ["F_gap_domain_absmean", <><Num path={P("fingerprint.F_gap_domain_absmean")} fmt="nats" />{ciSpan(model, "spread", "nats")}</>],
                ["F_gap_domain_min", <Num path={P("fingerprint.F_gap_domain_min")} fmt="gap" />],
                ["tail.tf_fresh.gap_hiH", <Num path={P("tail.tf_fresh.gap_hiH")} fmt="gap" />],
                ...(band
                  ? ([[
                      "pre-anneal band",
                      <>
                        ±<Num path={path(band.model, "fingerprint.F_calib_gap")} value={band.band} fmt="nats" derived="max |F_calib_gap| over pre-anneal checkpoints" />
                      </>,
                    ]] as [React.ReactNode, React.ReactNode][])
                  : []),
              ]}
            />
            <Plate
              label="Plate M3b · Cross-entropy per post-cutoff domain"
              caption="Cross-entropy alone cannot say whether a model is miscalibrated; it is shown for context. Sorted by this checkpoint’s value; compare models hollow."
              sources={[P("fingerprint.F_CE_*")]}
              data={{
                columns: ["domain", model.label, ...compare.map((c) => c.label)],
                numeric: [false, true, ...compare.map(() => true)],
                rows: domainRows(both, "F_CE_", model).map((r) => [r.label, fmtNum(r.values[model.id], "nats"), ...compare.map((c) => fmtNum(r.values[c.id], "nats"))]),
              }}
            >
              <DotRows rows={domainRows(both, "F_CE_", model)} model={model} compare={compare} axisTitle="cross-entropy on post-cutoff text, nats" />
            </Plate>
          </Section>

          {/* §3 */}
          <Section {...SEC.tail}>
            {model.tail ? (
              <div className="tbl-scroll">
                <table className="tbl tail-table">
                  <caption>
                    Realised tail statistics per pass{compare[0] ? `; deltas against ${compare[0].label}` : ""}.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">statistic</th>
                      {TAIL_PASSES.filter((p) => model.tail?.[p.key]).map((p) => (
                        <th key={p.key} scope="col" className="n">
                          {p.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TAIL_ROWS.map((r) => (
                      <tr key={r.key}>
                        <th scope="row" style={{ fontWeight: 400, background: "none" }}>
                          {r.label}
                        </th>
                        {TAIL_PASSES.filter((p) => model.tail?.[p.key]).map((p) => {
                          const v = get(model, ["tail", p.key, r.key]);
                          const c = compare[0] ? get(compare[0], ["tail", p.key, r.key]) : null;
                          let delta: string | null = null;
                          if (isNum(v) && isNum(c)) {
                            if (r.rate) delta = c > 0 ? `${fmt(v / c, "ratio")} vs ${compare[0].label}` : null;
                            else delta = `${fmt(v - c, "signed")} vs ${compare[0].label}`;
                          }
                          return (
                            <td key={p.key} className="n">
                              <Num path={path(model, ["tail", p.key, r.key])} fmt={r.kind} />
                              {delta && <span className="delta">{delta}</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {TAIL_PASSES.filter((p) => !model.tail?.[p.key]).map((p) => (
                  <p key={p.key} className="small ink3">
                    {p.label}: not run for this checkpoint.
                  </p>
                ))}
              </div>
            ) : (
              <NullPlate>Tail statistics not measured for this checkpoint.</NullPlate>
            )}
            <Plate
              label="Plate M4 · Gap where the model is uncertain (H > 4), every checkpoint"
              caption="Calibration gap restricted to post-cutoff positions with entropy above 4 nats. Negative = over-confident exactly where uncertain. This checkpoint is highlighted; compare models are outlined."
              sources={["models[*].tail.tf_fresh.gap_hiH"]}
            >
              <StageDotStrip
                bundle={bundle}
                value={(m) => get(m, "tail.tf_fresh.gap_hiH")}
                valuePath={(m) => path(m, "tail.tf_fresh.gap_hiH")}
                fmtKind="gap"
                axisTitle="gap at H > 4, mean(H − s), nats (post-cutoff)"
                highlight={model.id}
                compare={compare.map((c) => c.id)}
                zero
              />
            </Plate>
          </Section>

          {/* §4 tail reliability */}
          <Section {...SEC["tail-mass"]}>
            {model.tailmass ? (
              <>
                <div className="with-margin">
                  <div className="wm-main">
                    <Plate
                      label="Plate M4b · Predicted tail mass vs realised rate"
                      caption="Filled glyph: mean probability the model put below the threshold (predicted). Hollow circle: share of real post-cutoff tokens that fell below it (realised). A density model has the two together; realised to the right of predicted means the tail is thinner than real text. Compare models dashed."
                      sources={TAIL_KS.flatMap((k) => [P(`tailmass.pred${k}`), P(`tailmass.real${k}`), P(`tailmass.ratio${k}`)])}
                      data={{
                        columns: ["threshold", "predicted", "realised", "realised / predicted", "95% CI", ...compare.map((c) => `${c.label} ratio`)],
                        numeric: [false, true, true, true, false, ...compare.map(() => true)],
                        rows: TAIL_KS.map((k) => {
                          const b = ciBounds(model, `tail_ratio${k}`);
                          return [
                            tailLabel(k),
                            fmtNum(model.tailmass?.[`pred${k}`] ?? null, "pct"),
                            fmtNum(model.tailmass?.[`real${k}`] ?? null, "pct"),
                            fmtNum(model.tailmass?.[`ratio${k}`] ?? null, "num2"),
                            b ? `[${fmtNum(b[0], "num2")}, ${fmtNum(b[1], "num2")}]` : "—",
                            ...compare.map((c) => fmtNum(c.tailmass?.[`ratio${k}`] ?? null, "num2")),
                          ];
                        }),
                      }}
                    >
                      <TailMassRows model={model} compare={compare} />
                    </Plate>
                  </div>
                  <aside className="wm-margin">
                    <Kv
                      items={[
                        ["positions", <Num path={P("tailmass.n")} fmt="count" />],
                        ["CE on tf_tail", <Num path={P("tailmass.CE")} fmt="nats" />],
                        ["gap on tf_tail", <Num path={P("tailmass.gap")} fmt="gap" />],
                        ...TAIL_KS.map((k) => [`ratio at ${tailLabel(k)}`, <span>{withCI(model.tailmass?.[`ratio${k}`] ?? null, ciBounds(model, `tail_ratio${k}`), "num2")}</span>] as [React.ReactNode, React.ReactNode]),
                      ]}
                    />
                  </aside>
                </div>
                <Plate
                  label="Plate M4c · Tail reliability diagram"
                  caption="Positions sorted into quartiles of predicted tail mass m_k; x = mean predicted mass, y = mean realised rate in the quartile, log–log. Glyph size tells the threshold (largest = 10⁻²). Below the diagonal the tail is thinner than real text. Compare models hollow."
                  sources={TAIL_KS.map((k) => P(`tailmass.bins${k}`))}
                  data={{
                    columns: ["threshold", "quartile", "predicted", "realised", "positions"],
                    numeric: [false, true, true, true, true],
                    rows: TAIL_KS.flatMap((k) => (model.tailmass?.[`bins${k}`] ?? []).map((b, i) => [tailLabel(k), String(i + 1), fmtNum(b[0], "pct"), fmtNum(b[1], "pct"), fmt(b[2], "count")])),
                  }}
                >
                  <TailReliabilityDiagram model={model} compare={compare} />
                </Plate>
                <Plate
                  label="Plate M4d · Realised / predicted at p < 10⁻³, every checkpoint"
                  caption="Ratio of the realised rate to the predicted mass at the middle threshold. 1 = the tail is as thin as the model says. This checkpoint is highlighted; compare models outlined."
                  sources={["models[*].tailmass.ratio3"]}
                >
                  <StageDotStrip
                    bundle={bundle}
                    value={(m) => get(m, "tailmass.ratio3")}
                    valuePath={(m) => path(m, "tailmass.ratio3")}
                    fmtKind="num2"
                    axisTitle="realised / predicted tail mass at p < 10⁻³ (post-cutoff)"
                    highlight={model.id}
                    compare={compare.map((c) => c.id)}
                  />
                </Plate>
              </>
            ) : (
              <NullPlate>Predicted tail mass not yet measured for this checkpoint (the pass is being run across the bench).</NullPlate>
            )}
          </Section>

          {/* §5 prior mass */}
          <Section {...SEC["prior-mass"]}>
            {model.prior ? (
              <div className="with-margin">
                <div className="wm-main">
                  <Plate
                    label="Plate M4e · Prior mass on chat openers after the start token"
                    caption="Exact probability that a document starts with any of the instruction openers, against the natural-start controls, then the most probable instruction templates. Log axis from 10⁻¹². Dashed ticks are compare models."
                    sources={[P("prior.instr_mass"), P("prior.ctrl_mass"), P("prior.logp"), "reference.prior_openers"]}
                    data={{
                      columns: ["template", "set", "text", "log P", "P", ...compare.map((c) => `${c.label} log P`)],
                      numeric: [false, false, false, true, true, ...compare.map(() => true)],
                      rows: Object.entries(model.prior.logp)
                        .sort((a, b) => (b[1] ?? -Infinity) - (a[1] ?? -Infinity))
                        .map(([n, v]) => [
                          n,
                          bundle.reference.prior_openers?.[n]?.set ?? "",
                          JSON.stringify(bundle.reference.prior_openers?.[n]?.text ?? ""),
                          fmtNum(v, "num2"),
                          fmtMass(isNum(v) ? Math.exp(v) : null),
                          ...compare.map((c) => fmtNum(c.prior?.logp?.[n] ?? null, "num2")),
                        ]),
                    }}
                  >
                    <PriorMassBars model={model} bundle={bundle} compare={compare} />
                  </Plate>
                </div>
                <aside className="wm-margin">
                  <Kv
                    items={[
                      ["instruction mass (exact)", <span>{fmtMass(model.prior.instr_mass)}</span>],
                      ["control mass (exact)", <span>{fmtMass(model.prior.ctrl_mass)}</span>],
                      ["most probable opener", <code>{model.prior.instr_argmax ?? "—"}</code>],
                      ["marker rate (32 samples)", <><Num path={P("fingerprint.roll_instr_marker_rate")} fmt="pct" />{ciSpan(model, "prior_marker", "pct")}</>],
                    ]}
                  />
                </aside>
              </div>
            ) : (
              <NullPlate>
                Exact prior probe not yet run for this checkpoint. The sampled marker rate is <Num path={P("fingerprint.roll_instr_marker_rate")} fmt="pct" />
                {ciSpan(model, "prior_marker", "pct")}.
              </NullPlate>
            )}
          </Section>

          {/* §6 OOD */}
          <Section {...SEC.ood}>
            {model.ood ? <OodTable model={model} compare={compare} /> : <NullPlate>Out-of-distribution pass not yet run for this checkpoint.</NullPlate>}
          </Section>

          {/* §7 */}
          <Section {...SEC.surnames}>
            {!s ? (
              <NullPlate>Surname test not run for this checkpoint.</NullPlate>
            ) : (
              <>
                {effMax !== null && (
                  <Plate
                    label="Plate M5 · Effective number of surnames, exp(H)"
                    caption="exp(entropy) of the model’s distribution over the 2,000 most common Census surnames, against the Census itself over the same set. Secondary labels give entropy in nats."
                    sources={["reference.census_entropy_top2000", P("surnames.H_few"), P("surnames.H_desc")]}
                  >
                    <HBars
                      // the axis reaches the longest bar: a model above the Census entropy is not clamped to it
                      max={Math.max(effMax, ...[s.H_few, s.H_desc].filter(isNum).map(Math.exp))}
                      fmtKind="eff"
                      axisTitle="effective number of surnames (linear); secondary labels: nats"
                      secondary={(v) => `${fmtNum(Math.log(v), "num2")} nats`}
                      bars={[
                        { label: "Census (top 2,000)", value: effMax, path: "exp(reference.census_entropy_top2000)" },
                        { label: "few-shot, exp(H_few)", value: isNum(s.H_few) ? Math.exp(s.H_few) : null, path: `exp(${P("surnames.H_few")})` },
                        { label: "described, exp(H_desc)", value: isNum(s.H_desc) ? Math.exp(s.H_desc) : null, path: `exp(${P("surnames.H_desc")})` },
                      ]}
                    />
                  </Plate>
                )}
                <SurnameStats model={model} compare={compare} />
                {topNames ? (
                  <Plate label="Plate M5b · Top Census surnames: model vs Census" caption={topNames.caption} sources={topNames.sources}>
                    <TopNamesChart data={topNames} />
                  </Plate>
                ) : (
                  <p className="small ink3">Per-name distribution not in this bundle.</p>
                )}
              </>
            )}
          </Section>

          {/* §8 */}
          <Section {...SEC.genres}>
            {!model.weird ? (
              <NullPlate>Rare-genre pass not run for this checkpoint.</NullPlate>
            ) : (
              <GenreTable model={model} compare={compare} band={band?.band} />
            )}
          </Section>

          {/* §9 */}
          <Section {...SEC.samples}>
            {model.selfboot?.lexical ? (
              <Plate
                label="Plate M6 · Own-sample lexical statistics vs the Pile"
                caption="Each axis spans the bundle-wide range; the labelled tick is the Pile reference. Compare models hollow."
                sources={lexKeys.map((k) => P(`selfboot.lexical.${k}`)).concat(["reference.pile_lexical"])}
              >
                <div className="gauges">
                  {lexKeys.map((k) => {
                    const val = (m: Model) => get(m, ["selfboot", "lexical", k]);
                    const ref = get(bundle.reference as never, ["pile_lexical", k]);
                    const ex = extent([...bundle.models.map(val), ref]) ?? [0, 1];
                    return (
                      <Gauge
                        key={k}
                        name={k}
                        model={model}
                        compare={compare}
                        value={val}
                        pathOf={(m) => path(m, `selfboot.lexical.${k}`)}
                        refValue={ref}
                        refLabel="Pile"
                        domain={ex}
                        fmtKind="num3"
                      />
                    );
                  })}
                </div>
              </Plate>
            ) : (
              <NullPlate>Own-sample statistics not measured for this checkpoint.</NullPlate>
            )}
            <p className="prose small" style={{ fontSize: 14 }}>
              Free-running collapse is not diagnostic of training stage (<Link to="/findings#f4">Finding 4</Link>). Share of near-deterministic steps
              (H &lt; 0.1): <Num path={P('fingerprint["roll_frac_H<0.1"]')} fmt="pct" />; late 8-gram repetition: <Num path={P("fingerprint.roll_rep8_q4")} fmt="pct" />.
            </p>
          </Section>

          {/* §10 */}
          <Section {...SEC.fingerprint}>
            <details className="disclosure">
              <summary>
                <Chevron /> Show all {Object.keys(model.fingerprint ?? {}).length} fingerprint features
              </summary>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
                <CopyButton text={() => JSON.stringify(model, null, 1)} label="Copy model JSON" />
                <button type="button" className="btn" onClick={() => downloadJson(`${model.id}.json`, model)}>
                  Download model JSON
                </button>
              </div>
              <Fingerprint model={model} compare={compare} />
            </details>
          </Section>
        </div>
      </div>
    </div>
  );
}

/**
 * smith_plain is recorded only when Smith is the model's most likely first name under the plain frame
 * (docs/vh_names_table.py), so a null there is a result, not a missing measurement.
 */
export const SMITH_NOT_FIRST = "Smith was not the most likely first name under the plain frame, so p(Smith) as item 1 was not recorded";
function nullMeaning(key: string): { nullText?: string; nullTitle?: string } {
  return key === "smith_plain" ? { nullText: "not 1st", nullTitle: SMITH_NOT_FIRST } : {};
}

function SurnameStats({ model, compare }: { model: Model; compare: Model[] }) {
  const bundle = useBundle();
  const rows: { label: string; key: string; kind: Fmt; ref?: { path: string; kind: Fmt } }[] = [
    { label: "KL(Census‖model), few-shot", key: "KL_few", kind: "kl" },
    { label: "KL(Census‖model), described", key: "KL_desc", kind: "kl" },
    { label: "top-10 mass, few-shot", key: "top10_few", kind: "pct", ref: { path: "top10_r", kind: "pct" } },
    { label: "top-10 mass, described", key: "top10_desc", kind: "pct", ref: { path: "top10_r", kind: "pct" } },
    { label: "p(Smith) as item 1, plain frame (when Smith is the top name)", key: "smith_plain", kind: "pct" },
    { label: "sampled: junk share (not a Census surname)", key: "junk", kind: "pct" },
    { label: "sampled: distinct share", key: "distinct", kind: "pct" },
  ];
  return (
    <div className="tbl-scroll">
      <table className="tbl">
        <caption>
          Surname test. Census entropy over the same set: <Num path="reference.census_entropy_top2000" fmt="nats" />; Census self-entropy (all names):{" "}
          <Num path="reference.census_self_entropy_all" fmt="nats1" />.
        </caption>
        <thead>
          <tr>
            <th scope="col">statistic</th>
            <th scope="col" className="n">
              {model.label}
            </th>
            {compare.map((c) => (
              <th key={c.id} scope="col" className="n">
                {c.label}
              </th>
            ))}
            <th scope="col" className="n">
              Census
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" style={{ fontWeight: 400, background: "none" }}>
                {r.label}
              </th>
              <td className="n">
                {model.surnames ? <Num path={path(model, `surnames.${r.key}`)} fmt={r.kind} {...nullMeaning(r.key)} /> : "—"}
              </td>
              {compare.map((c) => (
                <td key={c.id} className="n">
                  {c.surnames ? <Num path={path(c, `surnames.${r.key}`)} fmt={r.kind} {...nullMeaning(r.key)} /> : "—"}
                </td>
              ))}
              <td className="n">
                {r.ref ? (
                  <Num path={path(model, `surnames.${r.ref.path}`)} fmt={r.ref.kind} />
                ) : (
                  <span className="ink3">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!bundle && null}
    </div>
  );
}

/** The reliability bin of `m` whose lower edge is `lo` (within 1e-9), or null. */
function binAt(m: Model, lo: number | null): (number | null)[] | null {
  const bins = m.selfboot?.reliability?.bins ?? [];
  if (!isNum(lo)) return null;
  return bins.find((b) => isNum(b[0]) && Math.abs(b[0] - lo) < 1e-9) ?? null;
}

/** True while the element scrolls sideways (content wider than its box): drives the "scroll →" cue. */
function useOverflowX<T extends HTMLElement>(ref: React.RefObject<T>, deps: unknown[]): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOver(el.scrollWidth > el.clientWidth + 1);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, deps);
  return over;
}

function GenreTable({ model, compare, band }: { model: Model; compare: Model[]; band?: number }) {
  const bundle = useBundle();
  const [wrapRef, cw] = useWidth<HTMLDivElement>(900);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Phones: the bar narrows and CE folds under the genre name, so the numbers stay on screen.
  const narrow = cw < 600;
  const barW = narrow ? 72 : 240;
  const overflow = useOverflowX(scrollRef, [narrow, compare.length]);
  const [sort, setSort] = useState<"gap" | "runfrac" | "CE" | "genre">("gap");
  const [asc, setAsc] = useState(true);
  const maxGap = Math.max(
    0.01,
    ...bundle.models.flatMap((m) => Object.values(m.weird ?? {}).map((v) => (v && isNum(v[0]) ? Math.abs(v[0]) : 0))),
  );
  const entries = Object.entries(model.weird ?? {}).filter(([g]) => g !== "ALL");
  const idx = { gap: 0, runfrac: 1, CE: 2 } as const;
  entries.sort((a, b) => {
    if (sort === "genre") return asc ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]);
    return cmpNullsLast(a[1]?.[idx[sort]], b[1]?.[idx[sort]], asc ? 1 : -1);
  });
  const all = model.weird?.ALL ? ([["ALL", model.weird.ALL]] as typeof entries) : [];
  const th = (k: typeof sort, label: string, n = true) => (
    <th scope="col" className={n ? "n" : undefined} aria-sort={sort === k ? (asc ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="sort-btn"
        onClick={() => {
          if (sort === k) setAsc(!asc);
          else {
            setSort(k);
            setAsc(true);
          }
        }}
      >
        {label}
        <span className="tri" aria-hidden="true">
          {sort === k ? (asc ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
  return (
    <>
      <p className="small ink2">
        Rare-genre <strong>Pile</strong> documents (not post-cutoff text). Gap bars share one scale across the bundle (±{fmtNum(maxGap, "num3")} nats); the
        shaded band is ± the widest pre-anneal post-cutoff gap; dashed ticks are compare models.
      </p>
      <div ref={wrapRef}>
      {overflow && (
        <p className="small ink3 scroll-cue" aria-hidden="true">
          scroll →
        </p>
      )}
      <div className="tbl-scroll" ref={scrollRef}>
        <table className="tbl genre-tbl">
          <thead>
            <tr>
              {th("genre", narrow ? "genre · CE" : "genre", false)}
              {th("gap", "gap, nats")}
              <th scope="col" aria-hidden="true" style={{ width: barW + 8 }} />
              {th("runfrac", "verbatim share")}
              {!narrow && th("CE", "CE, nats")}
            </tr>
          </thead>
          <tbody>
            {[...all, ...entries].map(([g, v]) => (
              <tr key={g} className={g === "ALL" ? "pinned" : undefined}>
                <th scope="row" style={{ fontWeight: g === "ALL" ? 600 : 400, background: "none" }}>
                  {g === "ALL" ? "ALL genres" : g}
                  {narrow && (
                    <span className="small ink2" style={{ display: "block", fontWeight: 400 }}>
                      CE <Num path={path(model, ["weird", g, 2])} fmt="nats" />
                    </span>
                  )}
                </th>
                <td className="n">
                  <Num path={path(model, ["weird", g, 0])} fmt="gap" unit={false} />
                </td>
                <td style={{ width: barW + 8 }}>
                  <DivergingBar value={v?.[0] ?? null} max={maxGap} band={band} ghosts={compare.map((c) => c.weird?.[g]?.[0] ?? null)} width={barW} />
                </td>
                <td className="n">
                  <Num path={path(model, ["weird", g, 1])} fmt="pct" />
                </td>
                {!narrow && (
                  <td className="n">
                    <Num path={path(model, ["weird", g, 2])} fmt="nats" unit={false} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      <SourceLine paths={[`${path(model, "weird")}[genre] = [gap, verbatim share, CE]`]} />
    </>
  );
}

function Fingerprint({ model, compare }: { model: Model; compare: Model[] }) {
  const keys = Object.keys(model.fingerprint ?? {});
  const used = new Set<string>();
  const groups = GROUPS.map((g) => {
    const ks = keys.filter((k) => !used.has(k) && g.test(k));
    ks.forEach((k) => used.add(k));
    return { name: g.name, keys: ks };
  }).reverse();
  const order = ["Pile teacher-forced", "Wikipedia / GitHub (X_)", "Post-cutoff (F_)", "Own samples (roll_, W1)"];
  groups.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const first = compare[0];
  return (
    <>
      {groups
        .filter((g) => g.keys.length)
        .map((g) => (
          <div key={g.name} className="fp-group">
            <h3>{g.name}</h3>
            <div className="tbl-scroll">
              <table className="tbl fp-table">
                <thead>
                  <tr>
                    <th scope="col">key</th>
                    <th scope="col">description</th>
                    <th scope="col" className="n">
                      value
                    </th>
                    {compare.map((c) => (
                      <th key={c.id} scope="col" className="n">
                        {c.label}
                      </th>
                    ))}
                    {first && (
                      <th scope="col" className="n">
                        Δ vs {first.label}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {g.keys.map((k) => {
                    const v = fp(model, k);
                    const c0 = first ? fp(first, k) : null;
                    return (
                      <tr key={k}>
                        <td className="key">{k}</td>
                        <td className="desc">{describe(k) ?? "—"}</td>
                        <td className="n">
                          <Num path={path(model, ["fingerprint", k])} fmt="raw" />
                        </td>
                        {compare.map((c) => (
                          <td key={c.id} className="n">
                            {fmtNum(fp(c, k), "raw")}
                          </td>
                        ))}
                        {first && <td className="n ink2">{isNum(v) && isNum(c0) ? (v - c0 >= 0 ? "+" : MINUS) + fmtNum(Math.abs(v - c0), "raw") : "—"}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </>
  );
}


/** " [lo, hi]" after a value when the bundle carries its bootstrap interval. */
function ciSpan(m: Model, key: string, kind: Fmt) {
  const b = ciBounds(m, key);
  if (!b) return null;
  return (
    <span className="ink3" title={`95% bootstrap interval (${m.ci?.[key]?.n_docs ?? m.ci?.[key]?.n ?? "—"} resampled units), models[${m.id}].ci.${key}`}>
      {" "}
      [{fmtNum(b[0], kind)}, {fmtNum(b[1], kind)}]
    </span>
  );
}

function OodTable({ model, compare }: { model: Model; compare: Model[] }) {
  const bundle = useBundle();
  const rows = oodRows(model);
  const all = model.ood?.ALL ?? null;
  const maxGap = Math.max(0.05, ...bundle.models.flatMap((m) => Object.values(m.ood ?? {}).map((v) => (v && isNum(v.gap) ? Math.abs(v.gap) : 0))));
  const first = compare.find((c) => c.ood);
  return (
    <>
      <p className="small ink2">
        Synthetic genres (not post-cutoff prose). Hex and base64 are random bytes: the right answer is near-uniform, so any negative gap there is over-confidence. Gap bars share one
        scale across the bundle (±{fmtNum(maxGap, "num3")} nats); dashed ticks are compare models.
      </p>
      <div className="tbl-scroll">
        <table className="tbl genre-tbl">
          <thead>
            <tr>
              <th scope="col">genre</th>
              <th scope="col" className="n">CE, nats</th>
              <th scope="col" className="n">gap, nats</th>
              <th scope="col" aria-hidden="true" style={{ width: 168 }} />
              <th scope="col" className="n">realised / predicted at 10⁻³</th>
              {first && (
                <th scope="col" className="n">
                  {first.label}: gap
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {[...(all ? [{ key: "ALL", label: "ALL genres", note: "", stats: all }] : []), ...rows].map((r) => (
              <tr key={r.key} className={r.key === "ALL" ? "pinned" : undefined}>
                <th scope="row" style={{ fontWeight: r.key === "ALL" ? 600 : 400, background: "none", whiteSpace: "nowrap" }}>
                  {r.label}
                  {r.note && <span className="small ink3" style={{ display: "block", fontWeight: 400 }}>{r.note}</span>}
                </th>
                <td className="n">
                  <Num path={path(model, ["ood", r.key, "CE"])} fmt="nats" unit={false} />
                </td>
                <td className="n">
                  <Num path={path(model, ["ood", r.key, "gap"])} fmt="gap" unit={false} />
                </td>
                <td style={{ width: 168 }}>
                  <DivergingBar value={r.stats?.gap ?? null} max={maxGap} ghosts={compare.map((c) => c.ood?.[r.key]?.gap ?? null)} width={160} />
                </td>
                <td className="n">
                  <Num path={path(model, ["ood", r.key, "ratio3"])} fmt="num2" />
                </td>
                {first && (
                  <td className="n ink2">
                    {fmtNum(first.ood?.[r.key]?.gap ?? null, "gap")}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SourceLine paths={[`${path(model, "ood")}[genre] = {CE, H, gap, pred2..4, real2..4, ratio2..4, bins2..4}`]} />
    </>
  );
}
