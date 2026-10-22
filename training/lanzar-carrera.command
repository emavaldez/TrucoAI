#!/usr/bin/env bash
# Doble clic: commitea y pushea la carrera armamentista y la lanza (training/carrera.sh, ~6 h).
cd "$(dirname "$0")/.." || exit 1
git add training/learner/carrera_cfg.py training/carrera.sh training/lanzar-carrera.command training/results/BITACORA.md \
  training/results/r7-engano.md
git commit -q -m "feat(training): carrera armamentista de la charla (respuesta a la última y a la mezcla)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXKoq3mazV5T3w6vHDFY4F"
echo "commit hecho: $(git log -1 --oneline)"
git push origin main && echo "push hecho"
exec caffeinate -dimsu bash training/carrera.sh
