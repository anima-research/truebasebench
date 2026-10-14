import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useBundleState } from "../data/BundleContext";
import { familiesOf } from "../data/derive";
import { ORG_URL } from "../lib/config";
import { useMotion } from "../lib/motion";
import { applyTheme, loadTheme, saveTheme, type ThemePref } from "../lib/prefs";

export function RampGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1 4.5 H5.5 L10.5 11.5 H15" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

let themeState: ThemePref | null = null;
const listeners = new Set<(t: ThemePref) => void>();
function useTheme(): [ThemePref, (t: ThemePref) => void] {
  const [t, setT] = useState<ThemePref>(() => (themeState ??= loadTheme()));
  useEffect(() => {
    listeners.add(setT);
    return () => {
      listeners.delete(setT);
    };
  }, []);
  return [
    t,
    (n) => {
      themeState = n;
      saveTheme(n);
      listeners.forEach((l) => l(n));
    },
  ];
}

export function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  useEffect(() => applyTheme(theme), [theme]);
  return (
    <div className="seg theme-switch" role="group" aria-label="Theme">
      {(["system", "light", "dark"] as ThemePref[]).map((t) => (
        <button key={t} type="button" className="btn" aria-pressed={theme === t} onClick={() => setTheme(t)}>
          {t[0].toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}

const NAV = [
  { to: "/", label: "Leaderboard", end: true },
  { to: "/methodology", label: "Methodology" },
  { to: "/findings", label: "Findings" },
  { to: "/measure", label: "Measure your model" },
];

function Stamp() {
  const { state } = useBundleState();
  if (state.status !== "ready") return <span className="stamp" />;
  const { bundle, file } = state.loaded;
  return (
    <span className="stamp" title={`${file} · schema_version ${bundle.schema_version}`}>
      {file.replace(/\.json$/, "")} · {bundle.generated} · {bundle.n_models} models
    </span>
  );
}

export function TopBar() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <header className="topbar">
      <div className="container">
        <NavLink to="/" className="wordmark" aria-label="True Base Bench, home">
          <RampGlyph />
          True Base Bench
        </NavLink>
        <a className="byline" href={ORG_URL}>
          by Anima Labs
        </a>
        <button type="button" className="btn menu-btn" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>
          Menu
        </button>
        <nav id="site-nav" className={"nav" + (open ? " open" : "")} aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <span className="spacer" />
        <Stamp />
        <ThemeSwitch />
      </div>
    </header>
  );
}

export function Footer() {
  const { state } = useBundleState();
  const { toggle, setToggle } = useMotion();
  const ready = state.status === "ready" ? state.loaded : null;
  return (
    <footer className="footer">
      <div className="container">
        <div className="row">
          <span>
            True Base Bench by <a href={ORG_URL}>Anima Labs</a>
          </span>
          <NavLink to="/about">About, citation and maintenance</NavLink>
        </div>
        {ready && (
          <div className="row mono">
            <span>{ready.file}</span>
            <span>schema_version {ready.bundle.schema_version}</span>
            <span>generated {ready.bundle.generated}</span>
            <span>n_models {ready.bundle.n_models}</span>
            <span>n_families {familiesOf(ready.bundle).length}</span>
            <a href={ready.url} download>
              Download bundle (JSON)
            </a>
          </div>
        )}
        <div className="row">
          <span className="ink3">Data: OVH Object Storage, manifest.json</span>
          {ready?.fallback && <span className="ink3">(showing the bundled copy)</span>}
        </div>
        <div className="row">
          <ThemeSwitch />
          <button type="button" className="btn" aria-pressed={toggle} onClick={() => setToggle(!toggle)}>
            Reduce motion
          </button>
        </div>
      </div>
    </footer>
  );
}
