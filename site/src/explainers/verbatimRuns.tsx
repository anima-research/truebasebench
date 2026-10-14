/**
 * Explainer (d) Verbatim runs: recitation of the anneal mix (DESIGN §8 d).
 * D1 is an illustrative sequence built from the run rule (method.ts); D2's tapes fill exactly
 * round(X_runfrac_wiki × 1000) of 1 000 cells (arrangement schematic, seeded by model id); D3 is the memo ramp.
 */
import { useMemo, useState } from "react";
import type { ExplainerProps } from "./types";
import type { Model } from "../data/types";
import { fp, get, path } from "../data/bundle";
import { memoTriple, memoValue, STAGE_CODE } from "../data/derive";
import { RAMPS, RUN_H_MAX, RUN_MIN_LEN } from "../data/method";
import { useWidth } from "../components/Chart";
import { GlyphShape } from "../components/Glyph";
import { Num } from "../components/Num";
import { fmt, fmtNum, fmtTick, isNum } from "../lib/numfmt";
import { beeswarm, linear, niceTicks } from "../lib/scale";
import { ExplainerShell, Tag, type StepSpec } from "./kit/Shell";
import { ModelPicker } from "./kit/Picker";
import { useStepper } from "./kit/useStepper";
import { InlineGlyph } from "./kit/InlineGlyph";
import { easeSettle, rng, seg, stagger } from "./kit/anim";
import { RampPlot } from "./kit/RampPlot";
import { fk, full, N, pn, resolveIds, tx } from "./kit/num";

const DURS = [600, 2800, 1600, 3000, 700, 800, 700];
const TAPE = 1000;
const COLS = 40;
const ROWS = 25;

/** Which key supplies the memo value (X_runfrac_wiki, else the verbatim_run_frac_wiki fallback). */
function memoKey(m: Model): string {
  return isNum(fp(m, "X_runfrac_wiki")) ? "X_runfrac_wiki" : "verbatim_run_frac_wiki";
}
const eligible = (m: Model) => isNum(memoValue(m));

/** D1: the illustrative sequence, derived from the run rule: a run of RUN_MIN_LEN+1, a hesitation, a short streak, a tail. */
export function ruleSequence(minLen = RUN_MIN_LEN): { top1: boolean; lowH: boolean }[] {
  const short = Math.floor(minLen / 2) + 1;
  const seq: { top1: boolean; lowH: boolean }[] = [];
  for (let i = 0; i < minLen + 1; i++) seq.push({ top1: true, lowH: true });
  seq.push({ top1: true, lowH: false });
  for (let i = 0; i < short; i++) seq.push({ top1: true, lowH: true });
  seq.push({ top1: false, lowH: false });
  const tail = [
    { top1: true, lowH: true },
    { top1: true, lowH: false },
    { top1: false, lowH: true },
    { top1: true, lowH: true },
  ];
  for (const t of tail) if (seq.length < 32) seq.push(t);
  return seq;
}

/** Run lengths ending at each index, and which cells are inside qualifying runs. */
export function runsOf(seq: { top1: boolean; lowH: boolean }[], minLen = RUN_MIN_LEN) {
  const counter: number[] = [];
  let c = 0;
  for (const s of seq) {
    c = s.top1 && s.lowH ? c + 1 : 0;
    counter.push(c);
  }
  const inRun = seq.map(() => false);
  const brackets: [number, number][] = [];
  let i = 0;
  while (i < seq.length) {
    if (seq[i].top1 && seq[i].lowH) {
      let j = i;
      while (j + 1 < seq.length && seq[j + 1].top1 && seq[j + 1].lowH) j++;
      if (j - i + 1 >= minLen) {
        for (let q = i; q <= j; q++) inRun[q] = true;
        brackets.push([i, j]);
      }
      i = j + 1;
    } else i++;
  }
  return { counter, inRun, brackets };
}

/**
 * Tape arrangement: exactly `filled` of TAPE cells, as contiguous blocks of 16–64 (index order = left-to-right sweep),
 * placed by a PRNG seeded with the model id. Returns a boolean per cell.
 */
export function tapeCells(seed: string, filled: number): boolean[] {
  const r = rng(seed);
  const n = Math.max(0, Math.min(TAPE, filled));
  const blocks: number[] = [];
  let left = n;
  while (left > 0) {
    let len = Math.min(left, 16 + Math.floor(r() * 49));
    if (left - len > 0 && left - len < 16) len = left;
    blocks.push(len);
    left -= len;
  }
  const empty = TAPE - n;
  const w = Array.from({ length: blocks.length + 1 }, () => 0.2 + r());
  const z = w.reduce((a, b) => a + b, 0);
  const gaps = w.map((x) => Math.floor((x / z) * empty));
  let rem = empty - gaps.reduce((a, b) => a + b, 0);
  for (let i = 0; rem > 0; i = (i + 1) % gaps.length, rem--) gaps[i] += 1;
  const out: boolean[] = [];
  blocks.forEach((b, i) => {
    for (let q = 0; q < gaps[i]; q++) out.push(false);
    for (let q = 0; q < b; q++) out.push(true);
  });
  for (let q = 0; q < gaps[blocks.length]; q++) out.push(false);
  return out.slice(0, TAPE);
}

function Tape({ m, share, cells, pitch, sweep }: { m: Model; share: number; cells: boolean[]; pitch: number; sweep: number }) {
  const s = Math.max(1, pitch - 1);
  const upto = sweep * TAPE;
  let count = 0;
  for (let i = 0; i < TAPE && i < upto; i++) if (cells[i]) count++;
  const w = COLS * pitch;
  const h = ROWS * pitch;
  return (
    <div className="xp-tape">
      <p className="xp-tape-head">
        <InlineGlyph stage={m.stage} size={8} /> <span className="b">{m.label}</span> <span className="ink3">· {STAGE_CODE[m.stage]}</span>
        <span className="xp-tape-count">{sweep >= 1 ? fmt(share, "pct") : fmt(count / TAPE, "pct")}</span>
      </p>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        {cells.map((f, i) => {
          const col = Math.floor(i / ROWS);
          const row = i % ROWS;
          const shown = i < upto;
          return (
            <rect
              key={i}
              x={col * pitch}
              y={row * pitch}
              width={s}
              height={s}
              fill={shown ? (f ? "var(--bar)" : "var(--track)") : "var(--track)"}
              opacity={shown ? 1 : 0.35}
            />
          );
        })}
        {sweep > 0 && sweep < 1 && <line x1={Math.floor(upto / ROWS) * pitch} x2={Math.floor(upto / ROWS) * pitch} y1={-2} y2={h + 2} stroke="var(--ink)" />}
      </svg>
    </div>
  );
}

export default function VerbatimRuns({ bundle, reducedMotion }: ExplainerProps) {
  const trio = memoTriple(bundle);
  const [ids, setIds] = useState<(string | null)[]>(trio ? trio.map((m) => m.id) : [null, null, null]);
  const models = resolveIds(bundle, ids.length === 3 ? ids : [...ids, null, null, null].slice(0, 3), eligible).filter(Boolean);
  const [corpus, setCorpus] = useState<"auto" | "wiki" | "gh">("auto");
  const st = useStepper(DURS, reducedMotion);
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const W = Math.min(640, width);
  const seq = useMemo(() => ruleSequence(), []);
  const runs = useMemo(() => runsOf(seq), [seq]);
  const useGh = corpus === "gh" || (corpus === "auto" && st.step === 4);
  const shareOf = (m: Model) => (useGh ? fp(m, "X_runfrac_gh") : memoValue(m));
  const tapes = useMemo(
    () => models.map((m) => tapeCells(`${m.id}:${useGh ? "gh" : "wiki"}`, Math.round((useGh ? fp(m, "X_runfrac_gh") ?? 0 : memoValue(m) ?? 0) * TAPE))),
    [models.map((m) => m.id).join("|"), useGh],
  );
  if (models.length < 1) return <p className="pending">No checkpoint with a verbatim-run share in this bundle.</p>;

  const at = st.at;
  // ---------- D1 ----------
  const nCells = seq.length;
  const short = Math.floor(RUN_MIN_LEN / 2) + 1;
  const firstRun = RUN_MIN_LEN + 1;
  const revealed = st.step === 0 ? (at(0) > 0 ? 1 : 0) : st.step === 1 ? 1 + Math.floor(at(1) * (firstRun - 1) + 1e-9) : st.step === 2 ? firstRun + Math.floor(at(2) * (nCells - firstRun) + 1e-9) : nCells;
  const L1 = 0;
  const cw = (W - L1) / nCells;
  const tokY = 40;
  const ind1 = tokY + 36;
  const ind2 = ind1 + 28;
  const brY = ind2 + 18;
  const d1H = brY + 30;
  const cur = Math.max(0, revealed - 1);
  const cnt = revealed > 0 ? runs.counter[cur] : 0;
  const cursorX = L1 + revealed * cw;

  // ---------- strip of everyone ----------
  const all = bundle.models.filter(eligible);
  const maxV = Math.max(RAMPS.memo[1], ...all.map((m) => memoValue(m)!));
  const sx = linear([0, maxV * 1.04], [8, W - 8]);
  const slots = beeswarm(
    all.map((m) => sx(memoValue(m)!)),
    7,
    3,
  );
  const top3 = [...all].sort((a, b) => memoValue(b)! - memoValue(a)!).slice(0, 3);
  const maxM = top3[0];
  const minM = [...all].sort((a, b) => memoValue(a)! - memoValue(b)!)[0];

  const vals = models.map((m) => memoValue(m)!);
  const fullest = models[vals.indexOf(Math.max(...vals))];
  const mid = models[1];

  const tapeSide = W >= 560;
  const pitch = tapeSide ? Math.max(3, Math.floor(((W - 32) / 3 / COLS) * 10) / 10) : Math.max(4, Math.floor(Math.min(W, 400) / COLS));
  const sweep = st.step >= 4 ? 1 : st.step === 3 ? at(3) : 0;

  const memoN = (m: Model) => <N m={m} k={fk(memoKey(m))} f="pct" />;
  const steps: StepSpec[] = [
    {
      title: "A confident, correct token",
      body: (
        <>
          A token counts toward a run when the model’s top-1 prediction is the real token <em>and</em> its entropy is below{" "}
          <Num path="method.RUN_H_MAX" value={RUN_H_MAX} fmt="num2" def /> nats. Cell 1 passes both tests, so the counter reads 1.
        </>
      ),
      summary: "Cell 1: top-1 is the real token and entropy is below the threshold; run length 1.",
    },
    {
      title: "A run is a streak",
      body: (
        <>
          The counter climbs while both tests keep passing. At <Num path="method.RUN_MIN_LEN" value={RUN_MIN_LEN} fmt="count" def /> consecutive
          tokens the streak becomes a verbatim run: the model is reciting rather than predicting.
        </>
      ),
      summary: `The streak reaches ${RUN_MIN_LEN} tokens and is bracketed as a verbatim run.`,
    },
    {
      title: "The rule bites",
      body: (
        <>
          At cell {firstRun + 1} the model still ranks the real token first but hesitates (H above the threshold), so the counter resets to 0. The
          following streak of {short} never reaches {RUN_MIN_LEN} and gets no bracket.
        </>
      ),
      summary: `A hesitation resets the counter; the next streak of ${short} gets no bracket.`,
    },
    {
      title: "Share of Wikipedia inside runs",
      body: (
        <>
          Each tape stands for 1 000 Wikipedia tokens; filled cells lie inside verbatim runs.{" "}
          {models.map((m, i) => (
            <span key={m.id}>
              {m.label}: {memoN(m)}
              {i < models.length - 1 ? "; " : ". "}
            </span>
          ))}
          {mid && fullest.id === mid.id ? `The middle checkpoint, ${mid.label}, is the fullest.` : `${fullest.label} is the fullest.`}
        </>
      ),
      summary: `Share of Wikipedia tokens inside verbatim runs: ${models.map((m) => `${m.label} ${fmt(memoValue(m), "pct")}`).join(", ")}.`,
    },
    {
      title: "Why Wikipedia, not code",
      body: (
        <>
          On GitHub the shares are{" "}
          {models.map((m, i) => (
            <span key={m.id}>
              <N m={m} k={fk("X_runfrac_gh")} f="pct" />
              {i < models.length - 1 ? ", " : ""}
            </span>
          ))}
          . Code is predictable by nature, so long confident streaks are expected; it is reported but not scored.
        </>
      ),
      summary: `GitHub shares: ${models.map((m) => fmt(fp(m, "X_runfrac_gh"), "pct")).join(", ")}; reported, not scored.`,
    },
    {
      title: "Everyone",
      body: (
        <>
          Across all {all.length} checkpoints the share runs from <N m={minM} k={fk(memoKey(minM))} f="pct" /> ({full(minM)}) to{" "}
          <N m={maxM} k={fk(memoKey(maxM))} f="pct" /> ({full(maxM)}). The memo ramp
          scores 1 at or below <Num path="method.RAMPS.memo[0]" value={RAMPS.memo[0]} fmt="pct" def /> and 0 at or above{" "}
          <Num path="method.RAMPS.memo[1]" value={RAMPS.memo[1]} fmt="pct" def />.
        </>
      ),
      summary: `All checkpoints: from ${fmt(memoValue(minM), "pct")} to ${fmt(memoValue(maxM), "pct")}.`,
    },
    {
      title: "Onto the ramp",
      body: (
        <>
          Memo sub-scores:{" "}
          {models.map((m, i) => (
            <span key={m.id}>
              {m.label} <N m={m} k={["subscores", "memo", "score"]} f="score" />
              {i < models.length - 1 ? ", " : "."}
            </span>
          ))}
        </>
      ),
      summary: `Memo sub-scores: ${models.map((m) => `${m.label} ${tx(m, ["subscores", "memo", "score"], "score")}`).join(", ")}.`,
    },
  ];

  const figure = (
    <div ref={ref}>
      {/* D1 */}
      <svg width={W} height={d1H} viewBox={`0 0 ${W} ${d1H}`}>
        <text x={0} y={11} className="panel-label">
          D1 · The rule
        </text>
        <Tag x={W} y={11} anchor="end">
          illustrative sequence
        </Tag>
        {revealed > 0 && (
          <text x={Math.max(0, Math.min(W - 90, cursorX - 45))} y={30} className="mono ink">
            run length {cnt}
          </text>
        )}
        {seq.map((c, i) => {
          const shown = i < revealed;
          const x0 = L1 + i * cw;
          const run = runs.inRun[i] && shown && (i < firstRun ? revealed >= RUN_MIN_LEN : true);
          return (
            <g key={i}>
              <rect
                x={x0 + 1}
                y={tokY}
                width={Math.max(1, cw - 2)}
                height={18}
                fill={shown ? (run ? "var(--hl)" : "var(--track)") : "none"}
                stroke={shown ? "var(--rule-strong)" : "var(--rule)"}
                strokeDasharray={shown ? undefined : "2 2"}
              />
              {shown && (
                <>
                  <rect x={x0 + cw / 2 - 3.5} y={ind1} width={7} height={7} fill={c.top1 ? "var(--ink)" : "none"} stroke="var(--ink-3)" />
                  <rect x={x0 + cw / 2 - 3.5} y={ind2} width={7} height={7} fill={c.lowH ? "var(--ink)" : "none"} stroke="var(--ink-3)" />
                </>
              )}
            </g>
          );
        })}
        {revealed > 0 && revealed < nCells && <line x1={cursorX} x2={cursorX} y1={tokY - 4} y2={tokY + 22} stroke="var(--ink)" strokeWidth={2} />}
        <text x={0} y={ind1 - 4} className="ink2">
          top-1 = real token
        </text>
        <text x={0} y={ind2 - 4} className="ink2">
          H &lt; {fmtNum(RUN_H_MAX, "num2")} nats
        </text>
        {runs.brackets.map(([a, b]) => {
          if (revealed < a + RUN_MIN_LEN) return null;
          const x0 = L1 + a * cw + 1;
          const x1 = L1 + Math.min(b + 1, revealed) * cw - 1;
          return (
            <g key={a}>
              <path d={`M${x0},${brY - 5} V${brY} H${x1} V${brY - 5}`} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
              <text x={x0} y={brY + 14} className="ink b">
                verbatim run (≥ {RUN_MIN_LEN})
              </text>
            </g>
          );
        })}
        {revealed >= firstRun + 1 + short && (
          <text x={L1 + (firstRun + 1) * cw} y={brY + 14} className="it">
            streak of {short}: no bracket
          </text>
        )}
      </svg>

      {/* D2 */}
      <div className="xp-sub">
        <div className="xp-sub-row">
          <p className="xp-sub-label">D2 · The tape: 1 000 {useGh ? "GitHub" : "Wikipedia"} tokens each</p>
          <div className="seg" role="group" aria-label="Corpus">
            <button type="button" className="btn" aria-pressed={!useGh} onClick={() => setCorpus("wiki")}>
              Wikipedia
            </button>
            <button type="button" className="btn" aria-pressed={useGh} onClick={() => setCorpus("gh")}>
              GitHub
            </button>
          </div>
        </div>
        <div className={tapeSide ? "xp-tapes side" : "xp-tapes"}>
          {models.map((m, i) => (
            <Tape key={m.id} m={m} share={shareOf(m) ?? 0} cells={tapes[i] ?? []} pitch={pitch} sweep={sweep} />
          ))}
        </div>
        <p className="xp-tag-line">arrangement schematic; share from bundle</p>
      </div>

      {/* strip of everyone */}
      <div className={"xp-sub" + (st.step >= 5 ? "" : " future")}>
        <p className="xp-sub-label">Every checkpoint · share of Wikipedia inside verbatim runs</p>
        <svg width={W} height={96} viewBox={`0 0 ${W} 96`}>
          <rect x={sx(0)} width={sx(RAMPS.memo[0]) - sx(0)} y={14} height={44} fill="var(--band)" />
          <line x1={sx(RAMPS.memo[1])} x2={sx(RAMPS.memo[1])} y1={14} y2={58} stroke="var(--ink-2)" strokeDasharray="3 2" />
          <text x={sx(RAMPS.memo[0]) + 3} y={10} className="ink2">
            score 1 at or below {fmtTick(RAMPS.memo[0], { pct: true })}
          </text>
          <text x={sx(RAMPS.memo[1]) + 3} y={70} className="ink2">
            score 0 at or above {fmtTick(RAMPS.memo[1], { pct: true })}
          </text>
          {all.map((m, i) => {
            const e = easeSettle(stagger(at(5), i, all.length, 0.4, 0.5));
            if (e <= 0) return null;
            const v = memoValue(m)!;
            const hiIdx = top3.indexOf(m);
            return (
              <g key={m.id} opacity={e}>
                <title>{`${full(m)}: ${fmt(v, "pct")}`}</title>
                <GlyphShape stage={m.stage} x={sx(v)} y={36 + slots[i] * 6} size={models.some((x) => x.id === m.id) ? 9 : 7} />
                {hiIdx >= 0 && e >= 1 && (
                  <text x={sx(v)} y={36 + slots[i] * 6 - 9} textAnchor={sx(v) > W - 80 ? "end" : "middle"} className="ink" style={{ fontSize: 10 }}>
                    {`${m.family.split(" ")[0]} ${m.label.replace(/\s*\(.*\)$/, "")}`}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={8} x2={W - 8} y1={58} y2={58} stroke="var(--rule-strong)" />
          {niceTicks(0, maxV * 1.04, W < 480 ? 4 : 6).map((t) => (
            <text key={t} x={sx(t)} y={84} textAnchor="middle">
              {fmtTick(t, { pct: true })}
            </text>
          ))}
        </svg>
      </div>

      {/* D3 */}
      <div className={"xp-sub" + (st.step >= 6 ? "" : " future")}>
        <p className="xp-sub-label">D3 · The memo ramp</p>
        <RampPlot
          k="memo"
          width={Math.min(W, 420)}
          items={models.map((m, i) => ({
            id: m.id,
            stage: m.stage,
            value: memoValue(m),
            score: get(m, ["subscores", "memo", "score"]),
            label: String(i + 1),
            name: full(m),
          }))}
          prog={{ glyph: at(6) > 0 ? 1 : 0, ramp: 1, drop: seg(at(6), 0, 0.6), readoff: 0 }}
          bar={false}
        />
        <ol className="xp-key">
          {models.map((m, i) => (
            <li key={m.id}>
              <span className="xp-key-n">{i + 1}</span> <InlineGlyph stage={m.stage} size={7} /> {m.label}{" "}
              <Num path={path(m, ["subscores", "memo", "score"])} fmt="score" />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );

  const fallback = models.filter((m) => memoKey(m) !== "X_runfrac_wiki");
  return (
    <ExplainerShell
      id="verbatim-runs"
      label="Plate D · Verbatim runs"
      standfirst="An anneal that up-weights a source teaches the model to recite it; the share of text inside long confident streaks measures that."
      st={st}
      steps={steps}
      picker={
        <ModelPicker
          bundle={bundle}
          eligible={eligible}
          presets={trio ? [{ label: "Memo triple (computed)", ids: trio.map((m) => m.id), onSelect: () => setIds(trio.map((m) => m.id)) }] : []}
          slots={models.map((m, i) => ({
            key: String(i),
            label: String(i + 1),
            value: m.id,
            model: m,
            onChange: (id: string) => setIds(models.map((x, j) => (j === i ? id : x.id))),
          }))}
          note="Default: the pre-anneal → annealed pair with the largest rise in Wikipedia verbatim share, plus the next post-trained rung."
        />
      }
      figure={figure}
      figureLabel={`Verbatim runs. ${models.map((m) => `${m.label}: ${fmt(memoValue(m), "pct")} of Wikipedia tokens in runs, memo score ${tx(m, ["subscores", "memo", "score"], "score")}`).join("; ")}.`}
      caption={
        <>
          D1 is an illustrative sequence built from the run rule (length ≥ {RUN_MIN_LEN}, H &lt; {fmtNum(RUN_H_MAX, "num2")} nats, top-1 = real
          token). Each D2 tape fills exactly round(share × 1 000) cells; the block arrangement is schematic, seeded by the model id.
          {fallback.length ? ` ${fallback.map((m) => m.label).join(", ")} use the verbatim_run_frac_wiki fallback.` : ""}
        </>
      }
      sources={["models[*].fingerprint.X_runfrac_wiki (verbatim_run_frac_wiki fallback), X_runfrac_gh", "models[*].subscores.memo.score", "method.RUN_MIN_LEN, RUN_H_MAX, RAMPS.memo"]}
      data={[
        {
          columns: ["checkpoint", "Wikipedia share", "GitHub share", "memo score"],
          numeric: [false, true, true, true],
          rows: models.map((m) => [full(m), fmt(memoValue(m), "pct"), tx(m, fk("X_runfrac_gh"), "pct"), tx(m, ["subscores", "memo", "score"], "score")]),
        },
        {
          columns: ["genre (Pile rare genres)", ...models.map((m) => `${m.label} verbatim share`)],
          numeric: [false, ...models.map(() => true)],
          rows: Array.from(new Set(models.flatMap((m) => Object.keys(m.weird ?? {})))).map((g) => [g, ...models.map((m) => fmt(m.weird?.[g]?.[1] ?? null, "pct"))]),
        },
        {
          columns: ["checkpoint", "stage", "Wikipedia share"],
          numeric: [false, false, true],
          rows: [...all].sort((a, b) => memoValue(b)! - memoValue(a)!).map((m) => [full(m), STAGE_CODE[m.stage], fmt(memoValue(m), "pct")]),
        },
      ]}
      numbers={[
        ...models.map((m) => pn(`${m.label} Wikipedia share`, m, fk(memoKey(m)), "pct")),
        ...models.map((m) => pn(`${m.label} GitHub share`, m, fk("X_runfrac_gh"), "pct")),
        ...models.map((m) => pn(`${m.label} memo score`, m, ["subscores", "memo", "score"], "score")),
        { label: "run length", path: "method.RUN_MIN_LEN", fmt: "count", value: RUN_MIN_LEN, def: true },
        { label: "run entropy threshold", path: "method.RUN_H_MAX", fmt: "num2", value: RUN_H_MAX, def: true },
      ]}
    />
  );
}
