#!/usr/bin/env bash
# Carrera armamentista de la charla (2026-10-21, noche; programa-habla.md, tanda 2).
#   1. Cadena "ultima": 6 generaciones, cada una mejor respuesta a la anterior (~30 min cada una).
#   2. Cadena "mezcla": generaciones 2 a 5, cada una contra la mezcla de todas las anteriores (la 1 es la misma).
#   3. Matriz de duelos (400 pares, 4 jugadores) entre todas las generaciones y R, r6-escucha-verdad, r3 y la difícil.
# Lanzar desde la raíz del repo con la Mac despierta:   caffeinate -dimsu bash training/carrera.sh
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=training/runs/carrera-2026-10-21.log
mkdir -p training/runs
step() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }
# shellcheck disable=SC1091
source training/.venv/bin/activate
gen() {
  local run
  run=$(python training/learner/carrera_cfg.py "$1" "$2") || { step "no pude armar $1 $2"; return 1; }
  if [ -f "training/runs/$run/policies/best.json" ] && grep -q "\"$run\"" "$LOG" 2>/dev/null && grep -q "terminó $run" "$LOG"; then
    step "$run ya estaba"; return 0
  fi
  step "empieza $run"
  bash training/train.sh "$run"
  source training/.venv/bin/activate
  python training/learner/run.py archive --run "$run" 2>&1 | tee -a "$LOG"
  step "terminó $run"
}
for k in 1 2 3 4 5 6; do gen ultima "$k"; done
for k in 2 3 4 5; do gen mezcla "$k"; done

step "matriz de duelos"
NETS="runs/r7-engano/policies/best"
for k in 1 2 3 4 5 6; do NETS="$NETS runs/carrera-ultima-$k/policies/best"; done
for k in 2 3 4 5; do NETS="$NETS runs/carrera-mezcla-$k/policies/best"; done
NETS="$NETS runs/r6-escucha-verdad/policies/best runs/r5-charla-br-r5-charla-iter25/target runs/r3/policies/best hard"
set -- $NETS
while [ $# -gt 1 ]; do
  a=$1; shift
  [ "$a" = hard ] && continue
  for b in "$@"; do
    python training/learner/run.py duel --pairs 400 --talk tanto,cartas --reputation --a "$a" --b "$b" --players 4 \
      --note "carrera: matriz" 2>&1 | tee -a "$LOG"
  done
done
step "listo: registros en training/results/runs/carrera-*/ y training/results/duelos.jsonl (notas «carrera: matriz»)"
