#!/usr/bin/env bash
cd "$(dirname "$0")/.." || exit 1
git add training/results training/lanzar-commit-r7.command
git commit -q -m "docs(results): r7-engaño — con quien escucha, la red aprende a mentir a propósito (y el precio)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXKoq3mazV5T3w6vHDFY4F"
echo "commit hecho: $(git log -1 --oneline)"; echo "(podés cerrar esta ventana)"
