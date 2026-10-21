#!/usr/bin/env bash
# Doble clic: registros de r8, duelos con la última red de cada condición, y commit de todo.
cd "$(dirname "$0")/.." || exit 1
caffeinate -dimsu bash training/r8-cierre.sh
git add training/actors/rollout.ts training/learner/run.py training/config/r8-*.json training/r8-cierre.sh \
  training/lanzar-r8-cierre.command training/results
git commit -q -F - <<'MSG'
results(r8): dos audiencias — registros, duelos con la última red y arreglos (repInputs, archive)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXKoq3mazV5T3w6vHDFY4F
MSG
echo "commit hecho: $(git log -1 --oneline)"; echo "(podés cerrar esta ventana)"
