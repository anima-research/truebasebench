import os, json, numpy as np
import sys
res = sys.argv[1] if len(sys.argv) > 1 else "/models/varentropy/results"
rows = []
for m in sorted(os.listdir(res)):
    d = os.path.join(res, m)
    if m.startswith(("smoke", "vsmoke")) or not os.path.exists(os.path.join(d, "tf_fresh.npz")):
        continue
    out = {"model": m}
    for tag in ["tf", "tf_fresh", "tf_weird"]:
        p = os.path.join(d, tag + ".npz")
        if not os.path.exists(p):
            continue
        z = np.load(p); s = z["s"].astype(np.float32); r = z["rank"]; H = z["H"].astype(np.float32)
        out[tag] = {"s>7": float((s > 7).mean()), "s>10": float((s > 10).mean()), "rank>100": float((r > 100).mean()),
                    "rank>1000": float((r > 1000).mean()), "CE": float(s.mean()), "H": float(H.mean()),
                    "s_p99": float(np.percentile(s, 99)), "gap_hiH": float((H - s)[H > 4].mean()) if (H > 4).any() else None}
    rows.append(out)
print(f"{'model':28}{'corpus':9}{'CE':>6}{'s>7':>7}{'s>10':>7}{'rk>100':>8}{'rk>1k':>7}{'s_p99':>7}{'gap|H>4':>9}")
for o in rows:
    for tag in ["tf_fresh", "tf_weird", "tf"]:
        if tag in o:
            v = o[tag]
            print(f"{o['model'][:28]:28}{tag[3:] or 'pile':9}{v['CE']:6.2f}{v['s>7']:7.3f}{v['s>10']:7.3f}{v['rank>100']:8.3f}{v['rank>1000']:7.3f}{v['s_p99']:7.1f}{(v['gap_hiH'] if v['gap_hiH'] is not None else float('nan')):9.3f}")
json.dump(rows, open(os.path.join(res, "analysis", "tail_realised.json"), "w"), indent=1)
