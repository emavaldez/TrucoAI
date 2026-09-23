# Historia 0-3: Hotfix del juego actual — partidas completas sin trabas

Status: ready-for-dev
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

- [ ] Emitir `ai-turn` al iniciar submanos de pica-pica con IA de mano (AC 1)
- [ ] Reset completo en nuevo juego (AC 2)
- [ ] Versión de partida para descartar timers viejos (AC 3)
- [ ] Quitar `@conocido-*` y correr 10 semillas por modo (AC 4, 5)
- [ ] Tests unitarios de regresión (AC 6)
- [ ] Completar Dev Agent Record

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
### Debug Log References
### Completion Notes List
### File List

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada a pedido de Emmanuel (partida de 6 trabada en localhost).
