#!/usr/bin/env python
"""True-baseness index from reference-free fingerprints (results/analysis/fingerprints.json).

Sub-scores in [0,1] (1 = looks like a pre-anneal base), each a clipped linear ramp between two anchors
that were set from the Trinity ladder; refine the anchors once the OLMo-2 ladder is in:
  calib   : calibration gap mean(H - s) on fresh post-cutoff text (falls back to Pile).  0 -> 1, -0.10 -> 0
  spread  : mean |per-domain gap| on fresh text.                                        0.015 -> 1, 0.10 -> 0
  memo    : Wikipedia verbatim-run fraction (150-doc set; falls back to the 24-doc set). 0.02 -> 1, 0.12 -> 0
  prior   : instruction/chat-marker rate in 32 bare-BOS T=1 samples.                     0 -> 1, 0.40 -> 0
overall (score v1) = mean of the available calib, spread and prior sub-scores; memo is computed as a validation probe and not averaged in.
"""
import json, sys, os, math

RAMPS = {  # feature -> (good_value, bad_value); sign handled by the ramp direction
    "calib": (0.0, -0.10),
    "spread": (0.015, 0.10),
    "memo": (0.02, 0.12),
    "prior": (0.0, 0.40),
}


def ramp(x, good, bad):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    t = (x - bad) / (good - bad)
    return max(0.0, min(1.0, t))


def pick(f, *keys):
    for k in keys:
        v = f.get(k)
        if v is not None and not (isinstance(v, float) and math.isnan(v)):
            return v, k
    return None, None


SCORE_VERSION = 1
SCORED = ("calib", "spread", "prior")  # v1: memo is a validation probe, not a term of the score (v0 averaged all four)


def score(f):
    out = {}
    calib, src = pick(f, "F_calib_gap", "calib_gap")
    out["calib"] = (ramp(min(calib, 0.0) if calib is not None else None, *RAMPS["calib"]), calib, src)
    spread, src = pick(f, "F_gap_domain_absmean", "calib_gap_domain_absmean")
    out["spread"] = (ramp(spread, *RAMPS["spread"]), spread, src)
    memo, src = pick(f, "X_runfrac_wiki", "verbatim_run_frac_wiki")
    out["memo"] = (ramp(memo, *RAMPS["memo"]), memo, src)
    prior, src = pick(f, "roll_instr_marker_rate")
    out["prior"] = (ramp(prior, *RAMPS["prior"]), prior, src)
    avail = [out[k][0] for k in SCORED if out[k][0] is not None]
    out["overall"] = sum(avail) / len(avail) if avail else None
    out["n_avail"] = len(avail)
    return out


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "/models/varentropy/results/analysis/fingerprints.json"
    fps = json.load(open(path))
    rows = {n: score(f) for n, f in fps.items() if not n.startswith("smoke_")}
    order = sorted(rows, key=lambda n: -(rows[n]["overall"] or -1))
    print(f"{'model':34} {'overall':>7} | {'calib':>6} {'(gap)':>8} | {'spread':>6} {'(|gap|)':>8} | {'memo':>6} {'(wiki run)':>10} | {'prior':>6} {'(marker)':>8}  src")
    for n in order:
        r = rows[n]
        def fmt(k, w=8):
            s, v, src = r[k]
            return (f"{s:6.2f} " if s is not None else f"{'-':>6} ") + (f"{v:{w}.3f}" if v is not None else f"{'-':>{w}}")
        srcs = ",".join(("F" if (r[k][2] or "").startswith("F_") else "X" if (r[k][2] or "").startswith("X_") else "p") for k in ["calib", "spread", "memo"])
        print(f"{n[:34]:34} {r['overall'] if r['overall'] is not None else float('nan'):7.2f} | {fmt('calib')} | {fmt('spread')} | {fmt('memo', 10)} | {fmt('prior')}  {srcs}")
    out = os.path.join(os.path.dirname(path), "truebase_scores.json")
    doc = {n: {k: (v if k in ("overall", "n_avail") else {"score": v[0], "value": v[1], "source": v[2], "scored": k in SCORED}) for k, v in r.items()} for n, r in rows.items()}
    doc["_score_version"] = SCORE_VERSION; doc["_scored"] = list(SCORED)
    json.dump(doc, open(out, "w"), indent=1)
    print("wrote", out, "(src column: F=fresh corpus, X=150-doc wiki set, p=Pile main corpus)")


if __name__ == "__main__":
    main()
