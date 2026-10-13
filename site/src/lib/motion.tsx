import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadReduceMotion, saveReduceMotion } from "./prefs";

interface MotionState {
  /** true when prefers-reduced-motion: reduce OR the site's Reduce motion toggle is on */
  reducedMotion: boolean;
  /** the site toggle alone */
  toggle: boolean;
  setToggle: (on: boolean) => void;
}

const Ctx = createContext<MotionState>({ reducedMotion: false, toggle: false, setToggle: () => {} });

function mediaReduced(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const [media, setMedia] = useState(mediaReduced);
  const [toggle, setToggleState] = useState(loadReduceMotion);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-reduce-motion", toggle);
  }, [toggle]);
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return;
    }
    const on = () => setMedia(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  const setToggle = (on: boolean) => {
    saveReduceMotion(on);
    setToggleState(on);
  };
  return <Ctx.Provider value={{ reducedMotion: media || toggle, toggle, setToggle }}>{children}</Ctx.Provider>;
}

export function useMotion() {
  return useContext(Ctx);
}
export function useReducedMotion() {
  return useContext(Ctx).reducedMotion;
}
