# Auditoría: Motor v2 — truco, retruco y vale cuatro

- ID: `1-3-truco` · Auditor: Claude (supervisor) · Fecha: 2026-09-23
- Dictamen: **APROBADA**

## Verificación independiente (checkout limpio de `33614f2`, `npm ci`, Linux)

typecheck 0 · `eslint src/engine` 0 · **276/276 tests** · `src/engine/**` 98,75% líneas / 94,53% ramas · alcance: solo `src/engine/**` y `workflow/runs/1-3-*`.

## Revisión contra los AC

- AC1 `canCallTruco`: actor en `PLAYING`, sin pendiente, nivel < 3, y nivel 0 o equipo con el quiero. ✔
- AC2 `responderFor` en `turns.ts` (neutral, reutilizable por envido/flor): humano rival si participa, si no el primer rival después del que cantó, circular; respeta `participants` (pica-pica). ✔
- AC3 `AWAITING_TRUCO`: actor = respondedor; QUIERO / NO_QUIERO / CALL_TRUCO (si nivel < 3); nunca `PLAY_CARD` [ENG-02]. ✔
- AC4 quiero: nivel, `quieroTeam` del respondedor, vuelve a `PLAYING` sin cambiar `turnId`. ✔
- AC5 "quiero retruco": acepta el pendiente, `quieroTeam` = el que sube, nuevo pendiente al rival. ✔
- AC6 no quiero: `endHand` en el acto con `TRUCO_POINTS.rejected[nivel]` [ENG-03]; si llega a 30 termina la partida. ✔
- AC7 tabla única `TRUCO_POINTS` [ENG-20]; AC8 coherencia fase ⇔ pendiente en 50 manos random [ENG-18]; AC9 nadie sube su propio canto; AC10 escenarios 2p y 4p. ✔

## Observación (no bloqueante)

`canCallTruco` exige ser el actor en `PLAYING`; la 1-4 ("envido está primero") debe reutilizarla sin romper ese contrato.
