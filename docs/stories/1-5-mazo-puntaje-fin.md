# Historia 1-5: Irse al mazo, puntaje, historial y fin de partida (motor v2)

Status: ready-for-dev
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
6. **Partida nueva limpia [ENG-01]:** test que juega una partida completa hasta `MATCH_OVER` con una política "primera acción legal",
   después llama a `createMatch` de nuevo y juega otra completa; la segunda arranca con `scores [0,0]`, `history []`, `phase 'PLAYING'` y termina bien.
7. **Escenarios** (`scenarios/mazo-fin.test.ts`):
   - mazo sin truco → 1 al rival; con truco querido → 2; con retruco querido → 3; respondiendo a un truco → 1 al que cantó; respondiendo a un vale cuatro → 3;
   - con envido pendiente `MAZO` no está en las acciones legales y `applyAction` lo rechaza;
   - envido querido y resuelto + mazo después: se conservan los puntos del envido y se suman los del mazo;
   - fin de partida por cada camino (bazas, no quiero, mazo, envido) partiendo de `scores` cercanos a 30
     (permitir en tests armar el estado con un helper `withScores(state, [a,b])` que solo se use en `__tests__`).
8. Cobertura `src/engine/**` ≥ 90/85; typecheck, lint, test, build en verde.

## Tareas

- [ ] Legalidad y aplicación de `MAZO` (AC 1, 2)
- [ ] Revisión de `scoring.ts`: fin en todos los caminos, tope, evento único (AC 3, 4)
- [ ] Historial completo (AC 5)
- [ ] Test de dos partidas seguidas (AC 6)
- [ ] Escenarios (AC 7)
- [ ] Completar Dev Agent Record

### Alcance (wf `scope.allow`)
```json
["src/engine/*", "docs/stories/1-5-mazo-puntaje-fin.md"]
```

### Referencias
- GDD §8–9 · Auditoría ENG-01, ENG-09, ENG-10, ENG-15, UI-16

## Dev Agent Record

### Agent Model Used
### Debug Log References
### Completion Notes List
### File List

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
