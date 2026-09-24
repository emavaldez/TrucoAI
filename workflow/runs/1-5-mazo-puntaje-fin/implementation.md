# Implementación: Motor v2: mazo, puntaje, historial y fin de partida

- ID: `1-5-mazo-puntaje-fin`
- Worker: Hermes (perfil `trucoai`), modelo `deepseek-v4-flash`
- Rama: `task/1-5-mazo-puntaje-fin` · Worktree: `/Users/emmanuelvaldez/GameDev/.worktrees/1-5-mazo-puntaje-fin`
- Estado: implementada, verificada en verde y lista para auditoría

## Resumen

Se implementó la historia `docs/stories/1-5-mazo-puntaje-fin.md` completa en el motor puro (`src/engine/`): irse al mazo,
el puntaje y el historial exactos, y el fin de partida en el momento justo, siguiendo el GDD §8–9 y la auditoría
ENG-01, ENG-09, ENG-10, ENG-15 y UI-16.

Módulo nuevo:

- `src/engine/mazo.ts` — todo el mazo en un solo lugar: `canGoToMazo` (cuándo se puede uno ir, AC 1), `mazoActions`
  (la acción legal) y `applyMazo` (cuánto paga y cómo cierra la mano, AC 2). Los tantos del envido y de la flor ya
  resueltos en la mano no se tocan, y no hay punto extra por irse en primera sin cantar envido.

`legal.ts` y `apply.ts` solo delegan (`mazoActions` / `applyMazo`), igual que con el truco y el envido: siguen siendo la
única fuente de legalidad y el único punto de entrada para actuar. Nadie fuera de `scoring.ts` suma puntos ni cierra
manos [ENG-20]: el mazo llama a `endHand` (razón `'MAZO'`) y `endHand` llama a `addPoints`.

`scoring.ts` quedó como el único camino de puntaje y cierre:

- `endHand` escribe `hand.result` **antes** de sumar y después agrega el `HandRecord` al historial y emite `HAND_OVER`;
- `addPoints` es el único lugar que escribe `scores[...]`: aplica el tope del objetivo, marca `MATCH_OVER`, el ganador y
  un único evento `MATCH_OVER`, y si la partida termina **en medio** de una mano (el envido llega a 30) agrega el
  `HandRecord` de esa mano con `reason: 'MATCH_ENDED'` y `points: 0` [UI-16];
- `completeCantos` completa `points` y `pointsTo` de cada canto del historial con las tablas de `truco.ts` y
  `envido.ts` (AC 5) [ENG-15].

## Archivos modificados

- `src/engine/mazo.ts` (nuevo, 57 líneas) — AC 1 y AC 2. `canGoToMazo`, `mazoActions`, `applyMazo`.
- `src/engine/scoring.ts` (reescrito, 124 líneas) — AC 3, AC 4 y AC 5. `addPoints` (único que suma y cierra la partida),
  `endHand`, `MATCH_ENDED`, `completeCantos` y el `HandRecord` completo.
- `src/engine/truco.ts` — AC 5: `LEVEL_OF_CANTO` (inversa de `CANTO_KIND`) para el historial, `trucoCantoPoints`,
  `rejectPendingTruco` reutilizado por el mazo y la respuesta al canto pendiente que deja el nivel querido.
- `src/engine/envido.ts` — AC 5: `isEnvidoCanto` y `envidoCantoPoints`, que completan el historial de los cantos de
  envido (querido/no querido) con sus puntos y a qué equipo fueron.
- `src/engine/legal.ts` — AC 1: `getLegalActions` incluye el mazo del actor en `PLAYING` (después de los cantos, antes de
  las cartas) y el del respondedor en `AWAITING_TRUCO`; nada en `AWAITING_ENVIDO` / `AWAITING_FLOR` / `HAND_OVER` /
  `MATCH_OVER` [ENG-09].
- `src/engine/apply.ts` — AC 1 y AC 2: `case 'MAZO'` que delega en `applyMazo`.
- `src/engine/__tests__/mazo.test.ts` (nuevo, 266 líneas) — AC 1, AC 2 y AC 7 (unitarios), con los IDs de auditoría en
  los títulos (`[ENG-09]`).
- `src/engine/__tests__/scenarios/mazo-fin.test.ts` (nuevo, 209 líneas) — AC 7: escenarios de mazo sin truco, con truco
  querido, respondiendo a un truco y a un vale cuatro, con envido pendiente, con envido ya cobrado, y el fin de partida
  por los cuatro caminos [ENG-01] [UI-16] (usa el helper `withScores` de `__tests__`).
- `src/engine/__tests__/fullMatch.test.ts` (nuevo, 133 líneas) — AC 6: partidas completas de 2, 4 y 6 jugadores (6p con
  `picaPica: false` hasta la 1-7) con dos políticas (primera acción legal y aleatoria con semilla), sin trabas, y una
  segunda partida nueva después [ENG-01].
- `src/engine/__tests__/helpers.ts`, `apply.test.ts`, `truco.test.ts`, `scenarios/truco.test.ts`,
  `scenarios/envido.test.ts` — ajustes porque el mazo ahora es una acción legal más y porque el historial lleva
  `points`/`pointsTo` (ver "Desviaciones").
- (`src/engine/__tests__/scoring.test.ts` no se modificó: su test de grep `[ENG-01]` de la 1-3 ya exige el AC 3 y sigue
  pasando tal cual.)
- `docs/stories/1-5-mazo-puntaje-fin.md` — Dev Agent Record completo y `Status: review`.

## Verificación ejecutada

```text
$ npx tsc --noEmit
(exit 0, sin salida: 0 errores)

$ npm test
 Test Files  27 passed (27)
      Tests  379 passed (379)
   Duration  2.07s

$ npm run test:coverage
Statements   : 97.17% ( 447/460 )
Branches     : 94.3% ( 232/246 )
Functions    : 100% ( 97/97 )
Lines        : 98.91% ( 365/369 )
(umbral de src/engine/**: líneas 90, branches 85 — AC 8 cumplido; `mazo.ts` y `scoring.ts` al 100% en líneas y branches)

$ npm run lint
✖ 82 problems (0 errors, 82 warnings)   ← warnings preexistentes de src/core y src/ui (legacy), 0 errores

$ npm run build
dist/assets/index-C8K1YJj9.js   64.19 kB │ gzip: 15.17 kB
✓ built in 121ms

$ wf verify -i 1-5-mazo-puntaje-fin
OK    alcance         0.0s  @alcance
OK    tipos           0.9s  npx --no-install tsc --noEmit
OK    lint            1.0s  npm run lint --silent
OK    tests           1.7s  npm test --silent
OK    build           1.1s  npm run build --silent
OK    arranque        0.7s  @arranque
OK    partidas       41.8s  npm run test:partidas --silent

VERIFICACIÓN EN VERDE
```

El gate `alcance` listó exactamente estos archivos tocados, todos dentro de `scope.allow` más
`workflow/runs/1-5-mazo-puntaje-fin/*`:

```text
docs/stories/1-5-mazo-puntaje-fin.md
src/engine/__tests__/apply.test.ts
src/engine/__tests__/fullMatch.test.ts
src/engine/__tests__/helpers.ts
src/engine/__tests__/mazo.test.ts
src/engine/__tests__/scenarios/envido.test.ts
src/engine/__tests__/scenarios/mazo-fin.test.ts
src/engine/__tests__/scenarios/truco.test.ts
src/engine/__tests__/truco.test.ts
src/engine/apply.ts
src/engine/envido.ts
src/engine/legal.ts
src/engine/mazo.ts
src/engine/scoring.ts
src/engine/truco.ts
workflow/runs/1-5-mazo-puntaje-fin/state.json
```

El gate `partidas` (Playwright sobre `vite preview`, partidas completas de 2, 4 y 6 jugadores, "nueva partida" y
determinismo) pasó con `13 passed (41.4s)`.

`workflow/runs/1-5-mazo-puntaje-fin/verify.json` guarda el detalle completo de los 7 gates; su campo `head` es el commit
registrado en `implementation.commit` del `state.json` (la verificación se corrió **después** del commit final, como
exige `wf record-impl`).

## Cobertura de los criterios de aceptación

- **AC 1 (legalidad de `MAZO`)** — `mazo.test.ts`: en `PLAYING` el mazo es del actor y va en las acciones legales después
  de los cantos y antes de las cartas; el que no es el actor ni lo ve ni puede aplicarlo; en `AWAITING_TRUCO` es del
  respondedor y no del que cantó; **no** existe en `AWAITING_ENVIDO` (con el envido pendiente nadie puede irse) [ENG-09],
  ni en `AWAITING_FLOR`, `HAND_OVER` ni `MATCH_OVER`.
- **AC 2 (puntos del mazo)** — `mazo.test.ts` y `scenarios/mazo-fin.test.ts`: sin truco → 1 al rival; truco querido → 2;
  retruco querido → 3; vale cuatro querido → 4; respondiendo a un truco → 1 (el no querido) al que cantó; respondiendo a
  un vale cuatro → 3; los tantos del envido ya resueltos se conservan y se suman los del mazo (sin punto extra por irse
  en primera sin envido). El `CantoRecord` queda como `{ kind: 'MAZO', by, team }` y el evento `MAZO` sale antes de
  `POINTS`.
- **AC 3 (un solo camino)** — `scoring.test.ts` `[ENG-01]`: grep sobre las fuentes del motor que exige que el único
  archivo con asignación a `scores[...]` sea `scoring.ts`, y el único que ponga `phase = 'HAND_OVER'` también.
- **AC 4 (fin de partida en cualquier camino)** — `scenarios/mazo-fin.test.ts` cierra la partida por bazas, por truco no
  querido, por mazo y por envido partiendo de `scores` cercanos a 30 con el helper `withScores`; `fullMatch.test.ts`
  comprueba en cada partida terminada el tope 30, `winnerTeam`, un único evento `MATCH_OVER`, `getActor === null`,
  `getLegalActions === []` para todos los asientos, `applyAction` → `MATCH_OVER` y `startNextHand` que tira
  `NOT_HAND_OVER` [ENG-01].
- **AC 5 (historial)** — `scoring.test.ts` y `scenarios/mazo-fin.test.ts`: cada mano cerrada agrega un `HandRecord` con
  `number` correlativo (1, 2, 3…), `dealerId`, `manoId`, `tricks`, `cantos` (con `answer`, `points` y `pointsTo` de
  truco y envido), `winnerTeam`, `points`, `reason` y `scoresAfter`; la mano cortada por el fin de partida por envido
  queda con `reason: 'MATCH_ENDED'`, `points: 0` y sus cantos [UI-16], sin duplicar el record de una mano ya cerrada.
- **AC 6 (partida nueva limpia)** — `fullMatch.test.ts`: 2, 4 y 6 jugadores × 2 políticas, cada caso juega la partida
  completa, exige actor y acciones legales en cada paso (sin trabas, con tope de 20.000 acciones), juega una segunda
  partida nueva (que arranca con `scores [0,0]`, `history []`, `phase 'PLAYING'`, `version 0`) y una tercera con otra
  semilla. Los 6 jugadores van con `picaPica: false` hasta la 1-7.
- **AC 7 (escenarios)** — `scenarios/mazo-fin.test.ts` con mazo fijo en 2 y 4 jugadores: todos los valores del mazo, el
  envido pendiente que bloquea el mazo (`MAZO` no está en las acciones legales y `applyAction` lo rechaza) y los cuatro
  caminos de fin de partida.
- **AC 8 (calidad)** — cobertura `src/engine/**` ≥ 90/85 (real: líneas 98.91, branches 94.3), typecheck, lint, tests,
  build, arranque y partidas en verde (ver arriba).

## Riesgos o desviaciones del alcance

- **Sin desviaciones de alcance**: solo se tocó `src/engine/*`, `docs/stories/1-5-mazo-puntaje-fin.md` y este
  `implementation.md` (más `workflow/runs/1-5-mazo-puntaje-fin/state.json`, que es del propio workflow). No se tocó
  código legacy, ni `audit.md`, ni los campos de aprobación del estado; no hubo merge ni push.
- **Tests de historias anteriores ajustados** (`apply.test.ts`, `truco.test.ts`, `scenarios/truco.test.ts`,
  `scenarios/envido.test.ts`): enumeraban las acciones legales y los cantos del historial, así que dejaron de valer al
  agregarse el mazo (AC 1, AC 2) y `points`/`pointsTo` (AC 5). Son consecuencias directas de la historia, no cambios de
  comportamiento: los niveles, los puntos y las transiciones del truco y del envido no se tocaron.
- **`helpers.answerTruco` ahora tira si la respuesta no es legal** (antes devolvía el resultado fallido): los tests que
  esperaban un `MAZO` ilegal ahora usan `applyAction` directo. Es un endurecimiento del helper de tests, sin efecto en el
  motor.
- **`MATCH_ENDED` como motivo de `HandRecord`**: el tipo `HandEndReason` no lo incluye porque no es un cierre de mano
  pedido por una acción, sino la marca de la mano cortada por el fin de partida [UI-16]. Queda como constante exportada
  (`scoring.MATCH_ENDED`) para que la UI y las historias siguientes no dependan del string literal.
- **Riesgo abierto para la auditoría**: `AWAITING_FLOR` existe en el tipo de fase pero la flor es la historia 1-8; el
  caso "no hay mazo en `AWAITING_FLOR`" se cubre con un test unitario que fuerza la fase a mano, no de punta a punta.
- Sin dudas de reglamento pendientes: no hubo que detenerse por ambigüedades del GDD.
