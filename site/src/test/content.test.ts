import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { METHOD_DEFS } from "../data/method";
import { resolvePath } from "../data/bundle";
import { EXPLAINER_IDS } from "../explainers/types";
import { ABOUT_BLOCKS, ABOUT_VALUES, FINDINGS_BLOCKS, FINDINGS_PLATES, FINDING_IDS, MEASURE_BLOCKS, METHODOLOGY_BLOCKS, METHODOLOGY_VALUES } from "../content/slots";
import { sectionsOf, splitTitle } from "../components/Markdown";
import { readBundle } from "./helpers";

const dir = resolve(__dirname, "../content");
const md = (f: string) => readFileSync(resolve(dir, f), "utf8");
const slots = (src: string, kind: string) => Array.from(src.matchAll(new RegExp(`\\{\\{${kind}:([^}|]+)(?:\\|\\w+)?\\}\\}`, "g")), (m) => m[1].trim());

const PAGES: Record<string, { blocks: readonly string[]; values: readonly string[] }> = {
  "methodology.md": { blocks: METHODOLOGY_BLOCKS, values: METHODOLOGY_VALUES },
  "findings.md": { blocks: FINDINGS_BLOCKS, values: [] },
  "measure.md": { blocks: MEASURE_BLOCKS, values: [] },
  "about.md": { blocks: ABOUT_BLOCKS, values: ABOUT_VALUES },
};

describe("content slots", () => {
  const bundle = readBundle();
  for (const [file, provided] of Object.entries(PAGES)) {
    const src = md(file);
    it(`${file}: every block, value, explainer, num and def slot resolves`, () => {
      for (const b of slots(src, "block")) expect(provided.blocks, `${file} {{block:${b}}}`).toContain(b);
      for (const v of slots(src, "val")) expect(provided.values, `${file} {{val:${v}}}`).toContain(v);
      for (const e of slots(src, "explainer")) expect(EXPLAINER_IDS as readonly string[], `${file} {{explainer:${e}}}`).toContain(e);
      for (const d of slots(src, "def")) expect(METHOD_DEFS[d], `${file} {{def:${d}}}`).toBeTypeOf("number");
      for (const p of slots(src, "num")) expect(resolvePath(bundle, p), `${file} {{num:${p}}}`).toBeTypeOf("number");
    });
    it(`${file}: no slot syntax the renderer would drop`, () => {
      expect(src).not.toMatch(/<(Explainer|Chart)\b/);
      const known = /^\{\{(num|def|val|block|explainer):[^}]+\}\}$/;
      for (const m of src.matchAll(/\{\{[^}]*\}\}/g)) expect(m[0]).toMatch(known);
    });
  }
  it("methodology mounts all six explainers", () => {
    expect(slots(md("methodology.md"), "explainer").sort()).toEqual([...EXPLAINER_IDS].sort());
  });
  it("findings: F1–F7 in order, each with its claim and read-off, and every plate placed", () => {
    const { sections } = sectionsOf(splitTitle(md("findings.md")).body);
    expect(sections.map((s) => s.id).filter((id) => /^f\d$/.test(id))).toEqual([...FINDING_IDS]);
    for (const f of FINDING_IDS) {
      const body = sections.find((s) => s.id === f)!.body;
      expect(body).toContain(`{{block:${f}-claim}}`);
      expect(body).toContain(`{{block:${f}-readoff}}`);
    }
    const used = slots(md("findings.md"), "block");
    for (const p of FINDINGS_PLATES) expect(used, p).toContain(p);
  });
  it("no typed measurement ranges in findings prose", () => {
    // ranges must come from src/findings.ts (DESIGN §11.2); a digit range typed into prose would go stale
    const prose = md("findings.md").replace(/\{\{[^}]*\}\}/g, "");
    expect(prose).not.toMatch(/\d+(\.\d+)?\s*(%|nats)?\s*(–|-|and|to)\s*\d+(\.\d+)?\s*(%|nats)/);
  });
});
