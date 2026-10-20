#!/usr/bin/env bash
# Tanda 2 de la noche del 2026-10-20: ¿la mentira influye en el otro equipo? (Emmanuel: "si yo le hago señas al pie
# pero después digo otra cosa cuando me pregunta, quizás eso influye en el otro equipo").
# Espera a que termine training/escucha.sh y después:
#   1. Duelos de 1000 pares: el equipo de R (la mejor de r5-charla) con lo dicho impuesto (verdad / mentira / moneda /
#      callada / tal cual) contra la difícil, que escucha y cree 75% (y pesca mentiras con la reputación), en 4 y 6.
#      Si mentir rinde contra quien escucha, la mentira gana más que la verdad y que callarse.
#   2. Lo mismo contra r3 (que no oye): control, debería dar lo mismo con cualquier variante.
#   3. Reentrena el clasificador de frases (se agregó la intención «hacé como quieras»): public/models/intent-head.json.
# Lanzar desde la raíz del repo:   caffeinate -dimsu bash training/mentira.sh
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=training/runs/mentira-2026-10-20.log
mkdir -p training/runs
step() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }
while ! grep -q "^\[.*\] listo:" training/runs/escucha-2026-10-20.log 2>/dev/null; do sleep 120; done
step "escucha.sh terminó; arranca la tanda de la mentira"
# shellcheck disable=SC1091
source training/.venv/bin/activate
R=runs/r5-charla-br-r5-charla-iter25/target
duel() { python training/learner/run.py duel --pairs 1000 --talk tanto,cartas --reputation "$@" 2>&1 | tee -a "$LOG"; }
for n in 4 6; do
  for v in truth lie coin mute; do
    duel --a "$R#$v" --b hard --players "$n" --note "mentira: R que dice $v contra la difícil (que escucha)"
  done
  duel --a "$R" --b hard --players "$n" --note "mentira: R tal cual contra la difícil (que escucha)"
  duel --a "$R#lie" --b runs/r3/policies/best --players "$n" --note "mentira: R que miente contra r3 (que no oye)"
  duel --a "$R#truth" --b runs/r3/policies/best --players "$n" --note "mentira: R que dice la verdad contra r3 (que no oye)"
done
step "clasificador de frases (EmbeddingGemma): nueva intención IND_LIBRE"
node --import tsx training/lang/eval-intents.ts 2>&1 | tail -20 | tee -a "$LOG"
step "listo: duelos en training/results/duelos.jsonl; clasificador en public/models/intent-head.json (commitearlo)"
