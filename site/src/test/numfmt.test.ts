import { describe, expect, it } from "vitest";
import { fmt, fmtNum, fmtRaw } from "../lib/numfmt";

describe("numfmt (DESIGN §3.1)", () => {
  it("formats scores, gaps and shares", () => {
    expect(fmtNum(0.98281, "score")).toBe("0.983");
    expect(fmt(-0.91682, "gap")).toBe("−0.917 nats");
    expect(fmtNum(0.0156, "gap")).toBe("+0.016");
    expect(fmtNum(2.5517, "kl")).toBe("2.55");
    expect(fmtNum(0.102, "pct")).toBe("10.2%");
    expect(fmtNum(0.0019, "pct")).toBe("0.19%");
    expect(fmtNum(1.94, "ratio")).toBe("×1.9");
    expect(fmtNum(1356458, "count")).toBe("1 356 458");
    expect(fmtNum(757.2, "eff")).toBe("≈ 757");
    expect(fmtNum(null, "score")).toBe("—");
    expect(fmtNum(-0.0001, "score")).toBe("0.000");
    expect(fmtRaw(-0.916823)).toBe("−0.91682");
  });
});
