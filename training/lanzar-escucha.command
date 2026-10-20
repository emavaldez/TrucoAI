#!/usr/bin/env bash
# Doble clic desde el Finder: commitea el cambio de r6 y lanza la tanda de la noche (training/escucha.sh).
cd "$(dirname "$0")/.." || exit 1
if ! git diff --quiet HEAD -- training || [ -n "$(git ls-files --others --exclude-standard training)" ]; then
  git add training/README.md training/actors/rollout.ts training/learner/run.py training/results/BITACORA.md \
    training/config/r6-escucha-*.json training/escucha.sh training/lanzar-escucha.command training/results/runs
  git commit -q -F - <<'MSG'
feat(training): r6 "escucha" — la que escucha contra un emisor fijo (verdad, mentira, moneda)

Bandera speech (truth/lie/coin) en los agentes del rollout, '#banderas' en duel, eval, gauntlet y
fixedOpponents, eval.deafControl, init.fromRun copia las tablas W de 4 y 6. Configs r6-escucha-* y
training/escucha.sh (línea de base, tres entrenamientos y duelos finales). Registros de la tanda de
día del 2026-09-29 (explotabilidad de r5-charla y réplicas de r4-piloto).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXKoq3mazV5T3w6vHDFY4F
MSG
  echo "commit hecho: $(git log -1 --oneline)"
fi
exec caffeinate -dimsu bash training/escucha.sh
