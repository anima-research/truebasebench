/**
 * useStepper: the one driver for every explainer (DESIGN §8 shared mechanics, §9).
 *
 * - An explainer is a list of discrete steps; `t` is the 0..1 progress of the current step's animation.
 *   Earlier steps are always drawn at their final state, later steps not at all.
 * - Plays once, the first time ≥ 50% of the observed element has been visible for 400 ms; holds the final state.
 * - Suspends while the element is off-screen or the document is hidden; resumes when it is back.
 * - Reduced motion: starts at the final state, no autoplay, `t` is always 1. Step and Play still work, switching
 *   states instantly (Play dwells on each state for REDUCED_DWELL ms).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const AUTOPLAY_DELAY = 400;
export const REDUCED_DWELL = 1500;

export interface Stepper {
  n: number;
  step: number;
  /** progress of the current step, 0..1 (always 1 under reduced motion) */
  t: number;
  playing: boolean;
  reduced: boolean;
  /** attach to the element whose visibility drives autoplay/suspend */
  ref: React.RefObject<HTMLDivElement>;
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  prev(): void;
  replay(): void;
  goto(k: number): void;
  /** progress of step k as drawn now: 1 for past steps, t for the current one, 0 for later ones */
  at(k: number): number;
}

type Mode = "idle" | "play" | "single";

function docHidden(): boolean {
  try {
    return typeof document !== "undefined" && document.hidden;
  } catch {
    return false;
  }
}

export function useStepper(durations: number[], reduced: boolean): Stepper {
  const n = durations.length;
  const durs = useRef(durations);
  durs.current = durations;
  const [pos, setPos] = useState<{ step: number; t: number }>(() => (reduced ? { step: n - 1, t: 1 } : { step: 0, t: 0 }));
  const posRef = useRef(pos);
  posRef.current = pos;
  const [mode, setMode] = useState<Mode>("idle");
  const [inView, setInView] = useState(false);
  const [half, setHalf] = useState(false);
  const [hidden, setHidden] = useState(docHidden);
  const started = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  // reduced motion switched on: jump to the final state
  useEffect(() => {
    if (reduced) {
      setMode("idle");
      setPos({ step: n - 1, t: 1 });
    }
  }, [reduced, n]);

  // visibility
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // no observer: show the final state rather than an empty figure
      started.current = true;
      setPos({ step: n - 1, t: 1 });
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const vh = window.innerHeight || 1;
          setInView(e.isIntersecting);
          setHalf(e.isIntersecting && (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= 0.5 * vh));
        }
      },
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [n]);

  useEffect(() => {
    const on = () => setHidden(docHidden());
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // autoplay once
  useEffect(() => {
    if (reduced || started.current || !half || hidden) return;
    const id = window.setTimeout(() => {
      if (started.current) return;
      started.current = true;
      setPos({ step: 0, t: 0 });
      setMode("play");
    }, AUTOPLAY_DELAY);
    return () => window.clearTimeout(id);
  }, [half, hidden, reduced]);

  // animation loop
  useEffect(() => {
    if (mode === "idle" || !inView || hidden) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const cur = posRef.current;
      const d = reduced ? REDUCED_DWELL : Math.max(1, durs.current[cur.step] ?? 600);
      let t = cur.t + dt / d;
      let step = cur.step;
      let done = false;
      if (t >= 1) {
        if (mode === "play" && step < n - 1) {
          step += 1;
          t = 0;
        } else {
          t = 1;
          done = true;
        }
      }
      const next = { step, t };
      posRef.current = next;
      setPos(next);
      if (done) setMode("idle");
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, inView, hidden, reduced, n]);

  const goto = useCallback(
    (k: number) => {
      const step = Math.max(0, Math.min(n - 1, k));
      started.current = true;
      const back = step < posRef.current.step;
      if (reduced || back) {
        setMode("idle");
        setPos({ step, t: 1 });
      } else {
        setPos({ step, t: 0 });
        setMode("single");
      }
    },
    [n, reduced],
  );

  const replay = useCallback(() => {
    started.current = true;
    setPos({ step: 0, t: 0 });
    setMode("play");
  }, []);

  const play = useCallback(() => {
    started.current = true;
    const cur = posRef.current;
    if (cur.step === n - 1 && cur.t >= 1) {
      setPos({ step: 0, t: 0 });
    } else if (cur.t >= 1 && cur.step < n - 1) {
      setPos({ step: cur.step + 1, t: 0 });
    }
    setMode("play");
  }, [n]);

  const pause = useCallback(() => setMode("idle"), []);

  const playing = mode === "play";
  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play]);
  const next = useCallback(() => goto(posRef.current.step + 1), [goto]);
  const prev = useCallback(() => goto(posRef.current.step - 1), [goto]);

  const t = reduced ? 1 : pos.t;
  return useMemo(
    () => ({
      n,
      step: pos.step,
      t,
      playing,
      reduced,
      ref,
      play,
      pause,
      toggle,
      next,
      prev,
      replay,
      goto,
      at: (k: number) => (k < pos.step ? 1 : k > pos.step ? 0 : t),
    }),
    [n, pos.step, t, playing, reduced, play, pause, toggle, next, prev, replay, goto],
  );
}
