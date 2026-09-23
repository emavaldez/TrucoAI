# Historia 0-3: Hotfix del juego actual — partidas completas sin trabas

Status: review
wf-id: `0-3-hotfix-trabas-legacy` · kind: `default`
Depende de: 0-2 (mergeada: su gate `partidas` define "terminado")

## Historia

Como jugador del juego que hoy está publicado en Vercel,
quiero poder terminar una partida de 2, 4 y 6 jugadores y empezar otra,
para jugar ya mismo, sin esperar a que la v2 reemplace la UI (épica 3).

## Contexto y excepción al ADR-1

ADR-1 dice que el legacy no se parchea "salvo que bloquee algo". Una partida que se traba en producción bloquea: esta historia es la
**única excepción** y está acotada a trabas y a "Nuevo juego". **No** arregla reglas (envido, truco, puntajes): eso lo resuelve el motor v2.

Causa ya identificada por Claude para la traba de 6p **[UI-02] / [AI-04]**:
`GameEngine.startPicaPicaSubmano()` (`src/core/GameEngine.ts`) emite `round-start` pero **nunca** emite `ai-turn` cuando el primero de la
pareja de la submano es una IA. `startRound()` sí lo hace (bloque "If starter is AI, trigger AI turn"). Resultado: la submano 0 del pica-pica
arranca con turno de una IA que nadie despierta y la partida se congela (reproducido con marcador 6–16 y 5–6).

## Criterios de aceptación

1. **Pica-pica no se traba [UI-02][AI-04]:** al iniciar cada submano, si el que arranca es IA se dispara su turno (mismo mecanismo que `startRound`:
   evento `ai-turn`, respetando `_waitingForContinue`/`_pendingAiTurn` de `App.ts`). Las 3 submanos se juegan completas y la mano siguiente arranca.
   Si el humano no participa de una submano, esa submano se juega sola entre IAs.
2. **Nuevo juego limpio [UI-01][ENG-01]:** "Nuevo juego" (y volver a elegir cantidad desde el menú) arranca con marcador 0–0, `gameOver` en falso,
   truco/envido/bazas/pica-pica reseteados, y se puede jugar hasta el final otra vez.
3. **Sin timers huérfanos [UI-08], acotado:** al terminar la partida o al empezar una nueva, ningún `setTimeout` pendiente de la partida anterior
   ejecuta jugadas ni muestra avisos (guardar un id/versión de partida y descartar callbacks de otra versión es suficiente).
4. **Gate verde sin excepciones:** se quitan **todas** las etiquetas `@conocido-UI-01` / `@conocido-UI-02` / `@conocido-AI-04` de `e2e/partidas.spec.ts`.
   `npm run test:partidas` pasa con `PARTIDAS_SEEDS=1,2,3,4,5,6,7,8,9,10` (30 partidas + 3 nuevas partidas). Pegar la salida en el Dev Agent Record.
5. **Otras trabas:** si al correr esas semillas aparece otra traba o un `pageerror`, se arregla dentro de esta historia **solo si** el arreglo es local
   (≤ ~40 líneas y sin cambiar reglas) y se agrega su seed a un test con nombre descriptivo. Si no es local: **detenete** y documentalo en `implementation.md`
   con seed, marcador y screenshot (va al motor v2).
6. **Regresiones unitarias (vitest, legacy):** en `src/__tests__/`:
   - `[AI-04] pica-pica: al iniciar cada submano con una IA de mano se emite ai-turn` (6 jugadores, forzando marcador para que active pica-pica);
   - `[ENG-01] startGame después de una partida terminada deja el estado limpio`.
7. Los tests existentes siguen en verde; `typecheck`, `lint`, `test`, `build`, `test:partidas` en verde.

## Tareas

- [x] Emitir `ai-turn` al iniciar submanos de pica-pica con IA de mano (AC 1)
- [x] Reset completo en nuevo juego (AC 2)
- [x] Versión de partida para descartar timers viejos (AC 3)
- [~] 10 semillas por modo corridas en verde (AC 5); la quita de los `@conocido-*` queda pendiente **donde vive el spec**
  (`e2e/partidas.spec.ts` no existe en esta rama: el harness es de 0-2, sin mergear) (AC 4)
- [x] Tests unitarios de regresión (AC 6)
- [x] Completar Dev Agent Record

## Dev Notes

- Mirá `startRound()` en `GameEngine.ts` (bloque que emite `ai-turn` si el starter es IA) y replicalo en `startPicaPicaSubmano()`.
  Ojo con el orden: en `startRound` el `ai-turn` se emite **antes** de `round-start`; `App.ts` re-renderiza en `round-start`. Verificá que
  la IA no juegue dos veces (UI-06): si ves doble jugada, emití `ai-turn` después de `round-start` o protegé con la versión de partida del AC3.
- `App.handleNewGame` / `handleStartGame` → revisá que llamen a un reset real del motor; si `GameEngine.startGame` no resetea `gameOver`, `scores`,
  `truco`, `envido`, `roundResults`, `picaPica*`, `firstHandCompleted`, `history`, agregalo ahí.
- Tocá lo mínimo: este código se borra en la historia 3-5. Nada de refactors.
- Para el test unitario de pica-pica podés usar la API pública del motor legacy o, si no alcanza, `engine['campo']` **solo en el test** (el legacy ya lo usa).

### Alcance (wf `scope.allow`)
```json
["src/core/*", "src/App.ts", "src/ui/UIManager.ts", "src/__tests__/*", "e2e/*", "docs/stories/0-3-hotfix-trabas-legacy.md"]
```

### Verificación extra
```bash
npm run typecheck && npm run lint && npm test && npm run build
PARTIDAS_SEEDS=1,2,3,4,5,6,7,8,9,10 npm run test:partidas
```

### Referencias
- Auditoría UI-01, UI-02, UI-08, AI-04, ENG-01, ENG-14 · Historia 0-2 · `docs/planning/architecture.md` ADR-1

## Dev Agent Record

### Agent Model Used

Hermes Agent, perfil `trucoai` (worker headless) · modelo `deepseek-v4-flash` (provider custom).

### Debug Log References

- RED unitario (fix de `GameEngine.ts` en stash): `npx vitest run src/__tests__/GameEngine.picaPica.test.ts src/__tests__/GameEngine.newGame.test.ts`
  → `3 failed` (`expected [] to have a length of 1`, `expected [] to deeply equal [ '1:player-1', '2:player-2' ]`, `expected true to be false`).
- GREEN unitario (con el fix): `npm test` → `21 test files · 279 tests passed`.
- RED e2e (build sin el fix, servido en `127.0.0.1:4173`): `partida completa 6p seed 1` →
  `Error: TRABA: partida de 6p trabada (seed 1) en el paso 318` (screenshot y trace en `test-results/`).
- GREEN e2e (build de esta rama): ver `workflow/runs/0-3-hotfix-trabas-legacy/e2e-partidas-10-seeds.txt` (34/34, 1.3 m).

### Completion Notes List

- **AC 1 [UI-02][AI-04]:** `startPicaPicaSubmano()` ahora emite `ai-turn` (con `isPicaPica` y `picaPicaSubmano`) cuando el primero
  de la pareja activa es IA, con el mismo mecanismo y orden que `startRound()` (`ai-turn` antes de `round-start`). No hubo doble
  jugada en ninguna de las 30 partidas de la corrida de 10 semillas.
- **AC 2 [UI-01][ENG-01]:** `GameEngine.startGame()` resetea todo el estado de partida (`gameOver`, `currentRound`, `roundResults`,
  `currentTrick`(+`currentTrickNumber`), `picaPicaSubmano`, `picapicaResults`, `picaPicaActivePairIds`, `inPicaPicaHand`,
  `trickWinner*`, `roundWinnerTeam`, `firstTrickWinnerTeam`, `previousStarterId`, `currentTurnPlayerId`, `hands` y envido/truco).
  La causa raíz del "Nuevo juego" que no arrancaba era `gameOver` en `true`: `agregarPuntos()` devolvía 0 y la segunda partida
  no podía terminar.
- **AC 3 [UI-08]:** `App.ts` guarda `_gameVersion` (se incrementa al arrancar partida y en "Nuevo juego") y los **10** `setTimeout`
  de la clase capturan la versión al agendarse y la descartan si ya no es la actual; `beginNewGameVersion()` además limpia
  `_waitingForContinue`, `_pendingAiTurn`, `_pendingEnvidoAction` y `_pendingTrucoAction`. `UIManager` no tiene timers.
- **AC 4/AC 5 [UI-02][UI-01]:** corrida completa del spec de partidas con `PARTIDAS_SEEDS=1..10` **sin** `--grep-invert @conocido`:
  30 partidas completas (2p/4p/6p) + 3 "nueva partida tras terminar" + `determinismo 4p seed 7`, todas en verde, sin `pageerror`
  ni trabas, y con la firma del determinismo idéntica (`060f523c`) entre corridas. No apareció ninguna otra traba que arreglar.
- **Desvío del alcance (AC 4 literal):** `e2e/partidas.spec.ts` **no existe** en esta rama: el harness de partidas vive en la rama
  `task/0-2-partidas-completas` (historia 0-2), que **no está mergeada** en `main` (worktree base `19a1712`). Por eso la quita de
  las etiquetas `@conocido-*` no se puede hacer acá y `npm run test:partidas` no existe en este worktree. La verificación se hizo
  con el spec de 0-2 (mismo código, sin filtro de etiquetas) contra el build de esta rama. Detalle en `implementation.md`.
- **AC 6:** tests de regresión en `src/__tests__/`, con los IDs de auditoría en el título: `[AI-04] pica-pica: al iniciar cada
  submano con una IA de mano se emite ai-turn` y `[ENG-01] startGame después de una partida terminada deja el estado limpio`
  (+ `pica-pica: las 3 submanos se juegan completas y la mano termina sin trabarse`).
- **AC 7:** `typecheck`, `lint` (0 errores), `test` (279) y `build` en verde; `wf verify` en verde sobre el commit registrado.
- Sin refactors ni cambios de reglas: no se tocó GDD, ranking de cartas, puntajes ni el motor nuevo (`src/engine/`).

### File List

- `src/core/GameEngine.ts` — `startPicaPicaSubmano()` emite `ai-turn`; `startGame()` resetea el estado de partida. (+36)
- `src/App.ts` — `_gameVersion` + `beginNewGameVersion()`; guardas de versión en los 10 `setTimeout`; reset al arrancar partida y en "Nuevo juego". (+59/−7)
- `src/__tests__/GameEngine.picaPica.test.ts` — nuevo: `[AI-04]` y la mano completa de pica-pica.
- `src/__tests__/GameEngine.newGame.test.ts` — nuevo: `[ENG-01]`.
- `docs/stories/0-3-hotfix-trabas-legacy.md` — Dev Agent Record y `Status: review`.
- `workflow/runs/0-3-hotfix-trabas-legacy/implementation.md` — evidencia de la implementación.
- `workflow/runs/0-3-hotfix-trabas-legacy/e2e-partidas-10-seeds.txt` — salida cruda de la corrida e2e (34/34).

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada a pedido de Emmanuel (partida de 6 trabada en localhost).
- 2026-09-23 · Hermes `trucoai` (Dev) · Hotfix implementado y verificado: pica-pica con IA de mano, reset de partida nueva y timers huérfanos.
