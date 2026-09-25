"""Piezas comunes del learner: redes, exportación a TS, actores en paralelo, datos y checkpoints.

El motor y la codificación viven en TypeScript (training/env). Acá solo se entrena la red.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch import nn

REPO = Path(__file__).resolve().parents[2]
TRAINING = REPO / "training"


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def default_workers() -> int:
    return max(1, (os.cpu_count() or 4) - 2)


# ---------- layout de la observación (lo dice el TS) ----------

def obs_layout(players: int = 2) -> dict:
    out = subprocess.run(
        ["node", "--import", "tsx", "training/env/layout-cli.ts", str(players)],
        cwd=REPO, check=True, capture_output=True, text=True,
    )
    return json.loads(out.stdout)


# ---------- redes ----------

class PolicyNet(nn.Module):
    """MLP con ReLU; la misma forma que training/env/mlp.ts."""

    def __init__(self, obs_dim: int, n_actions: int, hidden: tuple[int, ...] = (256, 256, 128)):
        super().__init__()
        dims = (obs_dim, *hidden, n_actions)
        self.layers = nn.ModuleList(nn.Linear(a, b) for a, b in zip(dims[:-1], dims[1:]))
        self.hidden = hidden

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        for i, layer in enumerate(self.layers):
            x = layer(x)
            if i < len(self.layers) - 1:
                x = torch.relu(x)
        return x


class CriticNet(nn.Module):
    """Valor de la mano; ve la observación y además las manos ajenas (solo en entrenamiento)."""

    def __init__(self, obs_dim: int, priv_dim: int, hidden: tuple[int, ...] = (512, 256)):
        super().__init__()
        dims = (obs_dim + priv_dim, *hidden)
        layers: list[nn.Module] = []
        for a, b in zip(dims[:-1], dims[1:]):
            layers += [nn.Linear(a, b), nn.ReLU()]
        layers.append(nn.Linear(dims[-1], 1))
        self.net = nn.Sequential(*layers)

    def forward(self, obs: torch.Tensor, priv: torch.Tensor) -> torch.Tensor:
        return self.net(torch.cat([obs, priv], dim=-1)).squeeze(-1)


def masked_logits(logits: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    return logits.masked_fill(mask == 0, -1e9)


def export_policy(policy: PolicyNet, base: Path, layout_hash: str, tag: str) -> None:
    """Escribe <base>.json + <base>.bin para training/env/mlp.ts (escritura atómica)."""
    base.parent.mkdir(parents=True, exist_ok=True)
    chunks = []
    layers = []
    for layer in policy.layers:
        w = layer.weight.detach().float().cpu().numpy()
        b = layer.bias.detach().float().cpu().numpy()
        layers.append({"in": int(w.shape[1]), "out": int(w.shape[0])})
        chunks += [w.reshape(-1), b.reshape(-1)]
    data = np.concatenate(chunks).astype("<f4")
    meta = {
        "format": "trucoai-mlp-v1",
        "obsDim": layers[0]["in"],
        "nActions": layers[-1]["out"],
        "layers": layers,
        "layoutHash": layout_hash,
        "tag": tag,
    }
    atomic_write_bytes(base.with_suffix(".bin"), data.tobytes())
    atomic_write_bytes(base.with_suffix(".json"), json.dumps(meta).encode())


# ---------- escritura segura ----------

def atomic_write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def atomic_torch_save(obj: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "wb") as f:
        torch.save(obj, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def append_jsonl(path: Path, record: dict) -> None:
    with open(path, "a") as f:
        f.write(json.dumps(record) + "\n")
        f.flush()
        os.fsync(f.fileno())


# ---------- actores en paralelo ----------

def run_actors(jobs: list[dict], job_dir: Path, workers: int) -> None:
    """Lanza un proceso Node por trabajo, como mucho `workers` a la vez. Falla si alguno falla."""
    job_dir.mkdir(parents=True, exist_ok=True)
    pending = list(enumerate(jobs))
    running: list[tuple[int, subprocess.Popen, Path]] = []
    failures: list[str] = []
    while pending or running:
        while pending and len(running) < workers:
            i, job = pending.pop(0)
            path = job_dir / f"job-{i:03d}.json"
            path.write_text(json.dumps(job))
            err = job_dir / f"job-{i:03d}.err"
            proc = subprocess.Popen(
                ["node", "--import", "tsx", "training/actors/rollout.ts", str(path)],
                cwd=REPO, stdout=subprocess.DEVNULL, stderr=open(err, "w"),
            )
            running.append((i, proc, err))
        time.sleep(0.05)
        still = []
        for i, proc, err in running:
            code = proc.poll()
            if code is None:
                still.append((i, proc, err))
            elif code != 0:
                failures.append(f"actor {i} salió con {code}: {err.read_text()[-2000:]}")
        running = still
    if failures:
        raise RuntimeError("\n".join(failures))


def split_matches(total: int, parts: int) -> list[int]:
    base, extra = divmod(total, parts)
    return [base + (1 if i < extra else 0) for i in range(parts) if base + (1 if i < extra else 0) > 0]


# ---------- datos de los actores ----------

@dataclass
class Batch:
    obs: np.ndarray  # uint8 [N, obs]
    mask: np.ndarray  # uint8 [N, A]
    act: np.ndarray  # uint8 [N]
    logp: np.ndarray  # f32 [N]
    rew: np.ndarray  # f32 [N]
    done: np.ndarray  # uint8 [N]
    priv: np.ndarray | None  # uint8 [N, priv]
    metas: list[dict]


def load_chunks(prefixes: list[Path]) -> Batch:
    parts: dict[str, list[np.ndarray]] = {k: [] for k in ("obs", "mask", "act", "logp", "rew", "done", "priv")}
    metas = []
    for prefix in prefixes:
        meta = json.loads(Path(f"{prefix}.meta.json").read_text())
        metas.append(meta)
        n = meta["n"]
        if n == 0:
            continue
        parts["obs"].append(np.fromfile(f"{prefix}.obs.u8", dtype=np.uint8).reshape(n, meta["obsDim"]))
        parts["mask"].append(np.fromfile(f"{prefix}.mask.u8", dtype=np.uint8).reshape(n, meta["nActions"]))
        parts["act"].append(np.fromfile(f"{prefix}.act.u8", dtype=np.uint8))
        parts["logp"].append(np.fromfile(f"{prefix}.logp.f32", dtype="<f4"))
        parts["rew"].append(np.fromfile(f"{prefix}.rew.f32", dtype="<f4"))
        parts["done"].append(np.fromfile(f"{prefix}.done.u8", dtype=np.uint8))
        if meta.get("privDim"):
            parts["priv"].append(np.fromfile(f"{prefix}.priv.u8", dtype=np.uint8).reshape(n, meta["privDim"]))
    cat = {k: (np.concatenate(v) if v else None) for k, v in parts.items()}
    return Batch(cat["obs"], cat["mask"], cat["act"], cat["logp"], cat["rew"], cat["done"], cat["priv"], metas)


def remove_tree(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)


def git_commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    except Exception:  # noqa: BLE001
        return "?"


def wilson(wins: float, n: int, z: float = 1.645) -> tuple[float, float]:
    if n == 0:
        return 0.0, 1.0
    p = wins / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / denom
    return center - half, center + half


if __name__ == "__main__":
    print(json.dumps(obs_layout(int(sys.argv[1]) if len(sys.argv) > 1 else 2))[:300])
