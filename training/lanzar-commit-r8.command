#!/usr/bin/env bash
# Doble clic: commitea la lectura final de r8 y pushea main a GitHub (Vercel despliega desde ahí).
cd "$(dirname "$0")/.." || exit 1
git add training/results training/lanzar-commit-r8.command
git commit -q -m "results(r8): duelos con la última red de cada condición y lectura final

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXKoq3mazV5T3w6vHDFY4F"
echo "commit hecho: $(git log -1 --oneline)"
git push origin main && echo "push hecho: $(git log -1 --oneline origin/main)"
echo "(podés cerrar esta ventana)"
