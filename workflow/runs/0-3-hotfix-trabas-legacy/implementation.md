# Implementación: Hotfix del juego actual: partidas completas sin trabas

- ID: `0-3-hotfix-trabas-legacy`
- Worker: Hermes headless (perfil `trucoai`) · modelo `deepseek-v4-flash`
- Estado: **implementado y verificado, con un desvío de alcance pendiente de decisión del supervisor** (ver "Riesgos o desviaciones")
- Commits: `74000ac` (engine), `807d9d3` (app), `3fd3917` (tests), `8b177d5` (docs)

## Resumen

Tres trabas del juego legacy, sin refactors y sin tocar reglas:

1. **Pica-pica de 6p congelado [UI-02][AI-04].** `GameEngine.startPicaPicaSubmano()` no emitía `ai-turn`
   (a diferencia de `startRound()`), así que la submano que arranca una IA quedaba esperando un turno que nadie
   despertaba. Ahora emite `ai-turn` (con `isPicaPica` y `picaPicaSubmano`) cuando el primero de la pareja activa
   es IA, **antes** de `round-start`, igual que `startRound()`. Las submanos sin humano se juegan solas entre IAs.
2. **"Nuevo juego" no arrancaba [UI-01][ENG-01].** `GameEngine.startGame()` no reseteaba `gameOver` (ni bazas,
   cantos ni pica-pica): la segunda partida arrancaba con `gameOver = true`, `agregarPuntos()` devolvía 0 y no había
   ganador posible. Ahora `startGame()` deja el estado de partida en cero (0-0, `gameOver` falso, truco/envido,
   bazas, pica-pica y `firstHandCompleted` reseteados).
3. **Timers huérfanos [UI-08].** `App.ts` guarda `_gameVersion`, que se incrementa al arrancar una partida y al
   volver al menú; los 10 `setTimeout` de la clase capturan la versión al agendarse y descartan su callback si ya no
   es la actual (ninguno juega cartas ni muestra avisos de la partida anterior). Al cambiar de versión además se
   limpian `_waitingForContinue`, `_pendingAiTurn`, `_pendingEnvidoAction` y `_pendingTrucoAction`.

## Archivos modificados

- `src/core/GameEngine.ts` — `startPicaPicaSubmano()` emite `ai-turn` con IA de mano (+15 líneas);
  `startGame()` resetea el estado de partida (+21 líneas). Sin cambios en reglas, puntajes ni ranking de cartas.
- `src/App.ts` — `_gameVersion` + `beginNewGameVersion()` (17 líneas), guardas de versión en los 10 `setTimeout`
  y llamada al reset en `startGame()` y `handleNewGame()` (+59/−7). Ningún timer cambió su delay ni su semántica.
- `src/__tests__/GameEngine.picaPica.test.ts` — nuevo. `[AI-04] pica-pica: al iniciar cada submano con una IA de mano
  se emite ai-turn` + `pica-pica: las 3 submanos se juegan completas y la mano termina sin trabarse` (6p, marcador
  forzado a 10-10 con `picaPicaHandAlternation = false` para activar la mano de pica-pica).
- `src/__tests__/GameEngine.newGame.test.ts` — nuevo. `[ENG-01] startGame después de una partida terminada deja el
  estado limpio` (baza jugada + truco/envido cantados + partida terminada → `startGame` → estado limpio y se puede
  volver a puntuar).
- `docs/stories/0-3-hotfix-trabas-legacy.md` — Dev Agent Record y `Status: review`.
- `workflow/runs/0-3-hotfix-trabas-legacy/e2e-partidas-10-seeds.txt` — salida cruda de la corrida e2e (34/34).
- `workflow/runs/0-3-hotfix-trabas-legacy/implementation.md` — este archivo.

## Verificación ejecutada

### Gates de `wf` (sobre el commit registrado)

```text
$ wf verify -i 0-3-hotfix-trabas-legacy
OK    alcance         0.0s  @alcance
OK    tipos           0.9s  npx --no-install tsc --noEmit
OK    lint            1.2s  npm run lint --silent
OK    tests           2.1s  npm test --silent
OK    build           1.1s  npm run build --silent
OK    arranque        0.7s  @arranque

VERIFICACIÓN EN VERDE
```

`npm test` → `Test Files 21 passed (21) · Tests 279 passed (279)`.
`npm run lint` → `0 errors, 82 warnings` (los warnings son preexistentes del legacy).
Nota: en este worktree el gate `partidas` **no existe** todavía — lo agrega la historia 0-2 a
`workflow/config.json`, y esa rama no está mergeada (ver desvío 1). Por eso las partidas se corrieron
a mano (abajo), tal como pide la "Verificación extra" de la historia.

### Partidas completas (RED → GREEN)

Con el fix revertido (`git stash push -- src/core/GameEngine.ts src/App.ts`) y el build servido en
`127.0.0.1:4173`, el harness e2e de 0-2 **detecta la traba**:

```text
$ PARTIDAS_SEEDS=1 npx playwright test e2e/partidas.spec.ts -g "partida completa 6p seed 1" --reporter=line
  1 failed
    › partida completa 6p seed 1 @conocido-UI-02
Error: TRABA: partida de 6p trabada (seed 1) en el paso 318
(screenshot: test-results/partidas-partida-completa-6p-seed-1-conocido-UI-02-chromium/test-failed-1.png)
```

Con el build de esta rama (los 4 commits aplicados), el mismo test pasa y la corrida completa de la
"Verificación extra" queda en verde:

```text
$ PARTIDAS_SEEDS=1,2,3,4,5,6,7,8,9,10 npx playwright test e2e/partidas.spec.ts --reporter=line
  34 passed (1.3m)
```

Las 34 pruebas son las 30 partidas (2p/4p/6p × 10 semillas) + las 3 "nueva partida tras terminar" +
`determinismo 4p seed 7`, corridas **sin** `--grep-invert @conocido` (o sea, incluyendo las etiquetadas
`@conocido-UI-02` y `@conocido-UI-01`, que son las que fallaban). Extracto de firmas (log completo en
`e2e-partidas-10-seeds.txt`):

```text
[partida] 2p seed 1: 15-30 en 277 pasos · 24 manos · firma 8cecd082
[partida] 4p seed 1: 24-30 en 403 pasos · 29 manos · firma 94859c94
[partida] 6p seed 1: 16-30 en 458 pasos · 26 manos · firma 734ea70d
[partida] 6p seed 6: 28-30 en 821 pasos · 29 manos · firma 32a9b30e
[partida] 6p seed 10: 16-30 en 645 pasos · 21 manos · firma 5199c0fe
[nueva] 2p seed 1: 15-30 en 277 pasos · 24 manos · firma 8cecd082
[nueva] 4p seed 1: 24-30 en 403 pasos · 29 manos · firma 94859c94
[nueva] 6p seed 1: 16-30 en 458 pasos · 26 manos · firma 734ea70d
[determinismo] 4p seed 7: firma 1 = 060f523c / firma 2 = 060f523c (517 pasos, 29 manos)
```

Ninguna partida se trabó, ninguna bajó el marcador, ninguna terminó antes de las 5 manos, no hubo
`pageerror` ni errores de consola, y las 10 semillas de 6p (que antes se congelaban **siempre**)
llegan a 30 puntos. **No apareció ninguna otra traba** que arreglar (AC 5).

### Detalle de la corrida

- Worktree 0-3 (`task/0-3-hotfix-trabas-legacy`) → `npm ci`, `npm run build`, `npx vite preview --port 4173`
  (sirve el `dist` de esta rama; verificado con el hash `assets/index-C8K1YJj9.js`).
- Playwright `1.63.0` tomado de `node_modules` del worktree 0-2 (no se agregó ninguna dependencia acá) y
  Chromium ya cacheado en `~/Library/Caches/ms-playwright`. `reuseExistingServer` del config de 0-2 hace que
  el spec corra contra el server de **esta** rama y no recompile el de 0-2.

## Riesgos o desviaciones del alcance

### 1. AC 4 literal (quitar las etiquetas `@conocido-*`) — BLOQUEADO, necesita decisión del supervisor

- La asignación dice "Depende de: 0-2 (mergeada…)". **0-2 no está mergeada**: `e2e/`, `playwright.config.ts`,
  `npm run test:partidas` y el gate `partidas` viven en la rama `task/0-2-partidas-completas` (tip `8f109dd`),
  cuyo `state.json` está en `audit.decision = changes_requested` (ciclo 1) sin implementación registrada.
  El worktree de esta tarea se creó desde `main` (`19a1712`), que no tiene ninguna de esas piezas.
- Por eso acá no existe `e2e/partidas.spec.ts` para quitarle las etiquetas, y `npm run test:partidas`
  no existe en este worktree.
- Tampoco se puede traer el harness: el gate `alcance` compara `merge-base(main, HEAD)..HEAD`
  (`wf_gates.py:42-73`) y la infra de 0-2 toca `package.json`, `package-lock.json`, `playwright.config.ts`,
  `.github/*` y `workflow/config.json`, todos **fuera** del `scope.allow` de esta historia → el gate fallaría.
- **Lo que sí hice**: correr el mismo spec de 0-2 (sin filtro de etiquetas) contra el build de esta rama.
  Queda en verde, así que la quita de las etiquetas es un cambio de 2 líneas en
  `KNOWN_FAILURE_PREFIXES` (`e2e/partidas.spec.ts:63-66`) que debe hacerse **donde vive el archivo**.
- **Decisión que pido** (no la tomo yo): (a) mergear 0-2 a `main` y volver a despachar 0-3 sobre esa base
  (rebase trivial: esta historia solo toca `src/`), o (b) autorizar que 0-2 haga la quita de etiquetas en su
  propia rama, dejando constancia de que 0-3 ya arregló la traba.
- **Cómo quedó registrado**: aunque AC 4 no se puede cerrar literalmente acá, los 6 gates de `wf`
  (`alcance`, `tipos`, `lint`, `tests`, `build`, `arranque`) están **en verde** y la implementación quedó
  registrada con `wf record-impl -i 0-3-hotfix-trabas-legacy` (`implementation.completed: true`,
  `audit.decision: pending` — la aprobación es del supervisor, no mía). El cierre de AC 4 y el dictamen de la
  auditoría quedan en manos del supervisor; el gate `partidas` que la historia da por existente recién aparece
  cuando 0-2 entre a `main`.

### 2. AC 3 (timers) sin test unitario

`App.ts` necesita DOM; el proyecto corre vitest en `environment: 'node'` y no tiene jsdom/happy-dom
(agregarlo sería una devDependency fuera del alcance). La versión de partida queda cubierta por los tests
e2e "nueva partida tras terminar 2p/4p/6p" (que pasan de extremo a extremo) y por la guarda explícita en cada
timer; no hay forma de aislarlo en un test unitario sin tocar dependencias.

### 3. Riesgos asumidos (chicos, localizados)

- `startPicaPicaSubmano()` emite `ai-turn` **antes** de `round-start` (igual que `startRound()`): si el
  `App` estuviera esperando un "Continuar", el evento se guarda en `_pendingAiTurn` y se ejecuta después, así que
  no hay doble jugada — verificado en las 30 partidas (firmas estables y marcador siempre subiendo).
- `_gameVersion` es solo de la instancia de `App` y no se persiste: es lo que pide el AC ("guardar un id/versión
  de partida y descartar callbacks de otra versión es suficiente").
- Todo esto se borra en la historia 3-5; no se agregó deuda nueva (0 dependencias, 0 refactors).

## Verificación final (auditoría)

- Fecha: 2026-09-23 · Ejecutado por: Hermes (operador) a pedido del supervisor (Claude), sobre la rama ya rebasada sobre `main` (que ya incluye el gate `partidas` de la 0-2).

**El cambio.** `e2e/partidas.spec.ts`: se vació la lista de fallas conocidas, así que las 10 semillas tienen que pasar de verdad (antes `['partida:6:','UI-02']` y `['nueva:','UI-01']` las etiquetaban `@conocido-…`, que es justamente lo que esta historia arregla).

```diff
-const KNOWN_FAILURE_PREFIXES: Array<[string, string]> = [
-  ['partida:6:', 'UI-02'],
-  ['nueva:', 'UI-01'],
-];
+const KNOWN_FAILURE_PREFIXES: Array<[string, string]> = []; // 0-3: sin fallas conocidas
```

**Evidencia.** `npm ci` (182 paquetes) + `npx playwright install chromium` OK · `npm run build` ✓ 10 módulos en 148ms · `PARTIDAS_SEEDS=1,2,3,4,5,6,7,8,9,10 npm run test:partidas:todo`:

```
  34 passed (1.5m)
```

**34 passed, 0 failed**: 2p/4p/6p seeds 1..10 + los 3 "nueva partida tras terminar" + determinismo 4p seed 7. Las 6p seeds 6 y 8 (las que se trababan con `UI-02`) ahora terminan:

```
[partida] 6p seed 1: … · firma 00eeb109     [partida] 6p seed 7: 6-30 en 503 pasos · 21 manos · firma 7296f4d7
[partida] 6p seed 5: … · firma e05c1d66     [partida] 6p seed 6: 28-30 en 821 pasos · 29 manos · firma 32a9b30e
[partida] 6p seed 8: 21-30 en 579 pasos · firma e2339a7e   [partida] 6p seed 9: 24-30 en 647 pasos · firma 6e9f1d76
[partida] 6p seed 10: 16-30 en 645 pasos · firma 5199c0fe
[determinismo] 4p seed 7: firma 1 = 060f523c (517 pasos, 29 manos) · firma 2 = 060f523c
```

Además, `[nueva] 2p seed 1` da firma `8cecd082`, idéntica a la de la 0-2: el fix de los timers no cambió la simulación, solo hizo que los callbacks viejos no ensucien la partida nueva. Con esto queda cerrado el único punto del AC que dependía del gate `partidas`.
