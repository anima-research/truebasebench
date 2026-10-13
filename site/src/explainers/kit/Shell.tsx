/**
 * ExplainerShell: the band every explainer renders (DESIGN §7.3, §8): plate label, standfirst, the figure in the
 * main track, the Transport + picker + step list in the margin track (stacked under the figure below 1100px, with
 * the transport sticky at the viewport bottom), then caption, SourceLine, Data disclosure and "Numbers in this plate".
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Chevron, DataTable, SourceLine, type DataTableSpec } from "../../components/Plate";
import { Num } from "../../components/Num";
import type { Fmt } from "../../lib/numfmt";
import type { Stepper } from "./useStepper";
import "./explainers.css";

export interface StepSpec {
  title: string;
  /** 40–80 words of step prose; every measurement a <Num> */
  body: ReactNode;
  /** one plain sentence for the aria-live region, built from the same numbers */
  summary: string;
}

export interface PlateNumber {
  label: string;
  path: string;
  fmt: Fmt;
  value?: number | null;
  def?: boolean;
  derived?: string;
}

function Icon({ kind }: { kind: "play" | "pause" | "back" | "fwd" | "replay" }) {
  const common = { width: 12, height: 12, viewBox: "0 0 12 12", "aria-hidden": true as const };
  switch (kind) {
    case "play":
      return (
        <svg {...common}>
          <path d="M3 1.5v9l7-4.5z" fill="currentColor" />
        </svg>
      );
    case "pause":
      return (
        <svg {...common}>
          <rect x="2.5" y="1.5" width="2.5" height="9" fill="currentColor" />
          <rect x="7" y="1.5" width="2.5" height="9" fill="currentColor" />
        </svg>
      );
    case "back":
      return (
        <svg {...common}>
          <rect x="1.5" y="1.5" width="1.6" height="9" fill="currentColor" />
          <path d="M10.5 1.5v9l-6.5-4.5z" fill="currentColor" />
        </svg>
      );
    case "fwd":
      return (
        <svg {...common}>
          <path d="M1.5 1.5v9l6.5-4.5z" fill="currentColor" />
          <rect x="8.9" y="1.5" width="1.6" height="9" fill="currentColor" />
        </svg>
      );
    case "replay":
      return (
        <svg {...common}>
          <path d="M9.6 4.2A4 4 0 1 0 10 7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.6 1.4v3.6H7z" fill="currentColor" />
        </svg>
      );
  }
}

export function Transport({ st }: { st: Stepper }) {
  return (
    <div className="xp-transport" role="group" aria-label="Explainer transport">
      <button type="button" className="btn xp-tbtn" onClick={st.toggle} aria-label={st.playing ? "Pause" : "Play"}>
        <Icon kind={st.playing ? "pause" : "play"} />
      </button>
      <button type="button" className="btn xp-tbtn" onClick={st.prev} disabled={st.step === 0} aria-label="Step back">
        <Icon kind="back" />
      </button>
      <button type="button" className="btn xp-tbtn" onClick={st.next} disabled={st.step === st.n - 1} aria-label="Step forward">
        <Icon kind="fwd" />
      </button>
      <button type="button" className="btn xp-tbtn" onClick={st.replay} aria-label="Replay from step 1">
        <Icon kind="replay" />
      </button>
      <span className="xp-count" aria-hidden="true">
        step {st.step + 1} of {st.n}
      </span>
    </div>
  );
}

function StepList({ st, steps }: { st: Stepper; steps: StepSpec[] }) {
  const ref = useRef<HTMLOListElement>(null);
  // Keep the current step visible inside the scrolling step column (desktop) without scrolling the page.
  useEffect(() => {
    const ol = ref.current;
    const box = ol?.closest(".xp-st") as HTMLElement | null;
    const li = ol?.children[st.step] as HTMLElement | undefined;
    if (!box || !li || box.scrollHeight <= box.clientHeight) return;
    const top = li.offsetTop - ol!.offsetTop;
    if (top < box.scrollTop || top + li.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, top - 8);
  }, [st.step]);
  return (
    <ol className="xp-steps" ref={ref}>
      {steps.map((s, i) => {
        const state = i < st.step ? "past" : i === st.step ? "current" : "future";
        return (
          <li key={i} className={`xp-step ${state}`} aria-current={i === st.step ? "step" : undefined}>
            <button type="button" className="xp-step-title" onClick={() => st.goto(i)}>
              <span className="xp-step-n">{i + 1}</span> {s.title}
            </button>
            <div className="xp-step-body">{s.body}</div>
          </li>
        );
      })}
    </ol>
  );
}

function skipKeys(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, select, textarea, [role='slider'], [contenteditable='true']")) return true;
  if (key === " " && target.closest("button, a, summary")) return true;
  return false;
}

export function ExplainerShell({
  id,
  label,
  standfirst,
  st,
  steps,
  picker,
  figure,
  figureLabel,
  caption,
  sources,
  data,
  numbers,
}: {
  id: string;
  label: string;
  standfirst: ReactNode;
  st: Stepper;
  steps: StepSpec[];
  picker?: ReactNode;
  figure: ReactNode;
  /** data-generated sentence for the figure's accessible name */
  figureLabel: string;
  caption: ReactNode;
  sources: string[];
  data?: DataTableSpec | DataTableSpec[];
  numbers?: PlateNumber[];
}) {
  const live = steps[st.step]?.summary ?? "";
  // announce only after the first state change, so the page load does not read every plate out
  const [announce, setAnnounce] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setAnnounce(`Step ${st.step + 1} of ${st.n}: ${live}`);
  }, [st.step, st.n, live]);

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (skipKeys(e.target, e.key)) return;
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      st.toggle();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      st.next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      st.prev();
    }
  }
  const tables = data ? (Array.isArray(data) ? data : [data]) : [];
  return (
    <section className="xp" id={`explainer-${id}`} aria-label={label} onKeyDown={onKeyDown}>
      <p className="plate-label">{label}</p>
      <p className="xp-standfirst">{standfirst}</p>
      <div className="xp-grid">
        <div className="xp-col-main">
          <div
            className="xp-figure"
            ref={st.ref}
            tabIndex={0}
            role="group"
            aria-roledescription="animated figure"
            aria-label={`${figureLabel} Space plays or pauses; the arrow keys step.`}
          >
            <div role="img" aria-label={figureLabel}>
              {figure}
            </div>
          </div>
          <div className="xp-foot">
            <p className="caption">{caption}</p>
            <SourceLine paths={sources} />
            {tables.length > 0 && (
              <details className="data">
                <summary>
                  <Chevron /> Data
                </summary>
                {tables.map((t, i) => (
                  <div className="tbl-wrap" key={i}>
                    <DataTable spec={t} />
                  </div>
                ))}
              </details>
            )}
            {numbers && numbers.length > 0 && (
              <details className="data">
                <summary>
                  <Chevron /> Numbers in this plate ({numbers.length})
                </summary>
                <ul className="xp-numbers">
                  {numbers.map((x, i) => (
                    <li key={i}>
                      <span className="ink2">{x.label}</span> <Num path={x.path} fmt={x.fmt} value={x.value} def={x.def} derived={x.derived} />{" "}
                      <span className="mono ink3 xp-path">{x.def ? `definition · ${x.path}` : x.derived ? x.derived : x.path}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
        <div className="xp-col-side">
          <div className="xp-tr">
            <Transport st={st} />
          </div>
          {picker && <div className="xp-pk">{picker}</div>}
          <div className="xp-st">
            <StepList st={st} steps={steps} />
          </div>
        </div>
      </div>
      <div className="visually-hidden" aria-live="polite">
        {announce}
      </div>
    </section>
  );
}

/** A visible "constructed" / "schematic" / "illustrative" tag inside a figure (DESIGN §1.6, §11.5). */
export function Tag({ x, y, children, anchor = "start" }: { x: number; y: number; children: string; anchor?: "start" | "end" | "middle" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} className="xp-tag">
      {children}
    </text>
  );
}
