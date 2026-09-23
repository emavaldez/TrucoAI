# Historia 1-6: Observación pública y simulación con invariantes (motor v2)

Status: ready-for-dev
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

- [ ] `observation.ts` + tests unitarios (AC 1)
- [ ] Test de fugas (AC 2)
- [ ] `src/sim/simulate.ts` + invariantes (AC 3)
- [ ] `simulation.test.ts` + determinismo (AC 4, 5)
- [ ] `scripts/sim.ts` (AC 6)
- [ ] Completar Dev Agent Record

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
### Debug Log References
### Completion Notes List
### File List

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
