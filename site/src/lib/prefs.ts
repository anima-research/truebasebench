/** Theme and reduced-motion preferences. localStorage only, every access in try/catch (DESIGN §4.2, §10.10). */
export type ThemePref = "system" | "light" | "dark";

const THEME_KEY = "tbb.theme";
const MOTION_KEY = "tbb.reduceMotion";

export function readStore(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeStore(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: preference lasts for this page view only */
  }
}

export function loadTheme(): ThemePref {
  const v = readStore(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}
export function applyTheme(t: ThemePref): void {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
}
export function saveTheme(t: ThemePref): void {
  writeStore(THEME_KEY, t === "system" ? null : t);
  applyTheme(t);
}

export function loadReduceMotion(): boolean {
  return readStore(MOTION_KEY) === "1";
}
export function saveReduceMotion(on: boolean): void {
  writeStore(MOTION_KEY, on ? "1" : null);
  document.documentElement.toggleAttribute("data-reduce-motion", on);
}
