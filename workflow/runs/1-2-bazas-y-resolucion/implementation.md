# Implementación: Motor v2: bazas y resolución de la mano

- ID: `1-2-bazas-y-resolucion` · Rama: `task/1-2-bazas-y-resolucion`
- Worktree: `/Users/emmanuelvaldez/GameDev/.worktrees/1-2-bazas-y-resolucion`
- Worker: Hermes headless (perfil `trucoai`, modelo `deepseek-v4-flash`)
- Estado: **implementado** — `wf verify -i 1-2-bazas-y-resolucion` en **verde (6/6 gates)** sobre el
  commit final. Pendiente de auditoría.

## Resumen

Se implementó la resolución completa de bazas y de la mano del motor v2, sin tocar nada fuera de
`src/engine/*`:

- `tricks.ts`: `resolveTrick` (ganador por `cardRank` o parda), `resolveHandWinner` (tabla de 3 bazas del
  GDD §4.2), `nextLeader` ([ENG-07]) y `completeTrick` real (reemplaza el stub de 1-1).
- `scoring.ts` (nuevo): `addPoints` (suma, `POINTS`, tope de 30 y fin de partida) y `endHand`
  (`hand.result`, `HandRecord` en `history`, `HAND_OVER`): **único camino** de puntaje y cierre de mano.
- `truco.ts` (nuevo): `trucoPoints(state)` con la tabla de niveles (sin canto 1, truco 2, retruco 3,
  vale cuatro 4); el resto de truco queda para 1-3.
- El motor quedó limpio de stubs: ya no existe ningún `NOT_IMPLEMENTED: historia 1-2` en `src/engine/`.

Nada de DOM, timers, `Math.random` ni mutación del estado recibido: `apply.ts` sigue clonando con
`structuredClone` y toda la resolución corre sobre la copia (los tests de pureza [ENG-01] siguen verdes).

## Criterios de aceptación

- **AC 1 — `resolveTrick`** (`tricks.ts:34-45`): gana el equipo de la carta de mayor `cardRank`; si el
  rango máximo aparece en los dos equipos devuelve `{ winnerTeam: 'PARDA', winnerPlayerId: null }`; si
  aparece en dos cartas del mismo equipo gana ese equipo, con el **primero** de sus jugadores que la
  jugó. Tira `EMPTY_TRICK` con una baza sin jugadas y `UNKNOWN_PLAYER: <id>` si alguien jugó y no está
  sentado. Tests: `tricks.test.ts` → `describe('resolveTrick')` (7 tests, con casos de 2, 4 y 6 jugadores).
- **AC 2 — `resolveHandWinner`** (`tricks.ts:53-60` + `winnerSoFar` 63-82) **[ENG-08]**: recibe las bazas
  jugadas en orden (`TeamId | 'PARDA'`) y el equipo del mano EFECTIVO, y devuelve `{ decided: true,
  winnerTeam }` en la baza de decisión o `{ decided: false }` si todavía no se decidió. Test
  `it('[ENG-08] las 27 combinaciones dan el ganador y la baza de decisión de la tabla')`: recorre las
  **27 combinaciones** de 3 resultados (contra la tabla transcripta del AC) × los **dos** equipos como
  mano, y además verifica que (a) con las bazas previas a la decisión devuelve `decided: false` y (b) el
  resultado no cambia cuando la 3ª baza se juega igual. Total: 54 combinaciones cubiertas.
- **AC 3 — líder siguiente** (`tricks.ts:86-88`) **[ENG-07]**: `nextLeader(trick)` devuelve
  `winnerPlayerId` y, si fue parda, el mismo `leaderId` de esa baza. Tests en `describe('nextLeader')` y
  en los escenarios (se verifica `hand.turnId` y `currentTrick.leaderId` después de una parda).
- **AC 4 — `completeTrick`** (`tricks.ts:101-131`):
  1. calcula el resultado y agrega el `TrickResult` con `leaderId` (con `plays` copiadas);
  2. **después** de actualizar el estado emite `TRICK_WON` con el índice 0-based ya actualizado
     **[ENG-16]** (hay un test que compara el evento contra `hand.tricks.length - 1`);
  3. si la mano quedó decidida llama a `endHand(state, events, { winnerTeam, reason: 'BAZAS' })`;
  4. si no, deja `currentTrick = { leaderId, plays: [] }` con el líder de AC 3 y `turnId = leader`.
  Tira `INCOMPLETE_TRICK` si todavía no jugaron todos los `participants`. Tests: `describe('completeTrick')`
  en `tricks.test.ts` (7) + el test reemplazado en `apply.test.ts` (la baza se resuelve al completarse).
- **AC 5 — `endHand`** (`scoring.ts:61-84`): puntos vía `trucoPoints` (o `opts.points` explícitos),
  `addPoints`, `hand.result = { winnerTeam, points, reason }`, `HandRecord` a `history` con `number`,
  `dealerId`, `manoId`, `picaPica` (falso en esta historia: no hay submanos), `tricks`, `cantos`,
  `winnerTeam`, `points`, `reason` y `scoresAfter` (posteriores a `addPoints`), y `phase = 'HAND_OVER'` +
  evento `HAND_OVER`. `truco.ts:14-16` expone `trucoPoints(state)` (hoy 1 con `truco.level === 0`).
  Tests: `scoring.test.ts` → `describe('endHand')` (5) + los escenarios.
- **AC 6 — `addPoints`** (`scoring.ts:38-54`): suma al equipo y emite `POINTS`; si llega a
  `rules.targetScore` o más recorta a `targetScore` (tope), pasa a `phase = 'MATCH_OVER'`, setea
  `winnerTeam` y emite `MATCH_OVER`, y no queda ninguna acción legal (`getActor` → `null`,
  `getLegalActions` → `[]`, `applyAction` → `MATCH_OVER`, `startNextHand` → `NOT_HAND_OVER`). Tests:
  `describe('addPoints')` (5, incluido el tope 28+5 → 30) y el escenario “la partida también termina por
  bazas”.
- **AC 7 — fases de fin**: `getActor` devuelve `null` en `HAND_OVER` y `MATCH_OVER` (comportamiento de
  1-1, con tests propios) y `startNextHand` se encadena con manos reales: el escenario de 3 manos con
  `startNextHand` juega tres manos completas por bazas y verifica rotación de mano/repartidor y marcador;
  el test `describe('endHand')` → “deja la mano lista para `startNextHand`” cierra con `endHand` real
  (sin forzar la fase a mano).
- **AC 8 — escenarios** (`src/engine/__tests__/scenarios/hands.test.ts`, 10 tests): 2-0, 1-1 que define
  la 3ª, parda en la 1ª que define la 2ª, X-P que termina en la 2ª, P-P-P con la mano de los dos lados,
  cadena de 3 manos con `startNextHand`, y en 4 jugadores: dos cartas de igual rango del mismo equipo
  (gana ese equipo, con el primero que la jugó) vs. igual rango entre equipos (parda), más una mano de 4
  decidida en la 3ª. Todo con mazo fijo (`deckFor`) y solo a través de `applyAction`/`startNextHand`.
- **AC 9 — calidad** (`src/engine/** ≥ 90/85`, typecheck/lint/test/build): ver “Verificación ejecutada”.
  Cobertura medida: **99,02% statements, 97,50% branches, 100% functions, 100% lines**.

## Archivos modificados

Motor (nuevos):

- `src/engine/tricks.ts` — resolución de bazas, ganador de la mano, líder siguiente y `completeTrick` real.
- `src/engine/scoring.ts` — `addPoints` y `endHand`: único lugar que suma puntos y cierra manos.
- `src/engine/truco.ts` — `trucoPoints(state)` (tabla de niveles); el resto de truco es 1-3.

Motor (modificados):

- `src/engine/apply.ts` — solo un comentario: la baza completa la resuelve `tricks.ts` (ya no “la historia 1-2”).

Tests:

- `src/engine/__tests__/tricks.test.ts` (nuevo, 21 tests) — AC 1, 2, 3, 4 y cierre por bazas + [ENG-20].
- `src/engine/__tests__/scoring.test.ts` (nuevo, 11 tests) — AC 5, 6 y el “único camino de puntaje y cierre”.
- `src/engine/__tests__/truco.test.ts` (nuevo, 2 tests) — AC 5 (`trucoPoints`).
- `src/engine/__tests__/scenarios/hands.test.ts` (nuevo, 10 tests) — AC 8.
- `src/engine/__tests__/helpers.ts` — se agregaron `playTrick`, `playTricks`, `withScores` y `engineSources`
  (utilidades de test; los helpers existentes quedaron igual).
- `src/engine/__tests__/apply.test.ts` — se reemplazó el test que fijaba el stub por el de la resolución
  real [ENG-16] y se sacó el `describe('completeTrick (stub)')`; se agregó el caso “cuando la mano se
  cierra por bazas no queda nada legal”. Los tests de baza incompleta quedaron en `tricks.test.ts`.

Docs de la tarea:

- `docs/stories/1-2-bazas-y-resolucion.md` — Dev Agent Record, tareas marcadas y `Status: review`.
- `workflow/runs/1-2-bazas-y-resolucion/implementation.md` — este archivo.
- `workflow/runs/1-2-bazas-y-resolucion/state.json` — lo mantiene `wf` (dispatch/record-impl); permitido
  por el patrón `workflow/runs/<id>/*` del gate `alcance`.

Sin cambios: `types.ts`, `legal.ts`, `match.ts`, `cards.ts`, `rng.ts`, `index.ts`, `purity.test.ts`,
`match.test.ts`, `cards.test.ts`, `rng.test.ts`, `helpers.test.ts` y todo el legacy.

## Verificación ejecutada

```text
npm run typecheck   → tsc --noEmit → sin salida (verde)
npm run lint        → ✖ 82 problems (0 errors, 82 warnings) → exit 0
                      (los 82 warnings son del código legacy/tests, en warn)
npx eslint src/engine --max-warnings 0 → sin problemas
npm test            → Test Files 17 passed (17) · Tests 231 passed (231)
npx vitest run --coverage
                    → Statements 99.02% (204/206) · Branches 97.50% (78/80)
                      Functions 100% (51/51) · Lines 100% (169/169)
                      thresholds src/engine/** (90/85) → verdes
npm run build       → tsc && vite build → ✓ 10 modules transformed · built in 121ms
```

Los 4 archivos de test nuevos aportan 44 tests (21 + 11 + 2 + 10); el resto de los 231 son los de 1-1 y
los del legacy, que siguen pasando.

`wf verify -i 1-2-bazas-y-resolucion` (HEAD `433fc0e`):

```text
OK    alcance         0.0s  @alcance
OK    tipos           0.7s  npx --no-install tsc --noEmit
OK    lint            0.9s  npm run lint --silent
OK    tests           2.1s  npm test --silent
OK    build           0.9s  npm run build --silent
OK    arranque        0.7s  @arranque      → 200 /
VERIFICACIÓN EN VERDE
```

El gate `alcance` reportó exactamente los archivos de esta historia (`src/engine/**` nuevos/modificados
y `workflow/runs/1-2-bazas-y-resolucion/state.json`). El gate `arranque` —que en 1-1 quedaba rojo por el
bind IPv6 de `vite preview`— ahora pasa: el `preview.host: '127.0.0.1'` de `vite.config.ts` (historia
0-1, ya en `main`) hace que escuche en IPv4 y el probe del gate llega (`200 /`).

## Decisiones de diseño (dentro de lo contemplado)

1. **Fin de partida en `endHand`: `MATCH_OVER` gana la fase y no se emite `HAND_OVER`.**
   El AC 5 pide que `endHand` deje `HAND_OVER`, y el AC 6 que `addPoints` deje `MATCH_OVER` cuando el
   equipo llega al objetivo. Como `endHand` llama a `addPoints` **antes** de tocar la fase, la fase final
   es `MATCH_OVER` (una sola fase posible) y no se agrega el aviso `HAND_OVER`: la partida terminó, no
   hay “próxima mano”. `hand.result` y el `HandRecord` se escriben igual (el historial queda completo) y
   el evento `MATCH_OVER` sale una sola vez. Queda fijado por el test “si la mano termina la partida la
   fase queda en MATCH_OVER y hay un solo aviso” y por el escenario “la partida también termina por
   bazas”. Si el supervisor prefiere que además se emita `HAND_OVER`, es un cambio de dos líneas en
   `scoring.ts`, pero no es lo que dice el AC 6 (“ninguna acción posterior es legal”) ni la 1-5 (que
   habla de `MATCH_OVER`, `getActor: null` y `startNextHand` que tira).
2. **`HandWinner` es una unión discriminada** (`{ decided: true; winnerTeam } | { decided: false }`) en
   vez del `{ decided: boolean; winnerTeam?: TeamId }` del AC 2: es la misma forma observable, tipada de
   modo que “decidido” implique “hay ganador”. No cambia ningún retorno ni test.
3. **`HandRecord.picaPica` se calcula** (`state.hand.picaPica !== null`) y no se escribe `false` fijo: en
   esta historia siempre da `false` (no hay submanos) y en 1-7 el campo dice la verdad sin tocar este
   archivo.
4. **`EndHandOptions.reason` se limita a `'BAZAS' | 'NO_QUIERO' | 'MAZO'`** (`HandEndReason`) y el mapeo a
   la razón de `POINTS` es una tabla (`POINTS_REASON`): `BAZAS → 'MANO'`, `NO_QUIERO → 'NO_QUIERO'`,
   `MAZO → 'MAZO'`. 1-3, 1-5 y 1-7 extienden la tabla; el resto de los motivos (‘ENVIDO’, ‘FLOR’,
   ‘PICA_PICA’) están en `PointsReason` esperándolos.
5. **Sin exportar en `index.ts`**: la API pública (arquitectura §5) no incluye estas funciones y el AC 8
   de 1-1 la fijó “nada más que esto”. `tricks.ts` y `scoring.ts` son internos al motor; los tests los
   importan por ruta relativa.
6. **Se sacó una rama muerta** en `winnerSoFar`: la 3ª baza ganada por alguien ya vuelve antes por los
   dos “dos bazas iguales”, así que el caso “una para cada uno + 3ª jugada” es siempre la parda que gana
   el de la primera. Queda documentado en el comentario y cubierto por el test de las 27 combinaciones.

## Riesgos o desviaciones del alcance

- **`startNextHand` no valida `MATCH_OVER`** (tira `NOT_HAND_OVER`, igual que en 1-1): es el comportamiento
  pedido por 1-5 AC 4. Si la UI necesita un motivo distinto para el fin de partida, es decisión del supervisor.
- **Puntos negativos o `points` explícitos inválidos** no se validan en `addPoints`: hoy solo lo llama
  `endHand` con valores de la tabla de truco. Las historias que sumen puntos por envido/flor/mazo pasan
  por el mismo camino, así que cualquier validación debe ir ahí.
- **Cobertura de ramas al 97,5%**: quedan sin cubrir la rama `chosen.type !== 'PLAY_CARD'` de `apply.ts` y
  una de `sameAction` (`legal.ts`), ambas inalcanzables hasta que existan los cantos (1-3/1-4/1-8) y ya
  documentadas en la implementación de 1-1.
- **`withScores` en los tests** es la única forma de llegar al fin de partida sin jugar 30 manos: muta una
  copia del estado en `__tests__` (el motor nunca lo usa, y el test [ENG-01] verifica por escaneo de
  código que nadie fuera de `scoring.ts` escribe `scores`).
- **Desviaciones de alcance: ninguna.** No se tocó ningún archivo fuera de `scope.allow` +
  `workflow/runs/1-2-bazas-y-resolucion/`.

## Conformidad con el contrato

- `dispatch.approved: true` (verificado antes de empezar) y todo el trabajo dentro del worktree
  `/Users/emmanuelvaldez/GameDev/.worktrees/1-2-bazas-y-resolucion`, rama `task/1-2-bazas-y-resolucion`.
- Commits en la rama de tarea: `cce08dd feat(engine): resolución de bazas y cierre de mano (1-2)`,
  `433fc0e test(engine): bazas, puntaje y escenarios de mano (1-2)` y el commit final de docs.
- No se tocó `audit.md` ni los campos de aprobación del estado (`dispatch`, `audit`, `merge`), no hubo
  `git push` ni merge.
- No hubo ninguna decisión arquitectónica fuera de lo contemplado en la asignación: las decisiones de
  arriba son interpretaciones del propio AC (documentadas) y no cambian tipos públicos ni API.
- `workflow/runs/1-2-bazas-y-resolucion/verify.json` queda sin commitear (lo regenera cada corrida).
