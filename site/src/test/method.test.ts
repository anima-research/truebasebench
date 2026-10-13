import { describe, expect, it } from "vitest";
import { RAMPS, RUN_H_MAX, RUN_MIN_LEN, SURNAME_PROMPTS } from "../data/method";
import { SUB_KEYS } from "../data/types";
import { bundleFiles, readBundle, readDoc } from "./helpers";

/** Parse a Python dict literal of string -> string from the script source (simple, literal-only). */
function pyStringDict(src: string, name: string): Record<string, string> {
  const start = src.indexOf(`${name} = {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const body = src.slice(start, src.indexOf("\n}", start));
  const out: Record<string, string> = {};
  const re = /"(\w+)":\s*"((?:[^"\\]|\\.)*)",?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out[m[1]] = JSON.parse(`"${m[2]}"`);
  return out;
}

describe("method.ts mirrors the measurement scripts", () => {
  it("RAMPS equal docs/vh_truebase.py", () => {
    const src = readDoc("vh_truebase.py");
    const block = src.slice(src.indexOf("RAMPS = {"), src.indexOf("}", src.indexOf("RAMPS = {")));
    const re = /"(\w+)":\s*\(([-\d.e]+),\s*([-\d.e]+)\)/g;
    const py: Record<string, [number, number]> = {};
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) py[m[1]] = [parseFloat(m[2]), parseFloat(m[3])];
    expect(Object.keys(py).sort()).toEqual([...SUB_KEYS].sort());
    for (const k of SUB_KEYS) expect(RAMPS[k]).toEqual(py[k]);
  });
  it("surname frames equal SURNAME_PROMPTS in docs/vh_score.py", () => {
    const py = pyStringDict(readDoc("vh_score.py"), "SURNAME_PROMPTS");
    expect(Object.keys(py).length).toBeGreaterThanOrEqual(6);
    expect(SURNAME_PROMPTS).toEqual(py);
  });
  it("run rule equals the runs_mask defaults in docs/vh_memo.py", () => {
    const m = /def runs_mask\([^)]*minlen=(\d+),\s*hthr=([\d.]+)\)/.exec(readDoc("vh_memo.py"));
    expect(m).not.toBeNull();
    expect(RUN_MIN_LEN).toBe(parseInt(m![1], 10));
    expect(RUN_H_MAX).toBe(parseFloat(m![2]));
  });
});

for (const file of bundleFiles()) {
  describe(`bundle reference.* agrees with method.ts when present: ${file}`, () => {
    const b = readBundle(file);
    it("reference.ramps", () => {
      if (!b.reference.ramps) return;
      for (const k of SUB_KEYS) expect(b.reference.ramps[k]).toEqual(RAMPS[k]);
    });
    it("reference.method", () => {
      const m = b.reference.method;
      if (!m) return;
      if (m.run_min_len !== undefined) expect(m.run_min_len).toBe(RUN_MIN_LEN);
      if (m.run_H_max !== undefined) expect(m.run_H_max).toBe(RUN_H_MAX);
    });
    it("reference.surname_frames", () => {
      const f = b.reference.surname_frames;
      if (!f) return;
      const all = Object.values(SURNAME_PROMPTS);
      for (const t of [...(f.desc ?? []), ...(f.few ?? [])]) expect(all).toContain(t);
    });
  });
}
