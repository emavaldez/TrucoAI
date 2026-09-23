# Historia 1-3: Truco, retruco y vale cuatro (motor v2)

Status: ready-for-dev
wf-id: `1-3-truco` · kind: `default`
Depende de: 1-2

## Historia

Como jugador,
quiero cantar y responder truco, retruco y vale cuatro con las reglas reales,
para que el canto más importante del juego funcione sin trampas ni manos que se pagan dos veces.

## Criterios de aceptación

1. **Cantar (`CALL_TRUCO` en `PLAYING`)** es legal para el actor si: `truco.pending === null`, `truco.level < 3`, y
   (`truco.level === 0`) **o** (el equipo del actor es `truco.quieroTeam`). Lleva a:
   `truco.pending = { level: level+1, callerId, callerTeam, responderId }`, `phase = 'AWAITING_TRUCO'`, evento `TRUCO_CALLED`,
   y un `CantoRecord` (`TRUCO` / `RETRUCO` / `VALE4`) en `hand.cantos`.
2. **Quién responde** (`responderFor(state, callerId)`, reutilizable por envido y flor): entre los `participants` del **equipo contrario** al que cantó:
   si está el humano (`isHuman`) → el humano; si no, el primero de ese equipo **después** del que cantó en el orden de `participants` (circular).
3. **En `AWAITING_TRUCO`** el único actor es `pending.responderId` (`getActor`). Acciones legales del respondedor:
   `ANSWER_TRUCO QUIERO`, `ANSWER_TRUCO NO_QUIERO`, y `CALL_TRUCO` (subir) si `pending.level < 3`.
   (`MAZO` se agrega en 1-5; `CALL_ENVIDO` "envido está primero" en 1-4.) **`PLAY_CARD` nunca es legal en `AWAITING_TRUCO` [ENG-02].**
4. **Quiero:** `truco.level = pending.level`, `truco.quieroTeam = equipo del respondedor`, `pending = null`, `phase = 'PLAYING'`, evento `TRUCO_ANSWERED`;
   el turno vuelve a `hand.turnId` (no cambia quién tiene que jugar carta). El `CantoRecord` del canto se completa con `answer: 'QUIERO'`.
5. **Subir como respuesta ("quiero retruco"):** acepta el nivel pendiente (`truco.level = pending.level`) y crea un nuevo `pending` de `level+1`
   con `callerId = respondedor`, `callerTeam = su equipo` y `responderId = responderFor(state, respondedor)`. Emite `TRUCO_ANSWERED QUIERO` + `TRUCO_CALLED`.
   Sigue en `AWAITING_TRUCO`.
6. **No quiero:** termina la mano **en el acto** [ENG-03] llamando a `endHand(state, events, { winnerTeam: pending.callerTeam, points: TRUCO_POINTS.rejected[pending.level], reason: 'NO_QUIERO' })`.
   No se juegan más cartas. Evento `TRUCO_ANSWERED NO_QUIERO` antes de `POINTS`/`HAND_OVER`.
7. **Tabla única [ENG-20]** en `truco.ts`:
   `TRUCO_POINTS = { accepted: [1, 2, 3, 4], rejected: [0, 1, 2, 3] }` (índice = nivel). `trucoPoints(state)` = `accepted[truco.level]`.
   `endHand` por bazas paga `trucoPoints(state)` al ganador.
8. **Coherencia [ENG-18]:** en todo momento `phase === 'AWAITING_TRUCO'` ⇔ `truco.pending !== null`. Test que lo verifica tras cada acción en 50 manos random.
9. **Nadie puede subir su propio canto:** el equipo que hizo el último canto aceptado no tiene el quiero (test: después de "truco / quiero", el que cantó truco **no** tiene `CALL_TRUCO` en su próximo turno; el que quiso sí lo tiene en el suyo).
10. **Escenarios** (`scenarios/truco.test.ts`, 2 y 4 jugadores, mazo fijo):
    - truco querido y mano ganada → 2 puntos; retruco querido → 3; vale cuatro querido → 4;
    - truco no querido → 1 al que cantó y la mano termina (no se aceptan más `PLAY_CARD`: `getActor` es `null`);
    - retruco no querido → 2; vale cuatro no querido → 3;
    - "quiero retruco" como respuesta y después "quiero vale cuatro";
    - en 4 jugadores, un truco cantado por p1 lo responde p0 (humano); uno cantado por p0 lo responde p1; uno cantado por p2 lo responde p3;
    - con truco pendiente, `applyAction(PLAY_CARD)` del jugador de turno devuelve `NOT_YOUR_TURN` o `ILLEGAL_ACTION` [ENG-02];
    - truco en la 3ª baza y en la 2ª.
11. Cobertura `src/engine/**` ≥ 90/85; typecheck, lint, test, build en verde.

## Tareas

- [ ] `responderFor` (AC 2)
- [ ] Legalidad y `getActor` para `AWAITING_TRUCO` (AC 1, 3)
- [ ] Aplicar `CALL_TRUCO` / `ANSWER_TRUCO` (AC 1, 4, 5, 6)
- [ ] Tabla única + `trucoPoints` (AC 7)
- [ ] Tests de coherencia, derecho a subir y escenarios (AC 8, 9, 10)
- [ ] Completar Dev Agent Record

## Dev Notes

- Toda la lógica de truco en `truco.ts`; `legal.ts` y `apply.ts` solo delegan.
- No sumes puntos fuera de `addPoints` ni cierres la mano fuera de `endHand` (ver 1-2).
- `responderFor` va a ser usada por envido (1-4) y flor (1-8): exportala desde un lugar neutral (`turns.ts` o `legal.ts`).

### Alcance (wf `scope.allow`)
```json
["src/engine/*", "docs/stories/1-3-truco.md"]
```

### Referencias
- GDD §5 · Arquitectura §4 (`TrucoState`) · Auditoría ENG-02, ENG-03, ENG-18, ENG-20

## Dev Agent Record

### Agent Model Used
### Debug Log References
### Completion Notes List
### File List

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
