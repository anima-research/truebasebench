import { Component, Suspense, type ReactNode } from "react";
import { useBundle } from "../data/BundleContext";
import { useReducedMotion } from "../lib/motion";
import { registry } from "./index";
import { EXPLAINER_IDS, EXPLAINER_TITLES, type ExplainerId } from "./types";

export class Boundary extends Component<{ children: ReactNode; id: string }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { err: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (this.state.err)
      return (
        <p className="pending" role="note">
          Explainer “{this.props.id}” failed to render: {this.state.err}
        </p>
      );
    return this.props.children;
  }
}

/** Mounts registry[id] with {bundle, reducedMotion}; renders a labelled pending slot when absent. */
export function ExplainerSlot({ id }: { id: string }) {
  const bundle = useBundle();
  const reducedMotion = useReducedMotion();
  const known = (EXPLAINER_IDS as readonly string[]).includes(id);
  const C = known ? registry[id as ExplainerId] : undefined;
  if (!C)
    return (
      <div className="explainer-slot" id={`explainer-${id}`} data-explainer={id}>
        <p className="plate-label">Explainer · {id}</p>
        <p className="pending">
          {known ? `“${EXPLAINER_TITLES[id as ExplainerId]}”: animated explainer not yet mounted.` : `Unknown explainer id “${id}”.`}
        </p>
      </div>
    );
  return (
    <div data-explainer={id}>
      <Boundary id={id}>
        <Suspense fallback={<div className="explainer-slot"><p className="pending">Loading explainer…</p></div>}>
          <C bundle={bundle} reducedMotion={reducedMotion} />
        </Suspense>
      </Boundary>
    </div>
  );
}
