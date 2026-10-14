/**
 * Plate F7b: exact instruction mass (prior.instr_mass, log axis) against the sampled marker rate
 * (fingerprint.roll_instr_marker_rate, %). Modelled on GapPriorScatter: stage glyphs, one tooltip order, no fitted
 * line (the point is that the two do not rank alike). Checkpoints flagged `prior.unreliable` are hollow; the
 * marker rate's 95% interval is a vertical whisker when the bundle carries it.
 */
import { CiWhisker, tipLines, tipTitle } from "../../../charts/findings/common";
import { fmtMass } from "../../../charts/TailPriorCharts";
import { XAxis, YAxis } from "../../../components/Axis";
import { ChartFrame, Mark, TipBody } from "../../../components/Chart";
import { GlyphShape } from "../../../components/Glyph";
import { fp, get, path } from "../../../data/bundle";
import { ciBounds } from "../../../data/ci";
import type { Model } from "../../../data/types";
import { fmt, fmtTick, isNum } from "../../../lib/numfmt";
import { linear, log10Scale, niceTicks, textWidth } from "../../../lib/scale";
import { supExp } from "../../../charts/TailPriorCharts";

export const MASS_KEY = "prior.instr_mass";
export const RATE_KEY = "roll_instr_marker_rate";
export const massOf = (m: Model) => get(m, MASS_KEY);
export const rateOf = (m: Model) => fp(m, RATE_KEY);
export const unreliable = (m: Model) => !!m.prior?.unreliable;

export function PriorScatter({
  models,
  labelIds = [],
  labelOf,
}: {
  models: Model[];
  labelIds?: string[];
  labelOf: (m: Model) => string;
}) {
  const ms = models.filter((m) => isNum(massOf(m)) && isNum(rateOf(m)));
  const xs = ms.map((m) => massOf(m)!);
  const ys = ms.map((m) => rateOf(m)!);
  // decades from the lowest mass's decade up to 1 (a mass is a probability); nothing is off axis
  const lo = Math.max(
    1e-9,
    10 ** Math.floor(Math.log10(Math.max(1e-300, Math.min(...xs)))),
  );
  const aria =
    `Exact instruction mass against sampled marker rate for ${ms.length} checkpoints: ` +
    ms
      .map(
        (m) =>
          `${m.label} mass ${fmtMass(massOf(m))}, marker rate ${fmt(rateOf(m), "pct")}${unreliable(m) ? " (flagged unreliable)" : ""}`,
      )
      .join("; ");
  return (
    <ChartFrame ariaLabel={aria}>
      {(w) => {
        const L = 46;
        const T = 22;
        const Hh = Math.min(300, Math.max(220, w * 0.5));
        const x = log10Scale([lo, 1], [L, w - 14]);
        const y = linear(
          [0, Math.max(0.05, Math.max(...ys) * 1.1)],
          [T + Hh, T],
        );
        const p = (m: Model) => ({ x: x(massOf(m)!), y: y(rateOf(m)!) });
        const decades = x.ticks();
        const tickEvery = w < 480 && decades.length > 5 ? 2 : 1;
        const ticks = decades.filter(
          (_, i) => (decades.length - 1 - i) % tickEvery === 0,
        );
        return (
          <svg width={w} height={T + Hh + 46}>
            <XAxis
              scale={x}
              y={T + Hh}
              ticks={ticks}
              format={(v) => `10${supExp(Math.round(Math.log10(v)))}`}
              gridTop={T}
              title="exact instruction mass after the start token, P(document starts with a chat opener), log scale"
            />
            <YAxis
              scale={y}
              x={L}
              ticks={niceTicks(0, y.domain[1], 5)}
              format={(v) => fmtTick(v, { pct: true })}
              gridRight={w - 14}
              title="instruction-marker rate, bare-BOS samples"
            />
            {ms.map((m) => {
              const b = ciBounds(m, "prior_marker");
              const q = p(m);
              return b ? (
                <CiWhisker
                  key={"ci" + m.id}
                  x1={q.x}
                  x2={q.x}
                  y1={y(Math.max(0, b[0]))}
                  y2={y(Math.min(y.domain[1], b[1]))}
                />
              ) : null;
            })}
            {ms.map((m) => {
              const q = p(m);
              const startH = get(m, "prior.start.H");
              return (
                <Mark
                  key={m.id}
                  x={q.x}
                  y={q.y}
                  href={`/model/${encodeURIComponent(m.id)}`}
                  label={`${m.label} (${m.family}), ${m.stage}: instruction mass ${fmtMass(massOf(m))}, marker rate ${fmt(rateOf(m), "pct")}`}
                  tip={
                    <TipBody
                      title={tipTitle(m)}
                      lines={[
                        tipLines(m, "", null, "pct")[0],
                        `instruction mass ${fmtMass(massOf(m))}${unreliable(m) ? " (flagged unreliable)" : ""}`,
                        tipLines(
                          m,
                          "marker rate",
                          rateOf(m),
                          "pct",
                          "prior_marker",
                        )[1],
                        ...(isNum(startH)
                          ? [`start entropy ${fmt(startH, "nats")}`]
                          : []),
                      ]}
                      path={path(m, MASS_KEY)}
                    />
                  }
                >
                  <GlyphShape
                    stage={m.stage}
                    x={q.x}
                    y={q.y}
                    size={7}
                    hollow={unreliable(m)}
                  />
                </Mark>
              );
            })}
            {ms
              .filter((m) => labelIds.includes(m.id))
              .map((m) => {
                const q = p(m);
                const t = labelOf(m);
                const tw = textWidth(t);
                const right = q.x + 8 + tw <= w - 2;
                return (
                  <text
                    key={"lab" + m.id}
                    x={right ? q.x + 8 : q.x - 8}
                    y={q.y}
                    dy="0.32em"
                    textAnchor={right ? "start" : "end"}
                    className="halo"
                    style={{ fill: "var(--ink)" }}
                  >
                    {t}
                  </text>
                );
              })}
          </svg>
        );
      }}
    </ChartFrame>
  );
}
