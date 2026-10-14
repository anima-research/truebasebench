/**
 * Explainer (b) Teacher forcing on a fixed corpus vs the model's own samples (DESIGN §8 b).
 * The strips are schematic (grey blocks, no fake text); the histogram fills to the exact selfboot.reliability.bins
 * counts; the free-running vs teacher-forced entropy bars and the per-domain dot plot are bundle values.
 */
import { useMemo, useState } from "react";
import type { ExplainerProps } from "./types";
import type { Bundle, Model, ReliabilityBin } from "../data/types";
import { fp, getAny, path } from "../data/bundle";
import { collapseSpecimen, domainKeys, domainName, specimenPair } from "../data/derive";
import { useWidth } from "../components/Chart";
import { Num } from "../components/Num";
import { GlyphShape } from "../components/Glyph";
import { XAxis } from "../components/Axis";
import { fmt, fmtCount, fmtNum, isNum } from "../lib/numfmt";
import { linear, niceTicks } from "../lib/scale";
import { ExplainerShell, Tag, type StepSpec } from "./kit/Shell";
import { ModelPicker } from "./kit/Picker";
import { useStepper } from "./kit/useStepper";
import { InlineGlyph } from "./kit/InlineGlyph";
import { drawIndex, easeInOut, easeSettle, rng, seg, stagger } from "./kit/anim";
import { geometricWithEntropy } from "./kit/construct";
import { fk, N, pn, resolveIds, tx } from "./kit/num";

const DURS = [600, 2400, 1500, 1600, 2000, 900];
const CELLS = 40;
const PER_ROW = 10;
const READ_STEPS = 12;
const WRITE_STEPS = 10;
const OPENER = 3;

const PASSES: { key: string; name: string; source: string; q: string }[] = [
  { key: "tf", name: "tf", source: "Pile", q: "recall plus calibration" },
  { key: "tf_wiki", name: "tf_wiki", source: "Wikipedia+GitHub", q: "memorisation" },
  { key: "tf_fresh", name: "tf_fresh", source: "post-cutoff", q: "calibration on unseen text" },
  { key: "tf_weird", name: "tf_weird", source: "rare genres", q: "off-distribution behaviour" },
];

const binsOf = (m: Model): ReliabilityBin[] | null => {
  const b = m.selfboot?.reliability?.bins;
  return Array.isArray(b) && b.length ? (b as ReliabilityBin[]) : null;
};
const eligible = (m: Model) => !!binsOf(m) && isNum(fp(m, "F_H")) && isNum(fp(m, "roll_H_bos"));

/** Cell widths for the schematic strip: seeded, rows of PER_ROW. */
function cellLayout(seed: string, width: number) {
  const r = rng(seed);
  const rows: { x: number; w: number }[][] = [];
  for (let row = 0; row < CELLS / PER_ROW; row++) {
    const ws = Array.from({ length: PER_ROW }, () => 0.55 + r() * 0.9);
    const z = ws.reduce((a, b) => a + b, 0);
    let x = 0;
    rows.push(
      ws.map((w) => {
        const cw = (w / z) * width;
        const c = { x, w: cw };
        x += cw;
        return c;
      }),
    );
  }
  return rows.flat();
}

function Lane({
  width,
  title,
  sub,
  cells,
  cursor,
  mode,
  spark,
  pick,
  flash,
  on,
}: {
  width: number;
  title: string;
  sub: string;
  cells: { x: number; w: number }[];
  /** cells before this index are read/written */
  cursor: number;
  mode: "tf" | "own";
  spark: number[];
  pick: number | null;
  flash: number;
  /** sparkline visible */
  on: boolean;
}) {
  const rowH = 22;
  const top = 64;
  const ci = Math.min(CELLS - 1, Math.max(0, Math.floor(cursor)));
  const row = Math.floor(ci / PER_ROW);
  const atEnd = cursor >= CELLS;
  const cx = atEnd ? cells[CELLS - 1].x + cells[CELLS - 1].w : cells[ci].x;
  const cy = top + (atEnd ? CELLS / PER_ROW - 1 : row) * rowH;
  const boxW = 64;
  const bx = Math.max(0, Math.min(width - boxW, cx - boxW / 2));
  const sMax = Math.max(...spark, 1e-9);
  return (
    <g>
      <text x={0} y={11} className="panel-label">
        {title}
      </text>
      <text x={0} y={25} className="it">
        {sub}
      </text>
      {/* LM box with sparkline of the next-token distribution */}
      <g transform={`translate(${bx},32)`}>
        <rect width={boxW} height={22} fill="var(--bg-raised)" stroke="var(--ink-2)" />
        <text x={4} y={15} className="ink b">
          LM
        </text>
        {spark.map((p, i) => {
          const h = (p / sMax) * 16 * (on ? 1 : 0);
          const lit = pick === i && flash > 0.5;
          return <rect key={i} x={24 + i * 4.8} y={19 - h} width={3.6} height={h} fill={lit ? "var(--ink)" : "var(--ink-3)"} />;
        })}
      </g>
      <line x1={cx} x2={cx} y1={54} y2={cy + 18} stroke="var(--ink)" strokeWidth={2} />
      {cells.map((c, i) => {
        const r = Math.floor(i / PER_ROW);
        const y = top + r * rowH;
        const done = i < cursor;
        const isNew = i === Math.floor(cursor) - 1 && flash > 0 && !atEnd;
        if (mode === "tf") {
          return (
            <rect
              key={i}
              x={c.x + 1}
              y={y}
              width={Math.max(1, c.w - 2)}
              height={14}
              fill={isNew ? "var(--hl)" : done ? "var(--bar)" : "var(--rule-strong)"}
              stroke={isNew ? "var(--ink)" : "none"}
            />
          );
        }
        const opener = i < OPENER;
        return (
          <rect
            key={i}
            x={c.x + 1.5}
            y={y + 0.5}
            width={Math.max(1, c.w - 3)}
            height={13}
            fill={isNew ? "var(--hl)" : opener ? "var(--rule-strong)" : done ? "var(--bar)" : "none"}
            stroke={isNew ? "var(--ink)" : done || opener ? "none" : "var(--rule-strong)"}
            strokeDasharray={done || opener ? undefined : "2 2"}
          />
        );
      })}
    </g>
  );
}

function Histogram({ width, bins, units, morph, label }: { width: number; bins: ReliabilityBin[]; units: number[]; morph: number; label: string }) {
  const H = 64;
  const x = linear([0, 1], [0, width]);
  const maxC = Math.max(1, ...bins.map((b) => b[2]));
  const unit = 5;
  return (
    <g>
      {bins.map((b, i) => {
        const hu = (units[i] ?? 0) * unit;
        const hr = (b[2] / maxC) * H;
        const h = hu + (hr - hu) * morph;
        return <rect key={i} x={x(b[0]) + 1} y={H - Math.min(H + 6, h)} width={Math.max(1, x(b[1]) - x(b[0]) - 2)} height={Math.min(H + 6, h)} fill="var(--bar)" />;
      })}
      <line x1={0} x2={width} y1={H} y2={H} stroke="var(--rule-strong)" />
      {[0, 0.5, 1].map((v) => (
        <text key={v} x={x(v)} y={H + 13} textAnchor={v === 0 ? "start" : v === 1 ? "end" : "middle"}>
          {v}
        </text>
      ))}
      <text x={0} y={H + 27} className="ink2">
        {label}
      </text>
    </g>
  );
}

function EntropyBars({ width, m, prog }: { width: number; m: Model; prog: number }) {
  const tfH = fp(m, "F_H");
  const rollH = fp(m, "roll_H_bos");
  const vals = [rollH, tfH].filter(isNum);
  const hi = Math.max(...vals, 0.5) * 1.15;
  const L = 0;
  const x = linear([0, hi], [L, width - 46]);
  const rows: [string, number | null][] = [
    ["free-running (bare BOS)", rollH],
    ["teacher-forced (post-cutoff)", tfH],
  ];
  const e = easeSettle(prog);
  return (
    <g>
      {rows.map(([name, v], i) => (
        <g key={name} transform={`translate(0,${i * 30})`}>
          <text x={0} y={10} className="ink2">
            {name}
          </text>
          <rect x={L} y={14} width={x(hi) - L} height={8} fill="var(--track)" />
          {isNum(v) && <rect x={L} y={14} width={(x(v) - L) * e} height={8} fill="var(--bar)" />}
          {prog >= 1 && (
            <text x={isNum(v) ? x(v) + 4 : L} y={22} className="ink">
              {fmt(v, "nats")}
            </text>
          )}
        </g>
      ))}
      <text x={0} y={72} className="ink2">
        mean entropy, nats (linear, 0 to {fmtNum(hi, "num2")})
      </text>
    </g>
  );
}

function DomainDots({ width, a, b, prog }: { width: number; a: Model; b: Model; prog: number }) {
  const keys = domainKeys(a).filter((k) => isNum(fp(a, k)));
  keys.sort((k1, k2) => fp(a, k1)! - fp(a, k2)!);
  const vals = keys.flatMap((k) => [fp(a, k), fp(b, k)]).filter(isNum);
  if (!keys.length || !vals.length) return null;
  const lo = Math.max(0, Math.floor(Math.min(...vals) * 2) / 2);
  const hi = Math.ceil(Math.max(...vals) * 2) / 2;
  const LW = Math.min(118, width * 0.36);
  const x = linear([lo, hi], [LW, width - 8]);
  const rowH = 16;
  const top = 8;
  const axisY = top + keys.length * rowH + 4;
  return (
    <svg width={width} height={axisY + 40} viewBox={`0 0 ${width} ${axisY + 40}`} role="img" aria-label="Cross-entropy per post-cutoff domain">
      {keys.map((k, i) => {
        const y = top + i * rowH + rowH / 2;
        const va = fp(a, k);
        const vb = fp(b, k);
        const e = easeSettle(stagger(prog, i, keys.length, 0.4, 0.55));
        return (
          <g key={k}>
            <line x1={LW} x2={width - 8} y1={y} y2={y} stroke="var(--rule)" />
            <text x={LW - 6} y={y} dy="0.32em" textAnchor="end" className={domainName(k) ? undefined : "mono"}>
              {domainName(k) ?? k}
            </text>
            {e > 0 && isNum(va) && isNum(vb) && <line x1={x(va)} x2={x(vb)} y1={y} y2={y} stroke="var(--ink-3)" opacity={e} />}
            {e > 0 && isNum(vb) && <g opacity={e}><GlyphShape stage={b.stage} x={x(vb)} y={y} size={7} hollow /></g>}
            {e > 0 && isNum(va) && <g opacity={e}><GlyphShape stage={a.stage} x={x(va)} y={y} size={7} /></g>}
          </g>
        );
      })}
      <XAxis scale={x} y={axisY} ticks={niceTicks(lo, hi, 4)} format={(v) => String(v)} title="cross-entropy F_CE_<domain>, nats (linear)" titleOffset={32} />
    </svg>
  );
}

function passText(bundle: Bundle, key: string): string | null {
  const p = getAny(bundle, ["reference", "passes", key]) as { docs?: number; tokens?: number } | null;
  if (!p || typeof p !== "object") return null;
  const parts: string[] = [];
  if (isNum(p.docs)) parts.push(`${fmtCount(p.docs)} docs`);
  if (isNum(p.tokens)) parts.push(`${fmtCount(p.tokens)} tokens`);
  return parts.length ? parts.join(" · ") : null;
}

export default function TeacherForcing({ bundle, reducedMotion }: ExplainerProps) {
  const col = collapseSpecimen(bundle);
  const sp = specimenPair(bundle);
  const defaults = [col?.id ?? null, sp?.A.id ?? null];
  const [ids, setIds] = useState<(string | null)[]>(defaults);
  const [M, C] = resolveIds(bundle, ids, eligible);
  const st = useStepper(DURS, reducedMotion);
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const W = Math.min(640, width);
  const side = W >= 560;
  const lw = side ? (W - 28) / 2 : W;
  const cells = useMemo(() => cellLayout("tbb-teacher-forcing", lw), [lw]);
  const con = useMemo(() => (M ? geometricWithEntropy(fp(M, "F_H") ?? 1, 64) : null), [M]);
  const bins = M ? binsOf(M) : null;
  // per forced step: which confidence bin gets the count (drawn from the real bin shares), which rank was real
  const draws = useMemo(() => {
    if (!M || !bins || !con) return null;
    const r = rng(`tf:${M.id}`);
    const read = Array.from({ length: READ_STEPS }, () => ({ bin: drawIndex(bins.map((b) => b[2]), r()), rank: drawIndex(con.p.slice(0, 8), r()) }));
    const write = Array.from({ length: WRITE_STEPS }, () => drawIndex(con.p.slice(0, 8), r()));
    return { read, write };
  }, [M, bins, con]);
  if (!M || !C || !bins || !con || !draws) return <p className="pending">No checkpoint with top-1 reliability bins and own-sample entropy in this bundle.</p>;

  const at = st.at;
  const spark = con.p.slice(0, 8);
  // step 2: read cursor
  const rp = at(1) * READ_STEPS;
  const readCursor = at(2) > 0 ? READ_STEPS + (CELLS - READ_STEPS) * easeInOut(seg(at(2), 0, 0.5)) : at(0) > 0 ? rp : 0;
  const readFlash = at(1) > 0 && at(2) === 0 ? (rp % 1 < 0.75 ? 1 : 0) : 0;
  const readPick = at(1) > 0 && at(2) === 0 ? draws.read[Math.min(READ_STEPS - 1, Math.floor(rp))].rank : null;
  const units = Array(bins.length).fill(0) as number[];
  const nCounted = Math.min(READ_STEPS, Math.floor(rp + 0.25));
  for (let i = 0; i < nCounted; i++) units[draws.read[i].bin] += 1;
  const morph = easeInOut(seg(at(2), 0.2, 1));
  const total = bins.reduce((a, b) => a + b[2], 0);
  const counter = at(2) > 0 ? Math.round(nCounted + (total - nCounted) * morph) : nCounted;
  // step 5: own-sample cursor
  const wp = at(4) * WRITE_STEPS;
  const writeCursor = OPENER + Math.min(WRITE_STEPS, wp);
  const writeFlash = at(4) > 0 && at(4) < 1 ? (wp % 1 < 0.75 ? 1 : 0) : 0;
  const writePick = at(4) > 0 && at(4) < 1 ? draws.write[Math.min(WRITE_STEPS - 1, Math.floor(wp))] : null;
  const chipLit = (i: number) => (st.step > 3 ? true : st.step === 3 ? at(3) >= i / 4 : false);
  const chipCurrent = (i: number) => st.step === 3 && at(3) >= i / 4 && at(3) < (i + 1) / 4;

  const steps: StepSpec[] = [
    {
      title: "The same text, for every model",
      body: (
        <>
          Every checkpoint reads the same fixed documents. The strip stands for one document (grey blocks, not text), and the cursor sits before its
          first token.
        </>
      ),
      summary: "A fixed document, the same for every model; the cursor sits before the first token.",
    },
    {
      title: "Read, never write",
      body: (
        <>
          At each position the model gives its full next-token distribution (the sparkline). Then the document’s real token is forced in, whatever
          the model predicted. One count drops into a histogram of top-1 confidence.
        </>
      ),
      summary: "At each position the distribution is recorded and the real token is forced in; one count drops into the confidence histogram.",
    },
    {
      title: "Fast-forward",
      body: (
        <>
          Over the whole post-cutoff pass the histogram fills to the exact shape of {M.label}’s real counts, and the counter runs to{" "}
          <Num path={path(M, "selfboot.reliability.bins")} value={total} fmt="count" derived="Σ bins[i][2]" /> positions. Nothing is sampled and
          nothing is judged.
        </>
      ),
      summary: `The histogram fills to the real counts over ${fmtCount(total)} positions of post-cutoff text.`,
    },
    {
      title: "Four corpora, four questions",
      body: (
        <>
          Pile text is in most pretraining sets, so it measures recall plus calibration. Wikipedia and GitHub measure memorisation. Post-cutoff text
          has nothing recallable and drives the calibration scores. Rare genres probe off-distribution behaviour.
        </>
      ),
      summary: "Four teacher-forced passes: Pile, Wikipedia and GitHub, post-cutoff text, rare genres.",
    },
    {
      title: "Now let the model write",
      body: (
        <>
          In the own-sample pass the next token is drawn from the model’s distribution and appended, at temperature 1, and sampling continues past
          end-of-text. Free-running entropy from a bare BOS is <N m={M} k={fk("roll_H_bos")} f="nats" /> against{" "}
          <N m={M} k={fk("F_H")} f="nats" /> teacher-forced; <N m={M} k={fk("roll_frac_H<0.1")} f="pct" /> of its own steps are near-deterministic
          (H &lt; 0.1). See <a href="/findings#f4">Finding 4</a>.
        </>
      ),
      summary: `Free-running entropy ${tx(M, fk("roll_H_bos"), "nats")} against teacher-forced ${tx(M, fk("F_H"), "nats")}; ${tx(M, fk("roll_frac_H<0.1"), "pct")} of steps below 0.1 nats.`,
    },
    {
      title: "Averages per domain",
      body: (
        <>
          Teacher forcing reduces to one average per domain. {M.label} (filled) and {C.label} (hollow) differ by genre, but cross-entropy alone
          cannot say whether a model is miscalibrated: that needs its entropy too. See <a href="#calibration-gap">the calibration gap</a>.
        </>
      ),
      summary: `Cross-entropy per post-cutoff domain for ${M.label} and ${C.label}.`,
    },
  ];

  const laneH = 64 + 4 * 22 + 6;
  const histTop = laneH + 14;
  const histH = 64 + 34;
  const panelH = histTop + histH + 8;
  const own = (
    <g>
      <Lane width={lw} title="Own sample" sub="the model writes; the next token is drawn" cells={cells} cursor={writeCursor} mode="own" spark={spark} pick={writePick} flash={writeFlash} on={at(4) > 0} />
      <text x={0} y={laneH + 8} className="xp-tag">
        first {OPENER} blocks: a document opener
      </text>
      <g transform={`translate(0,${histTop + 10})`} opacity={at(4) > 0 ? 1 : 0.35}>
        <EntropyBars width={lw} m={M} prog={easeSettle(seg(at(4), 0.3, 1))} />
      </g>
    </g>
  );
  const tf = (
    <g>
      <Lane width={lw} title="Teacher-forced" sub="the document is fed in; the real token is forced" cells={cells} cursor={readCursor} mode="tf" spark={spark} pick={readPick} flash={readFlash} on={at(1) > 0} />
      <g transform={`translate(0,${histTop})`}>
        <Histogram width={lw} bins={bins} units={units} morph={morph} label="top-1 confidence (10 bins)" />
        <text x={0} y={-4} className="ink">
          {fmtCount(counter)} positions
        </text>
      </g>
    </g>
  );
  const figure = (
    <div ref={ref}>
      <svg width={W} height={side ? panelH + 14 : panelH * 2 + 36} viewBox={`0 0 ${W} ${side ? panelH + 14 : panelH * 2 + 36}`}>
        <g transform="translate(0,4)">{tf}</g>
        <g transform={side ? `translate(${lw + 28},4)` : `translate(0,${panelH + 28})`}>{own}</g>
        {side ? (
          <Tag x={W} y={panelH + 12} anchor="end">
            strips and sparkline schematic; histogram counts and entropies from bundle
          </Tag>
        ) : (
          <>
            <Tag x={0} y={panelH * 2 + 20}>
              strips and sparkline schematic;
            </Tag>
            <Tag x={0} y={panelH * 2 + 34}>
              histogram counts and entropies from bundle
            </Tag>
          </>
        )}
      </svg>
      <ul className="xp-chips" aria-label="Teacher-forced passes">
        {PASSES.map((p, i) => (
          <li key={p.key} className={`xp-chip${chipLit(i) ? " lit" : ""}`} aria-current={chipCurrent(i) ? "true" : undefined}>
            <span className="mono">{p.name}</span> · {p.source}
            {passText(bundle, p.key) ? <span className="ink3"> · {passText(bundle, p.key)}</span> : null}
          </li>
        ))}
      </ul>
      <div className={"xp-sub" + (st.step >= 5 ? "" : " future")}>
        <p className="xp-sub-label">
          Cross-entropy per post-cutoff domain ·{" "}
          <InlineGlyph stage={M.stage} size={7} />{" "}
          {M.label} ·{" "}
          <InlineGlyph stage={C.stage} size={7} hollow />{" "}
          {C.label}
        </p>
        <DomainDots width={W} a={M} b={C} prog={at(5)} />
      </div>
    </div>
  );
  const dk = domainKeys(M);
  const label = `Teacher forcing for ${M.label}: ${fmtCount(total)} post-cutoff positions in 10 top-1 confidence bins; free-running entropy ${tx(M, fk("roll_H_bos"), "nats")} against teacher-forced ${tx(M, fk("F_H"), "nats")}.`;
  return (
    <ExplainerShell
      id="teacher-forcing"
      label="Plate B · Teacher forcing vs the model’s own samples"
      standfirst="Teacher forcing reads a fixed text and records the distribution at every position; the own-sample pass lets the model write."
      st={st}
      steps={steps}
      picker={
        <ModelPicker
          bundle={bundle}
          eligible={eligible}
          presets={col && sp ? [{ label: "Collapse specimen vs A", ids: [col.id, sp.A.id], onSelect: () => setIds([col.id, sp.A.id]) }] : []}
          slots={[
            { key: "M", label: "Model", value: M.id, model: M, onChange: (id) => setIds([id, C.id]) },
            { key: "C", label: "Compare", value: C.id, model: C, hollow: true, onChange: (id) => setIds([M.id, id]) },
          ]}
          note="Default: the pre-anneal checkpoint with the most near-deterministic own-sample steps, against specimen A."
        />
      }
      figure={figure}
      figureLabel={label}
      caption={
        <>
          The strips stand for one document and are schematic, as is the sparkline (top 8 of a distribution constructed to the model’s F_H). The
          first counts are drawn from the real bin shares; the histogram then fills to the exact selfboot.reliability.bins counts, top-1 reliability
          on post-cutoff text. Pass sizes are shown when the bundle carries reference.passes.
        </>
      }
      sources={[
        `models[${M.id}].selfboot.reliability.bins[*][2]`,
        `models[*].fingerprint.F_H, roll_H_bos, ["roll_frac_H<0.1"]`,
        `models[*].fingerprint.F_CE_<domain>`,
      ]}
      data={[
        {
          columns: ["confidence bin", "positions", "mean confidence", "accuracy"],
          numeric: [false, true, true, true],
          rows: bins.map((b) => [`${fmtNum(b[0], "num2")}–${fmtNum(b[1], "num2")}`, fmtCount(b[2]), fmtNum(b[3], "num3"), fmtNum(b[4], "num3")]),
        },
        {
          columns: ["field", M.label, C.label],
          numeric: [false, true, true],
          rows: [
            ["F_H (teacher-forced)", tx(M, fk("F_H"), "nats"), tx(C, fk("F_H"), "nats")],
            ["roll_H_bos (free-running)", tx(M, fk("roll_H_bos"), "nats"), tx(C, fk("roll_H_bos"), "nats")],
            ["roll_frac_H<0.1", tx(M, fk("roll_frac_H<0.1"), "pct"), tx(C, fk("roll_frac_H<0.1"), "pct")],
            ...dk.map((k) => [domainName(k) ?? k, tx(M, fk(k), "nats"), tx(C, fk(k), "nats")]),
          ],
        },
      ]}
      numbers={[
        { label: `${M.label} positions (Σ bins counts)`, path: path(M, "selfboot.reliability.bins"), fmt: "count", value: total, derived: "Σ bins[i][2]" },
        pn(`${M.label} F_H`, M, fk("F_H"), "nats"),
        pn(`${M.label} roll_H_bos`, M, fk("roll_H_bos"), "nats"),
        pn(`${M.label} roll_frac_H<0.1`, M, fk("roll_frac_H<0.1"), "pct"),
      ]}
    />
  );
}


