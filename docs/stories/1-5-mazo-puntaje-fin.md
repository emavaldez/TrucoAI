# Historia 1-5: Irse al mazo, puntaje, historial y fin de partida (motor v2)

Status: review
wf-id: `1-5-mazo-puntaje-fin` · kind: `default`
Depende de: 1-4

## Historia

Como jugador,
quiero poder irme al mazo, que el marcador y el historial sean exactos y que la partida termine en el momento justo,
para poder jugar una partida tras otra sin errores.

## Criterios de aceptación

1. **Legalidad de `MAZO`:** en `PLAYING` para el actor; en `AWAITING_TRUCO` para el respondedor. **No** es legal en `AWAITING_ENVIDO`
   ni `AWAITING_FLOR` **[ENG-09]**, ni en `HAND_OVER`/`MATCH_OVER`.
2. **Puntos del mazo** (siempre vía `endHand`, razón `'MAZO'`, evento `MAZO` antes de `POINTS`):
   - en `PLAYING`: el equipo rival suma `trucoPoints(state)` (nivel querido; 1 si no hubo truco);
   - en `AWAITING_TRUCO` (se va el respondedor): equivale a no quiero → el equipo que cantó suma `TRUCO_POINTS.rejected[pending.level]`.
   - Los puntos de envido ya resueltos en la mano **no** se tocan. No hay punto extra por irse en primera sin envido.
   - `CantoRecord` `{ kind: 'MAZO', by, team }`.
3. **Un solo camino:** `endHand` y `addPoints` son los únicos lugares que cierran manos y suman puntos (grep en test: ninguna otra asignación a `scores[`).
4. **Fin de partida en cualquier camino [ENG-01]:** por bazas, por truco no querido, por mazo y por envido: en cuanto un equipo llega a 30,
   `phase = 'MATCH_OVER'`, `winnerTeam`, marcador con tope 30, evento `MATCH_OVER` una sola vez, `getActor === null`, `getLegalActions === []`
   para todos, `applyAction` → `MATCH_OVER`, `startNextHand` → `throw`.
5. **Historial [ENG-15]:** cada mano cerrada agrega un `HandRecord` con `number` correcto (1, 2, 3, …), `dealerId`, `manoId`, `tricks`, `cantos`
   (con `answer`, `points` y `pointsTo` completos para truco y envido), `winnerTeam`, `points`, `reason`, `scoresAfter`.
   Si la partida termina **en medio** de una mano (por envido), igual se agrega el `HandRecord` de esa mano con `reason: 'MATCH_ENDED'`, `points: 0` y sus cantos [UI-16].
6. **Partida nueva limpia [ENG-01]:** test (`fullMatch.test.ts`) que, para **2, 4 y 6 jugadores** (6p con `picaPica: false` hasta la 1-7), juega una partida completa hasta `MATCH_OVER` con una política "primera acción legal"
   y otra con una política aleatoria con semilla; en cada paso `getActor` no es `null` fuera de `HAND_OVER`/`MATCH_OVER` y tiene acciones legales (sin trabas);
   después llama a `createMatch` de nuevo y juega otra completa; la segunda arranca con `scores [0,0]`, `history []`, `phase 'PLAYING'` y termina bien.
7. **Escenarios** (`scenarios/mazo-fin.test.ts`):
   - mazo sin truco → 1 al rival; con truco querido → 2; con retruco querido → 3; respondiendo a un truco → 1 al que cantó; respondiendo a un vale cuatro → 3;
   - con envido pendiente `MAZO` no está en las acciones legales y `applyAction` lo rechaza;
   - envido querido y resuelto + mazo después: se conservan los puntos del envido y se suman los del mazo;
   - fin de partida por cada camino (bazas, no quiero, mazo, envido) partiendo de `scores` cercanos a 30
     (permitir en tests armar el estado con un helper `withScores(state, [a,b])` que solo se use en `__tests__`).
8. Cobertura `src/engine/**` ≥ 90/85; typecheck, lint, test, build en verde.

## Tareas

- [x] Legalidad y aplicación de `MAZO` (AC 1, 2)
- [x] Revisión de `scoring.ts`: fin en todos los caminos, tope, evento único (AC 3, 4)
- [x] Historial completo (AC 5)
- [x] Test de dos partidas seguidas (AC 6)
- [x] Escenarios (AC 7)
- [x] Completar Dev Agent Record

### Alcance (wf `scope.allow`)
```json
["src/engine/*", "docs/stories/1-5-mazo-puntaje-fin.md"]
```

### Referencias
- GDD §8–9 · Auditoría ENG-01, ENG-09, ENG-10, ENG-15, UI-16

## Dev Agent Record

### Agent Model Used

Hermes (perfil `trucoai`), modelo `deepseek-v4-flash`, worker headless del run `wf` `1-5-mazo-puntaje-fin`
(worktree `/Users/emmanuelvaldez/GameDev/.worktrees/1-5-mazo-puntaje-fin`, rama `task/1-5-mazo-puntaje-fin`).

### Debug Log References

- `workflow/runs/1-5-mazo-puntaje-fin/implementation.md` — evidencia completa: resumen, archivos, cobertura por AC y
  salida literal de `wf verify -i 1-5-mazo-puntaje-fin` sobre el commit registrado.
- `workflow/runs/1-5-mazo-puntaje-fin/verify.json` — resultado de los 7 gates (alcance, tipos, lint, tests, build,
  arranque, partidas).
- `npm run test:coverage` → `coverage/coverage-summary.json` (cobertura por archivo; `mazo.ts` y `scoring.ts` al 100%).

### Completion Notes List

- El mazo quedó en un módulo propio, `src/engine/mazo.ts` (`canGoToMazo`, `mazoActions`, `applyMazo`): `legal.ts` y
  `apply.ts` solo delegan, así que la legalidad de AC 1 vive en un único lugar. `applyMazo` cierra la mano con
  `endHand` (razón `'MAZO'`) y deja el reparto de puntos a `scoring.ts` [ENG-20].
- `scoring.ts` es el único módulo que suma puntos y cierra manos (AC 3, verificado por grep en `scoring.test.ts`):
  `endHand` escribe `hand.result` **antes** de llamar a `addPoints`, y `addPoints` usa ese campo para saber si la mano
  ya cerró. Así el fin de partida en medio de la mano (envido a 30) agrega el `HandRecord` `MATCH_ENDED` con
  `points: 0` [UI-16] sin duplicar el record de una mano que ya cerró `endHand`.
- AC 4 (fin en los cuatro caminos: bazas, truco no querido, mazo y envido) está cubierto a nivel unidad
  (`scoring.test.ts`) y de punta a punta con `withScores` en `scenarios/mazo-fin.test.ts`; el tope 30, el evento
  `MATCH_OVER` único, `getActor === null`, `getLegalActions === []` y `startNextHand` que tira se verifican en
  `fullMatch.test.ts` para cada partida terminada.
- AC 5: `HandRecord` completo (`number`, `dealerId`, `manoId`, `picaPica`, `tricks`, `cantos`, `winnerTeam`, `points`,
  `reason`, `scoresAfter`) y los cantos del historial completan `points`/`pointsTo` en `scoring.completeCantos`
  usando las tablas de `truco.ts` y `envido.ts` (`LEVEL_OF_CANTO` es la inversa de `CANTO_KIND`).
- AC 1 [ENG-09]: con el envido pendiente (`AWAITING_ENVIDO`) el mazo **no** es legal para nadie; el respondedor de un
  truco sí puede irse al mazo (AC 2, equivale a no quiero → cobra el que cantó).
- AC 6: `fullMatch.test.ts` juega partidas completas de 2, 4 y 6 jugadores (6p con `picaPica: false` hasta la 1-7) con
  las dos políticas (primera acción legal y aleatoria con semilla), en cada paso exige actor y acciones legales, y
  después juega otra partida nueva (marcador 0-0, historial vacío, fase `PLAYING`). 6 casos × 3 partidas.
- Los tests de las historias anteriores que enumeraban acciones legales o cantos (`apply.test.ts`, `truco.test.ts`,
  `scenarios/truco.test.ts`, `scenarios/envido.test.ts`) se actualizaron porque el mazo ahora es una acción legal más
  y porque el historial lleva `points`/`pointsTo`. No cambia el comportamiento del truco ni del envido: son
  consecuencias directas de AC 1, AC 2 y AC 5.
- Sin desvíos de alcance: solo `src/engine/*`, `docs/stories/1-5-mazo-puntaje-fin.md` y `workflow/runs/1-5-...`.
  No se tocó código legacy, ni `audit.md`, ni los campos de aprobación del estado; no hubo merge ni push.

### File List

Nuevos:

- `src/engine/mazo.ts` (57) — AC 1 y 2.
- `src/engine/__tests__/mazo.test.ts` (266) — AC 1, 2 y 7 (unitarios) [ENG-09].
- `src/engine/__tests__/scenarios/mazo-fin.test.ts` (209) — AC 4, 5 y 7 (escenarios) [ENG-01] [UI-16].
- `src/engine/__tests__/fullMatch.test.ts` (133) — AC 4 y 6 [ENG-01].

Modificados:

- `src/engine/scoring.ts` (124) — AC 3, 4 y 5: único camino de puntaje/cierre, tope 30, `MATCH_OVER` único e historial.
- `src/engine/truco.ts` (176) — `LEVEL_OF_CANTO` y respuesta al canto pendiente (AC 5).
- `src/engine/envido.ts` (247) — `isEnvidoCanto` / payout de los cantos de envido del historial (AC 5).
- `src/engine/legal.ts` (81) y `src/engine/apply.ts` (82) — delegan el mazo a `mazo.ts` (AC 1 y 2).
- `src/engine/__tests__/helpers.ts`, `apply.test.ts`, `truco.test.ts`, `scenarios/truco.test.ts`,
  `scenarios/envido.test.ts` — ajustes por el mazo legal y por `points`/`pointsTo` en el historial.
- `docs/stories/1-5-mazo-puntaje-fin.md` — este Dev Agent Record y `Status: review`.

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
- 2026-09-23 · Claude (SM) · AC6: partida completa en 2, 4 y 6 jugadores (pedido de Emmanuel).
- 2026-09-23 · Hermes (worker, perfil `trucoai`) · Implementada; 7 gates de `wf verify` en verde; `Status: review`.
