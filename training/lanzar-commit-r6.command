#!/usr/bin/env bash
# Doble clic: commitea los resultados de r6 y de la mentira, el clasificador v3 y los registros.
cd "$(dirname "$0")/.." || exit 1
git add training/escucha.sh training/mentira.sh training/lanzar-escucha-c.command training/lanzar-commit-r6.command \
  training/results public/models/intent-head.json
git commit -q -F - <<'MSG'
docs(results): r6 "escucha" (escuchar paga si el emisor informa), la mentira contra la difícil, clasificador v3

- results/r6-escucha.md: entrenada contra la verdad 58,5% / 54,5% (4 / 6) oyendo y 50,5% / 46,2% sorda; contra
  la mentira sistemática 55,6% en 4; contra la moneda nada. La charla de r4/r5 no servía por el emisor, no por
  el canal. Mentir no rinde contra la difícil ni r3: nadie escucha todavía.
- Fase C de escucha.sh corregida (declare -A no existe en bash 3.2; SOLO_C=1 para repetirla).
- Clasificador de frases v3 con la intención «hacé como quieras» (public/models/intent-head.json).
- Registros de r6-escucha-{verdad,mentira,moneda} y duelos.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXKoq3mazV5T3w6vHDFY4F
MSG
echo "commit hecho: $(git log -1 --oneline)"
echo "(podés cerrar esta ventana)"
