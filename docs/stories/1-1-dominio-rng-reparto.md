# Historia 1-1: Dominio, RNG, reparto y rotación (motor v2)

Status: ready-for-dev
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

- [ ] `types.ts` (AC 1)
- [ ] `rng.ts` + tests (distribución básica, determinismo, `shuffle` no muta y es permutación) (AC 2)
- [ ] `cards.ts` + tests: 40 cartas únicas sin 8/9; tabla completa de `cardRank` (las 40 cartas contra la tabla del GDD); `envidoValue`; nombres (AC 3)
- [ ] `match.ts`: `createMatch`, `startHand`, `startNextHand` + tests (AC 4, 5, 6)
- [ ] `legal.ts`, `apply.ts`, `tricks.ts` (stub) + tests: actor, legalidad, errores, turno circular, no mutación (AC 7)
- [ ] `index.ts` (AC 8)
- [ ] Test de pureza/determinismo (AC 9)
- [ ] Completar Dev Agent Record

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
### Debug Log References
### Completion Notes List
### File List

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
