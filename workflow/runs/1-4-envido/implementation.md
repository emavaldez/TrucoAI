# Implementación: Motor v2: envido

- ID: `1-4-envido`
- Worker: Hermes (perfil `trucoai`), modelo `deepseek-v4-flash`
- Rama: `task/1-4-envido` · Worktree: `/Users/emmanuelvaldez/GameDev/.worktrees/1-4-envido`
- Estado: implementada, verificada en verde y lista para auditoría

## Resumen

Se implementó el envido completo en el motor puro (`src/engine/`), siguiendo la historia `docs/stories/1-4-envido.md`
y el GDD §6: puntaje de envido, ventana de canto, "el envido está primero" [UI-05], cadena y subidas [ENG-04],
tabla de puntos, falta envido [ENG-11], desempate desde el mano [ENG-12] y la resolución querido/no querido con los
tantos cobrados en el momento.

Módulos nuevos:

- `src/engine/envidoScore.ts`: puntaje de envido de un jugador (GDD §6.1) calculado siempre sobre `hand.dealt[playerId]`
  [ENG-05], nunca sobre las cartas que le quedan en la mano.
- `src/engine/envido.ts`: todo el resto del envido (ventana, "el envido está primero", cadena, subidas, tabla de puntos,
  falta, legalidad del respondedor y resolución), siguiendo el patrón de `truco.ts`.

`legal.ts` y `apply.ts` solo delegan: son la única fuente de legalidad y el único punto de entrada para actuar.
Nadie fuera de `scoring.ts` suma puntos [ENG-20], y el envido suma los suyos en el momento con `addPoints`
(razón `ENVIDO`), nunca al cerrar la mano.

## Archivos modificados

- `src/engine/envidoScore.ts` (nuevo) — AC 1. Puntaje 0..33 de las 3 cartas repartidas.
- `src/engine/envido.ts` (nuevo) — AC 2 a AC 10. `canCallEnvido`, `envidoFirstCalls`, `envidoResponseActions`,
  `nextEnvidoCalls`, `openingEnvidoCalls`, `envidoPoints`, `faltaValue`, `applyCallEnvido`, `applyAnswerEnvido`.
- `src/engine/legal.ts` — `getActor` devuelve el respondedor en `AWAITING_ENVIDO`; `getLegalActions` agrega los cantos de
  envido en `PLAYING` (E, R, F) y en `AWAITING_TRUCO` cuando corre "el envido está primero".
- `src/engine/apply.ts` — despacho de `CALL_ENVIDO` / `ANSWER_ENVIDO` (antes caían en el `default` como inalcanzables).
- `src/engine/index.ts` — export de `envidoScore`.
- `src/engine/__tests__/envidoScore.test.ts` (nuevo) — AC 1: casos de la historia + barrido completo de manos (0..33) + no mutación.
- `src/engine/__tests__/envido.test.ts` (nuevo) — AC 2 a AC 10 unitarios, con los IDs de auditoría en los títulos.
- `src/engine/__tests__/scenarios/envido.test.ts` (nuevo) — AC 11: escenarios con mazo fijo en 2 y 4 jugadores.
- `src/engine/__tests__/helpers.ts` — helpers `callEnvido` / `answerEnvido` (mismo patrón que `callTruco` / `answerTruco`).
- `src/engine/__tests__/apply.test.ts`, `src/engine/__tests__/truco.test.ts`, `src/engine/__tests__/scenarios/truco.test.ts`
  — ajustes necesarios porque el respondedor de un truco ahora ve también los cantos de envido (ver "Desviaciones").
- `docs/stories/1-4-envido.md` — Dev Agent Record completo y `Status: review`.

## Verificación ejecutada

```text
$ npx tsc --noEmit
(sin salida: 0 errores)

$ npm test
 Test Files  22 passed (22)
      Tests  347 passed (347)

$ npm run test:coverage
Statements   : 97.31% ( 399/410 )
Branches     : 94.25% ( 197/209 )
Functions    : 100% ( 86/86 )
Lines        : 99.08% ( 324/327 )
(umbral de src/engine/**: líneas 90, branches 85)

$ npm run lint
✖ 82 problems (0 errors, 82 warnings)   ← warnings preexistentes de src/core y src/ui (legacy)

$ npm run build
✓ built in 117ms

$ wf verify -i 1-4-envido
OK    alcance         0.0s  @alcance
OK    tipos           0.8s  npx --no-install tsc --noEmit
OK    lint            0.8s  npm run lint --silent
OK    tests           2.1s  npm test --silent
OK    build           0.9s  npm run build --silent
OK    arranque        0.7s  @arranque

VERIFICACIÓN EN VERDE
```

## Cobertura de los criterios de aceptación

- **AC 1** — `envidoScore` con los 6 casos de la historia y el caso [ENG-05] (el 7 ya jugado sigue contando, porque el
  puntaje sale de `hand.dealt`). El barrido de las 9.880 manos posibles queda entre 0 y 33.
- **AC 2 y AC 10** — ventana: primera baza, `envido.status === 'none'`, `truco.level === 0`, sin truco pendiente, sin flor
  declarada; se cierra al completarse la primera baza [ENG-13].
- **AC 3** — "el envido está primero" [UI-05]: el respondedor de un truco nivel 1 en la primera baza ve E/R/F; al cantarlos
  se anota `resumeTrucoAfter` y al resolver vuelve a `AWAITING_TRUCO` con el mismo `truco.pending` y el mismo respondedor.
- **AC 4** — cadena, `pending`, fase, evento `ENVIDO_CALLED` y `CantoRecord`; subidas `[E]→E,R,F`, `[E,E]→R,F`,
  último `R`→F, último F→nada, nunca se baja [ENG-04]; en `AWAITING_ENVIDO` no hay `PLAY_CARD` ni `CALL_TRUCO` [ENG-02].
- **AC 5** — tabla del GDD §6.3 completa como test parametrizado (11 filas), unitario y de punta a punta [ENG-04].
- **AC 6** — `faltaValue`: 7 en pica-pica; 20-10 → 10; 10-20 → 10; 14-3 → 16 / 27; 29-29 → 1; 0-0 → 30 [ENG-11].
- **AC 7** — no querido: puntos al equipo del último que cantó, `revealed: []`, eventos `ENVIDO_ANSWERED` +
  `ENVIDO_RESOLVED` + `POINTS` [ENG-04].
- **AC 8** — querido: `participants` desde el mano, gana el mayor con empate para el primero [ENG-12] y `revealed` corta en
  el ganador [ENG-17]; un test verifica que un jugador ya no puntúa por su asiento.
- **AC 9** — `addPoints` en el momento; si la partida termina, `MATCH_OVER` sin jugar ninguna carta más. Si el envido
  cierra la partida con un truco pendiente, la fase queda en `MATCH_OVER` y el truco queda sin responder (nada más es legal).
- **AC 11** — `scenarios/envido.test.ts`: 22 tests (11 filas × querido/no querido), empate de 4 jugadores [ENG-12],
  "el envido está primero" de punta a punta [UI-05], cierre de ventana [ENG-13] y partida terminada por envido.
- **AC 12** — cobertura, tipos, lint, tests, build y arranque en verde (ver arriba).

## Riesgos o desviaciones del alcance

- **Sin desviaciones de alcance**: solo se tocó `src/engine/*`, `docs/stories/1-4-envido.md` y este `implementation.md`.
  No se tocó código legacy, ni `audit.md`, ni los campos de aprobación del estado.
- **Tres tests de la 1-3 (`apply.test.ts`, `truco.test.ts`, `scenarios/truco.test.ts`) hubo que ajustarlos** porque el
  respondedor de un truco ahora tiene también los cantos de envido entre sus acciones legales. Es consecuencia directa de
  AC 3 y AC 11, no un cambio de comportamiento del truco: los puntos, los niveles y las transiciones del truco no se tocaron.
- **Invariante [ENG-18] con dos excepciones documentadas**: `AWAITING_TRUCO ⇔ truco.pending !== null` deja de valer
  (a) en `AWAITING_ENVIDO` mientras corre "el envido está primero" (AC 3), y (b) en `MATCH_OVER` cuando el envido terminó
  la partida con el truco sin responder (AC 9). Queda anotado en el test de coherencia de `truco.test.ts`.
- **`faltaValue` usa `state.rules.targetScore`** (30 en las reglas actuales) en vez de la constante literal, para no
  duplicar el objetivo de la partida [ENG-20].
- **Riesgo abierto para la auditoría**: la flor declarada se chequea como `hand.flor.declared.length === 0` (la flor es la
  1-8); hoy el array no se llena porque la historia no está implementada, así que la condición no tiene test de punta a
  punta más allá del test unitario que la fuerza a mano.
- Sin dudas de reglamento pendientes: no hubo que detenerse por ambigüedades del GDD.
