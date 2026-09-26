"""Entrenamiento de la IA de TrucoAI (training/PLAN.md). Se puede cortar y retomar en cualquier momento.

Uso (desde la raíz del repo, con el entorno de training/setup.sh):
    python training/learner/run.py train --run r1            # todo: tabla W, imitación, PPO (retoma solo)
    python training/learner/run.py status --run r1           # cómo va
    python training/learner/run.py eval --run r1 --pairs 2000

Fases (cada una deja una marca y no se repite al retomar):
    1. wtable  — probabilidad de ganar la partida desde cada marcador (heurística vs heurística)
    2. bcdata  — partidas de la heurística "difícil" para imitarla
    3. bc      — la red aprende a jugar como la difícil
    4. ppo     — self-play con liga de rivales, recompensa = cambio en la probabilidad de ganar
"""

from __future__ import annotations

import argparse
import copy
import glob
import json
import math
import os
import platform
import random
import shutil
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    TRAINING,
    CriticNet,
    PolicyNet,
    append_jsonl,
    atomic_torch_save,
    atomic_write_bytes,
    default_workers,
    device,
    export_policy,
    git_commit,
    load_chunks,
    log,
    masked_logits,
    obs_layout,
    remove_tree,
    run_actors,
    split_matches,
    wilson,
)

DEFAULTS: dict = {
    "players": 2,
    "seed": 1,
    "workers": None,
    "wtable": {"matches": 4000},
    "bc": {
        "matches": 60000,
        "teacher": "hard",
        "opponents": [
            {"kind": "heur", "difficulty": "hard", "weight": 0.5},
            {"kind": "heur", "difficulty": "normal", "weight": 0.3},
            {"kind": "heur", "difficulty": "easy", "weight": 0.2},
        ],
        "epochs": 6,
        "batch": 4096,
        "lr": 1e-3,
        "evalPairs": 1000,
    },
    "ppo": {
        "iterations": 1000000,
        "matchesPerIter": 2048,
        "epochs": 4,
        "minibatch": 8192,
        "lr": 3e-4,
        "criticLr": 1e-3,
        "clip": 0.2,
        "gaeLambda": 0.95,
        "entropy": 0.01,
        "klBc": 0.02,
        "klBcFinal": 0.005,
        "klBcDecayIters": 2000,
        "maxGradNorm": 1.0,
        "snapshotEvery": 10,
        "leagueSize": 40,
        "opponents": {"self": 0.5, "league": 0.3, "hard": 0.1, "normal": 0.05, "easy": 0.05},
    },
    "eval": {"every": 10, "pairs": 1000, "opponent": "hard"},
    "checkpoint": {"keepLast": 5, "keepBest": 3, "backupDir": None},
}

SMOKE: dict = {
    "wtable": {"matches": 40},
    "bc": {"matches": 60, "epochs": 1, "batch": 512, "evalPairs": 10},
    "ppo": {"iterations": 3, "matchesPerIter": 24, "minibatch": 1024, "snapshotEvery": 1, "klBcDecayIters": 3},
    "eval": {"every": 2, "pairs": 10},
}


def training_path(p: str) -> Path:
    """Rutas de la configuración: absolutas o relativas a training/."""
    q = Path(p).expanduser()
    return q if q.is_absolute() else TRAINING / q


def merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for key, value in over.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = merge(out[key], value)
        else:
            out[key] = value
    return out


class Run:
    def __init__(self, name: str, config: dict, workers: int | None):
        self.name = name
        self.dir = TRAINING / "runs" / name
        self.dir.mkdir(parents=True, exist_ok=True)
        cfg_path = self.dir / "config.json"
        if cfg_path.exists():
            saved = json.loads(cfg_path.read_text())
            if config != saved:
                log("aviso: la configuración cambió respecto de la guardada; se usa la nueva")
        atomic_write_bytes(cfg_path, json.dumps(config, indent=2).encode())
        self.cfg = config
        self.workers = workers or config.get("workers") or default_workers()
        self.layout = obs_layout(config["players"])
        self.dev = device()
        self.log_path = self.dir / "log.jsonl"
        manifest = self.dir / "manifest.json"
        if not manifest.exists():
            atomic_write_bytes(manifest, json.dumps({
                "run": name,
                "created": time.strftime("%Y-%m-%d %H:%M:%S"),
                "commit": git_commit(),
                "layoutHash": self.layout["layoutHash"],
                "obsDim": self.layout["obsDim"],
                "machine": platform.platform(),
                "python": sys.version.split()[0],
                "torch": torch.__version__,
            }, indent=2).encode())
        else:
            saved = json.loads(manifest.read_text())
            if saved["layoutHash"] != self.layout["layoutHash"]:
                raise SystemExit(
                    f"La observación cambió ({saved['layoutHash']} → {self.layout['layoutHash']}): "
                    "esta corrida no se puede retomar; empezá otra con --run."
                )

    def adopt_parent(self) -> None:
        """
        `init: {fromRun, iter}`: la corrida sigue desde un checkpoint de otra (pesos, optimizador, liga,
        contador de iteraciones) con la misma tabla W y la misma red de imitación como ancla del KL.
        La corrida original no se toca.
        """
        init = self.cfg.get("init")
        if not init or self.done("bc"):
            return
        parent = TRAINING / "runs" / init["fromRun"]
        ck = parent / "ckpt" / f"iter_{init['iter']:06d}.pt"
        if not ck.exists():
            raise SystemExit(f"no existe el checkpoint {ck}")
        for f in ("wtable.json", "bc.pt"):
            shutil.copy2(parent / f, self.dir / f)
        for phase in ("wtable", "bcdata", "bc"):
            self.mark(phase, {"from": init["fromRun"], "iter": init["iter"]})
        log(f"sigue desde {init['fromRun']} iteración {init['iter']}")

    def done(self, phase: str) -> bool:
        return (self.dir / f"{phase}.done").exists()

    def mark(self, phase: str, info: dict) -> None:
        atomic_write_bytes(self.dir / f"{phase}.done", json.dumps(info).encode())

    def event(self, kind: str, **data) -> None:
        append_jsonl(self.log_path, {"t": time.time(), "kind": kind, **data})

    def seed(self, *parts: int) -> int:
        h = self.cfg["seed"]
        for p in parts:
            h = (h * 1000003 + p) % 2_147_483_647
        return h

    def new_policy(self) -> PolicyNet:
        return PolicyNet(self.layout["obsDim"], self.layout["nActions"]).to(self.dev)

    # ---------- fase 1: tabla W ----------

    def phase_wtable(self) -> None:
        if self.done("wtable"):
            return
        log("fase 1/4: tabla de probabilidad de ganar por marcador")
        total = self.cfg["wtable"]["matches"]
        tmp = self.dir / "tmp-wtable"
        remove_tree(tmp)
        jobs = [
            {"mode": "wtable", "seed": self.seed(1, i), "matches": m, "players": self.cfg["players"], "out": str(tmp / f"w{i}"), "teacher": "hard"}
            for i, m in enumerate(split_matches(total, self.workers))
        ]
        run_actors(jobs, tmp, self.workers)
        # Se juntan las distribuciones de todos los actores y se arma la tabla con todas las manos.
        counts: dict[tuple[int, int], float] = {}
        hands = 0
        for i in range(len(jobs)):
            d = json.loads((tmp / f"w{i}.dist.json").read_text())
            hands += d["hands"]
            for x, y, p in d["dist"]:
                counts[(x, y)] = counts.get((x, y), 0) + p * d["hands"]
        dist = [[x, y, c / hands] for (x, y), c in counts.items()]
        dist_path = self.dir / "wtable-dist.json"
        atomic_write_bytes(dist_path, json.dumps({"hands": hands, "dist": dist}).encode())
        # La tabla la calcula el mismo código TS que usan los actores (una sola implementación).
        job = {"mode": "wtable-from-dist", "dist": str(dist_path), "out": str(self.dir / "wtable")}
        run_actors([{**job, "seed": 0, "matches": 0, "players": self.cfg["players"]}], tmp, 1)
        remove_tree(tmp)
        self.mark("wtable", {"hands": hands})
        self.event("wtable", hands=hands)
        log(f"tabla W lista ({hands} manos)")

    # ---------- fase 2: datos para imitar ----------

    def phase_bcdata(self) -> None:
        if self.done("bcdata"):
            return
        c = self.cfg["bc"]
        log(f"fase 2/4: {c['matches']} partidas de la heurística '{c['teacher']}' para imitarla ({self.workers} actores)")
        out = self.dir / "bcdata"
        remove_tree(out)
        started = time.time()
        # Muchos trabajos chicos: si se corta, se pierde poco y el progreso se ve.
        chunks = split_matches(c["matches"], max(self.workers * 4, 1))
        jobs = [
            {"mode": "bc", "seed": self.seed(2, i), "matches": m, "players": self.cfg["players"], "out": str(out / f"bc{i:04d}"),
             "teacher": c["teacher"], "opponents": c["opponents"], "wtable": str(self.dir / "wtable.json")}
            for i, m in enumerate(chunks)
        ]
        run_actors(jobs, out / "jobs", self.workers)
        n = sum(json.loads(Path(p).read_text())["n"] for p in glob.glob(str(out / "bc*.meta.json")))
        self.mark("bcdata", {"samples": n, "seconds": time.time() - started})
        self.event("bcdata", samples=n, seconds=time.time() - started)
        log(f"datos de imitación: {n} decisiones en {time.time() - started:.0f}s")

    # ---------- fase 3: imitación ----------

    def phase_bc(self) -> None:
        if self.done("bc"):
            return
        c = self.cfg["bc"]
        log("fase 3/4: imitación de la heurística")
        prefixes = sorted(Path(p[: -len(".meta.json")]) for p in glob.glob(str(self.dir / "bcdata" / "bc*.meta.json")))
        data = load_chunks(prefixes)
        n = len(data.act)
        rng = np.random.default_rng(self.seed(3))
        order = rng.permutation(n)
        n_val = max(1, n // 50)
        val_idx, train_idx = order[:n_val], order[n_val:]
        obs = torch.from_numpy(data.obs)
        mask = torch.from_numpy(data.mask)
        act = torch.from_numpy(data.act.astype(np.int64))
        # Las decisiones "pasivas" dominan: se reponderan las clases (∝ 1/√frecuencia).
        freq = np.bincount(data.act, minlength=self.layout["nActions"]).astype(np.float64) + 1
        weights = torch.tensor((freq.sum() / freq) ** 0.5, dtype=torch.float32)
        weights = (weights / weights[torch.from_numpy(data.act.astype(np.int64))].mean()).to(self.dev)
        policy = self.new_policy()
        opt = torch.optim.Adam(policy.parameters(), lr=c["lr"])
        steps_per_epoch = math.ceil(len(train_idx) / c["batch"])
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, steps_per_epoch * c["epochs"]))

        def batch(idx: np.ndarray):
            ii = torch.from_numpy(idx)
            return (obs[ii].to(self.dev).float() / 255.0, mask[ii].to(self.dev), act[ii].to(self.dev))

        for epoch in range(c["epochs"]):
            policy.train()
            perm = rng.permutation(train_idx)
            total = 0.0
            for s in range(steps_per_epoch):
                x, m, a = batch(perm[s * c["batch"]: (s + 1) * c["batch"]])
                logits = masked_logits(policy(x), m)
                loss = F.cross_entropy(logits, a, weight=weights)
                opt.zero_grad()
                loss.backward()
                opt.step()
                sched.step()
                total += loss.item()
            acc = self.bc_accuracy(policy, batch, val_idx)
            log(f"imitación época {epoch + 1}/{c['epochs']}: pérdida {total / steps_per_epoch:.4f}, acierto en validación {acc:.3f}")
            self.event("bc_epoch", epoch=epoch + 1, loss=total / steps_per_epoch, val_acc=acc)
        export_policy(policy, self.dir / "policies" / "bc", self.layout["layoutHash"], f"{self.name}/bc")
        atomic_torch_save({"policy": policy.state_dict()}, self.dir / "bc.pt")
        result = self.evaluate(self.dir / "policies" / "bc", c["evalPairs"], self.cfg["eval"]["opponent"], tag="bc")
        self.mark("bc", {"val_acc": acc, "eval": result})
        del data, obs, mask, act

    @torch.no_grad()
    def bc_accuracy(self, policy: PolicyNet, batch, idx: np.ndarray) -> float:
        policy.eval()
        hits = 0
        for s in range(0, len(idx), 8192):
            x, m, a = batch(idx[s: s + 8192])
            hits += (masked_logits(policy(x), m).argmax(-1) == a).sum().item()
        return hits / len(idx)

    # ---------- evaluación ----------

    @staticmethod
    def opponent_spec(opponent: str) -> dict:
        """'hard' / 'normal' / 'easy' (heurísticas) o 'mlp:<ruta sin extensión>' (una red)."""
        if opponent.startswith("mlp:"):
            return {"kind": "mlp", "path": opponent[4:]}
        return {"kind": "heur", "difficulty": opponent}

    def evaluate(self, policy_base: Path, pairs: int, opponent: str, tag: str) -> dict:
        tmp = self.dir / f"tmp-eval-{tag}"
        remove_tree(tmp)
        jobs = [
            {"mode": "eval", "seed": 777_000 + i, "matches": m, "players": self.cfg["players"], "out": str(tmp / f"e{i}.json"),
             "a": {"kind": "mlp", "path": str(policy_base)}, "b": self.opponent_spec(opponent)}
            for i, m in enumerate(split_matches(pairs, self.workers))
        ]
        started = time.time()
        run_actors(jobs, tmp, self.workers)
        games = wins = pa = pb = 0
        for i in range(len(jobs)):
            r = json.loads((tmp / f"e{i}.json").read_text())
            games += r["games"]
            wins += r["winsA"]
            pa += r["pointsA"]
            pb += r["pointsB"]
        remove_tree(tmp)
        low, high = wilson(wins, games)
        result = {"tag": tag, "opponent": opponent, "games": games, "winrate": wins / games, "ci90": [low, high],
                  "pointsPerGame": [pa / games, pb / games], "seconds": time.time() - started}
        self.event("eval", **result)
        shown = f"la red {'/'.join(Path(opponent[4:]).parts[-3:])}" if opponent.startswith("mlp:") else f"'{opponent}'"
        log(f"evaluación {tag} contra {shown}: {100 * wins / games:.1f}% (IC90 {100 * low:.1f}–{100 * high:.1f}) en {games} partidas")
        return result

    # ---------- fase 4: PPO ----------

    def ckpt_dir(self) -> Path:
        return self.dir / "ckpt"

    def latest_ckpt(self) -> Path | None:
        found = sorted(self.ckpt_dir().glob("iter_*.pt"))
        for path in reversed(found):
            try:
                torch.load(path, map_location="cpu", weights_only=False)
                return path
            except Exception:  # noqa: BLE001 — un checkpoint roto se saltea
                log(f"checkpoint dañado, se saltea: {path.name}")
        return None

    def phase_ppo(self) -> None:
        c = self.cfg["ppo"]
        e = self.cfg["eval"]
        policy = self.new_policy()
        critic = CriticNet(self.layout["obsDim"], self.layout["privDim"]).to(self.dev)
        anchor = self.new_policy()
        anchor.load_state_dict(torch.load(self.dir / "bc.pt", map_location="cpu")["policy"])
        anchor.eval()
        opt = torch.optim.Adam([
            {"params": policy.parameters(), "lr": c["lr"]},
            {"params": critic.parameters(), "lr": c["criticLr"]},
        ])
        state = {"iter": 0, "league": [], "best": [], "evals": []}
        latest = self.latest_ckpt()
        if latest:
            ck = torch.load(latest, map_location="cpu", weights_only=False)
            policy.load_state_dict(ck["policy"])
            critic.load_state_dict(ck["critic"])
            opt.load_state_dict(ck["opt"])
            state = ck["state"]
            random.setstate(ck["py_random"])
            log(f"fase 4/4: PPO — retomo desde la iteración {state['iter']}")
        elif self.cfg.get("init"):
            init = self.cfg["init"]
            ck = torch.load(TRAINING / "runs" / init["fromRun"] / "ckpt" / f"iter_{init['iter']:06d}.pt", map_location="cpu", weights_only=False)
            policy.load_state_dict(ck["policy"])
            critic.load_state_dict(ck["critic"])
            opt.load_state_dict(ck["opt"])
            # La liga (redes guardadas de la corrida madre) y el contador siguen; la "mejor" se vuelve a elegir.
            state = {**ck["state"], "best": [], "evals": []}
            random.setstate(ck["py_random"])
            log(f"fase 4/4: PPO — arranco desde {init['fromRun']} iteración {state['iter']}")
        else:
            policy.load_state_dict(anchor.state_dict())
            log("fase 4/4: PPO — arranco desde la red de imitación")
        pol_dir = self.dir / "policies"

        while state["iter"] < c["iterations"]:
            it = state["iter"] + 1
            t0 = time.time()
            current = pol_dir / "current"
            export_policy(policy, current, self.layout["layoutHash"], f"{self.name}/iter{it}")
            opponents = self.league_opponents(state, c)
            tmp = self.dir / "tmp-rollouts"
            remove_tree(tmp)
            jobs = [
                {"mode": "ppo", "seed": self.seed(4, it, i), "matches": m, "players": self.cfg["players"], "out": str(tmp / f"r{i:03d}"),
                 "learner": str(current), "opponents": opponents, "wtable": str(self.dir / "wtable.json")}
                for i, m in enumerate(split_matches(c["matchesPerIter"], self.workers))
            ]
            run_actors(jobs, tmp / "jobs", self.workers)
            data = load_chunks(sorted(Path(p[: -len(".meta.json")]) for p in glob.glob(str(tmp / "r*.meta.json"))))
            t_roll = time.time() - t0
            stats = self.merge_stats(data.metas)
            self.update_league_scores(state, stats)
            kl_beta = c["klBcFinal"] + (c["klBc"] - c["klBcFinal"]) * max(0.0, 1 - it / max(1, c["klBcDecayIters"]))
            metrics = self.ppo_update(policy, critic, anchor, opt, data, c, kl_beta)
            remove_tree(tmp)
            state["iter"] = it
            dt = time.time() - t0
            record = {"iter": it, "steps": int(len(data.act)), "rollout_s": round(t_roll, 1), "total_s": round(dt, 1),
                      "steps_per_s": round(len(data.act) / max(dt, 1e-6)), "kl_beta": kl_beta, **metrics,
                      "vs": {k: round(v["wins"] / max(1, v["matches"]), 3) for k, v in stats.items()}}
            self.event("ppo_iter", **record)
            log(f"iter {it}: {len(data.act)} decisiones en {dt:.1f}s ({record['steps_per_s']}/s) · "
                f"pérdida pol {metrics['loss_pi']:.3f} val {metrics['loss_v']:.4f} ent {metrics['entropy']:.3f} "
                f"kl_bc {metrics['kl_bc']:.3f} · vs {record['vs']}")
            envido_keys = [k for k in metrics["style"] if k.startswith("acepta_") or k.endswith(("_exito", "_pts", "_dW"))]
            style_main = {k: v for k, v in metrics["style"].items() if k not in envido_keys}
            log(f"   entropía por decisión {metrics['ent_by']} · estilo {style_main}")
            log(f"   envido {({k: metrics['style'][k] for k in envido_keys})}")

            if it % c["snapshotEvery"] == 0:
                snap = pol_dir / f"iter_{it:06d}"
                export_policy(policy, snap, self.layout["layoutHash"], f"{self.name}/iter{it}")
                state["league"].append({"path": str(snap), "iter": it, "wins": 0.0, "matches": 0.0})
                state["league"] = state["league"][-c["leagueSize"]:]
            if it % e["every"] == 0:
                result = self.evaluate(current, e["pairs"], e["opponent"], tag=f"iter{it}")
                state["evals"].append({"iter": it, "winrate": result["winrate"], "ci90": result["ci90"]})
                gauntlet = e.get("gauntlet")
                if gauntlet:
                    # Duelos contra redes fijas (versiones anteriores y atacantes): la difícil ya no discrimina.
                    rates = []
                    for spec in gauntlet["opponents"]:
                        opp = spec if spec in ("hard", "normal", "easy") else f"mlp:{training_path(spec)}"
                        name = spec if spec in ("hard", "normal", "easy") else training_path(spec).parent.parent.name + "/" + Path(spec).name
                        r = self.evaluate(current, gauntlet["pairs"], opp, tag=f"iter{it}-vs-{name}")
                        rates.append(r["winrate"])
                    score = sum(rates) / len(rates)
                    self.event("gauntlet", iter=it, score=score, rates=rates)
                    log(f"duelos iter{it}: promedio {100 * score:.1f}% ({', '.join(f'{100 * x:.1f}' for x in rates)})")
                    self.update_best(state, it, {**result, "winrate": score}, policy)
                else:
                    self.update_best(state, it, result, policy)
            self.save_ckpt(policy, critic, opt, state, it)

    def league_opponents(self, state: dict, c: dict) -> list[dict]:
        if c.get("fixedOpponents"):
            return c["fixedOpponents"]
        w = c["opponents"]
        out: list[dict] = [{"kind": "self", "weight": w["self"], "name": "self"}]
        for diff in ("hard", "normal", "easy"):
            if w.get(diff):
                out.append({"kind": "heur", "difficulty": diff, "weight": w[diff], "name": f"heur-{diff}"})
        exploiters = c.get("exploiters") or []
        if exploiters and w.get("exploiters"):
            # Redes entrenadas para explotar versiones anteriores: rivales fijos, mismo peso cada una.
            for path in exploiters:
                base = training_path(path)
                if not base.with_suffix(".json").exists():
                    raise SystemExit(f"no existe la red atacante {base}.json")
                out.append({"kind": "mlp", "path": str(base), "weight": w["exploiters"] / len(exploiters),
                            "name": "exp-" + base.parent.parent.name.replace("r1-br-", "")})
        elif w.get("exploiters"):
            out[0]["weight"] += w["exploiters"]
        league = state["league"]
        if league and w.get("league"):
            # PFSP: más peso a los rivales del pasado a los que todavía no les ganamos.
            prio = [(1 - (e["wins"] + 1) / (e["matches"] + 2)) ** 2 + 0.05 for e in league]
            total = sum(prio)
            for entry, p in zip(league, prio):
                out.append({"kind": "mlp", "path": entry["path"], "weight": w["league"] * p / total, "name": f"iter{entry['iter']}"})
        else:
            out[0]["weight"] += w.get("league", 0)
        return out

    @staticmethod
    def merge_stats(metas: list[dict]) -> dict:
        stats: dict[str, dict] = {}
        for meta in metas:
            for name, s in meta.get("stats", {}).items():
                entry = stats.setdefault(name, {"matches": 0, "wins": 0})
                entry["matches"] += s["matches"]
                entry["wins"] += s["wins"]
        return stats

    @staticmethod
    def update_league_scores(state: dict, stats: dict) -> None:
        for entry in state["league"]:
            s = stats.get(f"iter{entry['iter']}")
            if s:
                # Media móvil: lo reciente pesa más.
                entry["wins"] = entry["wins"] * 0.9 + s["wins"]
                entry["matches"] = entry["matches"] * 0.9 + s["matches"]

    def ppo_update(self, policy, critic, anchor, opt, data, c: dict, kl_beta: float) -> dict:
        dev = self.dev
        obs = torch.from_numpy(data.obs).to(dev).float() / 255.0
        priv = torch.from_numpy(data.priv).to(dev).float() / 255.0
        mask = torch.from_numpy(data.mask).to(dev)
        act = torch.from_numpy(data.act.astype(np.int64)).to(dev)
        old_logp = torch.from_numpy(data.logp).to(dev)
        rew = data.rew.astype(np.float64)
        done = data.done.astype(bool)
        n = len(act)
        with torch.no_grad():
            values = torch.cat([critic(obs[s: s + 32768], priv[s: s + 32768]) for s in range(0, n, 32768)]).cpu().numpy().astype(np.float64)
        # GAE dentro de cada mano (γ = 1): las trayectorias vienen contiguas y terminan con done.
        adv = np.zeros(n)
        last = 0.0
        for t in range(n - 1, -1, -1):
            next_v = 0.0 if done[t] else values[t + 1]
            if done[t]:
                last = 0.0
            delta = rew[t] + next_v - values[t]
            last = delta + c["gaeLambda"] * last
            adv[t] = last
        ret = torch.tensor(adv + values, dtype=torch.float32, device=dev)
        adv_t = torch.tensor(adv, dtype=torch.float32, device=dev)
        adv_t = (adv_t - adv_t.mean()) / (adv_t.std() + 1e-8)

        ent_by, style = self.style_metrics(policy, obs, mask, data)

        sums = {"loss_pi": 0.0, "loss_v": 0.0, "entropy": 0.0, "kl_bc": 0.0, "clip_frac": 0.0, "approx_kl": 0.0}
        count = 0
        for _ in range(c["epochs"]):
            perm = torch.randperm(n, device=dev)
            for s in range(0, n, c["minibatch"]):
                idx = perm[s: s + c["minibatch"]]
                logits = masked_logits(policy(obs[idx]), mask[idx])
                logp_all = torch.log_softmax(logits, -1)
                logp = logp_all.gather(1, act[idx, None]).squeeze(1)
                ratio = torch.exp(logp - old_logp[idx])
                a = adv_t[idx]
                loss_pi = -torch.min(ratio * a, torch.clamp(ratio, 1 - c["clip"], 1 + c["clip"]) * a).mean()
                probs = logp_all.exp() * (mask[idx] > 0)
                entropy = -(probs * logp_all.masked_fill(mask[idx] == 0, 0)).sum(-1).mean()
                with torch.no_grad():
                    anchor_logp = torch.log_softmax(masked_logits(anchor(obs[idx]), mask[idx]), -1)
                kl_bc = (probs * (logp_all - anchor_logp).masked_fill(mask[idx] == 0, 0)).sum(-1).mean()
                v = critic(obs[idx], priv[idx])
                loss_v = F.mse_loss(v, ret[idx])
                loss = loss_pi + 0.5 * loss_v - c["entropy"] * entropy + kl_beta * kl_bc
                opt.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(list(policy.parameters()) + list(critic.parameters()), c["maxGradNorm"])
                opt.step()
                with torch.no_grad():
                    sums["loss_pi"] += loss_pi.item()
                    sums["loss_v"] += loss_v.item()
                    sums["entropy"] += entropy.item()
                    sums["kl_bc"] += kl_bc.item()
                    sums["clip_frac"] += ((ratio - 1).abs() > c["clip"]).float().mean().item()
                    sums["approx_kl"] += (old_logp[idx] - logp).mean().item()
                count += 1
        out = {k: v / max(1, count) for k, v in sums.items()}
        out["mean_hand_reward"] = float(rew[done].mean()) if done.any() else 0.0
        out["ent_by"] = ent_by
        out["style"] = style
        return out

    @torch.no_grad()
    def style_metrics(self, policy, obs: torch.Tensor, mask: torch.Tensor, data) -> tuple[dict, dict]:
        """
        Entropía por tipo de decisión (con la red de esta iteración) y cómo juega:
        - cartas: solo puede jugar carta (o irse); turno: puede cantar truco o envido en su turno;
          resp_truco / resp_envido: le cantaron y tiene que responder.
        - truco: de las veces que pudo cantar truco en su turno, cuántas cantó; farol: de esos cantos,
          cuántos sin un 3 o algo mejor en la mano; envido: cuántas veces lo cantó pudiendo;
          farol_envido: de sus cantos de envido (abrir o subir), cuántos con 23 o menos de tantos;
          envido_<24 … envido_31+: cuánto abre el envido pudiendo, según sus tantos;
          quiere_truco / sube_truco / quiere_envido: respuestas;
          acepta_envido_<24 … acepta_envido_31+: cuando le cantan envido, cuánto lo acepta (quiere o
          sube) según sus tantos (¿caza faroles o solo quiere con mucho?).
        - farol_envido_exito / _pts / _dW (y tantos_envido_*): de las manos en que cantó envido con
          23 o menos (farol) o con 24 o más (tantos), en cuántas el rival no quiso, los puntos de envido
          netos por mano y el cambio medio en la probabilidad de ganar la partida en esa mano (ΔW).
        """
        n = len(data.act)
        ent = torch.empty(n, device=obs.device)
        for s in range(0, n, 32768):
            logits = masked_logits(policy(obs[s: s + 32768]), mask[s: s + 32768])
            logp = torch.log_softmax(logits, -1)
            ent[s: s + 32768] = -(logp.exp() * logp.masked_fill(mask[s: s + 32768] == 0, 0)).sum(-1)
        m = data.mask.astype(bool)
        act = data.act
        resp_truco = m[:, 4]
        resp_envido = m[:, 9]
        turno = ~resp_truco & ~resp_envido & (m[:, 3] | m[:, 6])
        cartas = ~resp_truco & ~resp_envido & ~turno
        ent_np = ent.cpu().numpy()
        ent_by = {name: round(float(ent_np[sel].mean()), 3) for name, sel in
                  (("cartas", cartas), ("turno", turno), ("resp_truco", resp_truco), ("resp_envido", resp_envido)) if sel.any()}

        def rate(sel: np.ndarray, hit: np.ndarray) -> float | None:
            return round(float(hit[sel].mean()), 3) if sel.any() else None

        def offset_of(name: str) -> int:
            off = 0
            for part in self.layout["layout"]:
                if part["name"] == name:
                    return off
                off += part["size"]
            raise KeyError(name)

        # La carta más fuerte que le queda: tramo "slot0" (rango en one-hot de 14) de la observación.
        slot0 = offset_of("slot0")
        best_rank = data.obs[:, slot0 + 1: slot0 + 15].argmax(1)
        # Sus tantos de envido: "myEnvido" guarda tantos/33 cuantizado a k/255.
        tantos = np.rint(data.obs[:, offset_of("myEnvido")].astype(np.float64) / 255 * 33).astype(int)
        can_truco = ~resp_truco & ~resp_envido & m[:, 3]
        called = can_truco & (act == 3)
        envido_call = (act >= 6) & (act <= 8)
        can_open_envido = ~resp_envido & m[:, 6]
        # Cualquier canto de envido: abrirlo (en su turno o "el envido está primero") o subirlo al responder.
        sang_envido = (can_open_envido | resp_envido) & envido_call
        style = {
            "truco": rate(can_truco, act == 3),
            "farol": rate(called, best_rank < 9),
            "envido": rate(~resp_truco & ~resp_envido & m[:, 6], envido_call),
            # Farol de envido: cantos (abrir o subir) con 23 o menos de tantos.
            "farol_envido": rate(sang_envido, tantos <= 23),
            # Cuánto canta envido pudiendo abrirlo, según sus tantos.
            "envido_<24": rate(can_open_envido & (tantos <= 23), envido_call),
            "envido_24-27": rate(can_open_envido & (tantos >= 24) & (tantos <= 27), envido_call),
            "envido_28-30": rate(can_open_envido & (tantos >= 28) & (tantos <= 30), envido_call),
            "envido_31+": rate(can_open_envido & (tantos >= 31), envido_call),
            "quiere_truco": rate(resp_truco, act == 4),
            "sube_truco": rate(resp_truco, act == 3),
            "quiere_envido": rate(resp_envido, act == 9),
        }
        acepta = (act == 9) | envido_call
        for label, lo, hi in (("<24", 0, 23), ("24-27", 24, 27), ("28-30", 28, 30), ("31+", 31, 99)):
            style[f"acepta_envido_{label}"] = rate(resp_envido & (tantos >= lo) & (tantos <= hi), acepta)
        # Resultado del envido cantado (lo junta el actor, que ve la mano entera).
        for group, prefix in (("farol", "farol_envido"), ("tantos", "tantos_envido")):
            g = {"hands": 0, "noQuiso": 0, "points": 0.0, "dW": 0.0}
            for meta in getattr(data, "metas", None) or []:
                for k in g:
                    g[k] += meta.get("envido", {}).get(group, {}).get(k, 0)
            if g["hands"]:
                style[f"{prefix}_exito"] = round(g["noQuiso"] / g["hands"], 3)
                style[f"{prefix}_pts"] = round(g["points"] / g["hands"], 2)
                style[f"{prefix}_dW"] = round(g["dW"] / g["hands"], 4)
        return ent_by, style

    def update_best(self, state: dict, it: int, result: dict, policy: PolicyNet) -> None:
        keep = self.cfg["checkpoint"]["keepBest"]
        best = state["best"]
        best.append({"iter": it, "winrate": result["winrate"]})
        best.sort(key=lambda b: -b["winrate"])
        state["best"] = best[:keep]
        if state["best"][0]["iter"] == it:
            export_policy(policy, self.dir / "policies" / "best", self.layout["layoutHash"], f"{self.name}/iter{it}")
            log(f"nueva mejor red: iteración {it} ({100 * result['winrate']:.1f}%)")
            backup = self.cfg["checkpoint"].get("backupDir")
            if backup:
                dest = Path(backup).expanduser() / self.name
                dest.mkdir(parents=True, exist_ok=True)
                for ext in (".json", ".bin"):
                    shutil.copy2(self.dir / "policies" / f"best{ext}", dest / f"best{ext}")

    def save_ckpt(self, policy, critic, opt, state: dict, it: int) -> None:
        path = self.ckpt_dir() / f"iter_{it:06d}.pt"
        atomic_torch_save({
            "policy": policy.state_dict(), "critic": critic.state_dict(), "opt": opt.state_dict(),
            "state": state, "py_random": random.getstate(), "config": self.cfg,
        }, path)
        keep_last = self.cfg["checkpoint"]["keepLast"]
        best_iters = {b["iter"] for b in state["best"]}
        found = sorted(self.ckpt_dir().glob("iter_*.pt"))
        for old in found[:-keep_last]:
            if int(old.stem.split("_")[1]) not in best_iters:
                old.unlink(missing_ok=True)
        backup = self.cfg["checkpoint"].get("backupDir")
        if backup and it % 50 == 0:
            dest = Path(backup).expanduser() / self.name / "ckpt"
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest / "latest.pt")


def cmd_train(args) -> None:
    config = merge(DEFAULTS, json.loads(Path(args.config).read_text()) if args.config else {})
    if args.smoke:
        config = merge(config, SMOKE)
    run = Run(args.run, config, args.workers)
    log(f"corrida '{args.run}' · {run.workers} actores en paralelo · red en {run.dev} · observación {run.layout['obsDim']} ({run.layout['layoutHash']})")
    run.event("start", workers=run.workers, device=str(run.dev), commit=git_commit(), config=config)
    run.adopt_parent()
    run.phase_wtable()
    run.phase_bcdata()
    run.phase_bc()
    run.phase_ppo()
    log("listo")


def cmd_status(args) -> None:
    d = TRAINING / "runs" / args.run
    if not d.exists():
        raise SystemExit(f"no existe la corrida {args.run}")
    phases = [p for p in ("wtable", "bcdata", "bc") if (d / f"{p}.done").exists()]
    print(f"corrida {args.run}: fases hechas {phases}")
    lines = (d / "log.jsonl").read_text().splitlines() if (d / "log.jsonl").exists() else []
    records = [json.loads(line) for line in lines if line.strip()]
    iters = [r for r in records if r["kind"] == "ppo_iter"]
    evals = [r for r in records if r["kind"] == "eval"]
    if iters:
        last = iters[-1]
        print(f"PPO: iteración {last['iter']}, {last['steps_per_s']} decisiones/s, vs {last['vs']}")
    for r in evals[-8:]:
        print(f"  eval {r['tag']}: {100 * r['winrate']:.1f}% contra {r['opponent']} (IC90 {100 * r['ci90'][0]:.1f}–{100 * r['ci90'][1]:.1f}, {r['games']} partidas)")
    if (d / "policies" / "best.json").exists():
        print(f"mejor red: {json.loads((d / 'policies' / 'best.json').read_text()).get('tag')}")


def cmd_exploit(args) -> None:
    """
    Prueba de explotabilidad (training/PLAN.md, fase 3): se entrena una red nueva cuyo ÚNICO rival es
    la red objetivo congelada. Si aprende a ganarle por mucho, la objetivo es predecible/explotable.
    Corre aparte (otra carpeta en runs/) y no toca la corrida original.
    """
    parent = TRAINING / "runs" / args.run
    if not (parent / "bc.pt").exists():
        raise SystemExit(f"la corrida {args.run} todavía no terminó la imitación")
    source = parent / "policies" / args.target
    if not source.with_suffix(".json").exists():
        raise SystemExit(f"no existe la red {source}.json")
    tag = json.loads(source.with_suffix(".json").read_text()).get("tag", args.target).replace("/", "-")
    name = f"{args.run}-br-{tag}"
    d = TRAINING / "runs" / name
    d.mkdir(parents=True, exist_ok=True)
    target = d / "target"
    if not target.with_suffix(".json").exists():
        # Copia congelada: aunque "best" cambie en la corrida original, se ataca siempre a la misma.
        for ext in (".json", ".bin"):
            shutil.copy2(source.with_suffix(ext), target.with_suffix(ext))
        for f in ("wtable.json", "bc.pt"):
            shutil.copy2(parent / f, d / f)
        for phase in ("wtable", "bcdata", "bc"):
            atomic_write_bytes(d / f"{phase}.done", json.dumps({"from": args.run}).encode())
    base = json.loads((parent / "config.json").read_text())
    config = merge(base, {
        "ppo": {
            "iterations": args.iters,
            "klBc": 0.0,
            "klBcFinal": 0.0,
            "snapshotEvery": 10**9,
            "fixedOpponents": [{"kind": "mlp", "path": str(target), "weight": 1, "name": "objetivo"}],
        },
        "eval": {"every": 10, "pairs": args.pairs, "opponent": f"mlp:{target}"},
    })
    run = Run(name, config, args.workers)
    run.event("start", workers=run.workers, device=str(run.dev), commit=git_commit(), config=config, exploit=tag)
    log(f"explotabilidad: entreno una red solo para ganarle a {tag} ({args.iters} iteraciones, {run.workers} actores)")
    run.phase_ppo()
    evals = [json.loads(line) for line in (d / "log.jsonl").read_text().splitlines() if '"kind": "eval"' in line]
    if evals:
        best = max(evals, key=lambda r: r["winrate"])
        log(f"resultado: la mejor respuesta le gana a {tag} el {100 * best['winrate']:.1f}% "
            f"(IC90 {100 * best['ci90'][0]:.1f}–{100 * best['ci90'][1]:.1f}). "
            "Cerca de 50–55%: sólida. Arriba de ~65%: tiene un agujero explotable.")


RESULTS = TRAINING / "results"


def policy_label(spec: str) -> str:
    return spec if spec in ("hard", "normal", "easy") else "/".join(training_path(spec).parts[-3:])


def cmd_duel(args) -> None:
    """
    Duelo entre dos redes (o una red y una heurística) en partidas duplicadas. El resultado se agrega a
    training/results/duelos.jsonl, que va a git: es el registro de todas las comparaciones.
    """
    workers = args.workers or default_workers()
    a = training_path(args.a)
    if not a.with_suffix(".json").exists():
        raise SystemExit(f"no existe la red {a}.json")
    if args.b in ("hard", "normal", "easy"):
        b_spec = {"kind": "heur", "difficulty": args.b}
    else:
        b = training_path(args.b)
        if not b.with_suffix(".json").exists():
            raise SystemExit(f"no existe la red {b}.json")
        b_spec = {"kind": "mlp", "path": str(b)}
    tmp = TRAINING / "runs" / f"tmp-duel-{os.getpid()}"
    remove_tree(tmp)
    jobs = [
        {"mode": "eval", "seed": args.seed + i, "matches": m, "players": args.players, "out": str(tmp / f"e{i}.json"),
         "a": {"kind": "mlp", "path": str(a)}, "b": b_spec}
        for i, m in enumerate(split_matches(args.pairs, workers))
    ]
    started = time.time()
    run_actors(jobs, tmp, workers)
    games = wins = pa = pb = 0
    for i in range(len(jobs)):
        r = json.loads((tmp / f"e{i}.json").read_text())
        games += r["games"]
        wins += r["winsA"]
        pa += r["pointsA"]
        pb += r["pointsB"]
    remove_tree(tmp)
    low, high = wilson(wins, games)
    record = {"date": time.strftime("%Y-%m-%d %H:%M"), "a": policy_label(args.a), "b": policy_label(args.b),
              "players": args.players, "games": games, "winrate": wins / games, "ci90": [low, high],
              "pointsPerGame": [pa / games, pb / games], "seed": args.seed, "commit": git_commit(),
              "seconds": round(time.time() - started, 1), "note": args.note or ""}
    RESULTS.mkdir(parents=True, exist_ok=True)
    append_jsonl(RESULTS / "duelos.jsonl", record)
    log(f"{record['a']} vs {record['b']}: {100 * wins / games:.1f}% (IC90 {100 * low:.1f}–{100 * high:.1f}) en {games} partidas"
        " → training/results/duelos.jsonl")


def cmd_archive(args) -> None:
    """
    Guarda el registro de una corrida para la tesis:
    - en training/results/runs/<corrida>/ (va a git): configuración, manifiesto, log.jsonl y stdout.log
      comprimidos y un resumen (evaluaciones, mejor red, última iteración);
    - con --backup <carpeta>: además copia la corrida entera menos lo que se regenera (datos de imitación,
      temporales y checkpoints viejos): redes guardadas, tabla W, red de imitación y el último checkpoint.
    """
    import gzip

    d = TRAINING / "runs" / args.run
    if not d.exists():
        raise SystemExit(f"no existe la corrida {args.run}")
    out = RESULTS / "runs" / args.run
    out.mkdir(parents=True, exist_ok=True)
    for f in ("config.json", "manifest.json"):
        if (d / f).exists():
            shutil.copyfile(d / f, out / f)
    for f in ("log.jsonl", "stdout.log"):
        if (d / f).exists():
            with open(d / f, "rb") as src, gzip.open(out / f"{f}.gz", "wb", compresslevel=9) as dst:
                shutil.copyfileobj(src, dst)
    log_path = d / "log.jsonl"
    lines = log_path.read_text().splitlines() if log_path.exists() else []
    records = [json.loads(line) for line in lines if line.strip()]
    iters = [r for r in records if r["kind"] == "ppo_iter"]
    summary = {
        "run": args.run,
        "archived": time.strftime("%Y-%m-%d %H:%M"),
        "starts": [{"t": r["t"], "commit": r.get("commit")} for r in records if r["kind"] == "start"],
        "lastIter": iters[-1]["iter"] if iters else 0,
        "evals": [{k: r[k] for k in ("tag", "opponent", "games", "winrate", "ci90")} for r in records if r["kind"] == "eval"],
        "gauntlet": [{k: r[k] for k in ("iter", "score", "rates")} for r in records if r["kind"] == "gauntlet"],
        "best": json.loads((d / "policies" / "best.json").read_text()).get("tag") if (d / "policies" / "best.json").exists() else None,
        "lastStyle": iters[-1].get("style") if iters else None,
        "lastEntropyByDecision": iters[-1].get("ent_by") if iters else None,
    }
    atomic_write_bytes(out / "summary.json", json.dumps(summary, indent=1, ensure_ascii=False).encode())
    log(f"registro de {args.run} en training/results/runs/{args.run}/ (va a git)")
    if args.backup:
        dest = Path(args.backup).expanduser() / args.run
        ckpts = sorted((d / "ckpt").glob("iter_*.pt"))
        skip_ckpts = {p.name for p in ckpts[:-1]}

        def ignore(folder: str, names: list[str]) -> set[str]:
            here = Path(folder)
            drop = {n for n in names if n.startswith("tmp") or n == "bcdata"}
            if here.name == "ckpt":
                drop |= {n for n in names if n in skip_ckpts}
            return drop

        shutil.copytree(d, dest, ignore=ignore, dirs_exist_ok=True)
        log(f"copia de respaldo en {dest}")


def cmd_eval(args) -> None:
    d = TRAINING / "runs" / args.run
    config = json.loads((d / "config.json").read_text())
    run = Run(args.run, config, args.workers)
    base = Path(args.policy) if args.policy else d / "policies" / "best"
    run.evaluate(base, args.pairs, args.opponent, tag=f"manual-{base.name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train")
    t.add_argument("--run", required=True)
    t.add_argument("--config")
    t.add_argument("--workers", type=int)
    t.add_argument("--smoke", action="store_true", help="corrida mínima para probar que todo anda")
    s = sub.add_parser("status")
    s.add_argument("--run", required=True)
    x = sub.add_parser("exploit", help="prueba de explotabilidad contra una red guardada")
    x.add_argument("--run", required=True)
    x.add_argument("--target", default="best", help="red de runs/<run>/policies (best, iter_000040, ...)")
    x.add_argument("--iters", type=int, default=150)
    x.add_argument("--pairs", type=int, default=500)
    x.add_argument("--workers", type=int, default=6)
    du = sub.add_parser("duel", help="duelo entre dos redes; se registra en training/results/duelos.jsonl")
    du.add_argument("--a", required=True, help="red (ruta sin extensión, relativa a training/ o absoluta)")
    du.add_argument("--b", required=True, help="otra red, o hard / normal / easy")
    du.add_argument("--pairs", type=int, default=1000)
    du.add_argument("--players", type=int, default=2)
    du.add_argument("--seed", type=int, default=888_000)
    du.add_argument("--workers", type=int)
    du.add_argument("--note", help="para qué se corrió (queda en el registro)")
    ar = sub.add_parser("archive", help="guarda el registro de una corrida (y opcionalmente una copia de respaldo)")
    ar.add_argument("--run", required=True)
    ar.add_argument("--backup", help="carpeta de respaldo fuera del repo (iCloud, disco externo)")
    e = sub.add_parser("eval")
    e.add_argument("--run", required=True)
    e.add_argument("--policy")
    e.add_argument("--pairs", type=int, default=1000)
    e.add_argument("--opponent", default="hard")
    e.add_argument("--workers", type=int)
    args = parser.parse_args()
    torch.set_num_threads(max(1, (os.cpu_count() or 4) // 4))
    {"train": cmd_train, "status": cmd_status, "eval": cmd_eval, "exploit": cmd_exploit,
     "duel": cmd_duel, "archive": cmd_archive}[args.cmd](args)


if __name__ == "__main__":
    main()
