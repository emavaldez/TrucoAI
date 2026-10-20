#!/usr/bin/env bash
# Doble clic: commitea la configuración de r7 y lanza training/engano.sh.
cd "$(dirname "$0")/.." || exit 1
git add training/config/r7-engano.json training/engano.sh training/lanzar-engano.command training/results/BITACORA.md
git commit -q -m "feat(training): r7-engaño, ¿la red aprende a mentir cuando hay quien escucha?

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXKoq3mazV5T3w6vHDFY4F"
echo "commit hecho: $(git log -1 --oneline)"
exec caffeinate -dimsu bash training/engano.sh
