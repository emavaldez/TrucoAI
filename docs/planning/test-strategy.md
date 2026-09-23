# TrucoAI — Estrategia de testing (v2)

**Objetivo:** que ningún bug de la auditoría 2026-09 pueda volver sin que un test lo detecte, y que cada regla del GDD tenga al menos un test que la nombre.

## 1. Niveles

| Nivel | Herramienta | Dónde | Qué cubre | Tiempo máx. |
|---|---|---|---|---|
| Unit | vitest | `src/**/__tests__/*.test.ts` | funciones puras: ranking, envido, cadena de envido, resolución de bazas, truco, falta, pica-pica | < 5 s total |
| Escenarios | vitest | `src/engine/__tests__/scenarios/*.test.ts` | manos completas con mazo fijo (`createMatch({deck})`) y acciones guionadas; valida eventos, puntaje y fase | < 5 s |
| Simulación con invariantes | vitest + `scripts/sim.ts` | `src/engine/__tests__/simulation.test.ts` | 200 partidas random-legal por modo en CI (2/4/6 × flor on/off); 1.000 con `npm run sim` | < 20 s en CI |
| IA | vitest | `src/ai/__tests__/` | decisiones puntuales con observaciones construidas a mano; legalidad; justicia | < 5 s |
| Arena | `scripts/arena.ts` + test | `src/ai/__tests__/arena.test.ts` | orden de dificultades: 300 partidas por cruce en CI; 1.000 manual | < 60 s |
| Controller | vitest (sin DOM) | `src/app/__tests__/` | driver de IA, cancelación, versión, `autoAck`, nueva partida | < 5 s |
| UI unit | vitest + jsdom | `src/ui/__tests__/` | vistas: botones == acciones legales, escape de HTML, testids | < 5 s |
| E2E | Playwright (chromium) | `e2e/*.spec.ts` | flujos reales en `vite preview` con `?test=1&seed=N&fast=1&autoAck=1` | < 3 min |

## 2. Invariantes de simulación (se chequean después de CADA acción)

1. Las 40 cartas se conservan: `mazo restante + manos + jugadas = 40` y no hay duplicados.
2. Nadie juega más de 3 cartas por mano (por submano en pica-pica).
3. `getActor(state)` no es `null` salvo en `HAND_OVER` / `MATCH_OVER`, y `getLegalActions(state, actor)` no está vacío (no hay cuelgues).
4. Toda acción elegida de `getLegalActions` es aceptada por `applyAction`; toda acción fuera de la lista es rechazada.
5. Con un canto pendiente (`AWAITING_*`), `PLAY_CARD` nunca es legal.
6. Los puntajes nunca bajan; nunca superan 30 en `MATCH_OVER` visible (tope); la partida termina exactamente cuando alguien llega a 30.
7. Puntos por mano: truco nunca más de 4 por mano (por submano en pica-pica); envido/flor según tabla.
8. El envido se cierra al terminar la primera baza.
9. `getObservation(p)` no contiene ninguna carta de otro jugador que no haya sido jugada (se verifica serializando y buscando ids).
10. La partida termina en ≤ 200 manos (no hay bucles).
11. Determinismo: misma semilla + misma secuencia de decisiones → mismo estado final (hash JSON).

## 3. Cobertura (vitest `--coverage`, provider v8)

| Carpeta | Líneas | Ramas |
|---|---|---|
| `src/engine/` | ≥ 90% | ≥ 85% |
| `src/ai/` | ≥ 80% | ≥ 70% |
| `src/app/` | ≥ 80% | ≥ 70% |
| `src/ui/` | ≥ 60% | — |

Los umbrales se activan por carpeta cuando la épica correspondiente se completa (historia 0-1 deja la config lista con umbrales solo para carpetas existentes del código nuevo).
El legacy (`src/core`, `src/App.ts`, `src/ai/{AIPlayer,DecisionEngine,CardEvaluator}.ts`) queda excluido de cobertura hasta que se borre.

## 4. Regresiones obligatorias (de la auditoría)

Cada ID de `docs/planning/audit-2026-09.md` marcado para una historia debe tener un test nombrado con su ID, por ejemplo:
`it('[ENG-04] Envido + Real envido querido vale 5', …)`. El revisor (Claude) verifica que existan con
`grep -rn "\[ENG-" src e2e`.

## 5. `data-testid` (contrato UI ↔ E2E)

- Menú: `menu`, `player-count-2|4|6`, `difficulty-easy|normal|hard`, `rule-flor`, `rule-picapica`, `start-game`
- Marcador: `scoreboard`, `score-team-0`, `score-team-1`
- Asientos: `seat-{playerId}` con `data-active`, `data-team`, `data-dealer`, `data-mano`
- Mano propia: `hand-card-{cardId}` (botón; `disabled` si no es legal jugarla)
- Mesa: `played-card-{playerId}-{trickIndex}`
- Acciones: `action-envido`, `action-real-envido`, `action-falta-envido`, `action-truco` (texto cambia a Retruco/Vale cuatro), `action-mazo`
- Panel de respuesta: `response-panel` con `data-kind="truco|envido|flor"`, `response-quiero`, `response-no-quiero`,
  `response-raise-truco`, `response-raise-envido-E|R|F`, `response-envido-primero-E|R|F`, `response-flor-achico|contraflor|contraflor-al-resto`
- Avisos: `toast` (con `data-kind`)
- Fin de mano: `hand-summary`, `next-hand`
- Fin de partida: `game-over`, `game-over-winner`, `game-over-history`, `new-game`
- Raíz: `app-root` con `data-phase` y `data-busy="true|false"` (busy mientras hay una decisión de IA programada)

## 6. Hooks de test (solo con `?test=1` o en DEV)

- `?seed=N` semilla de la partida · `?fast=1` delays de IA en 0 · `?aiDelay=min,max` · `?autoAck=1` pasa solo el resumen de mano
- `?scores=a,b` puntaje inicial · `?dealer=K` repartidor inicial · `?flor=1` · `?picapica=0|1`
- `window.__truco = { getState(), getLegalActions(playerId), getEvents(), waitForIdle(): Promise<void> }`
  (`waitForIdle` resuelve cuando no hay decisiones de IA programadas y le toca al humano o la partida terminó)

## 7. Escenarios E2E mínimos (historia 4-1)

1. Arrancar 2p, 4p y 6p desde el menú: asientos, equipos, repartidor/mano correctos.
2. Partida completa a 30 (seed fijo, política "primera acción legal" para el humano) y **nueva partida** jugada hasta el final.
3. Envido: cantar, querer, no querer, subir a real y a falta; puntos mostrados correctos.
4. Truco: cantar, subir, aceptar y rechazar; no querido termina la mano y no se aceptan más cartas.
5. Con canto pendiente, las cartas están deshabilitadas; indicador de turno coincide con `getActor`.
6. El envido está primero y después el truco sigue pendiente.
7. Irse al mazo con y sin truco.
8. 6p pica-pica: las 3 submanos se completan (seed que active pica-pica vía `?scores=10,10`).
9. Fin de partida por envido, por truco y por baza: un solo panel de fin, sin avisos ni jugadas posteriores.
10. Flor activada: flor única y contraflor.
11. Visual: capturas 1280×800 y 390×844 de 6p en juego y de fin de partida con historial largo, sin elementos cortados (chequeo de bounding boxes dentro del viewport).
12. Teclado: jugar una mano completa solo con Tab/Enter.

## 7b. Gates del flujo `wf` (por tarea)

`@alcance` → `tipos` (`npx --no-install tsc --noEmit`) → `lint` (desde 0-1) → `tests` (`npm test --silent`) → `build` → `@arranque` (vite preview, GET `/`).
Desde la historia 4-1 se suma `e2e` (`npm run e2e`).

## 8. CI (GitHub Actions, `.github/workflows/ci.yml`)

En cada push y PR: `npm ci` → `npm run typecheck` → `npm run lint` → `npm run test:coverage` → `npm run build` → (desde 4-1) `npm run e2e`.
Node 20. Vercel deploya `main` automáticamente; `main` solo recibe merges con CI en verde y auditoría aprobada.
