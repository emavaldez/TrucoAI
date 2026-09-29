#!/usr/bin/env bash
# Tanda de la noche del 2026-09-28 (Emmanuel se va a dormir: "quiero dejar probando lo más que pueda").
# Corre una cosa atrás de otra; cada entrenamiento se retoma solo si se corta (train.sh).
#   1. r4-sinrep  — control de r4-reputación sin reputación (~1 h 20 min)
#   2. r5-charla  — la red que habla, en 4 y 6 jugadores, 700 iteraciones (~4 h 30 min)
#   3. duelos de 1000 pares (~20 min) → training/results/duelos.jsonl
# Lanzar (desde la raíz del repo) con la Mac despierta toda la tanda:
#   caffeinate -dimsu bash training/noche.sh
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=training/runs/noche-2026-09-28.log
mkdir -p training/runs
step() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }
run() {
  step "empieza $1"
  bash training/train.sh "$1"
  # shellcheck disable=SC1091
  source training/.venv/bin/activate
  python training/learner/run.py archive --run "$1" 2>&1 | tee -a "$LOG"
  step "terminó $1"
}

run r4-sinrep
run r5-charla

# shellcheck disable=SC1091
source training/.venv/bin/activate
step "duelos"
duel() { python training/learner/run.py duel --pairs 1000 --talk tanto,cartas --reputation "$@" 2>&1 | tee -a "$LOG"; }
for n in 4 6; do
  duel --a runs/r5-charla/policies/best --b runs/r3/policies/best --players "$n" --note "noche: r5-charla contra r3"
  duel --a runs/r5-charla/policies/best --b hard --players "$n" --note "noche: r5-charla contra la difícil (que escucha)"
done
duel --a runs/r4-reputacion/policies/best --b runs/r4-sinrep/policies/best --players 4 --note "noche: con reputación contra sin reputación"
duel --a runs/r5-charla/policies/best --b runs/r4-piloto/policies/best --players 4 --note "noche: r5-charla contra r4-piloto"
step "listo: todo en training/results/runs/ y training/results/duelos.jsonl"
