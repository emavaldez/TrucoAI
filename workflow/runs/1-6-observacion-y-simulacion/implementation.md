# Implementación: Motor v2: observación pública y simulación

- ID: `1-6-observacion-y-simulacion`
- Worker: Hermes headless (perfil `trucoai`) · 2026-09-24
- Estado: completada (pendiente `wf verify` + `wf record-impl`)

## Resumen

Implementé la historia 1-6 completa: `getObservation` pública con `unseenCards`/`publicScores`
(sin fugas de cartas ajenas [AI-09]), el simulador masivo `src/sim/simulate.ts` que verifica los
invariantes 1-10 de `test-strategy.md` §2 después de **cada** acción (el 11 por test de
determinismo), la batería de 200 partidas × 3 modos con `check: true`, y el CLI
`scripts/sim.ts`. No hubo que corregir ningún bug del motor: la simulación no encontró ninguno.

## Archivos modificados

- `src/engine/observation.ts` (nuevo) — `getObservation(state, playerId)` con todos los campos
  del contrato (architecture.md §4): `unseenCards = createDeck() − myDealt − jugadas de otros`
  en orden del mazo (incluye submanos previas de pica-pica, que quedan en `hand.tricks`),
  `publicScores` desde `envido.result.revealed` (+ flor cuando exista) con `kind`,
  `isMano`/`isPie` según `participants`, clonado profundo (mutar la obs no toca el estado).
- `src/engine/index.ts` — exporta `getObservation` (API pública).
- `src/engine/__tests__/observation.test.ts` (nuevo) — AC 1 y AC 2 [AI-09]: 300 estados de
  simulaciones 2p/4p/6p verifican que la serialización pública sin `unseenCards` no contiene
  ninguna carta en mano de otro, que `unseenCards` coincide con el conjunto calculado solo con
  info pública y que ningún envido fuera de `revealed` aparece.
- `src/sim/simulate.ts` (nuevo) — `simulateMatch({rules, seed, pickAction?, check?})`: RNG propio
  con semilla derivada, `startNextHand` en `HAND_OVER`, invariantes 1-10 chequeados tras cada
  acción con `Error` descriptivo (semilla, número de mano, última acción).
- `src/sim/__tests__/simulation.test.ts` (nuevo) — AC 4 (200 partidas × 2p/4p/6p, `check: true`,
  flor off, todas en `MATCH_OVER`, 0 errores, < 20 s) y AC 5 (determinismo).
- `scripts/sim.ts` — reemplaza el placeholder: `npm run sim -- --games 1000 --players 4 --seed 1
  [--flor] [--no-check]`; reporta partidas, manos promedio, % victorias por equipo, promedio de
  puntos por envido/truco y errores por modo.
- `vitest.config.ts` — `src/sim/**` agregado a cobertura sin umbral propio (AC 7).
- `docs/stories/1-6-observacion-y-simulacion.md` — Status → `review`, Dev Agent Record completo
  con la salida de 1.000 partidas por modo.
- `workflow/runs/1-6-observacion-y-simulacion/state.json` — lo escribió `wf dispatch` (status
  `dispatched` + ruta del worktree) antes de esta sesión; lo commiteé para dejar el árbol limpio.
  No toqué campos de aprobación ni `audit.md`.

## Verificación ejecutada

```text
$ npm ci && npx playwright install chromium        # ok (preparación del worktree)
$ npx tsc --noEmit                                 # 0 errores
$ npm run lint --silent                            # 0 errores, 82 warnings (todos preexistentes
                                                   #   en legacy/scripts viejos; mis archivos: 0
                                                   #   warnings, verificado con eslint puntual)
$ npm test --silent                                # 29 files / 401 tests passed (2,3 s; +22 nuevos)
$ npx vitest run --coverage                        # src/engine: 98,5% líneas / 94,1% ramas (umbral 90/85 ✓)
                                                   # src/sim: 82,3% / 73,1% (sin umbral)
$ npm run build --silent                           # ok (vite build, 109 ms)
$ npx tsx scripts/sim.ts --games 1000 --seed 1     # 3 modos × 1000 partidas, check on:
                                                   #   3.000 partidas, 0 errores, 9,5 s totales
                                                   #   (2p: 6,24 manos prom; 4p: 5,39; 6p: 5,44;
                                                   #    victorias ≈50/50; detalle en Dev Agent Record)
$ npx tsx scripts/sim.ts --games 50 --players 4 --seed 1 --flor   # 0 errores (flor on no rompe)
$ wf verify -i 1-6-observacion-y-simulacion        # ver más abajo (se pega el resultado)
```

Resultado de `wf verify`: VERDE sobre el último commit — `alcance` OK · `tipos` OK · `lint` OK ·
`tests` OK (401) · `build` OK · `arranque` OK · `partidas` OK (40,8 s). Total 47,7 s.
Detalle en `workflow/runs/1-6-observacion-y-simulacion/verify.json`.

## Riesgos o desviaciones del alcance

- Ninguna desviación de alcance: todos los archivos tocados están en `scope.allow`
  (+ `workflow/runs/1-6-observacion-y-simulacion/`).
- **Pica-pica (1-7)**: cuando active `hand.picaPica`, los invariantes siguen valiendo porque
  `hand.participants` pasa a ser el par de la submano. Si 1-7 introdujera mazos distintos por
  submano, revisar `checkCards`.
- **Flor (1-8)**: `publicScores` ya contempla `flor.result.revealed`; cuando `getLegalActions`
  exponga acciones de flor, el simulador las ejercita automáticamente sin cambios.
- AC 4 dice "pica-pica encendida si 1-7 ya está, si no apagada": 1-7 no mergeó, así que los 6p
  corren con `picaPica: false` explícito (no dependiente del default).
- El invariante 11 (determinismo) es una propiedad entre dos simulaciones completas: no se
  puede chequear "después de cada acción"; lo cubre el test dedicado de AC 5.
- Falso positivo inicial del invariante 1 en mi chequeo (no del motor): al cerrar la mano,
  `completeTrick` deja la última baza en `hand.tricks` y en `hand.currentTrick`; el chequeo
  ahora deduce con `handPlays()`. Queda documentado en el Debug Log de la historia.
