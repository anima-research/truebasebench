import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { loadBundle } from "./load";
import type { Bundle, LoadedBundle } from "./types";

type State =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; loaded: LoadedBundle };

const Ctx = createContext<{ state: State; retry: () => void }>({ state: { status: "loading" }, retry: () => {} });

export function BundleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const run = useCallback((force: boolean) => {
    setState({ status: "loading" });
    loadBundle(force).then(
      (loaded) => setState({ status: "ready", loaded }),
      (e: unknown) => setState({ status: "error", error: e instanceof Error ? e.message : String(e) }),
    );
  }, []);
  useEffect(() => run(false), [run]);
  return <Ctx.Provider value={{ state, retry: () => run(true) }}>{children}</Ctx.Provider>;
}

export function useBundleState() {
  return useContext(Ctx);
}

/** Only call under <RequireBundle>. */
export function useBundle(): Bundle {
  const { state } = useContext(Ctx);
  if (state.status !== "ready") throw new Error("bundle not loaded");
  return state.loaded.bundle;
}
export function useLoaded(): LoadedBundle {
  const { state } = useContext(Ctx);
  if (state.status !== "ready") throw new Error("bundle not loaded");
  return state.loaded;
}
