"""vLLM V1 logits processor that records the exact next-token distribution statistics
(entropy H, varentropy V, top-1 prob/id, surprisal s of the realised token, rank of a forced token)
at every sampling step, and optionally *forces* the realised token (teacher forcing) by masking the
logits to the known next token. Per-request configuration arrives via SamplingParams.extra_args:
    {"vh_id": "<name>", "vh_out": "<dir>", "force": [token ids...] | None}
At request removal the per-step arrays are written to <vh_out>/<vh_id>.npz.
"""
import os
import numpy as np
import torch
from vllm.v1.sample.logits_processor import LogitsProcessor, BatchUpdate


class _Req:
    __slots__ = ("vid", "out", "force", "out_ids", "step", "H", "V", "p1", "t1", "s", "rank", "last_logp")

    def __init__(self, vid, out, force, out_ids):
        self.vid, self.out, self.force, self.out_ids = vid, out, force, out_ids
        self.step = 0
        self.H, self.V, self.p1, self.t1, self.s, self.rank = [], [], [], [], [], []
        self.last_logp = None  # (V,) float32 cpu tensor of the previous step (for s of a free-sampled token)


class VHRecorder(LogitsProcessor):
    def __init__(self, vllm_config, device, is_pin_memory):
        self.device = device
        self.slots: dict[int, _Req] = {}
        try:
            self.rank = torch.distributed.get_rank() if torch.distributed.is_initialized() else 0
        except Exception:
            self.rank = 0

    def is_argmax_invariant(self) -> bool:
        return False

    @classmethod
    def validate_params(cls, params):
        return

    def _finalize(self, r: _Req):
        # surprisal of the last free-sampled token (its logp was stored at the previous step)
        if r.force is None and r.last_logp is not None and len(r.out_ids) >= r.step and r.step > 0:
            tok = r.out_ids[r.step - 1]
            if len(r.s) < r.step:
                r.s.append(float(-r.last_logp[tok]))
        if self.rank == 0 and r.out:
            os.makedirs(r.out, exist_ok=True)
            n = min(len(r.H), len(r.s)) if r.s else len(r.H)
            np.savez(os.path.join(r.out, f"{r.vid}.npz"),
                     H=np.array(r.H[:n], np.float32), V=np.array(r.V[:n], np.float32), p1=np.array(r.p1[:n], np.float32),
                     top1=np.array(r.t1[:n], np.int32), s=np.array(r.s[:n], np.float32),
                     rank=np.array(r.rank[:n] if r.rank else [], np.int32),
                     tok=np.array(list(r.out_ids)[:n], np.int32), forced=np.array(r.force is not None))

    def update_state(self, batch_update: BatchUpdate | None):
        if batch_update is None:
            return
        # vLLM contract: process removed, then added, then moved (added/moved may reuse an index).
        for index in batch_update.removed:
            r = self.slots.pop(index, None)
            if r is not None:
                self._finalize(r)
        for index, params, prompt_tok_ids, output_tok_ids in batch_update.added:
            ea = getattr(params, "extra_args", None) or {}
            old = self.slots.pop(index, None)
            if old is not None:
                self._finalize(old)
            if "vh_id" in ea:
                self.slots[index] = _Req(ea["vh_id"], ea.get("vh_out"), ea.get("force"), output_tok_ids)
        for a, b, direction in batch_update.moved:
            ra, rb = self.slots.pop(a, None), self.slots.pop(b, None)
            if str(direction).endswith("SWAP"):
                if ra is not None:
                    self.slots[b] = ra
                if rb is not None:
                    self.slots[a] = rb
            else:
                if rb is not None:
                    self._finalize(rb)
                if ra is not None:
                    self.slots[b] = ra

    def apply(self, logits: torch.Tensor) -> torch.Tensor:
        if not self.slots:
            return logits
        idx = sorted(i for i in self.slots if i < logits.shape[0])
        if not idx:
            return logits
        rows = torch.tensor(idx, device=logits.device)
        lg = logits[rows].float()
        logp = torch.log_softmax(lg, dim=-1)
        p = logp.exp()
        H = -(p * logp).sum(-1)
        V = (p * (logp + H[:, None]) ** 2).sum(-1)
        p1, t1 = p.max(-1)
        Hc, Vc, p1c, t1c = H.cpu(), V.cpu(), p1.cpu(), t1.cpu()
        logp_cpu = None
        forced_rows, forced_toks = [], []
        for k, i in enumerate(idx):
            r = self.slots[i]
            # surprisal of the token sampled at the previous step (free rows)
            if r.force is None and r.last_logp is not None and len(r.out_ids) >= r.step and r.step > 0:
                r.s.append(float(-r.last_logp[r.out_ids[r.step - 1]]))
            r.H.append(float(Hc[k])); r.V.append(float(Vc[k])); r.p1.append(float(p1c[k])); r.t1.append(int(t1c[k]))
            if r.force is not None:
                if r.step < len(r.force):
                    t = int(r.force[r.step])
                    r.s.append(float(-logp[k, t]))
                    r.rank.append(int((lg[k] > lg[k, t]).sum()))
                    forced_rows.append(i); forced_toks.append(t)
            else:
                if logp_cpu is None:
                    logp_cpu = logp.cpu()
                r.last_logp = logp_cpu[k]
            r.step += 1
        if forced_rows:
            fr = torch.tensor(forced_rows, device=logits.device)
            ft = torch.tensor(forced_toks, device=logits.device)
            masked = torch.full_like(logits[fr], float("-inf"))
            masked[torch.arange(len(forced_rows), device=logits.device), ft] = 0.0
            logits[fr] = masked
        return logits
