# Auditoría: Test de partidas completas 2/4/6 (gate partidas)

- ID: `0-2-partidas-completas` · Auditor: Claude (supervisor) · Fecha: 2026-09-23
- Dictamen: **APROBADA** (tras ciclo 1 + corrección de una línea aplicada por el operador)

## Verificación independiente

- Checkout limpio (Linux, `npm ci`): typecheck 0 · lint 0 errores · 122 tests · build OK. Alcance OK (nada en `src/`).
- Partidas corridas por Claude en otra máquina (Linux, Chromium headless, `PARTIDAS_SEEDS=1,2,3`):
  | Test | Mac (worker) | Linux (Claude) |
  |---|---|---|
  | 2p seed 1 | 25-30, 355 pasos | **16-30, 218 pasos** |
  | 2p seed 2 | 15-30, 229 pasos | **30-16, 111 pasos** |
  | 4p seed 1 | 30-0, 9 pasos | **18-30, 310 pasos** |
  | 6p seed 1 | 0-30, 12 pasos | 0-30, 9 pasos |
  | 6p seed 3 (sin etiqueta) | ✓ 2-30 | **✘ TRABA paso 192** |
  **La misma semilla produce otra partida en otra máquina** → el gate no es reproducible y el job `partidas` del CI (runner Ubuntu, más lento) fallaría
  al azar en `main`.

## Causa

`page.clock.install()` sin pausar: el reloj falso **sigue avanzando con el tiempo real** además de `runFor(400)`. Cuánto tiempo real pasa entre pasos
(lecturas del DOM, clicks con `CLICK_TIMEOUT` de 800 ms reales) depende de la velocidad de la máquina, así que los `setTimeout` de la IA se disparan
en otro orden, el legacy consume `Math.random` (sembrado) en otro orden y la partida diverge.

## Cambios pedidos

1. **Reloj congelado:** después de `page.clock.install()` llamar `page.clock.pauseAt(...)` (o equivalente) para que el tiempo del juego avance **solo**
   con `runFor`. Ningún `timeout` en ms reales puede influir en el resultado (los que queden son solo red de seguridad).
2. **Sin animaciones:** `page.emulateMedia({ reducedMotion: 'reduce' })` + inyectar `*{transition:none!important;animation:none!important}` antes de jugar,
   para que la visibilidad de botones no dependa del tiempo real.
3. **Firma de partida:** cada test imprime y adjunta una firma = hash corto de la secuencia (acción del bot, marcador) de toda la partida.
   Nuevo test `determinismo 4p seed 7`: juega la misma partida **dos veces** en el mismo worker y exige firma idéntica. Pegar en `implementation.md`
   las firmas de los 12 tests (Claude las compara corriendo en Linux).
4. **Partidas que valgan como partidas:** hoy con algunas semillas termina todo en la 1ª mano por falta envido (4p seed 1: 9 pasos; 6p seed 1: 12 pasos)
   y no se ejercita nada. En `e2e/bot.ts`: el bot **nunca** canta falta envido y ante una falta envido responde **no quiero**. En el spec: una
   "partida completa" válida tiene **≥ 5 manos**; si termina antes, el test falla con "partida demasiado corta" (señal de bug o de bot mal calibrado).
5. **Etiquetas:** con el comportamiento de 6p dependiente del pica-pica, etiquetar **todas** las `partida completa 6p seed N` con `@conocido-UI-02`
   (no semilla por semilla) hasta la 0-3. 2p, 4p y el test de determinismo **no** llevan etiqueta.
6. Correr `npm run test:partidas` **3 veces seguidas** con `PARTIDAS_SEEDS=1,2,3,4,5` y pegar que las firmas son idénticas entre corridas.
   Después `wf verify` en verde + `wf record-impl`.

Alcance sin cambios (`e2e/*`, docs de la historia, `implementation.md`).

## Re-auditoría ciclo 1 (commit `816b432`)

Corrí `PARTIDAS_SEEDS=1,2,3,4,5 npm run test:partidas` en Linux (Chromium headless, máquina ~10× más lenta que la Mac):
**las 9 partidas que terminaron dieron exactamente las mismas firmas que en la Mac** (2p: 8cecd082, 14261841, e83ada44, 9fad1cd3;
4p: 94859c94, a2e8fcbc, 03d51ded, 0bcda204; determinismo 4p seed 7: 060f523c ×2). El determinismo entre máquinas quedó resuelto. ✔
Bot sin falta envido, ≥ 5 manos (18–33 manos por partida), 6p y "nueva partida" etiquetadas como conocidas. ✔

**Falla en máquina lenta (2 de 11):** `clock.pauseAt: Cannot fast-forward to the past` en `openGame` (`e2e/partidas.spec.ts:139`).
`clock.install({ time: FROZEN_TIME })` y enseguida `pauseAt(FROZEN_TIME)`: si entre las dos llamadas pasa ≥1 ms real, el instante ya quedó en el pasado.
En la Mac no se ve; en el runner de GitHub sí puede pasar.
**Corrección (autorizada por el supervisor, la aplica el operador):** `await page.clock.pauseAt(FROZEN_TIME + 1_000);`. Se verifica que las
firmas sigan idénticas entre 3 corridas en la Mac; Claude vuelve a correrlas en Linux después del merge.

## Re-verificación (commit `8f109dd`, 20:40 UTC)

Con `pauseAt(FROZEN_TIME + 1_000)` volvió a fallar 1 de 6 tests en Linux con 4 workers en paralelo (`Cannot fast-forward to the past`):
arrancar 4 Chromium a la vez en una máquina lenta puede tardar más de 1 s entre `install` y `pauseAt`.
**Corrección final (autorizada, la aplica el operador):** `pauseAt(FROZEN_TIME + 60_000)`. Antes de `goto` la página no tiene timers, así que
adelantar 60 s no ejecuta nada del juego y el instante sigue siendo fijo (determinista). Las firmas no cambian.
Con esa rama más el hotfix de 0-3, las 6p (seeds 1–2) y las 3 "nueva partida" terminan en Linux con firmas idénticas a la Mac (6p seed 1 `734ea70d`).
