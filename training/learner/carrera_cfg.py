"""
Configuraciones de la carrera armamentista (2026-10-21, `training/carrera.sh`; programa-habla.md, tanda 2).

Cada generación es una mejor respuesta, con charla pública y señas como en el juego, a redes congeladas:
- cadena "ultima": la generación k juega solo contra la k-1 (respuesta iterada: ¿cicla mentir ↔ desconfiar?);
- cadena "mezcla": la generación k juega contra la mezcla uniforme de todas las anteriores (PSRO con meta-solver
  uniforme = juego ficticio: ¿se apaga hacia el balbuceo?).
La generación 0 es la mejor de r7-engano (la que aprendió a mentir contra una que escucha). Cada una arranca de los
pesos de la anterior de su cadena y entrena 100 iteraciones.

Uso: python training/learner/carrera_cfg.py <ultima|mezcla> <k>   → escribe config/carrera-<cadena>-<k>.json e
imprime el nombre de la corrida.
"""

import json
import re
import sys
from pathlib import Path

TRAINING = Path(__file__).resolve().parent.parent
ITERS = 100


def best_of(run: str) -> tuple[str, int]:
    tag = json.loads((TRAINING / "runs" / run / "policies" / "best.json").read_text())["tag"]
    return run, int(re.search(r"iter(\d+)", tag).group(1))


def member(chain: str, k: int) -> str:
    if k == 0:
        return "r7-engano"
    if chain == "mezcla" and k == 1:
        return "carrera-ultima-1"  # la primera respuesta es la misma en las dos cadenas
    return f"carrera-{chain}-{k}"


def main() -> None:
    chain, k = sys.argv[1], int(sys.argv[2])
    parent_run, parent_iter = best_of(member(chain, k - 1))
    targets = [member(chain, k - 1)] if chain == "ultima" else [member(chain, j) for j in range(k)]
    paths = [f"runs/{t}/policies/best" for t in targets]
    name = f"carrera-{chain}-{k}"
    cfg = {
        "_comment": f"{name}: mejor respuesta a {' + '.join(targets)} (congeladas, mezcla uniforme), desde {parent_run} "
                    f"iteración {parent_iter}, {ITERS} iteraciones, 4 y 6, charla pública con reputación y señas. "
                    "Ver learner/carrera_cfg.py.",
        "players": 4, "seed": 90 + k + (0 if chain == "ultima" else 50), "workers": 16,
        "talk": {"topics": ["tanto", "cartas"], "reputation": True, "matchCredit": True},
        "init": {"fromRun": parent_run, "iter": parent_iter},
        "ppo": {
            "iterations": parent_iter + ITERS, "matchesPerIter": 1024, "minibatch": 8192, "criticWarmup": 0,
            "playerMix": {"4": 0.5, "6": 0.5}, "klBc": 0.0, "klBcFinal": 0.0, "snapshotEvery": 1_000_000_000,
            "fixedOpponents": [{"kind": "mlp", "path": p, "weight": 1.0 / len(paths), "name": t} for p, t in zip(paths, targets)],
            "obeyBonus": {"start": 0.005, "floor": 0.005, "decayIters": 1},
        },
        "eval": {
            "every": 20, "pairs": 300, "opponent": paths[-1], "players": [4, 6], "select": [4, 6], "deafControl": True,
            **({"gauntlet": {"pairs": 300, "players": [4, 6], "opponents": paths}} if chain == "mezcla" else {}),
        },
        "checkpoint": {"keepLast": 2, "keepBest": 2, "backupDir": None},
    }
    (TRAINING / "config" / f"{name}.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=2))
    print(name)


if __name__ == "__main__":
    main()
