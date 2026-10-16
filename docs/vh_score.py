#!/usr/bin/env python
"""Per-token entropy / varentropy profiling of a causal LM.

Two measurements, both with the *full* next-token distribution (no top-k approximation):

  1. teacher-forced: run a fixed shared corpus through the model and record, at every position,
     H (entropy, nats), V (varentropy = Var_{x~p}[-log p(x)]), s (surprisal of the actual next
     token), p1 / top1 (prob and id of the argmax), rank (rank of the actual token).
  2. rollouts: free-running sampling at temperature T (default 1.0, no truncation) from
     (a) a bare document-start token and (b) short document openers; the same statistics are
     recorded at every sampled step (s = surprisal of the token that was sampled).

Everything is plain HF transformers with device_map="auto" (pipeline over all visible GPUs), so
the same code path serves dense and MoE checkpoints and arbitrary sizes.
"""
import argparse, json, os, sys, time, math
import numpy as np
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModelForCausalLM


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


TEMPS = (0.8, 0.9, 1.1, 1.25)  # surprisal at these temperatures (s at T=1 is `s`); columns sT08, sT09, sT11, sT125
TEMP_COLS = ("sT08", "sT09", "sT11", "sT125")
TAIL_THRESH = (1e-2, 1e-3, 1e-4)  # predicted tail mass: total probability on tokens with p < thr (columns m2, m3, m4)


def tail_mass(p):
    """p: (N, V) probabilities -> (N, 3) mass below each TAIL_THRESH."""
    return torch.stack([(p * (p < t)).sum(-1) for t in TAIL_THRESH], -1)


def dist_stats(logits):
    """logits: (N, V) any float dtype on GPU -> dict of (N,) tensors + logp (N, V) float32."""
    logp = F.log_softmax(logits.float(), dim=-1)
    p = logp.exp()
    H = -(p * logp).sum(-1)
    V = (p * (logp + H[:, None]) ** 2).sum(-1)
    p1, t1 = p.max(-1)
    return H, V, p1, t1, logp


def prep_ids(tok, text, max_len, min_len=8, start_id=None):
    """Tokenize one document; None if too short. start_id: make sure the sequence starts with this id
    (the prior probe scores P(opener | <bos>) and needs a start token even for tokenizers that add none)."""
    ids = tok(text, add_special_tokens=True, truncation=True, max_length=max_len)["input_ids"]
    if start_id is not None and (not ids or ids[0] != start_id):
        ids = [start_id] + ids[: max_len - 1]
    return ids if len(ids) >= min_len else None


def load_corpus(path):
    with open(path) as f:
        return json.load(f)


def build_corpus(out_path, arrow_path, n_tf, n_openers, min_chars=400, seed=0):
    """Fixed shared selection from pile-10k; written once, reused by every model."""
    if os.path.exists(out_path):
        return load_corpus(out_path)
    from datasets import Dataset
    ds = Dataset.from_file(arrow_path)
    rng = np.random.RandomState(seed)
    order = rng.permutation(len(ds))
    tf, op = [], []
    for i in order:
        r = ds[int(i)]
        txt = r["text"]
        if len(txt) < min_chars:
            continue
        item = {"idx": int(i), "set": r["meta"].get("pile_set_name"), "text": txt}
        if len(tf) < n_tf:
            tf.append(item)
        elif len(op) < n_openers:
            op.append(item)
        else:
            break
    corpus = {"source": "NeelNanda/pile-10k", "seed": seed, "tf": tf, "openers": op}
    with open(out_path, "w") as f:
        json.dump(corpus, f)
    return corpus


@torch.no_grad()
def teacher_forced(model, tok, docs, max_len, out_dir, chunk=512, tag="tf", min_len=8, start_id=None):
    cols = {k: [] for k in ["H", "V", "s", "p1", "top1", "rank", "tok", "doc", "pos", "m2", "m3", "m4", *TEMP_COLS]}
    meta = []
    t0 = time.time()
    ntok = 0
    for di, d in enumerate(docs):
        ids = prep_ids(tok, d["text"], max_len, min_len, start_id)
        if ids is None:
            continue
        x = torch.tensor(ids, device=model.device)[None]
        try:
            logits = model(input_ids=x, use_cache=False).logits[0]  # (L, V)
        except torch.cuda.OutOfMemoryError:
            log(f"OOM on doc {di} (len {len(ids)}), skipping")
            torch.cuda.empty_cache()
            continue
        L = logits.shape[0] - 1  # predictions for positions 0..L-1 -> targets 1..L
        tgt = x[0, 1:]
        for a in range(0, L, chunk):
            b = min(a + chunk, L)
            lg = logits[a:b]
            H, V, p1, t1, logp = dist_stats(lg)
            tg = tgt[a:b]
            s = -logp.gather(1, tg[:, None])[:, 0]
            tl = lg.float().gather(1, tg[:, None])
            rank = (lg.float() > tl).sum(-1)
            tm = tail_mass(logp.exp()).half().cpu()
            cols["m2"].append(tm[:, 0]); cols["m3"].append(tm[:, 1]); cols["m4"].append(tm[:, 2])
            lgf = lg.float()
            for T, col in zip(TEMPS, TEMP_COLS):  # surprisal of the real token under temperature T
                cols[col].append((-F.log_softmax(lgf / T, dim=-1).gather(1, tg[:, None])[:, 0]).half().cpu())
            cols["H"].append(H.half().cpu()); cols["V"].append(V.half().cpu())
            cols["s"].append(s.half().cpu()); cols["p1"].append(p1.half().cpu())
            cols["top1"].append(t1.int().cpu()); cols["rank"].append(rank.int().cpu())
            cols["tok"].append(tg.int().cpu())
            cols["doc"].append(torch.full((b - a,), di, dtype=torch.int32))
            cols["pos"].append(torch.arange(a, b, dtype=torch.int32))
        meta.append({"doc": di, "idx": d["idx"], "set": d["set"], "ntok": L + 1})
        ntok += L
        del logits
        if di % 20 == 0:
            el = time.time() - t0
            log(f"tf doc {di}/{len(docs)} len={L+1} total_tok={ntok} {ntok/el:.0f} tok/s")
    arrs = {k: torch.cat(v).numpy() for k, v in cols.items()}
    np.savez_compressed(os.path.join(out_dir, f"{tag}.npz"), **arrs)
    with open(os.path.join(out_dir, f"{tag}_docs.json"), "w") as f:
        json.dump(meta, f)
    log(f"tf done: {ntok} tokens in {time.time()-t0:.0f}s")


@torch.no_grad()
def rollout_group(model, tok, prompt_ids, steps, temperature, seed, tag):
    """prompt_ids: list of equal-length id lists. Returns dict of (B, steps) arrays."""
    from transformers import DynamicCache
    B = len(prompt_ids)
    x = torch.tensor(prompt_ids, device=model.device)
    past = DynamicCache(config=model.config) if "config" in DynamicCache.__init__.__code__.co_varnames else DynamicCache()
    rec = {k: torch.empty((B, steps), dtype=torch.float16) for k in ["H", "V", "s", "p1"]}
    rec["top1"] = torch.empty((B, steps), dtype=torch.int32)
    rec["tok"] = torch.empty((B, steps), dtype=torch.int32)
    gen = None
    t0 = time.time()
    out = model(input_ids=x, past_key_values=past, use_cache=True, logits_to_keep=1)
    for t in range(steps):
        logits = out.logits[:, -1, :].float()
        if gen is None:
            gen = torch.Generator(device=logits.device).manual_seed(seed)
        H, V, p1, t1, logp_raw = dist_stats(logits)
        if temperature == 1.0:
            logp = logp_raw
        else:
            logp = F.log_softmax(logits / temperature, dim=-1)
        nxt = torch.multinomial(logp.exp(), 1, generator=gen)  # (B,1)
        s = -logp_raw.gather(1, nxt)[:, 0]  # surprisal under the raw (T=1) distribution
        rec["H"][:, t] = H.half().cpu(); rec["V"][:, t] = V.half().cpu()
        rec["s"][:, t] = s.half().cpu(); rec["p1"][:, t] = p1.half().cpu()
        rec["top1"][:, t] = t1.int().cpu(); rec["tok"][:, t] = nxt[:, 0].int().cpu()
        out = model(input_ids=nxt.to(model.device), past_key_values=past, use_cache=True, logits_to_keep=1)
        if t % 200 == 0:
            el = time.time() - t0
            log(f"rollout[{tag}] step {t}/{steps} {(t+1)*B/max(el,1e-6):.0f} tok/s meanH={H.mean():.2f}")
    del past, out
    torch.cuda.empty_cache()
    return {k: v.numpy() for k, v in rec.items()}


def rollouts(model, tok, corpus, args, out_dir):
    start_id = tok.bos_token_id if tok.bos_token_id is not None else tok.eos_token_id
    groups = {}
    if args.n_bos > 0:
        groups["bos"] = [[start_id]] * args.n_bos
    if args.n_openers > 0:
        ops = []
        for d in corpus["openers"][: args.n_openers]:
            ids = tok(d["text"], add_special_tokens=True, truncation=True, max_length=args.opener_len)["input_ids"]
            if len(ids) == args.opener_len:
                ops.append(ids)
        groups["openers"] = ops
    res = {}
    for name, prompts in groups.items():
        for i in range(0, len(prompts), args.rollout_batch):
            batch = prompts[i: i + args.rollout_batch]
            r = rollout_group(model, tok, batch, args.rollout_steps, args.temperature,
                              seed=args.seed + i, tag=f"{name}:{i}")
            for k, v in r.items():
                res.setdefault(f"{name}_{k}", []).append(v)
            res.setdefault(f"{name}_prompt", []).append(np.array(batch, dtype=np.int32))
    arrs = {k: np.concatenate(v, 0) for k, v in res.items()}
    arrs["start_id"] = np.array(start_id)
    np.savez_compressed(os.path.join(out_dir, "rollouts.npz"), **arrs)
    # human-readable dump
    with open(os.path.join(out_dir, "rollouts.jsonl"), "w") as f:
        for name in groups:
            toks = arrs[f"{name}_tok"]; pr = arrs[f"{name}_prompt"]
            for i in range(toks.shape[0]):
                f.write(json.dumps({"group": name, "i": i,
                                    "prompt": tok.decode(pr[i].tolist()),
                                    "text": tok.decode(toks[i].tolist()),
                                    "meanH": float(arrs[f"{name}_H"][i].astype(np.float32).mean()),
                                    "meanV": float(arrs[f"{name}_V"][i].astype(np.float32).mean())}) + "\n")
    log("rollouts done")


# ---------------- names distribution probe (Gwern's surname test) ----------------
SURNAME_PROMPTS = {
    "pop": "Below is a list of 100 American surnames drawn at random from the U.S. population, so common surnames appear more often than rare ones. The list is in random order, not alphabetical.\n\n1.",
    "census": "Random sample of 100 U.S. last names, drawn in proportion to their frequency in the 2010 Census, listed in the order they were drawn:\n\n1.",
    "plain": "Here are the last names of 100 randomly chosen Americans, in no particular order:\n\n1.",
    "fewshot1": "Last names of six randomly selected U.S. residents:\n\n1. Collins\n2. Johnson\n3. Whitaker\n4. Matias\n5. Trujillo\n6. Oneill\n7.",
    "fewshot2": "Last names of six randomly selected U.S. residents:\n\n1. Watson\n2. Rubio\n3. Adkins\n4. Beltz\n5. Evans\n6. Carlson\n7.",
    "fewshot3": "Last names of six randomly selected U.S. residents:\n\n1. Graham\n2. Brock\n3. Calderon\n4. Medina\n5. Danforth\n6. Morris\n7.",
}
FIRSTNAME_PROMPTS = {
    "pop": "Below is a list of 100 American first names drawn at random from the U.S. population, so common names appear more often than rare ones. The list is in random order, not alphabetical.\n\n1.",
    "plain": "Here are the first names of 100 randomly chosen Americans, in no particular order:\n\n1.",
}


@torch.no_grad()
def score_candidates(model, tok, prompt, cands, bs=96):
    """log P(name | prompt), exact: name tokens only (no terminator), summed over Title-case and ALL-CAPS spellings."""
    pid = tok(prompt, add_special_tokens=True)["input_ids"]
    variants = [[tok(" " + c, add_special_tokens=False)["input_ids"], tok(" " + c.upper(), add_special_tokens=False)["input_ids"]] for c in cands]
    flat = [v for vs in variants for v in vs]
    out = []
    pad = tok.pad_token_id if tok.pad_token_id is not None else 0
    for a in range(0, len(flat), bs):
        chunk = flat[a:a + bs]
        L = max(len(c) for c in chunk)
        ids = torch.full((len(chunk), len(pid) + L), pad, dtype=torch.long)
        mask = torch.zeros_like(ids)
        for i, c in enumerate(chunk):
            seq = pid + c
            ids[i, :len(seq)] = torch.tensor(seq); mask[i, :len(seq)] = 1
        ids, mask = ids.to(model.device), mask.to(model.device)
        logits = model(input_ids=ids, attention_mask=mask, use_cache=False).logits.float()
        logp = torch.log_softmax(logits, -1)
        for i, c in enumerate(chunk):
            lp = 0.0
            for j, t in enumerate(c):
                lp += float(logp[i, len(pid) - 1 + j, t])
            out.append(lp)
    out = np.array(out).reshape(len(cands), 2)
    return np.logaddexp(out[:, 0], out[:, 1])


def dist_metrics(logp_model, counts):
    """Compare the model's (unnormalised) log-probs over a candidate set with reference counts."""
    lp = np.array(logp_model, np.float64); c = np.array(counts, np.float64)
    mass_in_set = float(np.exp(lp).sum())
    pm = np.exp(lp - lp.max()); pm /= pm.sum()
    pc = c / c.sum()
    eps = 1e-12
    kl_cm = float((pc * np.log((pc + eps) / (pm + eps))).sum()); kl_mc = float((pm * np.log((pm + eps) / (pc + eps))).sum())
    Hm = float(-(pm * np.log(pm + eps)).sum()); Hc = float(-(pc * np.log(pc + eps)).sum())
    order = np.argsort(-pm)
    top10 = float(pm[order[:10]].sum()); top10c = float(pc[:10].sum())
    r = np.arange(1, len(pm) + 1)
    slope = float(np.polyfit(np.log(r[:500]), np.log(pm[order][:500] + eps), 1)[0])
    slope_c = float(np.polyfit(np.log(r[:500]), np.log(pc[:500] + eps), 1)[0])
    return {"mass_in_set": mass_in_set, "KL(ref||model)": kl_cm, "KL(model||ref)": kl_mc, "H_model": Hm, "H_ref": Hc,
            "top10_model": top10, "top10_ref": top10c, "zipf_slope_model": slope, "zipf_slope_ref": slope_c,
            "top5_model": [(int(i), round(float(pm[i]), 4)) for i in order[:5]], "p_rank1_ref_name": float(pm[0])}


def parse_list(text, allowed=None):
    import re
    names = []
    for line in text.split("\n"):
        m = re.match(r"^\s*(\d{1,3})[.)]\s+([A-Z][A-Za-z'\-]+(?: [A-Z][A-Za-z'\-]+){0,2})\s*$", line)
        if m:
            names.append(m.group(2).strip().title())
    return names


def sample_metrics(names, ref_counts_by_name, ref_total):
    """names: generated list; ref: dict name->count. Returns diversity + census-surprise metrics."""
    import math
    n = len(names)
    if n == 0:
        return {"n": 0}
    cnt = {}
    for x in names:
        cnt[x] = cnt.get(x, 0) + 1
    distinct = len(cnt)
    in_ref = [x for x in names if x in ref_counts_by_name]
    junk = 1 - len(in_ref) / n
    surprise = [-math.log(ref_counts_by_name[x] / ref_total) for x in in_ref]
    top = sorted(cnt.items(), key=lambda kv: -kv[1])[:10]
    simpson = sum(v * v for v in cnt.values()) / (n * n)
    return {"n": n, "distinct_frac": distinct / n, "junk_frac": junk, "mean_ref_surprise_nats": float(np.mean(surprise)) if surprise else None,
            "median_ref_rank_logcount": None, "top10_share": sum(v for _, v in top) / n, "simpson": simpson, "top10": top}


def names_probe(model, tok, out_dir, names_path, args):
    import json as _json
    data = _json.load(open(names_path))
    res = {"surnames": {}, "firstnames": {}}
    for key, prompts, ref in [("surnames", SURNAME_PROMPTS, data["surnames"]), ("firstnames", FIRSTNAME_PROMPTS, data.get("firstnames", []))]:
        if not ref:
            continue
        top = ref[: args.names_topk]
        cands = [n for n, _ in top]; counts = [c for _, c in top]
        ref_by_name = {n: c for n, c in ref}; ref_total = sum(c for _, c in ref)
        for pname, prompt in prompts.items():
            t0 = time.time()
            lp = score_candidates(model, tok, prompt, cands)
            m = dist_metrics(lp, counts); m["top5_model"] = [(cands[i], p) for i, p in m["top5_model"]]
            m["logp_top50"] = {cands[i]: round(float(lp[i]), 3) for i in np.argsort(-lp)[:50]}
            # sampled lists (skipped when --names-lists 0)
            B = args.names_lists
            if B > 0:
                pid = tok(prompt, add_special_tokens=True)["input_ids"]
                r = rollout_group(model, tok, [pid] * B, args.names_steps, 1.0, seed=args.seed + 7, tag=f"names:{key}:{pname}")
                texts = [tok.decode(r["tok"][i].tolist()) for i in range(B)]
                gen = []
                per_list_distinct = []
                for t in texts:
                    ns = parse_list("1." + t)
                    gen += ns; per_list_distinct.append(len(set(ns)) / max(len(ns), 1))
                sm = sample_metrics(gen, ref_by_name, ref_total)
                sm["within_list_distinct_frac"] = float(np.mean(per_list_distinct))
                sm["sample_text"] = texts[0][:600]
                sm["mean_step_H"] = float(r["H"].astype(np.float32).mean())
            else:
                sm = {"n": 0}
            res[key][pname] = {"exact": m, "sampled": sm, "secs": time.time() - t0}
            log(f"names[{key}/{pname}] KL(ref||m)={m['KL(ref||model)']:.3f} H_m={m['H_model']:.2f} H_ref={m['H_ref']:.2f} top10_m={m['top10_model']:.3f} mass_in_set={m['mass_in_set']:.3f} | sampled n={sm.get('n')} distinct={sm.get('distinct_frac')} junk={sm.get('junk_frac')} surprise={sm.get('mean_ref_surprise_nats')}")
            if B == 0:
                res[key][pname]["sampled"] = {"n": 0}
    # reference self-entropy of the full distribution for context
    with open(os.path.join(out_dir, "names.json"), "w") as f:
        _json.dump(res, f, indent=1)
    log("names probe done")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--name", default=None)
    ap.add_argument("--out", default="/models/varentropy/results")
    ap.add_argument("--corpus", default="/models/varentropy/corpus/pile10k_sel.json")
    ap.add_argument("--arrow", default="/models/huggingface/datasets/NeelNanda___pile-10k/default/0.0.0/127bfedcd5047750df5ccf3a12979a47bfa0bafa/pile-10k-train.arrow")
    ap.add_argument("--n-tf", type=int, default=400)
    ap.add_argument("--max-len", type=int, default=2048)
    ap.add_argument("--n-bos", type=int, default=32)
    ap.add_argument("--n-openers", type=int, default=32)
    ap.add_argument("--opener-len", type=int, default=32)
    ap.add_argument("--rollout-steps", type=int, default=1536)
    ap.add_argument("--rollout-batch", type=int, default=32)
    ap.add_argument("--temperature", type=float, default=1.0)
    ap.add_argument("--seed", type=int, default=1234)
    ap.add_argument("--max-mem-gib", type=int, default=165)
    ap.add_argument("--experts-impl", default=None, help="HF experts_implementation (eager|batched_mm|grouped_mm)")
    ap.add_argument("--attn", default="sdpa")
    ap.add_argument("--extra-corpus", action="append", default=[], help="NAME=PATH (repeatable) or PATH; extra TF-only corpora")
    ap.add_argument("--extra-name", default="tf_wiki")
    ap.add_argument("--trust-remote-code", action="store_true")
    ap.add_argument("--arch", default=None, help="force a native transformers class, e.g. deepseek_v3 (for Kimi K2 / DSV3 custom-code checkpoints)")
    ap.add_argument("--quantize-fp8", action="store_true", help="quantize a bf16 checkpoint to fine-grained FP8 (block 128) at load")
    ap.add_argument("--fp8-dequantize", action="store_true", help="dequantize a fine-grained FP8 checkpoint to bf16 at load (for remote-code MoE the FP8 quantizer cannot wrap)")
    ap.add_argument("--names-probe", default=None, help="names.json (census surnames / SSA first names) → names distribution probe")
    ap.add_argument("--names-topk", type=int, default=2000)
    ap.add_argument("--names-lists", type=int, default=16)
    ap.add_argument("--names-steps", type=int, default=400)
    ap.add_argument("--skip-tf", action="store_true")
    ap.add_argument("--skip-rollouts", action="store_true")
    args = ap.parse_args()

    name = args.name or os.path.basename(args.model.rstrip("/"))
    out_dir = os.path.join(args.out, name)
    os.makedirs(out_dir, exist_ok=True)
    corpus = build_corpus(args.corpus, args.arrow, n_tf=max(args.n_tf, 400), n_openers=64)
    log(f"corpus: {len(corpus['tf'])} tf docs, {len(corpus['openers'])} openers; using {args.n_tf} tf docs")

    if args.trust_remote_code:
        # transformers 5 removed gpt2.tokenization_gpt2.bytes_to_unicode; Kimi K2's tokenization_kimi.py imports it
        import transformers.models.gpt2.tokenization_gpt2 as _g
        if not hasattr(_g, "bytes_to_unicode"):
            def _b2u():
                bs = list(range(ord("!"), ord("~") + 1)) + list(range(ord("¡"), ord("¬") + 1)) + list(range(ord("®"), ord("ÿ") + 1))
                cs = bs[:]; n = 0
                for b in range(2 ** 8):
                    if b not in bs:
                        bs.append(b); cs.append(2 ** 8 + n); n += 1
                return dict(zip(bs, [chr(c) for c in cs]))
            _g.bytes_to_unicode = _b2u
    tok = AutoTokenizer.from_pretrained(args.model, trust_remote_code=args.trust_remote_code)
    ngpu = torch.cuda.device_count()
    max_memory = {i: f"{args.max_mem_gib}GiB" for i in range(ngpu)}
    kw = dict(dtype=torch.bfloat16, device_map="auto", max_memory=max_memory, attn_implementation=args.attn)
    if args.experts_impl:
        kw["experts_implementation"] = args.experts_impl
    if args.trust_remote_code:
        kw["trust_remote_code"] = True
    if args.quantize_fp8:
        from transformers import FineGrainedFP8Config
        kw["quantization_config"] = FineGrainedFP8Config(weight_block_size=(128, 128))
    if args.fp8_dequantize:
        from transformers import FineGrainedFP8Config
        kw["quantization_config"] = FineGrainedFP8Config(dequantize=True)
    loader = AutoModelForCausalLM
    if args.arch == "deepseek_v3":
        from transformers import DeepseekV3Config, DeepseekV3ForCausalLM
        cfg = DeepseekV3Config.from_pretrained(args.model)  # ignores model_type/auto_map (Kimi K2 is the same architecture)
        kw["config"] = cfg; kw.pop("trust_remote_code", None)
        loader = DeepseekV3ForCausalLM
    t0 = time.time()
    log(f"loading {args.model} on {ngpu} GPUs with {kw}")
    try:
        model = loader.from_pretrained(args.model, **kw)
    except TypeError as e:
        log(f"retry load without experts_implementation ({e})")
        kw.pop("experts_implementation", None)
        model = loader.from_pretrained(args.model, **kw)
    model.eval()
    log(f"loaded in {time.time()-t0:.0f}s; device={model.device}; "
        f"mem/GPU GiB: {[round(torch.cuda.memory_allocated(i)/2**30,1) for i in range(ngpu)]}")
    with open(os.path.join(out_dir, "run.json"), "w") as f:
        json.dump({"args": vars(args), "model_type": model.config.model_type, "vocab": tok.vocab_size,
                   "bos": tok.bos_token_id, "eos": tok.eos_token_id, "ngpu": ngpu,
                   "load_s": time.time() - t0, "transformers": __import__("transformers").__version__}, f, indent=1)
    if not args.skip_tf:
        teacher_forced(model, tok, corpus["tf"][: args.n_tf], args.max_len, out_dir)
    if not args.skip_rollouts:
        rollouts(model, tok, corpus, args, out_dir)
    for spec in args.extra_corpus:
        name, path = spec.split("=", 1) if "=" in spec else (args.extra_name, spec)
        if os.path.exists(os.path.join(out_dir, f"{name}.npz")):
            log(f"extra corpus {name} already done, skipping"); continue
        extra = load_corpus(path)
        log(f"extra corpus {name} ({path}): {len(extra['tf'])} docs")
        start_id = (tok.bos_token_id if tok.bos_token_id is not None else tok.eos_token_id) if extra.get("ensure_start") else None
        teacher_forced(model, tok, extra["tf"], args.max_len, out_dir, tag=name, min_len=extra.get("min_len", 8), start_id=start_id)
    if args.names_probe:
        names_probe(model, tok, out_dir, args.names_probe, args)
    log("ALL DONE")


if __name__ == "__main__":
    main()
