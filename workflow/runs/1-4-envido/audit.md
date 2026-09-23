# Auditoría: Motor v2 — envido

- ID: `1-4-envido` · Auditor: Claude (supervisor) · Fecha: 2026-09-23
- Dictamen: **APROBADA**

## Verificación independiente (checkout limpio de `dc3b116`, `npm ci`, Linux)

typecheck 0 · `eslint src/engine` 0 · **347/347 tests** · `src/engine/**` 99,08% líneas / 94,25% ramas · alcance: `src/engine/**` y `workflow/runs/1-4-*`.
IDs de auditoría con test: ENG-02, 04, 05, 11, 12, 13, 17 y UI-05.

## Revisión contra los AC

- AC1 `envidoScore` sobre `dealt` [ENG-05], figuras 0, tres del mismo palo → dos más altas. ✔
- AC2/AC10 ventana: 1ª baza, sin cadena, sin truco querido ni pendiente, sin flor [ENG-13]. ✔
- AC3 envido está primero solo con truco nivel 1 pendiente y el respondedor; `resumeTrucoAfter` vuelve a `AWAITING_TRUCO` con el mismo pendiente [UI-05]. ✔
- AC4 `nextEnvidoCalls`: E→E/R/F, E-E→R/F, R→F, F→nada; nunca baja [ENG-04]. Sin `PLAY_CARD` ni `CALL_TRUCO` en `AWAITING_ENVIDO` [ENG-02]. ✔
- AC5 tabla: revisé a mano las 11 filas querido/no querido contra `envidoPoints` (no querido = cadena sin el último canto; 1 con un solo canto). ✔
- AC6 falta [ENG-11]: pica-pica 7; en malas lo que le falta al ganador; en buenas lo que le falta al que va ganando. ✔
- AC7/AC8 no quiero al último que cantó; quiero: orden desde el mano, empate al que dice antes [ENG-12], `revealed` hasta el ganador inclusive. ✔
- AC9 puntos en el momento vía `addPoints`; si llega a 30 queda en `MATCH_OVER`. ✔
