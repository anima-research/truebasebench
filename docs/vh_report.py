#!/usr/bin/env python
"""Render the true-baseness results page (HTML with inline SVG charts) from
results/analysis/fingerprints.json + truebase_scores.json.  Usage: vh_report.py ANALYSIS_DIR OUT.html"""
import json, sys, os, math, html

CLASS = {  # model -> (family, stage class, short label, order within family)
    "Trinity-Large-TrueBase": ("Trinity Large 398B-A13B", "pre-anneal", "TrueBase (10T, pre-anneal)", 0),
    "Trinity-Large-Base": ("Trinity Large 398B-A13B", "base", "Base (17T, annealed)", 1),
    "Trinity-Large-Preview": ("Trinity Large 398B-A13B", "post-trained", "Preview (instruct)", 2),
    "Olmo-3-1125-32B": ("OLMo-3 32B", "base", "Base", 0),
    "olmo2-7b_stage1-2928B": ("OLMo-2 7B", "pre-anneal", "stage 1 · 2.9T", 0),
    "olmo2-7b_stage1-3896B": ("OLMo-2 7B", "pre-anneal", "stage 1 · 3.9T (pre-anneal)", 1),
    "olmo2-7b_stage2-ing1-5B": ("OLMo-2 7B", "anneal", "stage 2 · +5B", 2),
    "olmo2-7b_stage2-ing1-17B": ("OLMo-2 7B", "anneal", "stage 2 · +17B", 3),
    "olmo2-7b_stage2-ing1-50B": ("OLMo-2 7B", "anneal", "stage 2 · +50B", 4),
    "olmo2-7b_main": ("OLMo-2 7B", "base", "Base (soup)", 5),
    "olmo2-7b_sft": ("OLMo-2 7B", "post-trained", "SFT", 6),
    "olmo2-7b_dpo": ("OLMo-2 7B", "post-trained", "DPO", 7),
    "olmo2-7b_instruct": ("OLMo-2 7B", "post-trained", "Instruct (RLVR)", 8),
    "Llama-3.1-405B": ("Llama 3.1", "base", "405B base", 0),
    "Llama-3.1-70B": ("Llama 3.1", "base", "70B base", 1),
    "Llama-3.1-70B-Instruct-new": ("Llama 3.1", "post-trained", "70B Instruct", 2),
    "Qwen2.5-72B": ("Qwen2.5 72B", "base", "Base", 0),
    "Qwen2.5-72B-Instruct": ("Qwen2.5 72B", "post-trained", "Instruct", 1),
    "Qwen3-30B-A3B-Base": ("Qwen3 30B-A3B", "base", "Base", 0),
    "Qwen3-30B-A3B": ("Qwen3 30B-A3B", "post-trained", "Instruct/thinking", 1),
    "GLM-4-32B-Base-0414": ("GLM-4 32B", "base", "Base", 0),
    "GLM-4-32B-0414": ("GLM-4 32B", "post-trained", "Chat", 1),
    "gemma-2-9b": ("Gemma 2 9B", "base", "base (distilled)", 0),
    "gemma-2-9b-it": ("Gemma 2 9B", "post-trained", "it", 1),
    "Gemma-4-31B-Base": ("Gemma 4 31B", "base", "Base", 0),
    "gemma-4-31B-it": ("Gemma 4 31B", "post-trained", "it", 1),
    "DeepSeek-V4-Flash-Base": ("DeepSeek V4 Flash", "base", "Base", 0),
    "DeepSeek-V4-Flash": ("DeepSeek V4 Flash", "post-trained", "Instruct", 1),
    "DeepSeek-V3-Base": ("DeepSeek V3 671B-A37B", "base", "Base", 0),
    "cogito-671b-v2.1": ("DeepSeek V3 671B-A37B", "post-trained", "Cogito v2.1 (light finetune of Base)", 1),
    "DeepSeek-V3": ("DeepSeek V3 671B-A37B", "post-trained", "Chat", 2),
    "kimi-k2-base": ("Kimi K2 1T-A32B", "base", "Base", 0),
    "Kimi-K2-Instruct": ("Kimi K2 1T-A32B", "post-trained", "Instruct", 1),
    "MiMo-V2.5-Base": ("MiMo V2.5", "base", "Base", 0),
    "MiMo-V2.5": ("MiMo V2.5", "post-trained", "Instruct", 1),
}
CLASS_COLOR = {"pre-anneal": "var(--s1)", "anneal": "var(--s1b)", "base": "var(--s2)", "post-trained": "var(--s3)"}
CLASS_LABEL = {"pre-anneal": "pre-anneal checkpoint", "anneal": "mid-anneal checkpoint", "base": "released base", "post-trained": "post-trained"}


def g(f, k, alt=None):
    v = f.get(k)
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return f.get(alt) if alt else None
    return v


def esc(s):
    return html.escape(str(s))


def fmt(v, d=3, signed=False):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "–"
    return f"{v:+.{d}f}" if signed else f"{v:.{d}f}"


def dot_chart(rows, key, title, xmin, xmax, ticks, fmtv, zero=True, w=720):
    """horizontal dot chart grouped by family. rows: list of dicts with family,label,cls,value"""
    fams = []
    for r in rows:
        if r["family"] not in fams:
            fams.append(r["family"])
    rowh, famgap, left, right, top = 22, 14, 230, 24, 28
    n = len(rows) + 0
    H = top + n * rowh + (len(fams)) * famgap + 30
    pw = w - left - right
    sx = lambda v: left + (v - xmin) / (xmax - xmin) * pw
    out = [f'<svg class="chart" viewBox="0 0 {w} {H}" role="img" aria-label="{esc(title)}" style="max-width:100%;height:auto">']
    for t in ticks:
        x = sx(t)
        out.append(f'<line x1="{x:.1f}" y1="{top-6}" x2="{x:.1f}" y2="{H-26}" class="grid{" zero" if (zero and abs(t)<1e-9) else ""}"/>')
        out.append(f'<text x="{x:.1f}" y="{H-10}" class="tick" text-anchor="middle">{fmtv(t)}</text>')
    y = top
    for fam in fams:
        out.append(f'<text x="{left-8}" y="{y+4}" class="fam" text-anchor="end">{esc(fam)}</text>')
        y += famgap
        for r in [r for r in rows if r["family"] == fam]:
            v = r["value"]
            cy = y + rowh / 2
            out.append(f'<text x="{left-8}" y="{cy+4}" class="lbl" text-anchor="end">{esc(r["label"])}</text>')
            if v is not None:
                vc = max(xmin, min(xmax, v))
                x = sx(vc)
                if zero:
                    out.append(f'<line x1="{sx(0):.1f}" y1="{cy:.1f}" x2="{x:.1f}" y2="{cy:.1f}" class="stem" style="stroke:{CLASS_COLOR[r["cls"]]}"/>')
                clipped = ' stroke-dasharray="2 2"' if vc != v else ""
                out.append(f'<circle cx="{x:.1f}" cy="{cy:.1f}" r="5" fill="{CLASS_COLOR[r["cls"]]}" class="mark" data-tip="{esc(r["family"])} · {esc(r["label"])}: {fmtv(v)}"{clipped}/>')
                if vc != v:
                    out.append(f'<text x="{x+8:.1f}" y="{cy+4}" class="tick">{fmtv(v)} →</text>')
            y += rowh
    out.append("</svg>")
    return "\n".join(out)


def scatter(rows, w=720, h=440):
    left, right, top, bot = 56, 20, 20, 44
    pw, ph = w - left - right, h - top - bot
    xmin, xmax = -1.0, 0.05
    ymin, ymax = 0, 0.6
    sx = lambda v: left + (max(xmin, v) - xmin) / (xmax - xmin) * pw
    sy = lambda v: top + ph - (v - ymin) / (ymax - ymin) * ph
    out = [f'<svg class="chart" viewBox="0 0 {w} {h}" role="img" aria-label="calibration gap versus instruction-marker rate" style="max-width:100%;height:auto">']
    for t in [-1.0, -0.8, -0.6, -0.4, -0.2, 0]:
        out.append(f'<line x1="{sx(t):.1f}" y1="{top}" x2="{sx(t):.1f}" y2="{top+ph}" class="grid{" zero" if t==0 else ""}"/>')
        out.append(f'<text x="{sx(t):.1f}" y="{h-24}" class="tick" text-anchor="middle">{t:+.1f}</text>')
    for t in [0, 0.2, 0.4, 0.6]:
        out.append(f'<line x1="{left}" y1="{sy(t):.1f}" x2="{left+pw}" y2="{sy(t):.1f}" class="grid"/>')
        out.append(f'<text x="{left-8}" y="{sy(t)+4:.1f}" class="tick" text-anchor="end">{int(t*100)}%</text>')
    out.append(f'<text x="{left+pw/2:.1f}" y="{h-6}" class="axis" text-anchor="middle">calibration gap on post-cutoff text, mean(H − s) in nats · 0 = calibrated, negative = over-confident</text>')
    out.append(f'<text transform="translate(14 {top+ph/2:.1f}) rotate(-90)" class="axis" text-anchor="middle">bare-BOS samples with chat/instruction markers</text>')
    for r in rows:
        if r["gap"] is None or r["marker"] is None:
            continue
        x, y = sx(r["gap"]), sy(r["marker"])
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="{CLASS_COLOR[r["cls"]]}" class="mark ring" data-tip="{esc(r["family"])} · {esc(r["label"])}: gap {r["gap"]:+.3f}, markers {r["marker"]*100:.0f}%"/>')
        if r.get("annot"):
            dx, dy = r["annot"]
            out.append(f'<text x="{x+dx:.1f}" y="{y+dy:.1f}" class="lbl">{esc(r["short"])}</text>')
    out.append("</svg>")
    return "\n".join(out)


def main():
    adir, outp = sys.argv[1], sys.argv[2]
    fps = json.load(open(os.path.join(adir, "fingerprints.json")))
    sc = json.load(open(os.path.join(adir, "truebase_scores.json")))
    def opt(name):
        p = os.path.join(adir, name)
        return json.load(open(p)) if os.path.exists(p) else {}
    selfboot = opt("selfboot.json").get("models", {}); names = opt("names_summary.json"); weird = opt("weird_summary.json")
    EXCLUDE = {"gemma-4-31B-it": "garbage output under this loading path (CE 6.0 nats on Pile, bare-BOS samples are glyph strings) while Gemma-4-31B-Base loads correctly; excluded pending a re-load check"}
    models = [m for m in CLASS if m in fps and m not in EXCLUDE]
    # ---- rows
    def row(m):
        f = fps[m]; fam, cls, lab, order = CLASS[m]
        return {"m": m, "family": fam, "cls": cls, "label": lab, "order": order,
                "gap": g(f, "F_calib_gap", "calib_gap"), "gap_src": "fresh" if g(f, "F_calib_gap") is not None else "Pile",
                "spread": g(f, "F_gap_domain_absmean", "calib_gap_domain_absmean"),
                "wiki": g(f, "X_runfrac_wiki", "verbatim_run_frac_wiki"), "marker": g(f, "roll_instr_marker_rate"),
                "ce": g(f, "F_CE", "CE_tok"), "p10": g(f, "X_docCE_p10/med_wiki"), "rep": g(f, "roll_rep8_q4"),
                "lowH": g(f, "roll_frac_H<0.1"), "score": sc[m]["overall"]}
    rows = sorted([row(m) for m in models], key=lambda r: (list(dict.fromkeys(CLASS[m][0] for m in models)).index(r["family"]), r["order"]))
    gap_rows = [{"family": r["family"], "label": r["label"], "cls": r["cls"], "value": r["gap"]} for r in rows]
    wiki_rows = [{"family": r["family"], "label": r["label"], "cls": r["cls"], "value": r["wiki"]} for r in rows]
    short = {"Trinity-Large-TrueBase": "TrueBase", "Trinity-Large-Base": "Trinity Base", "Trinity-Large-Preview": "Trinity Preview",
             "olmo2-7b_stage1-3896B": "OLMo stage1", "olmo2-7b_stage2-ing1-50B": "OLMo +50B anneal", "olmo2-7b_main": "OLMo Base",
             "olmo2-7b_sft": "OLMo SFT", "olmo2-7b_dpo": "OLMo DPO", "olmo2-7b_instruct": "OLMo Instruct", "Llama-3.1-70B": "Llama 70B",
             "Llama-3.1-405B": "Llama 405B", "Qwen3-30B-A3B-Base": "Qwen3 Base", "Qwen2.5-72B": "Qwen2.5-72B", "Olmo-3-1125-32B": "OLMo-3 32B", "DeepSeek-V4-Flash-Base": "V4-Flash Base", "DeepSeek-V4-Flash": "V4-Flash", "Qwen2.5-72B-Instruct": "Qwen2.5-72B-Inst", "Qwen3-30B-A3B": "Qwen3", "GLM-4-32B-Base-0414": "GLM-4 Base",
             "GLM-4-32B-0414": "GLM-4", "gemma-2-9b": "gemma-2-9b", "gemma-2-9b-it": "gemma-2-9b-it", "Gemma-4-31B-Base": "Gemma 4 Base",
             "gemma-4-31B-it": "Gemma 4 it", "MiMo-V2.5-Base": "MiMo Base", "MiMo-V2.5": "MiMo"}
    annots = {"Trinity-Large-TrueBase": (-62, -10), "olmo2-7b_stage2-ing1-50B": (8, -8), "Qwen3-30B-A3B-Base": (8, 4), "olmo2-7b_instruct": (8, 4),
              "olmo2-7b_dpo": (8, -8), "olmo2-7b_sft": (8, 4), "gemma-2-9b-it": (8, 14), "Qwen3-30B-A3B": (8, -8), "Trinity-Large-Base": (8, 14),
              "gemma-2-9b": (-66, 14), "GLM-4-32B-0414": (8, 4), "Llama-3.1-70B": (-62, 14), "Trinity-Large-Preview": (8, 4), "olmo2-7b_main": (8, -6)}
    sc_rows = [dict(r, short=short.get(r["m"], r["label"]), annot=annots.get(r["m"])) for r in rows]
    ece_rows = [{"family": r["family"], "label": r["label"], "cls": r["cls"], "value": (selfboot.get(r["m"], {}).get("reliability") or {}).get("ECE")} for r in rows]
    sur_rows = [{"family": r["family"], "label": r["label"], "cls": r["cls"], "value": (names.get(r["m"], {}).get("KL_few") if names.get(r["m"], {}).get("KL_few") is not None else names.get(r["m"], {}).get("KL_desc"))} for r in rows]
    ent_rows = [{"family": r["family"], "label": r["label"], "cls": r["cls"], "value": names.get(r["m"], {}).get("H_m")} for r in rows]
    href = next((v["H_r"] for v in names.values() if v.get("H_r")), None)
    sur_trs = []
    for r in sorted(rows, key=lambda r: ((names.get(r["m"], {}).get("KL_few") or names.get(r["m"], {}).get("KL_desc") or 9) if names.get(r["m"]) else 9)):
        n = names.get(r["m"])
        if not n:
            continue
        sur_trs.append(f'<tr><td><span class="sw" style="background:{CLASS_COLOR[r["cls"]]}"></span>{esc(r["family"])} <span class="muted">{esc(r["label"])}</span></td>'
                       f'<td class="num">{fmt(n.get("KL_few"))}</td><td class="num">{fmt(n.get("H_few"),2)}</td><td class="num">{fmt(n.get("KL_desc"))}</td><td class="num">{fmt(n.get("H_desc"),2)}</td><td class="num">{fmt(n.get("smith_plain"),2)}</td>'
                       f'<td class="num">{fmt(n["distinct"],2)}</td><td class="num">{fmt(n["junk"],2)}</td><td class="num">{fmt(n["surpr"],1)}</td></tr>')
    wd_models = [m for m in ["Trinity-Large-TrueBase", "Trinity-Large-Base", "Trinity-Large-Preview", "olmo2-7b_stage1-3896B", "olmo2-7b_main", "olmo2-7b_instruct",
                             "Llama-3.1-70B", "Llama-3.1-405B", "DeepSeek-V3-Base", "kimi-k2-base", "GLM-4-32B-Base-0414", "Qwen3-30B-A3B-Base"] if m in weird]
    wd_genres = sorted({g for m in wd_models for g in weird[m] if g != "ALL"})
    wd_head = "".join(f"<th class=\"num\">{esc(g.replace(' Backgrounds','').replace(' Emails',''))}</th>" for g in wd_genres)
    wd_trs = []
    for m in wd_models:
        cells = "".join((f"<td class=\"num\">{weird[m][g][0]:+.2f} <span class=\"muted small\">{weird[m][g][1]*100:.0f}%</span></td>" if g in weird[m] else "<td class=\"num muted\">–</td>") for g in wd_genres)
        wd_trs.append(f"<tr><td>{esc(CLASS[m][0])} <span class=\"muted\">{esc(CLASS[m][2])}</span></td><td class=\"num\">{weird[m]['ALL'][0]:+.3f}</td>{cells}</tr>")
    # ---- table
    def cell(v, d=3, signed=False, cls=""):
        return f'<td class="num {cls}">{fmt(v, d, signed)}</td>'
    trs = []
    for r in sorted(rows, key=lambda r: -(r["score"] if r["score"] is not None else -1)):
        s = r["score"]
        bar = f'<span class="scorebar" style="--w:{(s or 0)*100:.0f}%"><i></i></span>{s:.2f}' if s is not None else "–"
        trs.append(f'<tr><td><span class="sw" style="background:{CLASS_COLOR[r["cls"]]}"></span>{esc(r["family"])} <span class="muted">{esc(r["label"])}</span></td>'
                   f'<td class="num score">{bar}</td>{cell(r["gap"],3,True)}{cell(r["spread"])}{cell(r["wiki"],3)}'
                   f'<td class="num">{fmt((r["marker"] or 0)*100 if r["marker"] is not None else None,0)}%</td>{cell(r["ce"],3)}<td class="muted small">{r["gap_src"]}</td></tr>')
    n_models = len(rows)
    page = f"""<title>True-Base Fingerprints</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* layout: single reading column (~68ch) with charts allowed to run to 760px; data in mono */
:root {{ --bg:#f7f6f2; --fg:#1d1c1a; --fg2:#5a5852; --mute:#8b887f; --rule:#dcd9d0; --card:#fffefb; --accent:#1c5cab;
  --s1:#2a78d6; --s1b:#86b6ef; --s2:#eb6834; --s3:#1baf7a; --grid:#e6e3da; --zero:#8b887f;
  --serif:"Spectral",Georgia,"Times New Roman",serif; --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#17171a; --fg:#ebe9e3; --fg2:#b9b6ad; --mute:#8b887f; --rule:#34343a; --card:#1f1f24; --accent:#6da7ec;
  --s1:#3987e5; --s1b:#5598e7; --s2:#d95926; --s3:#199e70; --grid:#2a2a30; --zero:#8b887f; color-scheme:dark }} }}
:root[data-theme="dark"] {{ --bg:#17171a; --fg:#ebe9e3; --fg2:#b9b6ad; --mute:#8b887f; --rule:#34343a; --card:#1f1f24; --accent:#6da7ec;
  --s1:#3987e5; --s1b:#5598e7; --s2:#d95926; --s3:#199e70; --grid:#2a2a30; --zero:#8b887f; color-scheme:dark }}
body {{ background:var(--bg); color:var(--fg); font-family:var(--serif); font-size:17px; line-height:1.55; padding-block:40px 80px; padding-inline:16px; }}
main {{ max-width:760px; margin:0 auto; }}
h1 {{ font-weight:600; font-size:2rem; line-height:1.15; margin:0 0 .3rem; text-wrap:balance; letter-spacing:-.01em }}
h2 {{ font-weight:600; font-size:1.3rem; margin:2.6rem 0 .6rem; text-wrap:balance }}
h3 {{ font-weight:600; font-size:1.05rem; margin:1.6rem 0 .4rem }}
p, li {{ max-width:68ch }}
.lede {{ color:var(--fg2); font-size:1.05rem; margin:0 0 1.2rem }}
.meta {{ font-family:var(--mono); font-size:.78rem; color:var(--mute); letter-spacing:.02em; margin-bottom:2rem }}
.kpis {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin:1.4rem 0 }}
.kpi {{ background:var(--card); border:1px solid var(--rule); padding:12px 14px; min-width:0 }}
.kpi b {{ display:block; font-family:var(--mono); font-size:1.5rem; font-weight:500; font-variant-numeric:tabular-nums }}
.kpi span {{ font-size:.85rem; color:var(--fg2) }}
figure {{ margin:1rem 0 1.6rem }}
figcaption {{ font-size:.88rem; color:var(--fg2); margin-top:.4rem; max-width:68ch }}
.legend {{ display:flex; flex-wrap:wrap; gap:14px; font-family:var(--mono); font-size:.76rem; color:var(--fg2); margin:.2rem 0 .6rem }}
.legend span::before {{ content:""; display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; background:var(--c); vertical-align:-1px }}
.chart {{ display:block; font-family:var(--mono) }}
.chart .grid {{ stroke:var(--grid); stroke-width:1 }} .chart .grid.zero {{ stroke:var(--zero); stroke-width:1.5 }}
.chart .tick, .chart .axis {{ fill:var(--mute); font-size:11px }} .chart .axis {{ font-size:11.5px }}
.chart .lbl {{ fill:var(--fg2); font-size:11.5px }} .chart .fam {{ fill:var(--fg); font-size:12px; font-weight:500 }}
.chart .stem {{ stroke-width:2; opacity:.55 }} .chart .mark {{ cursor:default }} .chart .ring {{ stroke:var(--bg); stroke-width:2 }}
.chart .mark:hover {{ stroke:var(--fg); stroke-width:2 }}
#tip {{ position:fixed; pointer-events:none; background:var(--fg); color:var(--bg); font-family:var(--mono); font-size:.76rem; padding:5px 8px; border-radius:3px; max-width:280px; z-index:9 }}
.tablewrap {{ overflow-x:auto; margin:1rem 0; border-top:1px solid var(--rule) }}
table {{ border-collapse:collapse; width:100%; font-size:.86rem; min-width:720px }}
th {{ text-align:left; font-family:var(--mono); font-weight:500; font-size:.72rem; color:var(--mute); letter-spacing:.03em; text-transform:uppercase; padding:10px 8px 6px; border-bottom:1px solid var(--rule); vertical-align:bottom }}
td {{ padding:7px 8px; border-bottom:1px solid var(--rule); vertical-align:middle }}
td.num, th.num {{ text-align:right; font-family:var(--mono); font-variant-numeric:tabular-nums; white-space:nowrap }}
td.score {{ min-width:120px }}
.scorebar {{ display:inline-block; width:64px; height:7px; background:var(--grid); margin-right:8px; vertical-align:middle; position:relative }}
.scorebar i {{ position:absolute; inset:0 auto 0 0; width:var(--w); background:var(--accent) }}
.sw {{ display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:7px; vertical-align:0 }}
.muted {{ color:var(--mute) }} .small {{ font-size:.78rem; font-family:var(--mono) }}
code, .mono {{ font-family:var(--mono); font-size:.86em }}
.note {{ border-left:3px solid var(--accent); padding:.2rem 0 .2rem 14px; color:var(--fg2); margin:1.2rem 0 }}
dl {{ display:grid; grid-template-columns:max-content 1fr; gap:6px 16px; font-size:.95rem }} dt {{ font-family:var(--mono); font-size:.82rem; color:var(--fg2); padding-top:3px }} dd {{ margin:0; max-width:60ch }}
@media (max-width:520px) {{ dl {{ grid-template-columns:1fr }} body {{ font-size:16px }} h1 {{ font-size:1.6rem }} }}
@media (prefers-reduced-motion: no-preference) {{ .scorebar i {{ transition:width .3s }} }}
</style>
<main>
<h1>How much of a true base is it?</h1>
<p class="lede">A reference-free fingerprint that places any causal LM on the line from pre-anneal pretraining checkpoint to post-trained assistant, built from exact next-token entropy and varentropy on fixed text.</p>
<div class="meta">{n_models} checkpoints · 8× B200 per model · HF transformers (bf16 / native FP8) and vLLM 0.30 · 2026-10-09/10</div>

<div class="kpis">
 <div class="kpi"><b>+0.008</b><span>Trinity TrueBase gap on post-cutoff text (calibrated)</span></div>
 <div class="kpi"><b>−0.065</b><span>Trinity Base after the anneal; −0.099 Preview</span></div>
 <div class="kpi"><b>−0.92</b><span>OLMo-2 Instruct; SFT −0.40, DPO −0.85</span></div>
 <div class="kpi"><b>1.5% → 10%</b><span>Wikipedia tokens inside verbatim runs, TrueBase → Base</span></div>
</div>

<h2>The measurement</h2>
<p>For every model: the full-vocabulary next-token distribution at every position of three fixed corpora, teacher-forced, and at every step of 64 free-running samples at temperature 1 with no truncation. From each distribution: entropy <span class="mono">H</span>, varentropy <span class="mono">V = Var[−log p]</span>, the surprisal <span class="mono">s</span> of the token that actually came next, top-1 probability and the rank of the actual token.</p>
<dl>
<dt>Pile slice</dt><dd>400 pile-10k documents, ≤2048 tokens each, ≈290k tokens. In most pretraining sets, so it also measures recall.</dd>
<dt>Wikipedia + GitHub</dt><dd>150 + 60 further pile-10k documents, for the memorization features.</dd>
<dt>Post-cutoff</dt><dd>900 documents from UncheatableEval 2026-04 (ao3, arXiv, bioRxiv, BBC, GitHub, Wikipedia in 15 categories), ≈1.3M tokens. Written after every model's cutoff, so nothing here can be recalled.</dd>
<dt>Own samples</dt><dd>32 sequences from a bare <span class="mono">&lt;bos&gt;</span> and 32 from 32-token document openers, 1536 steps each; sampling continues past end-of-text.</dd>
</dl>

<h2>What separates a true base</h2>
<p><strong>Calibration.</strong> A pre-anneal checkpoint is calibrated: its mean entropy equals its mean surprisal on text it has never seen, to within a hundredth of a nat, in every domain. Every later stage pushes <span class="mono">mean(H − s)</span> negative: the model is more confident than it is right. The gap grows monotonically through the OLMo-2 post-training ladder and separates every base/instruct pair in the sweep.</p>
<div class="legend"><span style="--c:var(--s1)">pre-anneal checkpoint</span><span style="--c:var(--s1b)">mid-anneal checkpoint</span><span style="--c:var(--s2)">released base</span><span style="--c:var(--s3)">post-trained</span></div>
<figure>
{dot_chart(gap_rows, "gap", "calibration gap by model", -0.30, 0.04, [-0.3, -0.2, -0.1, 0], lambda v: f"{v:+.2f}")}
<figcaption>Calibration gap <span class="mono">mean(H − s)</span> in nats per token on the post-cutoff corpus (Pile where the fresh pass is still pending, marked in the table). Dashed marks are clipped at −0.30; their values are printed.</figcaption>
</figure>

<p><strong>Memorization of the anneal mix.</strong> Trinity's anneal (10T → 17T tokens, with instruction data introduced) left the model reciting its up-weighted sources. Of the 1,620 Pile positions where TrueBase had ≥2 nats of uncertainty and Base under 0.3, Base is right 97% of the time, 900 are Wikipedia, and 625 come from a single article. Wikipedia cross-entropy fell 27% while web text fell 4%. Post-training (Preview) added no further recall. Llama 3.1 405B shows the same signature more strongly on Pile Wikipedia (25% of tokens in verbatim runs); OLMo-2's 50B-token anneal shows none of it.</p>
<figure>
{dot_chart(wiki_rows, "wiki", "wikipedia verbatim runs by model", 0, 0.30, [0, 0.1, 0.2, 0.3], lambda v: f"{v*100:.0f}%", zero=False)}
<figcaption>Share of Wikipedia tokens inside verbatim runs: ≥16 consecutive tokens where the model's top-1 is the actual token with entropy under 0.2 nats (150-document set; 24-document Pile set where the larger pass is pending).</figcaption>
</figure>

<p><strong>What the prior contains.</strong> Sampling from a bare <span class="mono">&lt;bos&gt;</span> shows what the model thinks a document is. OLMo-2's anneal keeps calibration intact but injects instruction data: the share of samples containing chat or instruction markers goes 0% → 22% → 31% across the anneal, with calibration unchanged. Qwen3-30B-A3B-Base is calibrated on fresh text yet 41% of its samples are instruction-formatted, which is why it is not a true base either. The two axes are independent and both are needed.</p>
<figure>
{scatter(sc_rows)}
<figcaption>Each point is a checkpoint. Horizontal: calibration gap on post-cutoff text (clipped at −1.0). Vertical: fraction of 32 bare-BOS samples with at least one chat/instruction marker (<span class="mono">Assistant:</span>, <span class="mono">### Instruction</span>, <span class="mono">You will be given</span>, <span class="mono">step by step</span>, …). Pre-anneal checkpoints sit in the top-left corner of the lower-right block: near 0 and near 0%.</figcaption>
</figure>

<p><strong>What does not work.</strong> Free-running collapse is not the signal. At temperature 1, both Trinity TrueBase and Base fall into single-glyph attractors (<span class="mono">‚‚‚‚</span>, <span class="mono">❨❨❨</span>) in a quarter to a third of 1536-step rollouts, and TrueBase is slightly worse; the instruct Preview is the least degenerate of the three. Varentropy at matched entropy drops with annealing (V 3.10 → 2.76 on Pile) but moves non-monotonically across families, so it is reported but not scored.</p>

<h2>Probe-free: reliability of the top-1 prediction</h2>
<p>The calibration gap can be read without any designed probe. Bin every position of the post-cutoff corpus by the model's top-1 probability and compare with how often that token actually came next; the expected gap is the ECE. Pre-anneal and annealed bases sit at 0.005–0.012; post-training moves it to 0.03–0.12, and within every family the share of positions where the model is at least 90% sure rises while its top-1 accuracy falls.</p>
<figure>
{dot_chart(ece_rows, "ece", "top-1 expected calibration error", 0, 0.13, [0, 0.05, 0.10], lambda v: f"{v:.3f}", zero=False)}
<figcaption>Top-1 expected calibration error on the post-cutoff corpus (10 confidence bins). Any natural text works; this needs no prompt.</figcaption>
</figure>

<h2>Gwern's surname test</h2>
<p>Asked for random American surnames, does the model reproduce the population frequency distribution? Reference: 2010 Census surname counts. For the first list slot the distribution over the 2,000 most common surnames is computed exactly (both Title-case and ALL-CAPS spellings scored), under three prompt frames that differ in how "random" is phrased; sixteen 400-token lists are then sampled at temperature 1 per frame. Two things confound the naive version. Told in words that a list is random, every model answers with the <em>genre</em> "list of common surnames", which in training data begins Smith, Johnson, Williams — pre-anneal Trinity puts 38–56% on Smith at item 1 — and post-training sharpens this reflex into verbatim recitation of the ranked Census list (DeepSeek-V3-Base 12% on Smith, V3 chat 84%). Given six genuine Census draws as items 1–6 instead, the genre is broken and item 7 reads the prior itself; that is the number charted. Absolute KL also carries the internet's tilt toward famous names, so within-family deltas are the cleanest reading.</p>
<figure>
{dot_chart(sur_rows, "kl", "surname KL to census", 0, 3.0, [0, 1, 2, 3], lambda v: f"{v:.2f}", zero=False)}
<figcaption>KL(Census ∥ model) over the Census top-2,000 surnames, mean of the three few-shot frames (six genuine Census draws given, distribution read at item 7). Lower = closer to the population distribution.</figcaption>
</figure>
<div class="tablewrap"><table>
<thead><tr><th>checkpoint</th><th class="num">KL few-shot</th><th class="num">H few-shot</th><th class="num">KL described</th><th class="num">H described</th><th class="num">p(Smith) plain</th><th class="num">distinct</th><th class="num">junk</th><th class="num">surprise</th></tr></thead>
<tbody>{"".join(sur_trs)}</tbody></table></div>
<p class="muted small">Few-shot: six genuine Census draws are given as items 1–6 and the distribution is read at item 7 (three draws, averaged). Described: the model is told in words that the list is random and frequency-weighted (three phrasings, averaged); p(Smith) plain is the probability of "Smith" as the first item under the plainest phrasing — the ranked-list reflex. H is the model's entropy over the 2,000-name set (Census: {fmt(href,2) if href else "–"}). Sampled columns: distinct = unique names / names generated; junk = share of generated names not among the 162,253 Census surnames; surprise = mean −log p<sub>Census</sub> of generated in-Census names (sampling from the Census distribution itself gives ≈ 10.4 nats; a collapsed model scores lower).</p>

<h2>Weird genres instead of Wikipedia</h2>
<p>Recitation measured on Wikipedia is expected: it is in every anneal mix. The rarer Pile genres separate "memorised the anneal mix" from "memorised the corpus", and calibration on strange text is the harder test. Cells show the calibration gap and, in grey, the share of tokens inside verbatim runs.</p>
<div class="tablewrap"><table>
<thead><tr><th>checkpoint</th><th class="num">all</th>{wd_head}</tr></thead>
<tbody>{"".join(wd_trs)}</tbody></table></div>

<h2>Score</h2>
<p>Four sub-scores, each a clipped linear ramp between a true-base anchor and a post-trained anchor, averaged. The ramps are set from the Trinity triple and checked against the OLMo-2 ladder; they are deliberately coarse.</p>
<dl>
<dt>calib</dt><dd>gap on post-cutoff text: 0 → 1, −0.10 → 0</dd>
<dt>spread</dt><dd>mean |per-domain gap| on post-cutoff text: 0.015 → 1, 0.10 → 0</dd>
<dt>memo</dt><dd>Wikipedia verbatim-run share: 2% → 1, 12% → 0</dd>
<dt>prior</dt><dd>instruction-marker rate in bare-BOS samples: 0% → 1, 40% → 0</dd>
</dl>
<div class="tablewrap"><table>
<thead><tr><th>checkpoint</th><th class="num">score</th><th class="num">gap</th><th class="num">domain |gap|</th><th class="num">wiki runs</th><th class="num">markers</th><th class="num">CE fresh</th><th>gap src</th></tr></thead>
<tbody>{"".join(trs)}</tbody></table></div>

<h2>Reading the table</h2>
<ul>
<li>Three pre-anneal checkpoints from two labs (Trinity TrueBase at 10T, OLMo-2 at 2.9T and 3.9T) score 0.96–0.98. Nothing released as a "base" reaches them except GLM-4-32B-Base (0.96) and Llama-3.1-70B (0.92).</li>
<li>Annealing is lab-specific. Trinity's cost calibration and added recitation; OLMo-2's cost neither but reshaped the prior toward instruction data. A single-number score hides which happened; the four columns do not.</li>
<li>Gemma-2-9b base scores like an instruct model on calibration (gap −0.158) with a clean prior. It is distilled from a larger teacher during pretraining; distillation is a third way a "base" stops being a true base.</li>
<li>Post-training is an order of magnitude larger than anything in pretraining: SFT alone moves OLMo-2 from −0.006 to −0.40, DPO to −0.85.</li>
<li>The three largest open bases split along the two axes. DeepSeek-V3-Base is a clean annealed base (gap −0.021, 4% of Wikipedia tokens in verbatim runs, no instruction markers in its samples). Kimi-K2-Base is just as calibrated (−0.016) but recites Wikipedia like Llama-3.1-405B does (16% and 22% of tokens in verbatim runs). Their chat models move to −0.24 (V3) and −0.20 (K2); K2-Instruct also loses most of the recitation (2.6%), V3 keeps it.</li>
</ul>
<div class="note">Caveats: 24–150 Wikipedia documents is a small sample for the memorization share; the marker list is a heuristic and 32 samples give ±8% resolution; gaps are in nats per token and compare directly only within a tokenizer family (chars per token range 4.2–4.6 here, so cross-family rankings are unaffected). Pile gaps run about 0.02 lower than post-cutoff gaps for models that trained on the Pile. gemma-4-31B-it is excluded: it produced garbage under this loading path (cross-entropy 6.0 nats on Pile, bare-BOS samples are glyph strings) while Gemma-4-31B-Base loaded correctly through the same code. MiMo-V2.5 is excluded: neither transformers (FP8 quantizer vs. the checkpoint's custom expert layout) nor vLLM 0.30 (FP8 QKV sharding of its mixed 4/8-KV-head layers) loads it correctly yet. Kimi K2 was loaded through transformers' native DeepSeek-V3 class (identical architecture) and Cogito 671B through vLLM in bf16; both FP8 giants (DeepSeek-V3, K2) run in their native fine-grained FP8. The FP8 MoE models used a 300-document subset of the post-cutoff corpus (20 per category) and 1024-step rollouts.</div>

<h2>Reproduce</h2>
<p>Code and results on node1 under <span class="mono">/models/varentropy/</span>: <span class="mono">scripts/vh_score.py</span> (measurement), <span class="mono">vh_analyze.py --all</span> (fingerprints), <span class="mono">vh_memo.py</span> (memorization), <span class="mono">vh_truebase.py</span> (score), <span class="mono">vh_report.py</span> (this page). To fingerprint a new checkpoint: <span class="mono">python scripts/vh_score.py --model PATH --extra-corpus tf_wiki=corpus/pile10k_wiki.json --extra-corpus tf_fresh=corpus/uncheat.json</span>, then re-run the analysis.</p>
</main>
<div id="tip" hidden></div>
<script>
(function(){{var tip=document.getElementById('tip');document.querySelectorAll('.mark').forEach(function(m){{
 m.addEventListener('mousemove',function(e){{tip.textContent=m.dataset.tip;tip.hidden=false;tip.style.left=Math.min(e.clientX+12,window.innerWidth-290)+'px';tip.style.top=(e.clientY+14)+'px';}});
 m.addEventListener('mouseleave',function(){{tip.hidden=true;}});}});}})();
</script>
"""
    open(outp, "w").write(page)
    print("wrote", outp, len(page), "bytes")


if __name__ == "__main__":
    main()
