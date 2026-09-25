"""Verifica que la red exportada da lo mismo en PyTorch y en TypeScript (misma entrada, mismos logits)."""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import REPO, PolicyNet, export_policy, obs_layout  # noqa: E402


def main() -> None:
    layout = obs_layout(2)
    torch.manual_seed(0)
    net = PolicyNet(layout["obsDim"], layout["nActions"])
    rng = np.random.default_rng(0)
    obs = (rng.random((32, layout["obsDim"])) < 0.08).astype(np.uint8) * rng.integers(1, 256, (32, layout["obsDim"]), dtype=np.uint8)
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp) / "net"
        export_policy(net, base, layout["layoutHash"], "parity")
        (Path(tmp) / "obs.u8").write_bytes(obs.tobytes())
        out = subprocess.run(
            ["node", "--import", "tsx", "training/env/parity-cli.ts", str(base), str(Path(tmp) / "obs.u8"), str(layout["obsDim"])],
            cwd=REPO, check=True, capture_output=True, text=True,
        )
    ts = np.array(json.loads(out.stdout))
    with torch.no_grad():
        py = net(torch.from_numpy(obs).float() / 255.0).numpy()
    diff = float(np.abs(ts - py).max())
    print(f"diferencia máxima PyTorch vs TypeScript: {diff:.2e}")
    if diff > 1e-4:
        raise SystemExit("¡no coinciden!")
    print("ok")


if __name__ == "__main__":
    main()
