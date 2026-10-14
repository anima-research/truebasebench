#!/usr/bin/env node
// Renders the Open Graph images for the site from the current data bundle:
//   site/public/og.png        1200 × 630   (og:image, twitter summary_large_image)
//   site/public/og-square.png 1200 × 1200  (square variant for feeds that crop)
//
//   cd site && npm run og            # = node ../tools/og.mjs
//
// The picture is the leaderboard's own object: the calibration gap on post-cutoff text (F_calib_gap) for every
// checkpoint in the latest bundle, one row per stage, in the site's light palette (site/src/styles/tokens.css)
// and type (Source Serif 4, IBM Plex Sans Condensed, IBM Plex Mono; static TTFs in tools/og/fonts, converted
// from the @fontsource packages the site ships). Rendering: @resvg/resvg-js (a devDependency of site/).
// Every number in the image comes from the bundle; nothing is typed in.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const require = createRequire(join(repo, "site", "package.json"));
const { Resvg } = require("@resvg/resvg-js");

const site = JSON.parse(readFileSync(join(repo, "site", "site.config.json"), "utf8"));
const dataDir = join(repo, "data");
const manifest = JSON.parse(readFileSync(join(dataDir, "manifest.json"), "utf8"));
const bundleFile = manifest.latest;
const bundle = JSON.parse(readFileSync(join(dataDir, bundleFile), "utf8"));

// ---- identity (tokens.css, light) ----
const C = {
  bg: "#F5F3EE", plate: "#ECE8DF", ink: "#1A1D21", ink2: "#4A4F57", ink3: "#5F646C", rule: "#D8D2C4", ruleStrong: "#B9B1A0",
  zero: "#4A4F57", band: "rgba(30,122,106,0.12)", pre: "#1E7A6A", anl: "#A86B00", base: "#3B5B9A", post: "#B23A26",
};
const F = { serif: "Source Serif 4", serifBold: "Source Serif 4 SemiBold", sans: "IBM Plex Sans Condensed", sansBold: "IBM Plex Sans Condensed SemiBold", mono: "IBM Plex Mono" };
const STAGES = [
  { id: "pre-anneal", code: "PRE", name: "pre-anneal checkpoint", color: C.pre },
  { id: "anneal", code: "MID", name: "mid-anneal checkpoint", color: C.anl },
  { id: "base", code: "BASE", name: "released base", color: C.base },
  { id: "post-trained", code: "POST", name: "post-trained", color: C.post },
];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MINUS = "−";
const fmtGap = (v) => (v < 0 ? MINUS : "+") + Math.abs(v).toFixed(v > -0.1 && v < 0.1 ? 3 : 2);

/** Stage glyph (site/src/components/Glyph.tsx), centred at (x, y). */
function glyph(stage, x, y, size, color) {
  const r = size / 2;
  switch (stage) {
    case "pre-anneal":
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;
    case "anneal": {
      const d = r * 1.25;
      return `<polygon points="${x},${y - d} ${x + d},${y} ${x},${y + d} ${x - d},${y}" fill="${color}"/>`;
    }
    case "base": {
      const s = size * 0.9;
      return `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" fill="${color}"/>`;
    }
    default: {
      const h = size * 1.05;
      return `<polygon points="${x},${y - h * 0.6} ${x + r * 1.15},${y + h * 0.45} ${x - r * 1.15},${y + h * 0.45}" fill="${color}"/>`;
    }
  }
}

/** Vertical beeswarm slots: points closer than minGap on x take alternating slots above/below. */
function beeswarm(xs, minGap, maxSlot = 3) {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const placed = [];
  const slot = new Array(xs.length).fill(0);
  for (const [x, i] of order) {
    let s = 0;
    for (let k = 0; k < 2 * maxSlot + 1; k++) {
      s = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2);
      if (!placed.some((p) => p.s === s && Math.abs(p.x - x) < minGap)) break;
    }
    placed.push({ x, s });
    slot[i] = s;
  }
  return slot;
}

const models = bundle.models.filter((m) => m.fingerprint && typeof m.fingerprint.F_calib_gap === "number");
const gaps = models.map((m) => m.fingerprint.F_calib_gap);
const xmin = Math.floor(Math.min(...gaps) * 4) / 4; // nice quarter-nat floor
const xmax = 0.1;
const preBand = Math.max(...models.filter((m) => m.stage === "pre-anneal").map((m) => Math.abs(m.fingerprint.F_calib_gap)), 0);

/** The chart, as an SVG group placed at (0, top) inside a W-wide canvas; returns {svg, height}. */
function strip({ W, top, rowH, glyphSize, labelW, labelRows }) {
  const L = labelW;
  const R = W - 48;
  const x = (v) => L + ((v - xmin) / (xmax - xmin)) * (R - L);
  const ticks = [];
  for (let t = xmin; t <= xmax + 1e-9; t += 0.25) ticks.push(+t.toFixed(2));
  if (!ticks.includes(0)) ticks.push(0);
  let out = "";
  const headH = 58;
  const axisH = 40;
  const H = headH + STAGES.length * rowH + axisH;
  const y0 = top + headH;
  // band ± widest pre-anneal gap, zero line
  if (preBand > 0) out += `<rect x="${x(-preBand)}" y="${y0}" width="${x(preBand) - x(-preBand)}" height="${STAGES.length * rowH}" fill="${C.band}"/>`;
  out += `<text x="${L}" y="${top + 22}" font-family="${F.sansBold}" font-size="21" fill="${C.ink}">Calibration gap on post-cutoff text, mean(H ${MINUS} s), nats</text>`;
  out += `<text x="${R}" y="${top + 22}" text-anchor="end" font-family="${F.sans}" font-size="19" fill="${C.ink3}">${models.length} checkpoints · ${esc(bundleFile.replace(".json", ""))}</text>`;
  STAGES.forEach((st, i) => {
    const yc = y0 + i * rowH + rowH / 2;
    if (i > 0) out += `<line x1="${L}" x2="${R}" y1="${y0 + i * rowH}" y2="${y0 + i * rowH}" stroke="${C.rule}" stroke-width="1"/>`;
    out += glyph(st.id, 44 + glyphSize / 2, yc - 1, glyphSize, st.color);
    out += `<text x="${44 + glyphSize + 12}" y="${yc + 6}" font-family="${F.mono}" font-size="20" fill="${C.ink}">${st.code}</text>`;
    out += `<text x="${44 + glyphSize + 12 + 64}" y="${yc + 6}" font-family="${F.sans}" font-size="18" fill="${C.ink2}">${esc(st.name)}</text>`;
    const ms = models.filter((m) => m.stage === st.id);
    // glyphs stay inside the row (and above the row label when there is one)
    const step = glyphSize + 1;
    const reserve = labelRows ? 24 : 6;
    const maxSlot = Math.max(0, Math.floor((rowH / 2 - glyphSize / 2 - reserve) / step));
    const slots = beeswarm(ms.map((m) => x(m.fingerprint.F_calib_gap)), glyphSize + 2, maxSlot);
    ms.forEach((m, k) => {
      out += glyph(st.id, x(m.fingerprint.F_calib_gap), yc + slots[k] * step, glyphSize, st.color);
    });
    // name the most over-confident checkpoint of the row, under its glyphs (only when the row is tall enough)
    if (labelRows) {
      const worst = ms.reduce((a, b) => (b.fingerprint.F_calib_gap < a.fingerprint.F_calib_gap ? b : a));
      const wx = x(worst.fingerprint.F_calib_gap);
      const label = `${worst.family} · ${worst.label} ${fmtGap(worst.fingerprint.F_calib_gap)}`;
      const atRight = R - wx < 320;
      out += `<text x="${wx}" y="${yc + rowH / 2 - 8}" text-anchor="${atRight ? "end" : "start"}" font-family="${F.sans}" font-size="17" fill="${C.ink3}">${esc(label)}</text>`;
    }
  });
  const ya = y0 + STAGES.length * rowH;
  out += `<line x1="${L}" x2="${R}" y1="${ya}" y2="${ya}" stroke="${C.ruleStrong}" stroke-width="1.5"/>`;
  for (const t of ticks) {
    out += `<line x1="${x(t)}" x2="${x(t)}" y1="${ya}" y2="${ya + 6}" stroke="${C.ruleStrong}" stroke-width="1.5"/>`;
    out += `<text x="${x(t)}" y="${ya + 26}" text-anchor="middle" font-family="${F.sans}" font-size="18" fill="${C.ink3}">${t === 0 ? "0" : fmtGap(t)}</text>`;
  }
  out += `<line x1="${x(0)}" x2="${x(0)}" y1="${y0}" y2="${ya}" stroke="${C.zero}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  out += `<text x="${x(0) + 8}" y="${y0 - 6}" font-family="${F.sans}" font-size="16" fill="${C.ink2}">0 = calibrated</text>`;
  out += `<path d="M${L + 22},${y0 - 11} H${L + 2} M${L + 8},${y0 - 16} L${L + 2},${y0 - 11} L${L + 8},${y0 - 6}" fill="none" stroke="${C.ink2}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  out += `<text x="${L + 30}" y="${y0 - 6}" font-family="${F.sans}" font-size="16" fill="${C.ink2}">over-confident</text>`;
  return { svg: out, height: H };
}

function wrapTitleLines(W, baseY, lines, size, family, color) {
  return lines.map((l, i) => `<text x="64" y="${baseY + i * size * 1.2}" font-family="${family}" font-size="${size}" fill="${color}">${esc(l)}</text>`).join("");
}

function render({ W, H, square }) {
  const claim = ["how close a checkpoint is to an ideal base model —", "calibrated on unseen text, nothing memorised, no instruction prior"];
  const titleY = square ? 150 : 104;
  const claimY = titleY + (square ? 76 : 56);
  const stripTop = square ? 420 : 232;
  const rowH = square ? 136 : 56;
  const { svg: chart, height } = strip({ W, top: stripTop, rowH, glyphSize: square ? 18 : 14, labelW: 300, labelRows: square });
  const footY = H - (square ? 44 : 28);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.bg}"/>
  <rect x="0" y="0" width="${W}" height="6" fill="${C.ink}"/>
  <text x="64" y="${titleY}" font-family="${F.serifBold}" font-size="${square ? 88 : 76}" fill="${C.ink}">${esc(site.name)}</text>
  <text x="${W - 48}" y="${titleY}" text-anchor="end" font-family="${F.sans}" font-size="${square ? 30 : 26}" fill="${C.ink2}">by Anima Labs</text>
  ${wrapTitleLines(W, claimY, claim, square ? 38 : 30, F.sans, C.ink2)}
  <line x1="64" x2="${W - 48}" y1="${stripTop - 22}" y2="${stripTop - 22}" stroke="${C.rule}"/>
  ${chart}
  <line x1="64" x2="${W - 48}" y1="${stripTop + height + 16}" y2="${stripTop + height + 16}" stroke="${C.rule}"/>
  <text x="64" y="${footY}" font-family="${F.mono}" font-size="${square ? 24 : 21}" fill="${C.ink3}">${esc(new URL(site.url).host)}</text>
  <text x="${W - 48}" y="${footY}" text-anchor="end" font-family="${F.mono}" font-size="${square ? 24 : 21}" fill="${C.ink3}">${esc(bundleFile.replace(".json", ""))} · ${esc(bundle.generated)} · ${bundle.n_models} models</text>
</svg>`;
}

const fontFiles = ["SourceSerif4-400.ttf", "SourceSerif4-600.ttf", "IBMPlexSansCondensed-400.ttf", "IBMPlexSansCondensed-600.ttf", "IBMPlexMono-400.ttf"].map((f) => join(here, "og", "fonts", f));
const outDir = join(repo, "site", "public");
mkdirSync(outDir, { recursive: true });
for (const [name, W, H, square] of [["og.png", 1200, 630, false], ["og-square.png", 1200, 1200, true]]) {
  const svg = render({ W, H, square });
  const r = new Resvg(svg, { fitTo: { mode: "width", value: W }, font: { fontFiles, loadSystemFonts: false, defaultFontFamily: F.sans }, background: C.bg });
  const png = r.render().asPng();
  writeFileSync(join(outDir, name), png);
  if (process.env.OG_DEBUG_SVG) writeFileSync(join(outDir, name.replace(".png", ".svg")), svg);
  console.log(`wrote ${join("site/public", name)} (${W}×${H}, ${(png.length / 1024).toFixed(0)} KB) from ${bundleFile}`);
}
void pathToFileURL;
