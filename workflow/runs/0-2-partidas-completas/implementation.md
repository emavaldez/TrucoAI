# Implementación: Test de partidas completas 2/4/6 (gate partidas)

- ID: `0-2-partidas-completas` · Ciclo: **1** (corrección de la auditoría)
- Worker: Hermes headless (perfil `trucoai`, modelo `deepseek-v4-flash`)
- Rama: `task/0-2-partidas-completas` · Worktree: `/Users/emmanuelvaldez/GameDev/.worktrees/0-2-partidas-completas`
- Estado: implementado el ciclo 1, verificación en verde · pendiente auditoría del supervisor

## Resumen

Harness E2E con Playwright que juega **partidas completas** (2, 4 y 6 jugadores) contra la UI real servida por `vite preview`, con un bot de RNG propio y semilla.
Detecta trabas, marcador que baja, partidas demasiado cortas, fin de partida sin ganador, "Nuevo juego" que no reinicia y errores de página/consola.
Es el gate `partidas` de `wf` y el job `partidas` de CI. **No se tocó `src/`**: esta historia solo mide; los arreglos van en la 0-3.

Cómo funciona el test (ciclo 1):

- **Reloj congelado:** `page.clock.install({ time: <fija> })` + `page.clock.pauseAt(<fija>)` **antes** de `goto`, y el tiempo del juego avanza **solo** con
  `page.clock.runFor(400)` por paso. Con el reloj solo *instalado* (como estaba en el ciclo 0) `install()` seguía avanzando con el tiempo real: cuánto tiempo real pasa
  entre pasos depende de la máquina, los `setTimeout` de la IA se disparaban en otro orden y **la misma semilla daba otra partida en otra máquina** (auditoría).
- **Sin animaciones:** `page.emulateMedia({ reducedMotion: 'reduce' })` + `<style>` con `transition:none!important;animation:none!important`, para que la visibilidad de
  los botones no dependa del tiempo real.
- **Firma de partida** (`e2e/signature.ts`): FNV-1a de 32 bits de la secuencia (por paso: acción del bot o `-`, más el marcador). Cada test la imprime y adjunta;
  el test `determinismo 4p seed 7` juega la misma partida **dos veces** (dos páginas, misma worker) y exige la misma firma.
- **Partida válida:** ≥ 5 manos terminadas (`.hand-entry` del panel de fin). El bot **nunca** canta Falta Envido y ante una pendiente responde **no quiero**
  (una sola Falta Envido puede cerrar la partida en la 1ª mano y el test dejaba de ejercitar el juego).
- **Traba** = 75 pasos seguidos sin acción posible del bot **y** `snapshot()` idéntico → falla con jugadores, seed, paso, marcador, asiento con el turno y últimas 12
  acciones, y adjunta screenshot.
- **Determinismo del legacy:** el spec fija `Math.random` de la página con el seed del test (`installSeededRandom`); sin eso el `seed` del título no significaría nada.
- **Nueva partida (UI-01):** juega una partida, toca "Nuevo juego", vuelve a arrancar con la misma cantidad y exige marcador 0-0 + una mano jugable.

## Archivos modificados (ciclo 1)

- `e2e/partidas.spec.ts` — reloj congelado + sin animaciones; firma por test; `MIN_HANDS = 5`; test `determinismo 4p seed 7`; etiquetas por prefijo
  (`partida:6:* → @conocido-UI-02`, `nueva:* → @conocido-UI-01`); `timeout` 240 s.
- `e2e/bot.ts` — nunca canta Falta Envido (filtra `falta-envido`) y ante una Falta Envido pendiente responde **no quiero** (`envidoRaised`).
- `e2e/signature.ts` (nuevo) — `fnv1a` + `MatchSignature` (firma y secuencia completa).
- `e2e/driver/legacy.ts` — `observe()`: una sola lectura del DOM por paso (acciones, marcador, fin, texto, asiento con turno, manos jugadas).
- `e2e/driver/types.ts` — `observe()` y `Observation` en el contrato `GameDriver`.
- `docs/stories/0-2-partidas-completas.md` — AC 3/4/5/7 actualizados, tareas, Dev Notes, Dev Agent Record (notas 12-19), evidencia, File List y Change Log del ciclo 1.

Sin cambios en el ciclo 1: `playwright.config.ts`, `package.json`/`package-lock.json`, `.github/workflows/ci.yml`, `workflow/config.json`,
`docs/planning/test-strategy.md`, `docs/project-context.md` (ya cumplían el alcance de la historia).

## Verificación ejecutada

### `wf verify -i 0-2-partidas-completas` — **VERIFICACIÓN EN VERDE**

```
OK    alcance         0.0s  @alcance
OK    tipos           0.8s  npx --no-install tsc --noEmit
OK    lint            0.8s  npm run lint --silent
OK    tests           1.9s  npm test --silent            → 17 files · 231 tests
OK    build           0.9s  npm run build --silent       → ✓ built in 114ms
OK    arranque        0.7s  @arranque                    → "200 /"
OK    partidas       29.1s  npm run test:partidas --silent → 7 passed (28.8s)

VERIFICACIÓN EN VERDE
Detalle: workflow/runs/0-2-partidas-completas/verify.json
head:   último commit de la rama de tarea (el que se registra con `wf record-impl`)
```

El gate `partidas` corre con los seeds por defecto (`1,2,3`): 6 partidas (2p y 4p × 3 seeds) + `determinismo 4p seed 7` = 7 tests, todos en verde, con las mismas
firmas que las corridas manuales de abajo:

```
[partida] 2p seed 1: 15-30 · firma 8cecd082      [partida] 4p seed 1: 24-30 · firma 94859c94
[partida] 2p seed 2: 13-30 · firma f7dd6a2b      [partida] 4p seed 2: 22-30 · firma bae7e12c
[partida] 2p seed 3: 14-30 · firma 14261841      [partida] 4p seed 3: 15-30 · firma a2e8fcbc
[determinismo] 4p seed 7: firma 1 = 060f523c · firma 2 = 060f523c
```

El gate `alcance` vio solo estos archivos (todos en `scope.allow` + `workflow/runs/<id>/`):

```
.github/workflows/ci.yml · docs/planning/test-strategy.md · docs/project-context.md · docs/stories/0-2-partidas-completas.md
e2e/bot.ts · e2e/driver/legacy.ts · e2e/driver/types.ts · e2e/partidas.spec.ts · e2e/signature.ts
package-lock.json · package.json · playwright.config.ts · workflow/config.json
workflow/runs/0-2-partidas-completas/{assignment,audit,implementation,state,verify}.*
```

### Comandos sueltos

```text
$ npm run typecheck                    # tsc --noEmit → sin salida (OK)
$ npm run lint                         # ✖ 85 problems (0 errors, 85 warnings) — warnings preexistentes de src/
$ npx eslint e2e playwright.config.ts  # sin salida, exit 0 (los archivos de e2e/ cumplen lint)
$ npm test                             # Test Files 17 passed (17) · Tests 231 passed (231) · 1.76s
$ npm run build                        # ✓ built (tsc + vite build)

$ PARTIDAS_SEEDS=1,2,3,4,5 npm run test:partidas        # 3 corridas seguidas, firmas idénticas
  11 passed (34.2s)   ← corrida 1
  11 passed (34.3s)   ← corrida 2
  11 passed (34.7s)   ← corrida 3

[partida] 2p seed 1: 15-30 en 277 pasos (111s de reloj de juego) · 24 manos · firma 8cecd082
[partida] 2p seed 2: 13-30 en 221 pasos  (88s de reloj de juego) · 27 manos · firma f7dd6a2b
[partida] 2p seed 3: 14-30 en 232 pasos  (93s de reloj de juego) · 28 manos · firma 14261841
[partida] 2p seed 4: 16-30 en 307 pasos (123s de reloj de juego) · 30 manos · firma e83ada44
[partida] 2p seed 5: 16-30 en 251 pasos (100s de reloj de juego) · 29 manos · firma 9fad1cd3
[partida] 4p seed 1: 24-30 en 403 pasos (161s de reloj de juego) · 29 manos · firma 94859c94
[partida] 4p seed 2: 22-30 en 484 pasos (194s de reloj de juego) · 33 manos · firma bae7e12c
[partida] 4p seed 3: 15-30 en 436 pasos (174s de reloj de juego) · 24 manos · firma a2e8fcbc
[partida] 4p seed 4:  4-30 en 280 pasos (112s de reloj de juego) · 18 manos · firma 03d51ded
[partida] 4p seed 5:  9-30 en 357 pasos (143s de reloj de juego) · 22 manos · firma 0bcda204
[determinismo] 4p seed 7: firma 1 = 060f523c (517 pasos, 29 manos)
[determinismo] 4p seed 7: firma 2 = 060f523c (517 pasos, 29 manos)
```

**Determinismo entre corridas:** las 10 firmas de partida son idénticas en las 3 corridas (`diff` de las firmas ordenadas: sin diferencias) y el test de determinismo
da `060f523c` en sus dos corridas internas, en las 3 corridas. Antes del ciclo 1 la misma semilla daba partidas distintas en Mac y en Linux (ver `audit.md`).

```text
$ PARTIDAS_SEEDS=1,2,3,4,5 npm run test:partidas:todo   # 19 tests (incluye los @conocido) → 8 failed · 11 passed (48.2s)
[nueva] 2p seed 1: 15-30 en 277 pasos · 24 manos · firma 8cecd082    (= `partida 2p seed 1`)
[nueva] 4p seed 1: 24-30 en 403 pasos · 29 manos · firma 94859c94    (= `partida 4p seed 1`)

  ✘ partida completa 6p seed 1 @conocido-UI-02  Error: TRABA: partida de 6p trabada (seed 1) en el paso 318
  ✘ partida completa 6p seed 2 @conocido-UI-02  Error: TRABA: partida de 6p trabada (seed 2) en el paso 283
  ✘ partida completa 6p seed 3 @conocido-UI-02  Error: TRABA: partida de 6p trabada (seed 3) en el paso 256
  ✘ partida completa 6p seed 4 @conocido-UI-02  Error: TRABA: partida de 6p trabada (seed 4) en el paso 242
  ✘ partida completa 6p seed 5 @conocido-UI-02  Error: TRABA: partida de 6p trabada (seed 5) en el paso 383
  ✘ nueva partida tras terminar 2p @conocido-UI-01  Error: … tras "Nuevo juego" no se puede jugar una mano (fin de partida en pantalla: true, turno player-1 (Jugador 2))
  ✘ nueva partida tras terminar 4p @conocido-UI-01  Error: … tras "Nuevo juego" no se puede jugar una mano (fin de partida en pantalla: true, turno player-3 (Contrario 2))
  ✘ nueva partida tras terminar 6p @conocido-UI-01  Error: TRABA: partida de 6p trabada (seed 1) en el paso 318  (falla dentro de la 1ª partida)
```

**Ninguna falla sin explicar:** las 8 fallas están etiquetadas y mapeadas a `audit.md` — `UI-02 / AI-04` (pica-pica: el turno queda en una IA que nunca juega) en las 5
partidas de 6p y `UI-01` ("Nuevo juego" no resetea) en las 3 "nueva partida". Evidencia adjunta en `test-results/partidas-…-conocido-UI-0{1,2}-chromium/`
(screenshot + `error-context.md` con el DOM trabado).

### Respuesta a los 6 cambios pedidos en `audit.md`

1. **Reloj congelado** ✅ `pauseAt` + `runFor` como único avance del tiempo; los ms reales que quedan (`CLICK_TIMEOUT` 800 ms, `WAIT_TIMEOUT` 15 s) son solo red de seguridad.
2. **Sin animaciones** ✅ `emulateMedia({ reducedMotion: 'reduce' })` + `<style>` con `transition/animation: none !important`.
3. **Firma de partida** ✅ `e2e/signature.ts`; firma impresa y adjunta por test; test `determinismo 4p seed 7` con firma idéntica. Firmas de las 10 partidas (seeds 1..5) arriba.
4. **Partidas que valgan como partidas** ✅ el bot no canta ni acepta Falta Envido; `MIN_HANDS = 5`; todas las partidas que terminan tienen ≥ 18 manos (ya no hay 9 pasos con 30-0).
5. **Etiquetas** ✅ todas las `partida completa 6p seed N` con `@conocido-UI-02`; 2p, 4p y determinismo sin etiqueta → `test:partidas` en verde.
6. **3 corridas con `PARTIDAS_SEEDS=1,2,3,4,5`** ✅ 11 passed cada una (34.2 / 34.3 / 34.7 s) con las mismas 10 firmas.

## Bloqueo del registro (`wf record-impl`) — requiere aprobación humana

`wf record-impl -i 0-2-partidas-completas` **falla**:

```
ERROR: No se registra implementación sin despacho aprobado.
```

Causa: el `state.json` que lee `wf` desde el worktree (la rama de tarea es la fuente de verdad durante el ciclo) tiene `dispatch.approved: false`. La auditoría del
ciclo 1 (`4cb6019`, `changes_requested`) resetea el despacho a `false` (`wf: cmd_record_audit`) y **falta la aprobación humana del ciclo** (`wf approve -g dispatch`,
gate de Emmanuel según el contrato de `AGENTS.md`). El `wf dispatch` de este ciclo pasó el chequeo porque leyó la copia del repo base (`GameDev/TrucoAI`), que quedó con
la aprobación del **ciclo 0** (`approved: true`, status `ready`); `wf record-impl` en cambio lee la copia del worktree, que es la que manda en el ciclo.

**El worker no puede destrabarlo:** aprobar el despacho es un gate humano y el contrato prohíbe que el worker apruebe su propio trabajo o toque los campos de aprobación
(por eso `state.json` quedó sin cambios de mi parte). Secuencia para destrabar, en el worktree:

```bash
cd /Users/emmanuelvaldez/GameDev/.worktrees/0-2-partidas-completas
git checkout -- workflow/runs/0-2-partidas-completas/state.json   # vuelve a status changes_requested (approve no acepta 'dispatched')
wf approve -g dispatch -i 0-2-partidas-completas --by "Emmanuel"  # gate humano
wf record-impl -i 0-2-partidas-completas                          # verify.json ya apunta al HEAD de la rama
git add workflow/runs/0-2-partidas-completas/{state,verify}.json && git commit -m "chore(wf): registrar implementación 0-2 ciclo 1"
```

Si la aprobación se commitea en la rama de tarea, el HEAD se mueve: hay que volver a correr `wf verify -i 0-2-partidas-completas` antes de `wf record-impl`
(29 s, sin cambios de código). Todo lo demás queda listo: implementación, evidencia y verificación en verde.

## Riesgos o desviaciones del alcance

1. **Alcance respetado.** Solo `e2e/*`, `docs/stories/0-2-partidas-completas.md` y `workflow/runs/0-2-partidas-completas/implementation.md`. **No se tocó `src/`**,
   no se hizo `push` ni merge, no se tocó `audit.md` ni los campos de aprobación del estado.
2. **Extra del ciclo 1 dentro del alcance:** `observe()` en el driver y `Observation` en `e2e/driver/types.ts`. Agrega un método obligatorio al contrato `GameDriver`:
   el futuro `e2e/driver/v2.ts` (3-2) tiene que implementarlo. Motivo: un solo `page.evaluate` por paso ⇒ menos tiempo real por paso (el tiempo real es justo lo que
   la auditoría señaló como fuente de divergencia).
3. **El determinismo depende de que la partida avance solo con `runFor`.** Si una historia futura introduce `requestAnimationFrame` o un temporizador fuera de
   `setTimeout`/`Date`/`performance.now`, el reloj falso podría no cubrirlo y la firma divergiría; el test `determinismo 4p seed 7` lo detectaría (falla) y habría que
   revisar el spec, no el juego.
4. **Firmas de los tests `@conocido`:** los 6p y las 3 "nueva partida" fallan antes del fin de partida, así que no producen firma. `nueva 2p` y `nueva 4p` sí firman
   (su primera partida completa) y coinciden con `partida 2p seed 1` / `partida 4p seed 1`: esa coincidencia es la verificación cruzada de que el reloj congelado
   hace reproducible la corrida.
5. **`_nota` de `workflow/config.json`:** sigue vigente (no había frase obsoleta que borrar); sin cambios en este ciclo.
6. **Costo del gate:** `npm ci` + build + ~34 s de tests (seeds 1..5 en la Mac, `workers: 3`); en CI, `npx playwright install --with-deps chromium`.
7. **Pendiente para la 0-3:** quitar las etiquetas `@conocido-UI-01` / `@conocido-UI-02` cuando esos bugs se arreglen; el gate las vuelve a exigir automáticamente.
   El pica-pica de 6 jugadores hoy **no se puede** ejercitar hasta que la 0-3 arregle [UI-02]/[AI-04]: las 5 semillas de CI se traban ahí.

## Corrección final (auditoría)

- Fecha: 2026-09-23 · Ejecutado por: Hermes (operador) a pedido del supervisor (Claude), sobre la rama ya rebasada sobre `main`.

**Cambio (1 línea, autorizado).** En `e2e/partidas.spec.ts`, el margen al pausar el reloj pasa de 1 s a 60 s:

```diff
- await page.clock.pauseAt(FROZEN_TIME + 1_000);
+ await page.clock.pauseAt(FROZEN_TIME + 60_000);
```

Motivo: con 4 navegadores en paralelo en máquinas lentas, 1 s no alcanzaba para que el reloj falso quedara instalado antes de que el juego empezara a avanzar.

**Firmas del paso 6.** 3 corridas de `PARTIDAS_SEEDS=1,2,3,4,5 npm run test:partidas` → `11 passed` las tres, con **firmas idénticas entre sí** (comparadas línea por línea) e **idénticas también a las de la corrida con margen `+ 1_000`**: el cambio solo afecta al reloj real, no a la simulación.

```
[partida] 2p seed 1: 15-30 en 277 pasos (111s de reloj de juego) · 24 manos · firma 8cecd082
[partida] 2p seed 2: 13-30 en 221 pasos (88s de reloj de juego) · 27 manos · firma f7dd6a2b
[partida] 2p seed 3: 14-30 en 232 pasos (93s de reloj de juego) · 28 manos · firma 14261841
[partida] 2p seed 5: 16-30 en 251 pasos (100s de reloj de juego) · 29 manos · firma 9fad1cd3
[partida] 2p seed 4: 16-30 en 307 pasos (123s de reloj de juego) · 30 manos · firma e83ada44
[partida] 4p seed 1: 24-30 en 403 pasos (161s de reloj de juego) · 29 manos · firma 94859c94
[partida] 4p seed 4: 4-30 en 280 pasos (112s de reloj de juego) · 18 manos · firma 03d51ded
[partida] 4p seed 3: 15-30 en 436 pasos (174s de reloj de juego) · 24 manos · firma a2e8fcbc
[partida] 4p seed 2: 22-30 en 484 pasos (194s de reloj de juego) · 33 manos · firma bae7e12c
[partida] 4p seed 5: 9-30 en 357 pasos (143s de reloj de juego) · 22 manos · firma 0bcda204
[determinismo] 4p seed 7: firma 1 = 060f523c (517 pasos, 29 manos)
[determinismo] 4p seed 7: firma 2 = 060f523c (517 pasos, 29 manos)
  11 passed (36.6s / 34.4s / 34.8s)
```
