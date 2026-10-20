#!/usr/bin/env bash
# Tanda de la noche del 2026-10-20 (r6, "escucha"): ¿la charla no sirve porque la información no vale nada, o porque
# en self-play el emisor aprendió a balbucear? (training/results/BITACORA.md, 2026-10-20)
#   A. Línea de base (sin entrenar, ~45 min): la mejor de r5-charla (R) contra sí misma con lo dicho impuesto
#      (verdad / mentira / moneda / tal cual), en 4 y 6; R sorda contra la que dice la verdad; y las variantes entre sí.
#   B. Entrenar a la que escucha (~1 h cada una): r6-escucha-verdad, -mentira y -moneda, 150 iteraciones desde R
#      contra R con lo dicho impuesto. Cada 10 iteraciones se evalúa contra ese rival, oyendo y sorda.
#   C. Duelos finales de 1000 pares (~1 h): cada red entrenada contra su emisor (oyendo y sorda) y contra R tal cual.
# Lanzar desde la raíz del repo con la Mac despierta:   caffeinate -dimsu bash training/escucha.sh
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=training/runs/escucha-2026-10-20.log
mkdir -p training/runs
step() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }
# shellcheck disable=SC1091
source training/.venv/bin/activate
R=runs/r5-charla-br-r5-charla-iter25/target   # la mejor de r5-charla (iteración 25), congelada
PAIRS="${PAIRS:-1000}"
duel() { python training/learner/run.py duel --pairs "$PAIRS" --talk tanto,cartas --reputation "$@" 2>&1 | tee -a "$LOG"; }

step "A. línea de base: R contra sí misma con lo dicho impuesto"
for n in 4 6; do
  for v in truth lie coin; do
    duel --a "$R" --b "$R#$v" --players "$n" --note "escucha A: R oye a R que dice $v"
  done
  duel --a "$R#deaf" --b "$R#truth" --players "$n" --note "escucha A: R sorda contra R que dice la verdad"
done
duel --a "$R#truth" --b "$R#lie" --players 4 --note "escucha A: verdad contra mentira"
duel --a "$R#truth" --b "$R#coin" --players 4 --note "escucha A: verdad contra moneda"
duel --a "$R#lie" --b "$R#coin" --players 4 --note "escucha A: mentira contra moneda"

step "B. entrenar a la que escucha"
for v in verdad mentira moneda; do
  run="r6-escucha-$v"
  step "empieza $run"
  bash training/train.sh "$run"
  source training/.venv/bin/activate
  python training/learner/run.py archive --run "$run" 2>&1 | tee -a "$LOG"
  step "terminó $run"
done

step "C. duelos finales"
declare -A FLAG=([verdad]=truth [mentira]=lie [moneda]=coin)
for v in verdad mentira moneda; do
  best="runs/r6-escucha-$v/policies/best"
  f=${FLAG[$v]}
  for n in 4 6; do
    duel --a "$best" --b "$R#$f" --players "$n" --note "escucha C: entrenada contra $v, oyendo"
    duel --a "$best#deaf" --b "$R#$f" --players "$n" --note "escucha C: entrenada contra $v, sorda"
  done
  duel --a "$best" --b "$R" --players 4 --note "escucha C: entrenada contra $v, contra R tal cual"
done
step "listo: registros en training/results/runs/ y training/results/duelos.jsonl"
