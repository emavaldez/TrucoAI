# Auditoría: Hotfix del juego actual — partidas completas sin trabas

- ID: `0-3-hotfix-trabas-legacy` · Auditor: Claude (supervisor) · Fecha: 2026-09-23
- Dictamen: **APROBADA con una condición de integración** (ver abajo)

## Verificación independiente (checkout limpio de `8841569`, `npm ci`, Linux)

typecheck 0 · lint 0 errores · **279/279 tests** (incluye `[AI-04]` pica-pica y `[ENG-01]` reset) · alcance: `src/core/GameEngine.ts`, `src/App.ts`, `src/__tests__/*`, historia y `workflow/runs/0-3-*`.
Partidas: Claude armó el build de esta rama con el harness de 0-2 (`8f109dd`) y corrió en Linux las de 6 jugadores y "nueva partida" (resultado en la sección final).

## Revisión del diff

- `startPicaPicaSubmano()` emite `ai-turn` cuando arranca una IA, igual que `startRound()` [UI-02][AI-04]. Mínimo y correcto. ✔
- `startGame()` resetea todo el estado de partida (gameOver, bazas, pica-pica, truco/envido, turnos) [ENG-01][UI-01]. ✔
- `App.ts`: `_gameVersion` capturada en los 10 `setTimeout` y `beginNewGameVersion()` al arrancar y al volver al menú [UI-08]. No cambia delays ni reglas. ✔
- Sin refactors ni cambios de reglas: respeta la excepción acotada al ADR-1. ✔

## Condición de integración (la aplica el operador, autorizada)

0-2 todavía no está en `main`, así que esta rama no trae `e2e/` ni el gate `partidas` y **no pudo cumplir el AC4** (quitar las etiquetas `@conocido-*`).
Orden de cierre: 1) mergear 0-2; 2) en 0-3 `git rebase main`; 3) quitar ` @conocido-UI-02` / ` @conocido-UI-01` de los títulos en `e2e/partidas.spec.ts`
(la función que los arma debe devolver `''`); 4) `PARTIDAS_SEEDS=1,2,3,4,5,6,7,8,9,10 npm run test:partidas` → 34 passed; 5) `wf verify` (ahora con el gate `partidas`) y merge.
`e2e/*` ya está en el `scope.allow` de 0-3.
