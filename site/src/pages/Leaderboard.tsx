import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useBundle, useLoaded } from "../data/BundleContext";
import { CI_KEY, ciBounds, ciScore, compareOverall, familiesOf, fmtParams, ladder, ladderColumns, nAvailable, nScored, params, probeValue, ranked, SIZE_LABEL, sizeBucket, STAGE_CODE, stageOrder, type SizeBucket } from "../data/derive";
import { PROBE_KEYS, PROBE_META, RAMPS, SUB_META, type ProbeKey } from "../data/method";
import { fmtC } from "../charts/TempCharts";
import { get } from "../data/bundle";
import { isScoredSub, scoredKeys, scoredKeysOf } from "../data/scoring";
import { SUB_KEYS, type Model, type Stage, type SubKey } from "../data/types";
import { fmt, fmtNum } from "../lib/numfmt";
import { useReducedMotion } from "../lib/motion";
import { Glyph, GlyphShape, StageLegend } from "../components/Glyph";
import { RampCell, ScoreBar } from "../components/Bars";
import { Plate, Chevron } from "../components/Plate";
import { LadderStrip } from "../components/LadderStrip";
import { Num } from "../components/Num";
import { ReciteBadge } from "../components/ReciteBadge";
import { recitation } from "../data/derive";
import { linear } from "../lib/scale";

type SortKey = "overall" | SubKey | ProbeKey | "temp" | "model" | "stage" | "size";
const TEMP_TITLE = "Temp. cost (reported, not scored): C = CE(1) − min over T of CE(T), nats/token — the cross-entropy the model would gain from one global temperature rescaling; two-sided (over- and under-confidence both > 0). ≥ marks a minimum at the edge of the measured grid (C is a lower bound). Candidate calibration term for score v2.";
export const PROBE_NOTE = "validation probe: not a term of the score; the score should predict it";
const SIZES: SizeBucket[] = ["lt15", "15to100", "gt100", "unknown"];

function csv(v: string | null): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

function rawFmt(k: SubKey, v: number | null): string {
  if (SUB_META[k].unit === "share") return fmt(v, "pct");
  return k === "calib" ? fmt(v, "gap") : fmt(v, "nats");
}

export function anchorsText(k: SubKey): string {
  const [one, zero] = RAMPS[k];
  const f = (x: number) => (SUB_META[k].unit === "share" ? fmt(x, "pct") : fmtNum(x, k === "calib" ? "signed" : "num3").replace(/^\+/, ""));
  return `1 at ${f(one)}, 0 at ${f(zero)}`;
}

/** "value [lo, hi]" of the sub-score's input when the bundle carries a bootstrap interval for it. */
export function ciText(m: Model, k: SubKey): string | null {
  const b = ciBounds(m, CI_KEY[k]);
  if (!b) return null;
  const f = (x: number) => rawFmt(k, x);
  return `95% CI [${f(b[0])}, ${f(b[1])}]`;
}

export function cellTitle(m: Model, k: SubKey): string {
  const s = m.subscores?.[k];
  if (!s || s.score === null) return `${k}: not measured; overall is the mean of the ${nAvailable(m)} available`;
  const ci = ciText(m, k);
  return `${k} ${fmtNum(s.score, "score")} ← ${s.source ?? SUB_META[k].feature} ${rawFmt(k, s.value)}${ci ? " " + ci : ""} (${anchorsText(k)})`;
}

function headerTitle(k: SubKey): string {
  const m = SUB_META[k];
  return `${m.name}: ${m.feature}; ${anchorsText(k)}. Reads as ${m.readsAs}.`;
}

function probeTitle(k: ProbeKey): string {
  const p = PROBE_META[k];
  return `${p.name} (${PROBE_NOTE}): ${p.feature}. ${p.readsAs}.`;
}

/** Validation-probe cell: Wikipedia verbatim share (value, its v0 ramp as a faint bar) or few-shot surname KL (value with its 3-frame range). */
function ProbeCell({ m, k }: { m: Model; k: ProbeKey }) {
  const bundle = useBundle();
  const v = probeValue(m, k);
  const ci = ciBounds(m, PROBE_META[k].ci);
  if (k === "memo") {
    const s = m.subscores?.memo?.score ?? null;
    const rec = recitation(bundle, m);
    const title = `${probeTitle(k)} ${fmt(v, "pct")}${ci ? ` [${fmt(ci[0], "pct")}, ${fmt(ci[1], "pct")}]` : ""}; its v0 ramp would give ${fmtNum(s, "score")} (${anchorsText("memo")})${rec ? `; recitation ${rec}` : ""}`;
    return (
      <span className={"subcell probe" + (rec ? ` ${rec}` : "")} title={title}>
        <ScoreBar value={s} width={40} height={6} title={title} range={ciScore(m, "memo")} />
        <span className="v">{fmt(v, "pct")}</span>
      </span>
    );
  }
  const title = `${probeTitle(k)} ${fmt(v, "kl")}${ci ? `; range over the three few-shot frames [${fmt(ci[0], "kl")}, ${fmt(ci[1], "kl")}]` : ""}`;
  return (
    <span className="subcell probe" title={title}>
      <span className="v kl">{fmtNum(v, "kl")}</span>
      {ci && <span className="rng">[{fmtNum(ci[0], "kl")}, {fmtNum(ci[1], "kl")}]</span>}
    </span>
  );
}

function SubCell({ m, k, raw }: { m: Model; k: SubKey; raw: boolean }) {
  const s = m.subscores?.[k] ?? null;
  const title = cellTitle(m, k);
  if (raw) {
    const [good, bad] = RAMPS[k];
    return (
      <span className="subcell" title={title}>
        <RampCell value={s?.value ?? null} good={good} bad={bad} title={title} />
        <span className="v">{rawFmt(k, s?.value ?? null)}</span>
      </span>
    );
  }
  return (
    <span className="subcell" title={title}>
      <ScoreBar value={s?.score ?? null} width={64} height={6} title={title} range={ciScore(m, k)} />
      <span className="v">{fmtNum(s?.score ?? null, "score")}</span>
    </span>
  );
}

function MicroBars({ m }: { m: Model }) {
  return (
    <span className="micro">
      {[...scoredKeysOf(m), ...SUB_KEYS.filter((k) => !isScoredSub(m, k))].map((k) => (
        <span key={k} title={isScoredSub(m, k) ? cellTitle(m, k) : `${PROBE_NOTE}: ${cellTitle(m, k)}`} className={isScoredSub(m, k) ? undefined : "probe"}>
          <span className="k">{SUB_META[k].short}</span>
          <ScoreBar value={m.subscores?.[k]?.score ?? null} width={36} height={5} />
          <span className="v">{fmtNum(m.subscores?.[k]?.score ?? null, "score")}</span>
        </span>
      ))}
    </span>
  );
}

function Comb({ m }: { m: Model }) {
  const h = 24;
  const keys = [...scoredKeysOf(m), ...SUB_KEYS.filter((k) => !isScoredSub(m, k))];
  return (
    <svg width={keys.length * 12} height={h + 12} role="img" aria-label={keys.map((k) => `${SUB_META[k].name} ${fmtNum(m.subscores?.[k]?.score ?? null, "score")}${isScoredSub(m, k) ? "" : " (probe)"}`).join(", ")}>
      {keys.map((k, i) => {
        const v = m.subscores?.[k]?.score ?? null;
        const probe = !isScoredSub(m, k);
        return (
          <g key={k} transform={`translate(${i * 12},0)`} opacity={probe ? 0.5 : 1}>
            <title>{probe ? `${PROBE_NOTE}: ${cellTitle(m, k)}` : cellTitle(m, k)}</title>
            <rect width={6} height={h} fill={v === null ? "url(#hatch)" : "var(--track)"} />
            {v !== null && <rect y={h - v * h} width={6} height={v * h} fill="var(--bar)" />}
            <text x={3} y={h + 11} textAnchor="middle">
              {SUB_META[k].short}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Sparkline({ rungs }: { rungs: Model[] }) {
  const w = 120;
  const h = 28;
  const pts = rungs.filter((r) => r.score !== null);
  if (pts.length < 2) return null;
  const x = linear([0, rungs.length - 1], [5, w - 5]);
  const y = linear([0, 1], [h - 4, 4]);
  return (
    <svg width={w} height={h} role="img" aria-label={`overall across rungs: ${pts.map((p) => fmtNum(p.score, "score")).join(", ")}`}>
      <line x1={0} x2={w} y1={y(0.5)} y2={y(0.5)} stroke="var(--rule)" />
      <polyline points={rungs.map((r, i) => (r.score === null ? "" : `${x(i)},${y(r.score)}`)).join(" ")} fill="none" stroke="var(--ink-3)" />
      {rungs.map((r, i) => (r.score === null ? null : <GlyphShape key={r.id} stage={r.stage} x={x(i)} y={y(r.score)} size={6} />))}
    </svg>
  );
}

/** Distinct sizes across a family's rungs, largest first ("405B / 70B"); "—" when none is known. */
export function familySizes(rungs: Model[]): string {
  const seen = new Map<string, number>();
  for (const r of rungs) {
    const p = params(r);
    if (p.total_b !== null) seen.set(fmtParams(p), p.total_b);
  }
  if (!seen.size) return "—";
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .join(" / ");
}

/** Raw feature as a ramp position, oriented like the score (1 at the true-base anchor, 0 at the post-trained one), unclipped. */
function rampPosition(m: Model, k: SubKey): number | null {
  const v = m.subscores?.[k]?.value;
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const [good, bad] = RAMPS[k];
  return (v - bad) / (good - bad);
}

function LaddersView({ models }: { models: Model[] }) {
  const bundle = useBundle();
  const ids = new Set(models.map((m) => m.id));
  const fams = familiesOf(bundle)
    .map((f) => ({ f, rungs: ladder(bundle, f).filter((m) => ids.has(m.id)) }))
    .filter((x) => x.rungs.length);
  const maxScore = (rs: Model[]) => Math.max(...rs.map((r) => r.score ?? -1));
  const multi = fams.filter((x) => ladder(bundle, x.f).length > 1).sort((a, b) => maxScore(b.rungs) - maxScore(a.rungs));
  const single = fams.filter((x) => ladder(bundle, x.f).length <= 1).sort((a, b) => maxScore(b.rungs) - maxScore(a.rungs));
  const block = (f: string, rungs: Model[]) => (
    <section key={f} className="lad-block" aria-label={`${f} ladder`}>
      <header className="lad-head">
        <h3>{f}</h3>
        <span className="ink3 small">
          {familySizes(rungs)} · {rungs.length} rung{rungs.length > 1 ? "s" : ""}
        </span>
        <Sparkline rungs={rungs} />
      </header>
      <ol className="lad-rungs">
        {ladderColumns(rungs).map((col, ci) => (
          <li key={ci} className="lad-col">
            {ci > 0 && (
              <svg className="lad-chev" width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
                <path d="M2 1l6 5-6 5" fill="none" stroke="var(--ink-3)" />
              </svg>
            )}
            <div className="lad-stack">
              {col.length > 1 && <span className="kicker">parallel</span>}
              {col.map((m) => (
                <Link key={m.id} to={`/model/${encodeURIComponent(m.id)}`} className="lad-rung">
                  <span className="lad-label">
                    <Glyph stage={m.stage} title={m.stage} /> {m.label}
                  </span>
                  <span className="lad-score">
                    <strong>{fmtNum(m.score, "score")}</strong>
                    <ScoreBar value={m.score} width={64} height={6} />
                  </span>
                  <Comb m={m} />
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
  return (
    <div className="ladders">
      {multi.map((x) => block(x.f, x.rungs))}
      {single.length > 0 && (
        <>
          <h3 className="kicker" style={{ marginTop: 24 }}>
            Single checkpoints
          </h3>
          <div className="lad-singles">{single.map((x) => block(x.f, x.rungs))}</div>
        </>
      )}
    </div>
  );
}

export default function Leaderboard() {
  const bundle = useBundle();
  const loaded = useLoaded();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [hlFamily, setHlFamily] = useState<string | null>(null);
  const [famOpen, setFamOpen] = useState(false);

  const stages = csv(sp.get("stage")) as Stage[];
  const famSel = csv(sp.get("family"));
  const sizes = csv(sp.get("size")) as SizeBucket[];
  const view = sp.get("view") === "ladders" ? "ladders" : "ranked";
  const sort = (sp.get("sort") ?? "overall") as SortKey;
  const dir = sp.get("dir") === "asc" ? "asc" : sp.get("dir") === "desc" ? "desc" : sort === "model" || sort === "stage" ? "asc" : "desc";
  const raw = sp.get("raw") === "1";
  const q = sp.get("q") ?? "";

  function update(k: string, v: string | null) {
    const n = new URLSearchParams(sp);
    if (v === null || v === "") n.delete(k);
    else n.set(k, v);
    setSp(n, { replace: true });
  }
  const toggleIn = (k: string, list: string[], v: string) =>
    update(k, (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]).join(","));

  useEffect(() => {
    document.title = "True Base Bench";
  }, []);

  const rankInfo = useMemo(() => new Map(ranked(bundle).map((r) => [r.model.id, r])), [bundle]);
  const famCounts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of bundle.models) c.set(m.family, (c.get(m.family) ?? 0) + 1);
    return c;
  }, [bundle]);
  const sizesPresent = SIZES.filter((s) => bundle.models.some((m) => sizeBucket(m) === s));

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return bundle.models.filter(
      (m) =>
        (!stages.length || stages.includes(m.stage)) &&
        (!famSel.length || famSel.includes(m.family)) &&
        (!sizes.length || sizes.includes(sizeBucket(m))) &&
        (!ql || `${m.label} ${m.id} ${m.family}`.toLowerCase().includes(ql)),
    );
  }, [bundle, stages.join(), famSel.join(), sizes.join(), q]);

  const rows = useMemo(() => {
    const val = (m: Model): number | string | null => {
      switch (sort) {
        case "overall":
          return m.score;
        case "model":
          return `${m.family} ${String(m.order).padStart(3, "0")}`;
        case "stage":
          return stageOrder.indexOf(m.stage);
        case "size":
          return params(m).total_b;
        case "KL_few":
          return probeValue(m, "KL_few");
        case "temp":
          return get(m, "temp.C");
        default:
          // with raw features shown, sort by what is shown: the unclipped feature, oriented like the score
          return raw ? rampPosition(m, sort) : m.subscores?.[sort]?.score ?? null;
      }
    };
    const out = [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === null && vb === null) return compareOverall(a, b);
      if (va === null) return 1;
      if (vb === null) return -1;
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return c !== 0 ? (dir === "asc" ? c : -c) : compareOverall(a, b);
    });
    return out;
  }, [filtered, sort, dir, raw]);

  // FLIP re-sort animation (DESIGN §7.1), off under reduced motion
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const prevTops = useRef(new Map<string, number>());
  const sortSig = `${sort}:${dir}`;
  const prevSig = useRef(sortSig);
  useLayoutEffect(() => {
    const body = tbodyRef.current;
    if (!body) return;
    const trs = Array.from(body.querySelectorAll<HTMLTableRowElement>("tr[data-id]"));
    const now = new Map(trs.map((tr) => [tr.dataset.id!, tr.getBoundingClientRect().top]));
    if (!reduced && prevSig.current !== sortSig) {
      for (const tr of trs) {
        const before = prevTops.current.get(tr.dataset.id!);
        const after = now.get(tr.dataset.id!)!;
        if (before === undefined || before === after) continue;
        tr.style.transition = "none";
        tr.style.transform = `translateY(${before - after}px)`;
        void tr.offsetHeight;
        tr.style.transition = "transform var(--dur-2) var(--ease-inout)";
        tr.style.transform = "";
      }
    }
    prevSig.current = sortSig;
    prevTops.current = now;
  });

  const setSort = (k: SortKey) => {
    const n = new URLSearchParams(sp);
    const defDir = k === "model" || k === "stage" ? "asc" : "desc";
    if (sort === k) n.set("dir", dir === "asc" ? "desc" : "asc");
    else {
      n.set("dir", defDir);
    }
    if (k === "overall" && n.get("dir") === "desc") {
      n.delete("sort");
      n.delete("dir");
    } else n.set("sort", k);
    setSp(n, { replace: true });
  };
  const ariaSort = (k: SortKey) => (sort === k ? (dir === "asc" ? "ascending" : "descending") : "none");
  const SortTh = ({ k, children, className, title }: { k: SortKey; children: React.ReactNode; className?: string; title?: string }) => (
    <th scope="col" aria-sort={ariaSort(k) as "none"} className={className} title={title}>
      <button type="button" className="sort-btn" onClick={() => setSort(k)}>
        {children}
        <span className="tri" aria-hidden="true">
          {sort === k ? (dir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );

  // sticky thead sits under the sticky controls row
  const ctlRef = useRef<HTMLDivElement>(null);
  const [ctlH, setCtlH] = useState(0);
  useLayoutEffect(() => {
    const el = ctlRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setCtlH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nFam = familiesOf(bundle).length;
  const stageStrip = bundle.models.filter((m) => filtered.includes(m));
  const SCORED = scoredKeys(bundle);

  return (
    <div className="container lb" style={{ ["--ctl-h" as string]: `${ctlH}px` }}>
      <div className="lb-head">
        <div className="lb-intro">
          <h1>True Base Bench</h1>
          <p className="lede">
            How close each of <Num path="n_models" fmt="count" /> checkpoints is to an ideal base model — calibrated on unseen text, in every genre,
            with no instruction prior — read from its next-token distributions alone. 1 = indistinguishable from a pre-anneal checkpoint, the
            empirical anchor. Base-likeness, not capability. Two validation probes (Wikipedia recitation, the surname test) are shown beside the
            score and are not part of it.
          </p>
          <p>
            <Link to="/methodology#score">How the score is built →</Link>
          </p>
        </div>
        <aside className="bundle-card" aria-label="Bundle">
          <p className="kicker">Bundle</p>
          <dl className="statlist">
            <dt>file</dt>
            <dd className="mono small">{loaded.file}</dd>
            <dt>schema_version</dt>
            <dd>{bundle.schema_version}</dd>
            <dt>generated</dt>
            <dd>{bundle.generated}</dd>
            <dt>n_models</dt>
            <dd>{bundle.n_models}</dd>
            <dt>n_families</dt>
            <dd>{nFam}</dd>
          </dl>
          <a className="btn" href={loaded.url} download>
            Download JSON
          </a>
        </aside>
      </div>

      <Plate
        label="Plate 0 · Ladder strip: overall score by training stage"
        caption={
          <>
            Each glyph is one checkpoint, on the same 0–1 scale as the table bars; the vertical tick in each row is the stage median. Hover or focus
            a glyph (or a table row) to join its family’s rungs in ladder order.
          </>
        }
        sources={["models[*].score", "models[*].stage"]}
        data={{
          columns: ["stage", "n", "median overall", "checkpoints"],
          numeric: [false, true, true, false],
          rows: stageOrder.map((s) => {
            const ms = stageStrip.filter((m) => m.stage === s && m.score !== null);
            const xs = ms.map((m) => m.score!).sort((a, b) => a - b);
            const med = xs.length ? (xs.length % 2 ? xs[xs.length >> 1] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2) : null;
            return [s, ms.length, fmtNum(med, "score"), ms.map((m) => `${m.label} (${m.family}) ${fmtNum(m.score, "score")}`).join("; ")];
          }),
        }}
      >
        <StageLegend />
        <LadderStrip bundle={bundle} models={stageStrip} highlightFamily={hlFamily} onFamily={setHlFamily} />
      </Plate>

      <div className="lb-controls" role="region" aria-label="Table controls" ref={ctlRef}>
        <div className="seg" role="group" aria-label="View">
          <button type="button" className="btn" aria-pressed={view === "ranked"} onClick={() => update("view", null)}>
            Ranked
          </button>
          <button type="button" className="btn" aria-pressed={view === "ladders"} onClick={() => update("view", "ladders")}>
            Ladders
          </button>
        </div>
        <div className="ctl-group" role="group" aria-label="Stage filter">
          <span className="ctl-label">Stage</span>
          {stageOrder.map((s) => (
            <button key={s} type="button" className="btn chip" aria-pressed={stages.includes(s)} onClick={() => toggleIn("stage", stages, s)} title={s}>
              <Glyph stage={s} size={8} /> {STAGE_CODE[s]}
            </button>
          ))}
        </div>
        <div className="ctl-group fam-filter">
          <button type="button" className="btn" aria-expanded={famOpen} aria-controls="fam-list" onClick={() => setFamOpen(!famOpen)}>
            Family{famSel.length ? ` (${famSel.length})` : ""} <Chevron />
          </button>
          {famOpen && (
            <fieldset id="fam-list" className="fam-list">
              <legend className="visually-hidden">Families</legend>
              {familiesOf(bundle).map((f) => (
                <label key={f}>
                  <input type="checkbox" checked={famSel.includes(f)} onChange={() => toggleIn("family", famSel, f)} /> {f}{" "}
                  <span className="ink3">{famCounts.get(f)}</span>
                </label>
              ))}
              {famSel.length > 0 && (
                <button type="button" className="linkbtn" onClick={() => update("family", null)}>
                  Clear
                </button>
              )}
            </fieldset>
          )}
        </div>
        <div className="ctl-group" role="group" aria-label="Size filter">
          <span className="ctl-label">Size</span>
          {sizesPresent.map((s) => (
            <button key={s} type="button" className="btn chip" aria-pressed={sizes.includes(s)} onClick={() => toggleIn("size", sizes, s)}>
              {SIZE_LABEL[s]}
            </button>
          ))}
        </div>
        <label className="ctl-group">
          <span className="visually-hidden">Search</span>
          <input type="search" placeholder="Search label, id, family" value={q} onChange={(e) => update("q", e.target.value)} />
        </label>
        <button type="button" className="btn" aria-pressed={raw} onClick={() => update("raw", raw ? null : "1")}>
          Raw features
        </button>
        <label className="ctl-group sort-select">
          <span className="ctl-label">Sort</span>
          <select
            value={`${sort}:${dir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(":");
              const n = new URLSearchParams(sp);
              if (k === "overall" && d === "desc") {
                n.delete("sort");
                n.delete("dir");
              } else {
                n.set("sort", k);
                n.set("dir", d);
              }
              setSp(n, { replace: true });
            }}
          >
            <option value="overall:desc">Overall, high first</option>
            <option value="overall:asc">Overall, low first</option>
            {SCORED.map((k) => (
              <Fragment key={k}>
                <option value={`${k}:desc`}>{SUB_META[k].name}, high first</option>
                <option value={`${k}:asc`}>{SUB_META[k].name}, low first</option>
              </Fragment>
            ))}
            {PROBE_KEYS.map((k) => (
              <Fragment key={k}>
                <option value={`${k}:desc`}>{PROBE_META[k].name} (probe), high first</option>
                <option value={`${k}:asc`}>{PROBE_META[k].name} (probe), low first</option>
              </Fragment>
            ))}
            <option value="temp:asc">Temp. cost (reported), low first</option>
            <option value="temp:desc">Temp. cost (reported), high first</option>
            <option value="model:asc">Model A–Z</option>
            <option value="stage:asc">Stage order</option>
          </select>
        </label>
        <span className="ctl-count" aria-live="polite">
          showing {filtered.length} of {bundle.models.length}
        </span>
      </div>

      {view === "ranked" ? (
        <table className="tbl lb-table">
          <caption className="visually-hidden">
            Checkpoints ranked by overall score (1 = indistinguishable from a pre-anneal checkpoint; the score is distance from a true base, not capability)
          </caption>
          <thead>
            <tr>
              <SortTh k="overall" className="n c-rank">
                #
              </SortTh>
              <SortTh k="stage" className="c-stage">
                Stage
              </SortTh>
              <SortTh k="model" className="c-model">
                Model
              </SortTh>
              <SortTh k="size" className="c-size">
                Size
              </SortTh>
              <SortTh k="overall" className="c-overall" title={`Overall = mean of the available scored sub-scores (${SCORED.map((k) => SUB_META[k].name).join(", ")}). 1 = indistinguishable from a pre-anneal checkpoint; distance from a true base, not capability.`}>
                Overall <span className="ink3 small">(base-likeness)</span>
              </SortTh>
              {SCORED.map((k) => (
                <SortTh key={k} k={k} className="c-sub" title={headerTitle(k)}>
                  {SUB_META[k].name}
                </SortTh>
              ))}
              {PROBE_KEYS.map((k, i) => (
                <SortTh key={k} k={k} className={"c-probe" + (i === 0 ? " first" : "")} title={probeTitle(k)}>
                  {PROBE_META[k].name} <span className="probe-tag">probe</span>
                </SortTh>
              ))}
              <SortTh k="temp" className="c-probe c-temp" title={TEMP_TITLE}>
                Temp. cost <span className="probe-tag">reported</span>
              </SortTh>
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {rows.map((m) => {
              const r = rankInfo.get(m.id)!;
              const n = nAvailable(m);
              const href = `/model/${encodeURIComponent(m.id)}`;
              return (
                <tr
                  key={m.id}
                  data-id={m.id}
                  className={hlFamily === m.family ? "hl" : undefined}
                  onMouseEnter={() => setHlFamily(m.family)}
                  onMouseLeave={() => setHlFamily(null)}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button")) return;
                    navigate(href);
                  }}
                >
                  <td className="n c-rank ink3">
                    {r.tie ? "=" : ""}
                    {r.rank}
                  </td>
                  <td className="c-stage">
                    <span className="stage-tag" title={m.stage}>
                      <Glyph stage={m.stage} />
                      <span className="code">{STAGE_CODE[m.stage]}</span>
                      <span className="visually-hidden">{m.stage}</span>
                    </span>
                  </td>
                  <td className="c-model">
                    <div className="l1">
                      <span className="fam">{m.family}</span> · <Link to={href}>{m.label}</Link>
                      <ReciteBadge m={m} />
                      {n < nScored(m) && (
                        <span className="cov" title={`${n} of ${nScored(m)} scored sub-scores measured; overall is the mean of the ${n} available`}>
                          {n}/{nScored(m)}
                        </span>
                      )}
                    </div>
                    <div className="l2 mono">
                      {m.id}
                      <span className="size-inline"> · {fmtParams(params(m))}</span>
                    </div>
                  </td>
                  <td className="c-size">{fmtParams(params(m))}</td>
                  <td className="c-overall">
                    <span className="ov">
                      <strong>{fmtNum(m.score, "score")}</strong>
                      <ScoreBar value={m.score} width={90} height={8} ticks title={`overall ${fmtNum(m.score, "score")}`} />
                    </span>
                  </td>
                  {SCORED.map((k) => (
                    <td key={k} className="c-sub">
                      <SubCell m={m} k={k} raw={raw} />
                    </td>
                  ))}
                  {PROBE_KEYS.map((k, i) => (
                    <td key={k} className={"c-probe" + (i === 0 ? " first" : "")}>
                      <ProbeCell m={m} k={k} />
                    </td>
                  ))}
                  <td className="c-probe c-temp">
                    <span className="subcell probe" title={m.temp ? `${TEMP_TITLE} This row: C ${fmtC(m.temp)}, T* ${fmtNum(m.temp.T_star, "num2")}${m.temp.C_ci95 ? `, 95% CI [${fmt(m.temp.C_ci95[0], "raw")}, ${fmt(m.temp.C_ci95[1], "raw")}]` : ""}` : `${TEMP_TITLE} Not measured for this checkpoint.`}>
                      <span className={"v kl" + (m.temp?.T_star_at_bound ? " bound" : "")}>{m.temp ? fmtC(m.temp) : "—"}</span>
                    </span>
                  </td>
                  <td className="c-micro" aria-hidden="true">
                    <MicroBars m={m} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <LaddersView models={filtered} />
      )}
      {filtered.length === 0 && <p className="ink2">No checkpoints match these filters.</p>}
    </div>
  );
}
