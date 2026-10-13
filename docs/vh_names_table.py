#!/usr/bin/env python
"""Tables for the surname-distribution probe (results/<model>/names.json) and the weird-genre corpus
(results/<model>/tf_weird.npz). Usage: vh_names_table.py RESULTS_DIR"""
import sys, os, json, math
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vh_memo

res = sys.argv[1]
models = sorted(d for d in os.listdir(res) if os.path.exists(os.path.join(res, d, "names.json")) and not d.startswith("smoke"))
if "--all" in sys.argv:
    models = sorted(d for d in os.listdir(res) if os.path.exists(os.path.join(res, d, "names.json")))

print("=== surnames: exact distribution over Census top-2000. desc = mean of 3 description frames; few = mean of 3 few-shot frames (6 Census draws given)")
print(f"{'model':30}{'KL_desc':>8}{'KL_few':>8}{'H_desc':>7}{'H_few':>7}{'H_ref':>6}{'top10_d':>8}{'top10_f':>8}{'Smith@plain':>12} | sampled(desc): {'junk':>5}{'distinct':>9}{'surpr':>6}")
for_later = True
rows = {}
for m in models:
    j = json.load(open(os.path.join(res, m, "names.json")))["surnames"]
    if not j:
        continue
    ex = [v["exact"] for v in j.values()]; sm = [v["sampled"] for v in j.values()]
    ex_desc = [v["exact"] for k, v in j.items() if not k.startswith("fewshot")]; ex_few = [v["exact"] for k, v in j.items() if k.startswith("fewshot")]
    sm_desc = [v["sampled"] for k, v in j.items() if not k.startswith("fewshot")]
    def mean(k, lst=ex):
        vals = [x[k] for x in lst if x.get(k) is not None]
        return float(np.mean(vals)) if vals else float("nan")
    def worst(k, lst=ex, hi=True):
        vals = [x[k] for x in lst if x.get(k) is not None]
        return (max(vals) if hi else min(vals)) if vals else float("nan")
    r = {"KL_cm": mean("KL(ref||model)"), "KL_cm_worst": worst("KL(ref||model)"),
         "KL_desc": mean("KL(ref||model)", ex_desc), "KL_few": mean("KL(ref||model)", ex_few) if ex_few else None,
         "H_desc": mean("H_model", ex_desc), "H_few": mean("H_model", ex_few) if ex_few else None,
         "top10_desc": mean("top10_model", ex_desc), "top10_few": mean("top10_model", ex_few) if ex_few else None,
         "smith_plain": next((v["exact"]["top5_model"][0][1] for k, v in j.items() if k == "plain" and v["exact"]["top5_model"][0][0] == "Smith"), None), "KL_mc": mean("KL(model||ref)"), "H_m": mean("H_model"), "H_r": mean("H_ref"),
         "top10_m": mean("top10_model"), "top10_r": mean("top10_ref"), "zipf_m": mean("zipf_slope_model"), "zipf_r": mean("zipf_slope_ref"), "inset": mean("mass_in_set"),
         "junk": mean("junk_frac", sm), "distinct": mean("distinct_frac", sm), "surpr": mean("mean_ref_surprise_nats", sm), "top10sh": mean("top10_share", sm), "stepH": mean("mean_step_H", sm)}
    rows[m] = r
    f = lambda v, w=8, d=3: (f"{v:{w}.{d}f}" if v is not None and not (isinstance(v, float) and math.isnan(v)) else " " * (w - 1) + "–")
    print(f"{m[:30]:30}{f(r['KL_desc'])}{f(r['KL_few'])}{f(r['H_desc'],7,2)}{f(r['H_few'],7,2)}{r['H_r']:6.2f}{f(r['top10_desc'],8,2)}{f(r['top10_few'],8,2)}{f(r['smith_plain'],12,3)} |                {f(r['junk'],5,2)}{f(r['distinct'],9,2)}{f(r['surpr'],6,2)}")
json.dump(rows, open(os.path.join(res, "analysis", "names_summary.json"), "w"), indent=1)
print("\nH_ref/top10_ref/zipf_ref: Census 2010 restricted to the same 2000 names. inset: model's total next-name mass on those 2000 names.")
print("surpr: mean −log p_census(name) of generated in-Census names (Census self-entropy over all 162k names ≈ 10.4 nats; a collapsed model scores well below it).")

print("\n=== per-frame detail: top-5 names (model prob) and a sample list")
for m in models:
    j = json.load(open(os.path.join(res, m, "names.json")))["surnames"]
    for frame, v in j.items():
        t5 = ", ".join(f"{n} {p:.3f}" for n, p in v["exact"]["top5_model"])
        samp = v["sampled"].get("sample_text", "").replace("\n", " | ")[:140]
        print(f"{m[:26]:26} {frame:6} top5: {t5:70} | {samp}")

print("\n=== weird-genre corpus: calibration gap and verbatim-run share per genre")
genres = None
table = {}
for m in sorted(os.listdir(res)):
    p = os.path.join(res, m, "tf_weird.npz")
    if not os.path.exists(p) or m.startswith("smoke"):
        continue
    z = np.load(p); H = z["H"].astype(np.float32); s = z["s"].astype(np.float32)
    docs = json.load(open(os.path.join(res, m, "tf_weird_docs.json"))); dset = {d["doc"]: d["set"] for d in docs}
    ds = np.array([dset[int(d)] for d in z["doc"]])
    rm = vh_memo.runs_mask(H, z["rank"], z["doc"])
    row = {"ALL": (float((H - s).mean()), float(rm.mean()), float(s.mean()))}
    for g in sorted(set(ds)):
        mm = ds == g
        if mm.sum() > 1500:
            row[g] = (float((H[mm] - s[mm]).mean()), float(rm[mm].mean()), float(s[mm].mean()))
    table[m] = row
    genres = sorted(set(row) - {"ALL"}) if genres is None else genres
json.dump(table, open(os.path.join(res, "analysis", "weird_summary.json"), "w"), indent=1)
if table:
    gshort = {g: g[:9] for g in genres}
    print(f"{'model':28}{'ALL gap':>8}{'ALL run':>8}" + "".join(f"{gshort[g]:>10}" for g in genres) + "   (gap / verbatim-run share)")
    for m, row in table.items():
        print(f"{m[:28]:28}{row['ALL'][0]:8.3f}{row['ALL'][1]:8.3f}" + "".join((f"{row[g][0]:+.2f}/{row[g][1]:.2f}".rjust(10) if g in row else " " * 10) for g in genres))
