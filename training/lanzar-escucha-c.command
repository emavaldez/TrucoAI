#!/usr/bin/env bash
# Doble clic: corre solo la fase C de escucha.sh (se cayó por `declare -A` en bash 3.2) y, si la tanda de la mentira
# no quedó esperando, la lanza.
cd "$(dirname "$0")/.." || exit 1
SOLO_C=1 caffeinate -dimsu bash training/escucha.sh
if ! pgrep -f "training/mentira.sh" >/dev/null; then
  echo "mentira.sh no estaba esperando: la lanzo"
  exec caffeinate -dimsu bash training/mentira.sh
fi
echo "mentira.sh ya estaba esperando y ahora sigue sola"
