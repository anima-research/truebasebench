/**
 * Plate F2b cell: the four sub-score lines of one family across its rungs (FindingCharts.ProfileChart with the F2 polish:
 * no per-cell y title — the plate prints 'sub-score (0–1)' once; end labels de-collided at 13px with a 1px --ink-3
 * leader from the line end to the label; the dash key lives in the plate caption, not here).
 */
import { ChartFrame } from "../../../components/Chart";
import { GlyphShape } from "../../../components/Glyph";
import { YAxis } from "../../../components/Axis";
import { rungShortLabels } from "../../../charts/FindingCharts";
import { SUB_META } from "../../../data/method";
import { SUB_KEYS, type Model } from "../../../data/types";
import { fmtNum, isNum } from "../../../lib/numfmt";
import { linear } from "../../../lib/scale";

const DASH: Record<string, string | undefined> = { calib: undefined, spread: "6 3", memo: "1.5 3", prior: "7 3 1.5 3" };

export function ProfileLines({ rungs }: { rungs: Model[] }) {
  const aria = `Sub-scores along ${rungs[0]?.family}: ` + SUB_KEYS.map((k) => `${SUB_META[k].name} ${rungs.map((r) => fmtNum(r.subscores?.[k]?.score ?? null, "score")).join(" → ")}`).join("; ");
  return (
    <ChartFrame ariaLabel={aria}>
      {(w) => {
        const L = 34;
        const R = 60;
        const T = 12;
        const H = 150;
        const GAP = 13;
        const x = linear([0, Math.max(1, rungs.length - 1)], [L + 8, w - R]);
        const y = linear([0, 1], [T + H, T]);
        const short = rungShortLabels(rungs, 14);
        const last = rungs[rungs.length - 1];
        const ends = SUB_KEYS.map((k) => ({ k, v: last?.subscores?.[k]?.score ?? null }));
        // de-collide end labels: GAP apart, top to bottom, then pushed back up so the last stays inside the plot
        const endOrder = ends.filter((e) => isNum(e.v)).sort((a, b) => b.v! - a.v!);
        const ys = endOrder.map((e) => y(e.v!));
        for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + GAP);
        const over = ys.length ? ys[ys.length - 1] - (T + H) : 0;
        if (over > 0) {
          ys[ys.length - 1] -= over;
          for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - GAP);
        }
        const xEnd = x(rungs.length - 1);
        return (
          <svg width={w} height={T + H + 70}>
            <YAxis scale={y} x={L} ticks={[0, 0.25, 0.5, 0.75, 1]} format={(v) => String(v)} gridRight={w - R} />
            {SUB_KEYS.map((k) => (
              <polyline
                key={k}
                points={rungs.map((r, i) => (isNum(r.subscores?.[k]?.score) ? `${x(i)},${y(r.subscores![k]!.score!)}` : "")).join(" ")}
                fill="none"
                stroke="var(--ink)"
                strokeWidth={1.5}
                strokeDasharray={DASH[k]}
              />
            ))}
            {rungs.map((r, i) => (
              <g key={r.id}>
                <GlyphShape stage={r.stage} x={x(i)} y={T + H + 10} size={8} />
                <text transform={`translate(${x(i)},${T + H + 22}) rotate(35)`} style={{ fontSize: 11 }}>
                  {short.get(r.id)}
                </text>
              </g>
            ))}
            {endOrder.map((e, i) => (
              <g key={e.k}>
                {/* leader from the line's end to its label; straight when the label did not move */}
                <line x1={xEnd + 3} y1={y(e.v!)} x2={w - R + 6} y2={ys[i]} stroke="var(--ink-3)" strokeWidth={1} />
                <text x={w - R + 9} y={ys[i]} dy="0.32em" style={{ fill: "var(--ink)" }}>
                  {SUB_META[e.k].name}
                </text>
              </g>
            ))}
          </svg>
        );
      }}
    </ChartFrame>
  );
}
