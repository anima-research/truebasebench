import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";

export function useWidth<T extends HTMLElement>(fallback = 640): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(240, Math.floor(el.getBoundingClientRect().width)));
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}
const TipCtx = createContext<{ show: (t: Tip) => void; hide: () => void }>({ show: () => {}, hide: () => {} });

/**
 * Responsive chart frame. Measures its width, renders children(width), hosts one tooltip, and gives
 * keyboard navigation between focusable marks (arrow keys) with Esc to close (DESIGN §5 Tooltip).
 */
export function ChartFrame({
  children,
  maxWidth,
  ariaLabel,
  height,
}: {
  children: (width: number) => ReactNode;
  maxWidth?: number;
  ariaLabel: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(maxWidth ?? 640);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = useCallback((t: Tip) => setTip(t), []);
  const hide = useCallback(() => setTip(null), []);
  const w = maxWidth ? Math.min(width, maxWidth) : width;
  // The tooltip is measured after it mounts, then kept inside the frame: clamped to the right edge and flipped above
  // the mark when it would run past the bottom (the plate's .figure clips overflow).
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipBox, setTipBox] = useState<{ w: number; h: number }>({ w: 220, h: 60 });
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width && (Math.abs(r.width - tipBox.w) > 1 || Math.abs(r.height - tipBox.h) > 1)) setTipBox({ w: r.width, h: r.height });
  });
  const frameH = ref.current?.getBoundingClientRect().height ?? 0;
  // Roving tabindex: a chart is one Tab stop (the last-focused mark, else the first); arrow keys move between marks.
  useEffect(() => {
    const marks = Array.from(ref.current?.querySelectorAll<SVGElement>("[data-mark]") ?? []);
    if (!marks.length) return;
    const active = marks.find((m) => m === document.activeElement) ?? marks.find((m) => m.dataset.roving === "on") ?? marks[0];
    for (const m of marks) m.setAttribute("tabindex", m === active ? "0" : "-1");
  });
  function onFocusIn(e: React.FocusEvent<HTMLDivElement>) {
    const t = e.target as Element;
    if (!t.hasAttribute?.("data-mark")) return;
    for (const m of Array.from(ref.current?.querySelectorAll<SVGElement>("[data-mark]") ?? [])) {
      const on = m === t;
      m.setAttribute("tabindex", on ? "0" : "-1");
      if (on) m.dataset.roving = "on";
      else delete m.dataset.roving;
    }
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      hide();
      return;
    }
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    const marks = Array.from(ref.current?.querySelectorAll<SVGElement>("[data-mark]") ?? []);
    const i = marks.indexOf(document.activeElement as SVGElement);
    if (i < 0) return;
    e.preventDefault();
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    marks[(i + d + marks.length) % marks.length]?.focus();
  }
  return (
    <TipCtx.Provider value={{ show, hide }}>
      <div className="chart-wrap" ref={ref} onKeyDown={onKeyDown} onFocus={onFocusIn} onMouseLeave={hide} style={{ minHeight: height }}>
        <div role="img" aria-label={ariaLabel}>
          {children(w)}
        </div>
        {tip && (
          <div
            className="tooltip"
            role="tooltip"
            style={{
              left: Math.max(0, Math.min(tip.x + 10, w - tipBox.w)),
              top: frameH && tip.y + 12 + tipBox.h > frameH && tip.y - 12 - tipBox.h >= 0 ? tip.y - 12 - tipBox.h : tip.y + 12,
            }}
            ref={tipRef}
          >
            {tip.content}
          </div>
        )}
      </div>
    </TipCtx.Provider>
  );
}

/** A focusable chart mark with tooltip; optional link target. */
export function Mark({
  x,
  y,
  tip,
  href,
  children,
  label,
  onHover,
}: {
  x: number;
  y: number;
  tip: ReactNode;
  href?: string;
  children: ReactNode;
  label: string;
  onHover?: (on: boolean) => void;
}) {
  const { show, hide } = useContext(TipCtx);
  const navigate = useNavigate();
  const on = () => {
    show({ x, y, content: tip });
    onHover?.(true);
  };
  const off = () => {
    hide();
    onHover?.(false);
  };
  return (
    <g
      data-mark=""
      tabIndex={0}
      role={href ? "link" : "img"}
      aria-label={label}
      style={{ cursor: href ? "pointer" : "default", outline: "none" }}
      className="mark"
      onMouseEnter={on}
      onMouseLeave={off}
      onFocus={on}
      onBlur={off}
      onClick={href ? () => navigate(href) : undefined}
      onKeyDown={(e) => {
        if (href && e.key === "Enter") navigate(href);
      }}
    >
      {/* hit area */}
      <circle cx={x} cy={y} r={9} fill="transparent" />
      {children}
      <circle className="focus-ring" cx={x} cy={y} r={8} fill="none" />
    </g>
  );
}

export function TipBody({ title, lines, path }: { title: ReactNode; lines?: ReactNode[]; path?: string }) {
  return (
    <>
      <div style={{ fontWeight: 600, color: "var(--ink)" }}>{title}</div>
      {lines?.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
      {path && <div className="path">{path}</div>}
    </>
  );
}

export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
