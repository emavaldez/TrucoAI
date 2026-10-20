#!/usr/bin/env bash
# r7 "engaño" (2026-10-20, de día): ¿la red aprende a mentir a propósito cuando hay quien escucha, y le rinde?
#   1. Entrena r7-engano (200 iteraciones desde r6-escucha-verdad, liga en la que se escucha; ~1 h 30).
#   2. Duelos de 1000 pares en 4 y 6: r7 hablando libre, obligada a decir la verdad, mintiendo y callada, contra
#      r6-escucha-verdad (que escucha); r7 contra la difícil, r3 y R; y r7 contra r6-escucha-verdad sorda (control).
#      Si "libre" le gana a "verdad" contra la que escucha, lo que dice le rinde (engaña a propósito).
# Lanzar desde la raíz del repo:   caffeinate -dimsu bash training/engano.sh
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=training/runs/engano-2026-10-20.log
mkdir -p training/runs
step() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }
step "empieza r7-engano"
bash training/train.sh r7-engano
# shellcheck disable=SC1091
source training/.venv/bin/activate
python training/learner/run.py archive --run r7-engano 2>&1 | tee -a "$LOG"
step "terminó r7-engano; duelos"
B=runs/r7-engano/policies/best
E=runs/r6-escucha-verdad/policies/best
R=runs/r5-charla-br-r5-charla-iter25/target
duel() { python training/learner/run.py duel --pairs 1000 --talk tanto,cartas --reputation "$@" 2>&1 | tee -a "$LOG"; }
for n in 4 6; do
  duel --a "$B" --b "$E" --players "$n" --note "engaño: r7 libre contra la que escucha"
  duel --a "$B#truth" --b "$E" --players "$n" --note "engaño: r7 obligada a la verdad contra la que escucha"
  duel --a "$B#lie" --b "$E" --players "$n" --note "engaño: r7 obligada a mentir contra la que escucha"
  duel --a "$B#mute" --b "$E" --players "$n" --note "engaño: r7 callada contra la que escucha"
  duel --a "$B" --b "$E#deaf" --players "$n" --note "engaño: r7 libre contra la que escucha, sorda (control)"
  duel --a "$B" --b hard --players "$n" --note "engaño: r7 contra la difícil"
  duel --a "$B" --b runs/r3/policies/best --players "$n" --note "engaño: r7 contra r3"
  duel --a "$B" --b "$R" --players "$n" --note "engaño: r7 contra R (r5-charla)"
done
duel --a "$E" --b runs/r3/policies/best --players 4 --note "¿va al juego? r6-escucha-verdad contra r3"
duel --a "$E" --b runs/r3/policies/best --players 6 --note "¿va al juego? r6-escucha-verdad contra r3"
duel --a "$E" --b hard --players 4 --note "¿va al juego? r6-escucha-verdad contra la difícil"
duel --a "$E" --b hard --players 6 --note "¿va al juego? r6-escucha-verdad contra la difícil"
step "listo: registros en training/results/runs/r7-engano/ y training/results/duelos.jsonl"
