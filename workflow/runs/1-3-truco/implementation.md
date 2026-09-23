# Implementación: Motor v2: truco, retruco y vale cuatro

- ID: `1-3-truco`
- Worker: Hermes headless (perfil `trucoai`, modelo `deepseek-v4-flash`)
- Rama: `task/1-3-truco`
- Estado: implementado, pendiente de auditoría

## Resumen

La historia 1-3 deja el truco completo en el motor v2: cantar truco / retruco / vale
cuatro, quién responde el canto, aceptar (`QUIERO`), subir como respuesta ("quiero
retruco") y no querer (que cierra la mano en el acto). Todo el truco vive en
`src/engine/truco.ts`; `legal.ts` y `apply.ts` solo delegan, y los puntos siguen
sumándose únicamente por `addPoints`/`endHand` (`scoring.ts`).

Puntos de diseño (dentro de lo que ya fija la arquitectura):

- **`src/engine/turns.ts` (nuevo)**: utilidades neutrales de turno que van a compartir
  truco (1-3), envido (1-4) y flor (1-8): `teamOfSeat`, `teamOf` y `responderFor`
  (AC 2). `tricks.ts` quedó usando `teamOfSeat` en vez de su copia privada (equipo
  duplicado: [ENG-20]).
- **Tabla única de puntos [ENG-20]**: `TRUCO_POINTS = { accepted: [1,2,3,4], rejected: [0,1,2,3] }`
  en `truco.ts`, con `trucoPoints(state)` (= `accepted[level]`) y el no querido pagando
  `rejected[pending.level]`. Ningún otro módulo del motor nombra esos valores y hay un
  test de fuente (`engineSources`) que lo verifica.
- **Legalidad concentrada**: `canCallTruco` (truco en `PLAYING`: hay que ser el actor,
  sin canto pendiente, `level < 3` y, si ya hay nivel querido, tener el quiero → nadie
  sube su propio canto, AC 9) y `trucoResponseActions` (respondedor en `AWAITING_TRUCO`:
  quiero, no quiero y subir si `pending.level < 3`). `getLegalActions` deriva todo de
  ahí, así que **`PLAY_CARD` nunca es legal con un canto pendiente [ENG-02]**.
- **Coherencia de fase [ENG-18]**: `phase === 'AWAITING_TRUCO'` ⇔ `truco.pending !== null`
  en todo momento (el no querer limpia `pending` *antes* de cerrar la mano); un test de
  50 manos random lo verifica tras **cada** acción.
- **`responderFor` (AC 2)**: entre los `participants` del equipo rival, el humano si
  está; si no, el primero de ese equipo después del que cantó (circular) — mirando solo
  los `participants`, así que en una submano de pica-pica el humano solo responde si
  está en el par.
- **No quiero [ENG-03]**: `endHand(state, events, { winnerTeam: pending.callerTeam,
  points: TRUCO_POINTS.rejected[pending.level], reason: 'NO_QUIERO' })`, con
  `TRUCO_ANSWERED NO_QUIERO` antes de `POINTS`/`HAND_OVER` y sin jugar ninguna carta más.

No hubo decisiones arquitectónicas fuera de lo previsto: no se tocó la API pública
(`index.ts` sigue re-exportando exactamente lo de `architecture.md` §5) ni las reglas
de puntaje de 1-2.

## Archivos modificados

| Archivo | Estado | Qué y por qué |
|---|---|---|
| `src/engine/turns.ts` | nuevo | `teamOfSeat`, `teamOf`, `responderFor` (AC 2), compartibles con envido/flor |
| `src/engine/truco.ts` | modificado (reescrito) | `TRUCO_POINTS`, `trucoPoints`, `canCallTruco`, `trucoResponseActions`, `applyCallTruco`, `applyAnswerTruco` (AC 1, 3–7) |
| `src/engine/legal.ts` | modificado | `getActor` devuelve el respondedor en `AWAITING_TRUCO`; `getLegalActions` por fase (AC 1, 3; [ENG-02]) |
| `src/engine/apply.ts` | modificado | dispatch de `CALL_TRUCO` / `ANSWER_TRUCO` a `truco.ts` (el resto sigue `ILLEGAL_ACTION`) |
| `src/engine/tricks.ts` | modificado | usa `teamOfSeat` de `turns.ts` (saca la copia privada de `teamOfPlayer`) |
| `src/engine/__tests__/turns.test.ts` | nuevo | 8 tests de `teamOf`/`responderFor` (2, 4 y 6 jugadores; sin humano; par de pica-pica) |
| `src/engine/__tests__/truco.test.ts` | modificado | 25 tests: tabla única, legalidad, transiciones, no querer y coherencia [ENG-18] |
| `src/engine/__tests__/scenarios/truco.test.ts` | nuevo | 13 escenarios de mano con mazo fijo (AC 10): 2 y 4 jugadores, 2ª y 3ª baza |
| `src/engine/__tests__/helpers.ts` | modificado | `act`, `callTruco`, `answerTruco`, `playFirstCard`, `randomLegalAction`, `withScores`, `engineSources` |
| `src/engine/__tests__/apply.test.ts` | modificado | los 3 tests del stub (que exigían rechazar `CALL_TRUCO`) pasan al comportamiento real; [ENG-19] separado en envido/flor y truco |
| `docs/stories/1-3-truco.md` | modificado | Dev Agent Record + tareas marcadas |
| `workflow/runs/1-3-truco/implementation.md` | modificado | esta evidencia |

## Verificación ejecutada

```text
$ npm run typecheck   → tsc --noEmit, sin errores
$ npm run lint        → 0 errores (82 warnings, todos preexistentes en legacy/scripts)
$ npm test            → 19 archivos / 276 tests, todos verdes (45 tests nuevos)
$ npx vitest run --coverage
    Statements : 97,94% (286/292)
    Branches   : 94,53% (121/128)
    Functions  : 100,00% (61/61)
    Lines      : 98,75% (237/240)     (umbral src/engine/**: 90 líneas / 85 branches → OK)
$ npm run build       → vite build OK (dist/assets/index-*.js, 62,80 kB)
$ wf verify -i 1-3-truco → ver "Estado de la verificación"
```

Tests nuevos por archivo: `truco.test.ts` 25 (2 preexistentes), `turns.test.ts` 8,
`scenarios/truco.test.ts` 13 y `apply.test.ts` 17 (+1).

## Riesgos o desviaciones del alcance

- **Ninguna desviación de alcance**: solo se tocaron archivos de `scope.allow`
  (`src/engine/*`) y `workflow/runs/1-3-truco/*` (evidencia). No se tocó `audit.md`,
  ni los campos de aprobación del estado, ni la API pública.
- **Detalle de comportamiento documentado**: `canCallTruco` exige además ser el actor en
  `PLAYING`. El AC 1 enumera las condiciones de legalidad "para el actor" y
  `getLegalActions` solo consulta al actor, así que la función quedó coherente con su
  contrato (antes de este cambio, `canCallTruco(state, otroJugador)` devolvía `true`).
  Quien reutilice la función en 1-4 debe asumir lo mismo.
- `ANSWER_TRUCO` sin canto pendiente no es alcanzable por `applyAction` (nunca está en
  `getLegalActions`): el guard `NO_PENDING_TRUCO` de `applyAnswerTruco` queda como
  defensa y tiene su test unitario.
- Los cantos de envido, flor y mazo siguen fuera de `getLegalActions` (historias 1-4,
  1-5 y 1-8): el `default` de `apply.ts` sigue devolviendo `ILLEGAL_ACTION` y el TODO de
  `legal.ts` quedó acotado a esas historias.

## Estado de la verificación

```text
$ wf verify -i 1-3-truco      # corrida sobre el commit de implementación d0928bd
OK    alcance         0.0s  @alcance
OK    tipos           0.9s  npx --no-install tsc --noEmit
OK    lint            0.9s  npm run lint --silent
OK    tests           1.9s  npm test --silent
OK    build           1.1s  npm run build --silent
OK    arranque        0.7s  @arranque

VERIFICACIÓN EN VERDE
Detalle: workflow/runs/1-3-truco/verify.json
```

Los 6 gates pasaron en la primera corrida (sin correcciones). El commit de
implementación es `d0928bd`; el commit que agrega esta evidencia no cambia código,
así que la corrida registrada en `verify.json` y el HEAD de la rama de tarea
describen el mismo árbol de fuentes.
