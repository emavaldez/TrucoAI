# Historia 1-2: Bazas y resolución de la mano (motor v2)

Status: review
wf-id: `1-2-bazas-y-resolucion` · kind: `default`
Depende de: 1-1

## Historia

Como jugador,
quiero que cada baza y cada mano se resuelvan exactamente como en el truco real (incluidas todas las pardas),
para confiar en que el juego no me roba manos.

## Criterios de aceptación

1. **`resolveTrick(plays: TrickPlay[], seats: Seat[]): { winnerTeam: TeamId | 'PARDA'; winnerPlayerId: PlayerId | null }`** (pura, en `tricks.ts`):
   - gana el equipo de la carta de mayor `cardRank`;
   - si el rango máximo aparece en jugadores de **ambos** equipos → `'PARDA'`, `winnerPlayerId: null`;
   - si el rango máximo aparece solo en un equipo (aunque sean dos cartas iguales del mismo equipo) → gana ese equipo; `winnerPlayerId` = el **primero** de ese equipo que jugó esa carta máxima.
2. **`resolveHandWinner(results: ('X'|'Y'|'P')[] …)`** — implementada en términos de `TeamId`/`'PARDA'` y el equipo del mano — devuelve `{ decided: boolean; winnerTeam?: TeamId }`
   después de cada baza, según esta tabla (X = equipo del mano, Y = el otro, P = parda; "—" = no se juega) **[ENG-08]**:

   | Bazas | Ganador | Se decide en |
   |---|---|---|
   | X X — | X | 2ª |
   | X P — | X | 2ª |
   | X Y X | X | 3ª |
   | X Y Y | Y | 3ª |
   | X Y P | X | 3ª |
   | Y Y — | Y | 2ª |
   | Y P — | Y | 2ª |
   | Y X X | X | 3ª |
   | Y X Y | Y | 3ª |
   | Y X P | Y | 3ª |
   | P X — | X | 2ª |
   | P Y — | Y | 2ª |
   | P P X | X | 3ª |
   | P P Y | Y | 3ª |
   | P P P | X (equipo del mano) | 3ª |

   El test recorre **las 27 combinaciones** de 3 resultados y verifica ganador y baza de decisión contra esta tabla (las combinaciones cuya 3ª no se juega deben dar el mismo resultado sin importar el 3er valor).
3. **Quién abre la próxima baza [ENG-07]:** el `winnerPlayerId` de la baza anterior; si fue parda, el **mismo `leaderId`** de la baza parda.
4. **`completeTrick`** (reemplaza el stub de 1-1): cuando todos los `participants` jugaron,
   1. calcula el resultado, agrega un `TrickResult` a `hand.tricks` (con `leaderId`),
   2. **después** de actualizar el estado emite `TRICK_WON` con el índice de baza (0-based) **[ENG-16]**,
   3. si la mano quedó decidida → llama a `endHand(state, events, { winnerTeam, reason: 'BAZAS' })`;
   4. si no → nueva `currentTrick` con el líder de AC3 y `turnId` = ese líder.
5. **`endHand`** (nuevo, en `scoring.ts`, **el único punto de cierre de mano** del motor): calcula los puntos de la mano
   (en esta historia: `1` porque no hay truco todavía; dejar `trucoPoints(state)` en `truco.ts` que hoy devuelve 1 si `truco.level === 0`),
   llama a `addPoints(state, events, team, points, reason)`, setea `hand.result`, agrega el `HandRecord` a `history`
   (con `number`, `dealerId`, `manoId`, `picaPica: false`, `tricks`, `cantos: []`, `winnerTeam`, `points`, `reason`, `scoresAfter`),
   pone `phase = 'HAND_OVER'` y emite `HAND_OVER`.
6. **`addPoints`** (en `scoring.ts`, **el único lugar** que modifica `scores`): suma, emite `POINTS`; si el equipo llega a `rules.targetScore`
   o más → `scores[team] = targetScore` (tope), `phase = 'MATCH_OVER'`, `winnerTeam = team`, emite `MATCH_OVER`, y ninguna acción posterior es legal.
   (En 1-5 se agregan los casos de fin en medio de la mano; en esta historia alcanza con fin por bazas.)
7. `getActor` devuelve `null` en `HAND_OVER` y `MATCH_OVER`; `startNextHand` funciona encadenado con una mano real (sin forzar la fase a mano).
8. **Escenarios completos** (`src/engine/__tests__/scenarios/hands.test.ts`) con `deck` fijo, 2 y 4 jugadores:
   - mano ganada 2-0; mano 1-1 que define la 3ª; parda en 1ª que define la 2ª; X-P (termina en 2ª); P-P-P → equipo del mano;
   - en 4 jugadores: dos cartas de igual rango del **mismo** equipo no es parda; igual rango entre equipos sí;
   - después de parda abre el líder de la parda (verificar `turnId`) **[ENG-07]**;
   - encadenar 3 manos con `startNextHand` y verificar rotación de mano y que el marcador sube 1 por mano.
9. Cobertura `src/engine/**` ≥ 90/85; typecheck, lint, test, build en verde.

## Tareas

- [x] `resolveTrick` + tests (AC 1)
- [x] `resolveHandWinner` + test de 27 combinaciones (AC 2)
- [x] Líder siguiente (AC 3)
- [x] `completeTrick` real (AC 4)
- [x] `scoring.ts`: `endHand`, `addPoints` (AC 5, 6)
- [x] `truco.ts` con `trucoPoints(state)` mínimo (AC 5)
- [x] Escenarios (AC 8)
- [x] Completar Dev Agent Record

## Dev Notes

- **Mano efectivo = `hand.participants[0]`** (en manos normales es `hand.manoId`; en submanos de pica-pica, historia 1-7, es el primero del par). Usalo para P-P-P y cualquier desempate: nunca uses `dealerId+1` ni `manoId` directo en la resolución.

- `endHand` y `addPoints` son la base de 1-3, 1-4, 1-5, 1-7, 1-8: **nunca** sumar puntos ni cerrar manos en otro lado.
- `truco.ts` en esta historia solo exporta `trucoPoints`; el resto de truco es 1-3. No implementes cantos.
- Usá el helper `deckFor` de 1-1 para armar manos exactas.

### Alcance (wf `scope.allow`)
```json
["src/engine/*", "docs/stories/1-2-bazas-y-resolucion.md"]
```

### Referencias
- GDD §4 · Arquitectura §4–5 · Auditoría ENG-07, ENG-08, ENG-16, ENG-20

## Dev Agent Record

### Agent Model Used

Hermes headless (perfil `trucoai`), modelo `deepseek-v4-flash`.

### Debug Log References

- `wf verify -i 1-2-bazas-y-resolucion` → **VERIFICACIÓN EN VERDE** (6/6: alcance, tipos, lint, tests,
  build, arranque) sobre `433fc0e`. Salida completa en `workflow/runs/1-2-bazas-y-resolucion/verify.json`.
- `npm test` → 17 archivos / 231 tests, todos verdes (44 de ellos nuevos de esta historia).
- `npx vitest run --coverage` → statements 99,02% · branches 97,50% · functions 100% · lines 100%
  (umbral de `src/engine/**`: 90/85).
- Evidencia completa, decisiones y riesgos: `workflow/runs/1-2-bazas-y-resolucion/implementation.md`.
- No hubo correcciones del gate: la primera corrida de `wf verify` salió verde (en 1-1 el `arranque`
  fallaba por el bind IPv6 de `vite preview`; esa corrección, historia 0-1, ya está en `main`).

### Completion Notes List

- AC 1–9 implementados y cubiertos por tests; el stub de `completeTrick` de 1-1 quedó reemplazado por la
  resolución real y no queda ningún `NOT_IMPLEMENTED: historia 1-2` en `src/engine/`.
- `scoring.ts` es el único lugar que suma puntos y cierra manos, y `tricks.ts` no conoce DOM/RNG/timers
  (los tests de pureza [ENG-01] siguen verdes). `truco.ts` solo expone `trucoPoints`; los cantos son 1-3.
- Decisión documentada: si la mano termina la partida, la fase queda en `MATCH_OVER` (la pide `addPoints`)
  y no se emite `HAND_OVER`; el `HandRecord` se escribe igual. `HandWinner` es unión discriminada.
- Se retiró una rama muerta de `winnerSoFar` (la 3ª baza ganada ya vuelve por los “dos bazas iguales”).
- Sin cambios en la API pública ni en archivos fuera de `scope.allow`; no se tocó `audit.md` ni el estado.

### File List

| Archivo | Estado |
|---|---|
| `src/engine/tricks.ts` | modificado (implementación real de AC 1–4) |
| `src/engine/scoring.ts` | nuevo (`addPoints`, `endHand`) |
| `src/engine/truco.ts` | nuevo (`trucoPoints`) |
| `src/engine/apply.ts` | modificado (comentario de `completeTrick`) |
| `src/engine/__tests__/tricks.test.ts` | nuevo (21 tests) |
| `src/engine/__tests__/scoring.test.ts` | nuevo (11 tests) |
| `src/engine/__tests__/truco.test.ts` | nuevo (2 tests) |
| `src/engine/__tests__/scenarios/hands.test.ts` | nuevo (10 tests) |
| `src/engine/__tests__/helpers.ts` | modificado (`playTrick`, `playTricks`, `withScores`, `engineSources`) |
| `src/engine/__tests__/apply.test.ts` | modificado (tests del stub → resolución real) |
| `docs/stories/1-2-bazas-y-resolucion.md` | modificado (este record) |
| `workflow/runs/1-2-bazas-y-resolucion/implementation.md` | modificado (evidencia) |

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
- 2026-09-23 · Hermes (worker) · Implementación completa; tests y gates en verde sobre el commit de tarea.
