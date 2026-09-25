#!/usr/bin/env bash
# Prepara el entorno de entrenamiento en la Mac (una sola vez). Desde la raíz del repo:
#   bash training/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PY=""
for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then PY="$candidate"; break; fi
done
[ -n "$PY" ] || { echo "No encontré python3. Instalalo con: brew install python@3.12"; exit 1; }
echo "==> Python: $($PY --version)"

if [ ! -d training/.venv ]; then "$PY" -m venv training/.venv; fi
# shellcheck disable=SC1091
source training/.venv/bin/activate
python -m pip install --upgrade pip >/dev/null
python -m pip install -r training/requirements.txt

echo "==> Dependencias del juego (Node)"
npm install --no-audit --no-fund >/dev/null

echo "==> GPU para PyTorch"
python - <<'PY'
import torch
print("  MPS (GPU de Apple):", "sí" if torch.backends.mps.is_available() else "NO (va a entrenar en CPU)")
PY

echo "==> Chequeos"
npx vitest run training --reporter=dot
python training/learner/parity_check.py
python training/learner/run.py train --run smoke --smoke --workers 4
rm -rf training/runs/smoke
echo
echo "Listo. Para entrenar:  bash training/train.sh r1"
