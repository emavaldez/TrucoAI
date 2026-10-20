#!/usr/bin/env bash
# Doble clic: commitea el código y las configuraciones de r8 y lanza training/dos-audiencias.sh.
cd "$(dirname "$0")/.." || exit 1
git add training/actors/rollout.ts training/learner/run.py training/config/r8-*.json training/dos-audiencias.sh \
  training/lanzar-dos-audiencias.command training/results/BITACORA.md training/results/programa-habla.md
git commit -q -F - <<'MSG'
feat(training): r8 "dos audiencias" — sin señas, ¿cuándo informa lo que se dice?

- talk.signs / talk.opening / talk.audience (public, team o probabilidad de que oigan los rivales).
- Banderas deafteam, deafrivals, nosigns; talkAblation como lista; info_*_bits (información mutua) y
  canta_si_compa_*; duel --no-signs --opening --audience.
- Configs r8-A..D y training/dos-audiencias.sh; programa en results/programa-habla.md.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VXKoq3mazV5T3w6vHDFY4F
MSG
echo "commit hecho: $(git log -1 --oneline)"
exec caffeinate -dimsu bash training/dos-audiencias.sh
