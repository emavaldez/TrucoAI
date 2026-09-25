#!/usr/bin/env bash
# Lanza (o retoma) una corrida y la mantiene viva. Desde la raíz del repo:
#   bash training/train.sh r1            # corrida "r1" con training/config/default.json
#   bash training/train.sh r1 --workers 12
# - La Mac no se duerme mientras corre (caffeinate).
# - Si el proceso se cae, espera 30 s y retoma desde el último checkpoint.
# - Ctrl-C lo corta de verdad (y se retoma con el mismo comando).
# - Todo queda en training/runs/<corrida>/ (log.jsonl, stdout.log, checkpoints, redes).
set -uo pipefail
cd "$(dirname "$0")/.."
RUN="${1:?Uso: bash training/train.sh <nombre-de-corrida> [opciones]}"
shift || true
# shellcheck disable=SC1091
source training/.venv/bin/activate
mkdir -p "training/runs/$RUN"
stop=0
trap 'stop=1' INT TERM
while [ "$stop" -eq 0 ]; do
  caffeinate -dimsu python training/learner/run.py train --run "$RUN" --config training/config/default.json "$@" 2>&1 \
    | tee -a "training/runs/$RUN/stdout.log"
  code=${PIPESTATUS[0]}
  [ "$stop" -eq 1 ] && break
  [ "$code" -eq 0 ] && break
  echo "[$(date +%H:%M:%S)] el entrenamiento se cortó (código $code); retomo en 30 s (Ctrl-C para salir)" | tee -a "training/runs/$RUN/stdout.log"
  sleep 30
done
