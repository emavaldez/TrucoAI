#!/usr/bin/env bash
# r8 "dos audiencias" (2026-10-20, noche): ¿cuándo informa lo que se dice en la mesa? (results/programa-habla.md)
#   0. Cuánto valen las señas: R contra R sin ver las señas, en 4 y 6 (1000 pares, ~2 min).
#   1. Cuatro entrenamientos desde la misma red (r5-charla iteración 25), ~1 h cada uno:
#      A con señas y charla pública (control) · B sin señas, charla pública · C sin señas, charla solo del equipo ·
#      D sin señas, el rival oye la mitad de lo que se dice.
#   2. Duelos de 1000 pares de cada una contra sí misma callada, sorda a su equipo y sorda a los rivales, en 4 y 6.
# Lanzar desde la raíz del repo con la Mac despierta:   caffeinate -dimsu bash training/dos-audiencias.sh
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=training/runs/dos-audiencias-2026-10-20.log
mkdir -p training/runs
step() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }
# shellcheck disable=SC1091
source training/.venv/bin/activate
R=runs/r5-charla-br-r5-charla-iter25/target
duel() { python training/learner/run.py duel --pairs 1000 --talk tanto,cartas "$@" 2>&1 | tee -a "$LOG"; }

step "0. cuánto valen las señas"
for n in 4 6; do
  duel --reputation --a "$R" --b "$R#nosigns" --players "$n" --note "dos audiencias 0: R contra R sin ver las señas"
done

for c in A-senas-publica B-sinsenas-publica C-sinsenas-equipo D-sinsenas-mitad; do
  run="r8-$c"
  step "empieza $run"
  bash training/train.sh "$run"
  source training/.venv/bin/activate
  python training/learner/run.py archive --run "$run" 2>&1 | tee -a "$LOG"
  step "terminó $run"
done

step "2. duelos finales"
talkargs() {
  case "$1" in
    A-senas-publica) echo "" ;;
    B-sinsenas-publica) echo "--no-signs --opening --audience public" ;;
    C-sinsenas-equipo) echo "--no-signs --opening --audience team" ;;
    D-sinsenas-mitad) echo "--no-signs --opening --audience 0.5" ;;
  esac
}
for c in A-senas-publica B-sinsenas-publica C-sinsenas-equipo D-sinsenas-mitad; do
  best="runs/r8-$c/policies/best"
  # shellcheck disable=SC2046
  for n in 4 6; do
    for f in mute deafteam deafrivals; do
      [ "$c" = C-sinsenas-equipo ] && [ "$f" = deafrivals ] && continue
      duel $(talkargs "$c") --a "$best" --b "$best#$f" --players "$n" --note "dos audiencias $c: contra sí misma $f"
    done
    [ "$c" = A-senas-publica ] && duel --a "$best" --b "$best#nosigns" --players "$n" --note "dos audiencias $c: contra sí misma sin ver las señas"
    duel $(talkargs "$c") --a "$best" --b hard --players "$n" --note "dos audiencias $c: contra la difícil"
  done
done
step "listo: registros en training/results/runs/r8-*/ y training/results/duelos.jsonl"
