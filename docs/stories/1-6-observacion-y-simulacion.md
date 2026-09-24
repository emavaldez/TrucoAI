# Historia 1-6: Observación pública y simulación con invariantes (motor v2)

Status: review
wf-id: `1-6-observacion-y-simulacion` · kind: `default`
Depende de: 1-5

## Historia

Como desarrollador de la IA,
quiero una `Observation` por jugador que contenga solo información pública, y un simulador masivo que verifique invariantes,
para que la IA no pueda hacer trampa y para detectar cualquier cuelgue o error de puntaje antes de que llegue al juego.

## Criterios de aceptación

1. **`getObservation(state, playerId): Observation`** (`observation.ts`) con todos los campos del contrato (`architecture.md` §4):
   - `myHand`, `myDealt` del propio jugador; `currentTrick`, `tricks`, `truco`, `envidoChain`, `envidoStatus`, `florDeclared`, `picaPica`, `scores`, `phase`, `rules`, `seats`;
   - `isMano` = `playerId === hand.participants[0]`; `isPie` = es el último de su equipo en `participants`;
   - `unseenCards` = `createDeck()` − `myDealt` − todas las cartas jugadas por otros en la mano (incluidas submanos anteriores de pica-pica), en el orden de `createDeck`;
   - `publicScores` = `envido.result.revealed` (+ `flor.result.revealed` cuando exista) con `kind`;
   - `legalActions = getLegalActions(state, playerId)`.
   - La observación es un objeto nuevo (mutarla no afecta a `state`).
2. **Sin fugas [AI-09]:** test que, en 300 estados tomados de simulaciones (2/4/6 jugadores), para cada jugador:
   - `JSON.stringify(obsSin(unseenCards))` no contiene el `id` de ninguna carta que esté en `hand.hands` de **otro** jugador;
   - `unseenCards` es exactamente el conjunto calculado en AC1 (no depende de las manos reales);
   - no aparecen puntajes de envido de jugadores fuera de `revealed`.
3. **Simulador reutilizable** `src/sim/simulate.ts` (fuera de `src/engine` porque no es runtime del juego):
   `simulateMatch({ rules, seed, pickAction?: (legal: Action[], rng: Rng, obs: Observation) => Action, check?: boolean }): { state, steps, events }`
   — por defecto elige una acción legal al azar con un RNG propio (semilla derivada) y, en cada paso, llama a `startNextHand` al llegar a `HAND_OVER`.
   Con `check: true` verifica después de **cada** acción los invariantes de `docs/planning/test-strategy.md` §2 (1 a 10) y lanza un `Error` descriptivo
   con semilla, número de mano y última acción si alguno falla.
4. **`src/sim/__tests__/simulation.test.ts`**: 200 partidas con `check: true` por cada modo: 2p, 4p, 6p (pica-pica encendida si 1-7 ya está, si no apagada),
   con `flor: false` (el modo con flor se suma en 1-8). Todas terminan en `MATCH_OVER`; 0 errores. Tiempo total < 20 s.
5. **Determinismo (invariante 11):** dos simulaciones con la misma semilla producen el mismo `JSON.stringify(state)` final; con otra semilla, distinto.
6. **`scripts/sim.ts`** reemplaza el placeholder: `npm run sim -- --games 1000 --players 4 --seed 1 [--flor]` corre N partidas por modo pedido
   (o los tres modos si no se pasa `--players`) y muestra: partidas, manos promedio, % victorias por equipo, promedio de puntos por envido/truco, y errores (debe ser 0).
   Pegar la salida de 1.000 partidas por modo en el Dev Agent Record.
7. Cobertura `src/engine/**` ≥ 90/85 (agregar `'src/sim/**'` sin umbral); typecheck, lint, test, build en verde.

## Tareas

- [x] `observation.ts` + tests unitarios (AC 1)
- [x] Test de fugas (AC 2)
- [x] `src/sim/simulate.ts` + invariantes (AC 3)
- [x] `simulation.test.ts` + determinismo (AC 4, 5)
- [x] `scripts/sim.ts` (AC 6)
- [x] Completar Dev Agent Record

## Dev Notes

- `src/sim` puede importar de `src/engine/index.ts` (API pública) y nada más.
- Si la simulación encuentra un bug de reglas de historias anteriores, **no lo tapes en el simulador**: corregilo en `src/engine`,
  agregá un test de escenario que lo reproduzca y anotalo en Completion Notes (está dentro de tu alcance).
- `vitest.config.ts` ya incluye `src/**/*.test.ts`, así que `src/sim/__tests__` corre solo.

### Alcance (wf `scope.allow`)
```json
["src/engine/*", "src/sim/*", "scripts/sim.ts", "vitest.config.ts", "docs/stories/1-6-observacion-y-simulacion.md"]
```

### Referencias
- Arquitectura §4 (`Observation`), §7 · Test strategy §2 · Auditoría AI-09

## Dev Agent Record

### Agent Model Used

Hermes worker (perfil `trucoai`) · modelo Qwen (custom provider) · 2026-09-24.

### Debug Log References

- Ninguna traba de reglas encontrada: los invariantes pasaron en las 3.000 partidas de humo y en las 600 de CI (200 × 3 modos).
- Falso positivo inicial del invariante 1: al cerrar la mano, `completeTrick` deja la última baza en `hand.tricks` **y** en
  `hand.currentTrick`, así que contar ambas listas duplicaba las jugadas. Se resolvió en el chequeo con `handPlays()` (si
  `currentTrick` está completa, ya está en `tricks`); el motor está bien — el bug era del chequeo, no de `src/engine`.

### Completion Notes List

- AC 1: `src/engine/observation.ts` con `getObservation(state, playerId)`. Todos los campos del contrato (architecture.md §4).
  `unseenCards = createDeck() − myDealt − jugadas de otros (incluidas submanos previas de pica-pica, que quedan en `hand.tricks`)`,
  en el orden de `createDeck()`. `publicScores` sale de `envido.result.revealed` (+ `flor.result.revealed` cuando exista) con `kind`.
  `isMano` = primero de `participants`; `isPie` = último de su equipo en `participants`. Todo se clona (`structuredClone`): mutar
  la observación no toca el estado. `getObservation` se exporta desde `src/engine/index.ts` (API pública).
- AC 2: test `[AI-09]` sobre **300 estados** de simulaciones 2p/4p/6p: serializando la observación sin `unseenCards` no aparece
  ninguna carta en mano de otro jugador, `unseenCards` coincide con el conjunto calculado solo con info pública y `publicScores`
  no revela envidos fuera de `revealed`.
- AC 3: `src/sim/simulate.ts` con `simulateMatch({ rules, seed, pickAction?, check? })`. RNG propio con semilla derivada; por
  defecto elige acción legal al azar; en `HAND_OVER` llama `startNextHand`. Con `check: true` valida los invariantes 1-10 de
  test-strategy §2 **después de cada acción** (y el 11 con un test de determinismo), tirando `Error` con semilla, mano y última acción.
- AC 4: `src/sim/__tests__/simulation.test.ts` — 200 partidas por modo con `check: true`, flor off (y pica-pica off en 6p, que
  recién llega en 1-7; la historia ya lo contemplaba). Duración del archivo: ~1,4 s.
- AC 5: determinismo verificado para los 3 modos (misma semilla → mismo `JSON.stringify(state)`; otra semilla → distinto).
- AC 6: `scripts/sim.ts` con `--games --players --seed [--flor] [--no-check]`. Salida de 1.000 partidas por modo abajo.
- AC 7: `src/engine` en 98,5% líneas / 94,1% ramas (umbral 90/85); `src/sim/**` agregado a cobertura sin umbral.
  Typecheck, lint, tests y build en verde.
- Nota de robustez: cuando 1-7 active pica-pica en el motor, el invariante 2 (tope de 3 cartas) se sigue cumpliendo porque
  `hand.participants` pasa a ser el par de la submano; si 1-7 introdujera submanos con mazos distintos, hay que revisar `checkCards`.
- **No se arregló ningún bug de historias anteriores** en `src/engine`: el simulador no encontró ninguno.

### Salida de `npm run sim -- --games 1000 --seed 1` (check on, flor off)

```
== 2 jugadores (flor off, check on) ==
  partidas: 1000 · errores: 0
  manos promedio: 6.24
  victorias: equipo 0 50.1% · equipo 1 49.9%
  envido: 59.1% de las manos, promedio 7.84 pts
  truco: 38.5% de las manos, promedio 1.69 pts

Total errores: 0 OK

== 4 jugadores (flor off, check on) ==
  partidas: 1000 · errores: 0
  manos promedio: 5.39
  victorias: equipo 0 50.1% · equipo 1 49.9%
  envido: 66.7% de las manos, promedio 8.20 pts
  truco: 40.1% de las manos, promedio 1.69 pts

Total errores: 0 OK

== 6 jugadores (flor off, check on) ==
  partidas: 1000 · errores: 0
  manos promedio: 5.44
  victorias: equipo 0 51.1% · equipo 1 48.9%
  envido: 67.7% de las manos, promedio 8.03 pts
  truco: 39.8% de las manos, promedio 1.68 pts

Total errores: 0 OK
```

### File List

- `src/engine/observation.ts` (nuevo) — `getObservation`.
- `src/engine/index.ts` — exporta `getObservation`.
- `src/engine/__tests__/observation.test.ts` (nuevo) — AC 1 y AC 2.
- `src/sim/simulate.ts` (nuevo) — `simulateMatch` + invariantes.
- `src/sim/__tests__/simulation.test.ts` (nuevo) — AC 4 y AC 5.
- `scripts/sim.ts` — reemplaza el placeholder (AC 6).
- `vitest.config.ts` — `src/sim/**` en cobertura sin umbral (AC 7).
- `docs/stories/1-6-observacion-y-simulacion.md` — Dev Agent Record y Status.

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
