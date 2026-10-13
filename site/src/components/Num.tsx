import { useId, useState } from "react";
import { useBundleState } from "../data/BundleContext";
import { resolvePath } from "../data/bundle";
import { fmtNum, fmtRaw, isNum, NULL_TITLE, unitOf, type Fmt } from "../lib/numfmt";

/**
 * The only way prose shows a measurement (DESIGN §5). Renders a formatted value with a dotted underline;
 * hover/focus pops out its bundle path and raw value. `value` overrides resolution (for derived values,
 * describe the derivation in `path`). `def` marks a method constant ("definition").
 */
export function Num({
  path,
  fmt = "num3",
  value,
  def = false,
  unit = true,
  derived,
  nullText,
  nullTitle,
}: {
  path: string;
  fmt?: Fmt;
  value?: number | null;
  def?: boolean;
  unit?: boolean;
  derived?: string;
  /** What a null means for this field, when it is not "not measured" (e.g. smith_plain). */
  nullText?: string;
  nullTitle?: string;
}) {
  const { state } = useBundleState();
  const [open, setOpen] = useState(false);
  const id = useId();
  let v: unknown = value;
  if (value === undefined && state.status === "ready") v = resolvePath(state.loaded.bundle, path);
  const num = isNum(v) ? v : null;
  const text = num === null && nullText ? nullText : fmtNum(num, fmt);
  const u = unit ? unitOf(fmt) : "";
  return (
    <span
      className="num"
      tabIndex={0}
      aria-describedby={open ? id : undefined}
      title={num === null ? nullTitle ?? NULL_TITLE : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      {text}
      {u && num !== null && <span className="unit">{u}</span>}
      {open && (
        <span className="pop" role="tooltip" id={id}>
          {def && <span className="def">definition · </span>}
          {derived ? <>{derived} = </> : <>{path} = </>}
          {fmtRaw(num ?? (v as unknown))}
          {derived && (
            <>
              <br />
              <span className="def">from {path}</span>
            </>
          )}
        </span>
      )}
    </span>
  );
}
