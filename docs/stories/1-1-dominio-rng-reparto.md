# Historia 1-1: Dominio, RNG, reparto y rotación (motor v2)

Status: review
wf-id: `1-1-dominio-rng-reparto` · kind: `default`
Depende de: 0-1

## Historia

Como desarrollador del motor,
quiero los tipos, el RNG con semilla, el mazo, el reparto y el esqueleto de la API (`createMatch`, `getActor`, `getLegalActions`, `applyAction`),
para que el resto de las historias del motor v2 se construyan sobre una base pura y determinista.

## Criterios de aceptación

1. **Tipos:** `src/engine/types.ts` contiene **todos** los tipos de `docs/planning/architecture.md` §4 exactamente como están
   (Suit, CardNumber, Card, TeamId, PlayerId, Seat, RuleSet, Rng, Phase, TrucoLevel, TrucoState, EnvidoCall, EnvidoState, FlorState,
   TrickPlay, TrickResult, SubmanoResult, CantoRecord, HandRecord, HandState, MatchState, Action, GameEvent, Observation).
2. **RNG:** `src/engine/rng.ts` exporta `createRng(state: number): Rng & { getState(): number }` (mulberry32; `next()` en [0,1)),
   `nextInt(rng, n)` y `shuffle<T>(arr: readonly T[], rng): T[]` (Fisher–Yates, devuelve copia).
   El estado del RNG se guarda en `MatchState.rngState` después de cada uso.
3. **Cartas:** `src/engine/cards.ts` exporta `createDeck(): Card[]` (40 cartas, id `"${number}-${suit}"`, orden estable: palos
   espada, basto, oro, copa × números 1..7,10,11,12), `cardRank(card)` (tabla GDD §3, 0..13), `envidoValue(card)` (1–7 = número, figuras 0),
   `cardName(card)` en español ("1 de espada", "7 de oro", "12 de copa"; y alias `cardNickname`: "Ancho de espada", "Ancho de basto",
   "Siete de espada", "Siete de oro", el resto igual a `cardName`).
4. **createMatch** (`src/engine/match.ts`, re-exportado en `index.ts`):
   `createMatch({ rules, seed, names?, firstDealerSeat?, deck? }): MatchState`
   - asientos `p0..p{n-1}`, `seat = i`, `team = i % 2`, `isHuman = (i === 0)`;
   - nombres por defecto: 2p `['Vos','Rival']`; 4p `['Vos','Rival 1','Compañero','Rival 2']`;
     6p `['Vos','Rival 1','Compañero 1','Rival 2','Compañero 2','Rival 3']`;
   - repartidor: `firstDealerSeat` si viene; si no `nextInt(rng, n)`;
   - `rules` completa defaults: `targetScore: 30`, `flor: false`, `picaPica: playerCount === 6` (si no viene);
   - `scores: [0,0]`, `version: 0`, `history: []`, `winnerTeam: null`, `picaPicaNext: false`, `phase: 'PLAYING'`;
   - reparte la mano 1 (ver AC5).
5. **Reparto** (`startHand` interno en `match.ts`): mano = asiento siguiente al repartidor (`(dealerSeat+1) % n`).
   Mazo = `deck` si se pasó (se usa tal cual, sin mezclar) o `shuffle(createDeck(), rng)`.
   Se reparten 3 vueltas, una carta por jugador por vuelta, **empezando por el mano**: la carta `k` del mazo va al asiento `(manoSeat + k) % n`, para `k = 0..3n-1`.
   `hand.dealt` y `hand.hands` quedan con esas 3 cartas (copias independientes). `hand.number = 1` en la primera, +1 en cada siguiente.
   `currentTrick = { leaderId: manoId, plays: [] }`, `turnId = manoId`, `participants` = todos los asientos en orden de juego desde el mano,
   `tricks = []`, `truco = { level: 0, pending: null, quieroTeam: null }`, `envido = { chain: [], pending: null, status: 'none', resumeTrucoAfter: false, result: null }`,
   `flor = { declared: [], pending: null, status: 'none', result: null, resumePhase: null }`, `picaPica: null`, `cantos: []`, `result: null`.
6. **Rotación [ENG-06]:** `startNextHand(state, opts?: { deck?: Card[] })` (exportada; `deck` fija el mazo de esa mano, para tests) solo acepta `phase === 'HAND_OVER'` (si no, `throw new Error('NOT_HAND_OVER')`),
   rota el repartidor al asiento siguiente, reparte con el RNG y deja `phase = 'PLAYING'`. Devuelve `{ state, events: [HAND_STARTED] }`.
   Test: con 4 jugadores y `firstDealerSeat: 0`, forzando `HAND_OVER` a mano en 8 manos seguidas, la secuencia de manos es p1,p2,p3,p0,p1,p2,p3,p0.
7. **API esqueleto** (`legal.ts`, `apply.ts`):
   - `getActor(state)`: en `PLAYING` devuelve `hand.turnId`; en `HAND_OVER`/`MATCH_OVER` devuelve `null`. (Las fases `AWAITING_*` se completan en 1-3/1-4/1-8; en esta historia devuelven `null` y se documenta con TODO.)
   - `getLegalActions(state, playerId)`: si `playerId !== getActor(state)` → `[]`. En `PLAYING` → un `PLAY_CARD` por cada carta en `hands[playerId]`.
   - `applyAction(state, playerId, action)`: **no muta** `state` (clona con `structuredClone`); si `playerId` no es el actor → `{ ok:false, error:'NOT_YOUR_TURN' }`;
     si la acción no está en `getLegalActions` (comparación por `type` y campos) → `{ ok:false, error:'ILLEGAL_ACTION' }` **[ENG-10]**;
     si la fase es `MATCH_OVER` → `{ ok:false, error:'MATCH_OVER' }`. En éxito: `version + 1`.
   - `PLAY_CARD`: saca la carta de `hands`, la agrega a `currentTrick.plays`, emite `CARD_PLAYED`, y pasa el turno al siguiente de `participants`
     en orden circular. Cuando todos los participantes jugaron en la baza actual, llama a `completeTrick(state, events)` de `src/engine/tricks.ts`,
     que en **esta** historia es un stub que hace `throw new Error('NOT_IMPLEMENTED: historia 1-2')`. Los tests de esta historia no completan bazas.
8. `src/engine/index.ts` re-exporta: tipos, `createMatch`, `startNextHand`, `getActor`, `getLegalActions`, `applyAction`, `createDeck`, `cardRank`,
   `envidoValue`, `cardName`, `cardNickname`, `createRng`. Nada más.
9. **Determinismo y pureza:** mismo `seed` ⇒ mismo repartidor y mismas manos; `JSON.parse(JSON.stringify(state))` es `toEqual` a `state`;
   test que falla si algún archivo en `src/engine/` (excluyendo `__tests__`) contiene `Math.random`, `Date.now`, `setTimeout`, `document` o `window` **[AI-11]**.
10. Cobertura de `src/engine/**` ≥ 90% líneas / 85% ramas (el umbral de 0-1 queda activo). `npm run typecheck`, `lint`, `test`, `build` en verde.

## Tareas

- [x] `types.ts` (AC 1)
- [x] `rng.ts` + tests (distribución básica, determinismo, `shuffle` no muta y es permutación) (AC 2)
- [x] `cards.ts` + tests: 40 cartas únicas sin 8/9; tabla completa de `cardRank` (las 40 cartas contra la tabla del GDD); `envidoValue`; nombres (AC 3)
- [x] `match.ts`: `createMatch`, `startHand`, `startNextHand` + tests (AC 4, 5, 6)
- [x] `legal.ts`, `apply.ts`, `tricks.ts` (stub) + tests: actor, legalidad, errores, turno circular, no mutación (AC 7)
- [x] `index.ts` (AC 8)
- [x] Test de pureza/determinismo (AC 9)
- [x] Completar Dev Agent Record

## Dev Notes

- Leé `docs/project-context.md` y `docs/planning/architecture.md` §2–5 antes de empezar.
- El motor viejo (`src/core/`) **no se importa**. Podés mirarlo como referencia de nombres, pero no copies su lógica de turnos (tiene ENG-06/07).
- Ejemplo de reparto con `deck` fijo (2 jugadores, `firstDealerSeat: 0` ⇒ mano = p1): `deck[0]→p1, deck[1]→p0, deck[2]→p1, deck[3]→p0, deck[4]→p1, deck[5]→p0`.
  Agregá este caso literal como test.
- Comparación de acciones para legalidad: igualdad estructural (`type` + campos). Escribí un helper `sameAction(a, b)` en `legal.ts`.
- Tests en `src/engine/__tests__/` (`rng.test.ts`, `cards.test.ts`, `match.test.ts`, `apply.test.ts`, `purity.test.ts`).
- Helper de tests recomendado (`src/engine/__tests__/helpers.ts`): `card('1-espada')`, `deckFor(handsByPlayer, manoSeat, n)` que arma un `deck` para que cada jugador reciba exactamente las cartas pedidas (lo van a usar todas las historias siguientes: hacelo bien y testealo).

### Alcance (wf `scope.allow`)
```json
["src/engine/*", "docs/stories/1-1-dominio-rng-reparto.md"]
```

### Referencias
- GDD §2, §3 · Arquitectura §2–5 · Test strategy §1–3 · Auditoría ENG-06, ENG-10, AI-11

## Dev Agent Record

### Agent Model Used

Hermes Agent (perfil `trucoai`, worker headless) · modelo `deepseek-v4-flash` · worktree `../.worktrees/1-1-dominio-rng-reparto`, rama `task/1-1-dominio-rng-reparto`.

### Debug Log References

- `npm ci` en el worktree: 58 paquetes (el worktree no traía `node_modules`; `vitest` solo estaba ausente, la suite no corría).
- Gate de pureza [AI-11] falló en la primera corrida con `rng.ts: Math.random`: el propio comentario del archivo contenía el literal prohibido. Se reescribió el comentario ("aleatoriedad global"). El escáner es literal (grep), así que ningún archivo de `src/engine` puede nombrar esos identificadores ni en comentarios.
- `helpers.test.ts` esperaba que las cartas del mano cayeran en `deck[0..2]`; con `manoSeat = 0` y 4 jugadores caen en `k = 0, 4, 8`. Se corrigió la expectativa del test (el helper estaba bien).
- `npx vitest run --coverage` requiere `@vitest/coverage-v8`, que todavía no está en `package.json` (lo agrega 0-1). Se instaló con `npm install --no-save` para medir, y se restauró `node_modules/.package-lock.json` (archivo trackeado) para no ensuciar el diff.

### Completion Notes List

- AC 1: `types.ts` transcribe los 24 tipos de `architecture.md` §4 sin cambios de nombres ni semántica.
- AC 2–3: `rng.ts` (mulberry32 + `nextInt` + `shuffle` Fisher–Yates sobre copia) y `cards.ts` (40 cartas en orden estable, tabla de rango del GDD §3 completa, `envidoValue`, `cardName`/`cardNickname`).
- AC 4–6: `createMatch` (asientos `p0..p{n-1}`, `team = i % 2`, `isHuman` solo p0, nombres por defecto por modo, repartidor por `firstDealerSeat` o `nextInt`, ruleset completo con defaults, reparto de la mano 1) y `startNextHand` (solo `HAND_OVER`, rota el repartidor, reparte con el RNG persistido en `rngState`, `phase = 'PLAYING'`, evento `HAND_STARTED`).
- AC 7: `getActor`/`getLegalActions` en `legal.ts` (con `sameAction` para comparación estructural); `applyAction` en `apply.ts` con `structuredClone`, `NOT_YOUR_TURN`, `ILLEGAL_ACTION`, `MATCH_OVER` y `version + 1`; `completeTrick` de `tricks.ts` es el stub que tira `NOT_IMPLEMENTED: historia 1-2`.
- AC 8: `index.ts` re-exporta exactamente tipos, `createMatch`, `startNextHand`, `getActor`, `getLegalActions`, `applyAction`, `createDeck`, `cardRank`, `envidoValue`, `cardName`, `cardNickname`, `createRng`.
- AC 9: test de pureza (escáner literal de `Math.random`, `Date.now`, `setTimeout`, `document`, `window` sobre los 8 módulos, salteando `__tests__`), test de no-import del legacy, `JSON.parse(JSON.stringify(state))` `toEqual` `state`, `structuredClone` y determinismo por semilla.
- AC 10: 65 tests nuevos (187 en total, 122 del legacy intactos), `tsc --noEmit` y `npm run build` verdes; cobertura medida de `src/engine`: 100% líneas / 95.45% ramas / 100% funciones (umbral 90/85).
- Regresiones con ID: `[ENG-06]` (rotación del repartidor/mano), `[ENG-10]` (4 tests de rechazo: turno, carta ajena, cantos/mazo, `MATCH_OVER`), `[ENG-19]` (fases explícitas: `AWAITING_*` no tienen actor), `[AI-11]` (pureza/determinismo).
- **Desvío de alcance documentado:** `npm run lint` y `npm run test:coverage` (AC 10) todavía **no existen**: son de la historia 0-1, que no está mergeada. Agregarlos implica tocar `package.json`/`eslint.config.js`/`vitest.config.ts`, fuera del `scope.allow` de esta tarea, así que no se agregaron. Los umbrales de cobertura de `src/engine` se verificaron igual, con el mismo 90/85, y salen en verde. El gate `lint` de `wf` está explícitamente diferido por `workflow/config.json` hasta el merge de 0-1.
- No se modificó nada de `src/core/`, `src/App.ts`, `src/ui/` ni `src/ai/` (legacy).

### File List

Nuevos (15, todos dentro de `src/engine/`):

- `src/engine/types.ts` (AC 1)
- `src/engine/rng.ts` (AC 2)
- `src/engine/cards.ts` (AC 3)
- `src/engine/match.ts` (AC 4, 5, 6)
- `src/engine/legal.ts` (AC 7)
- `src/engine/apply.ts` (AC 7)
- `src/engine/tricks.ts` (AC 7, stub de 1-2)
- `src/engine/index.ts` (AC 8)
- `src/engine/__tests__/helpers.ts` (`card`, `ids`, `seatOf`, `deckFor` para las historias siguientes)
- `src/engine/__tests__/helpers.test.ts` (6 tests)
- `src/engine/__tests__/rng.test.ts` (10 tests)
- `src/engine/__tests__/cards.test.ts` (8 tests)
- `src/engine/__tests__/match.test.ts` (19 tests)
- `src/engine/__tests__/apply.test.ts` (16 tests)
- `src/engine/__tests__/purity.test.ts` (6 tests)

Modificados: `docs/stories/1-1-dominio-rng-reparto.md` (este registro y `Status: review`).

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
- 2026-09-23 · Hermes (worker `trucoai`) · Implementación del motor v2 (dominio, RNG, reparto, rotación y API) + 65 tests. `Status: review`.
- 2026-09-23 · Hermes (operador) · Ciclo 1: rebase sobre main (0-1), convención _ en no-unused-vars.
