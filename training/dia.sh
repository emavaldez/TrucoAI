#!/usr/bin/env bash
# Tanda del 2026-09-29 (de día, mientras se integra la red que habla al juego):
#   1. Explotabilidad de r5-charla: una red entrenada solo para ganarle (~50 min).
#   2. Réplicas de r4-piloto con otras dos semillas: ¿el "balbuceo" se repite? (~2 h 20 min)
# Lanzar con la Mac despierta:  caffeinate -dimsu bash training/dia.sh
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=training/runs/dia-2026-09-29.log
mkdir -p training/runs
step() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }
# shellcheck disable=SC1091
source training/.venv/bin/activate

step "empieza explotabilidad de r5-charla"
python training/learner/run.py exploit --run r5-charla --target best --iters 150 --workers 16 2>&1 | tee -a "$LOG" \
  | tee -a training/runs/r5-charla-exploit-stdout.log >/dev/null
for d in training/runs/r5-charla-br-*; do python training/learner/run.py archive --run "$(basename "$d")" 2>&1 | tee -a "$LOG"; done
step "terminó explotabilidad"

for run in r4-piloto-s2 r4-piloto-s3; do
  step "empieza $run"
  bash training/train.sh "$run"
  source training/.venv/bin/activate
  python training/learner/run.py archive --run "$run" 2>&1 | tee -a "$LOG"
  step "terminó $run"
done
step "listo: registros en training/results/runs/"
