#!/usr/bin/env bash
# Doble clic desde el Finder: commitea los cambios de la mesa (jugá tranquilo, el pie escucha) y deja encolada la
# tanda de la mentira detrás de la de escucha (training/mentira.sh).
cd "$(dirname "$0")/.." || exit 1
git add src training/README.md training/results/BITACORA.md training/mentira.sh training/lanzar-mentira.command
git commit -q -F - <<'MSG'
feat(mesa): el pie escucha a sus compañeros, «jugá tranquilo» = jugá chica, y «hacé como quieras»

- TRANQUILO pasa de "lo que quieras" a "jugá chica, guardá la grande" (regla para heurística y red,
  src/ai/followInstruction.ts); "hacé como quieras" es la intención nueva IND_LIBRE (el que preguntó decide).
- Los compañeros de la IA opinan en voz alta en los dos equipos (tanto, respuesta a un canto, truco) y el pie
  decide: sigue el consejo en el borde, con la mano clara manda él; el engaño del tanto no es consejo.
- El pie avisa "Dejá, esperemos" al esperar y subir; a "¿qué hago?" contesta "pasá, ya la tenemos" si el
  compañero ya ganó la baza. Respuestas nuevas al pie: "No tengo nada", "Hacé como quieras".
- Tests nuevos (followInstruction, consejos, consultas); 500 en verde, cobertura app 89% ramas.
- training/mentira.sh: duelos de la mentira contra la difícil que escucha, y reentreno del clasificador.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXKoq3mazV5T3w6vHDFY4F
MSG
echo "commit hecho: $(git log -1 --oneline)"
exec caffeinate -dimsu bash training/mentira.sh
