#!/usr/bin/env bash
# Cierre de r8 "dos audiencias" (2026-10-21): el archive se había caído (KeyError en talkAblation, ya arreglado) y la
# "mejor" de A y B se eligió temprano (iteraciones 60 y 40, por lo que le ganan a la difícil). Acá: registros de las
# cuatro corridas y duelos de 1000 pares con la ÚLTIMA red de cada una (iteración 225), que es la que aprendió a hablar.
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=training/runs/dos-audiencias-2026-10-20.log
step() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }
# shellcheck disable=SC1091
source training/.venv/bin/activate
for c in A-senas-publica B-sinsenas-publica C-sinsenas-equipo D-sinsenas-mitad; do
  python training/learner/run.py archive --run "r8-$c" 2>&1 | tee -a "$LOG"
done
duel() { python training/learner/run.py duel --pairs 1000 --talk tanto,cartas "$@" 2>&1 | tee -a "$LOG"; }
talkargs() {
  case "$1" in
    A-senas-publica) echo "" ;;
    B-sinsenas-publica) echo "--no-signs --opening --audience public" ;;
    C-sinsenas-equipo) echo "--no-signs --opening --audience team" ;;
    D-sinsenas-mitad) echo "--no-signs --opening --audience 0.5" ;;
  esac
}
step "3. duelos con la última red (iteración 225)"
for c in A-senas-publica B-sinsenas-publica C-sinsenas-equipo D-sinsenas-mitad; do
  last="runs/r8-$c/policies/current"
  for n in 4 6; do
    for f in mute deafteam deafrivals; do
      [ "$c" = C-sinsenas-equipo ] && [ "$f" = deafrivals ] && continue
      # shellcheck disable=SC2046
      duel $(talkargs "$c") --a "$last" --b "$last#$f" --players "$n" --note "dos audiencias $c (última): contra sí misma $f"
    done
    # shellcheck disable=SC2046
    duel $(talkargs "$c") --a "$last" --b hard --players "$n" --note "dos audiencias $c (última): contra la difícil"
  done
done
step "cierre listo"
