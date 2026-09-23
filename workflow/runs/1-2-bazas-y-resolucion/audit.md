# Auditoría: Motor v2 — bazas y resolución de la mano

- ID: `1-2-bazas-y-resolucion` · Auditor: Claude (supervisor) · Fecha: 2026-09-23
- Dictamen: **APROBADA**

## Verificación independiente (checkout limpio de `d3b8ef0`, `npm ci`, Linux)

typecheck 0 · `eslint src/engine` 0 · **231/231 tests** · `src/engine/**` 100% líneas / 97,5% ramas (umbral 90/85) · build OK.
Alcance: solo `src/engine/**`, la historia y `workflow/runs/1-2-*`.

## Revisión contra los AC

- AC1 `resolveTrick`: mayor `cardRank`; parda solo entre equipos distintos; mismo equipo → gana el primero que jugó la máxima. ✔
- AC2 `resolveHandWinner`: revisé los 15 renglones de la tabla a mano contra `winnerSoFar` (X-P, P-X, X-Y-P → el de la primera, P-P-P → mano) y el test recorre las 27 combinaciones [ENG-08]. ✔
- AC3 `nextLeader`: ganador o líder de la parda [ENG-07]. ✔
- AC4 `completeTrick`: registra `TrickResult` con `leaderId`, emite `TRICK_WON` después de actualizar el estado [ENG-16], cierra con `endHand` o abre la siguiente. ✔
- AC5/AC6 `scoring.ts` como único punto de cierre y de suma, tope a 30, `MATCH_OVER`; test que escanea que nadie más escribe `scores`. ✔
- AC7/AC8 escenarios con mazo fijo en 2 y 4 jugadores, encadenando 3 manos con rotación. ✔

## Observaciones (no bloqueantes, para 1-5)

1. Si la mano termina la partida, `endHand` no emite `HAND_OVER` (solo `MATCH_OVER`). Es coherente con "un solo panel de fin", queda como contrato: la 1-5 debe mantenerlo y la UI (3-1) no debe esperar `HAND_OVER` en ese caso.
2. `addPoints` no valida puntos negativos: la 1-5 agrega el test "los puntajes nunca bajan" en la simulación (invariante 6).
