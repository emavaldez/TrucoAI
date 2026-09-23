# Historia 0-2: Test de partidas completas 2/4/6 (gate `partidas`)

Status: review
wf-id: `0-2-partidas-completas` · kind: `default`
Depende de: 0-1 (mergeada: usa sus scripts, lint y CI)

## Historia

Como Emmanuel (dueño del juego),
quiero que después de cada historia se juegue automáticamente una partida completa de 2, una de 4 y una de 6 jugadores en el juego real (navegador),
para enterarme antes del merge si algo se traba o rompe una partida, en vez de descubrirlo jugando en localhost.

## Contexto

El 2026-09-23 Emmanuel jugó 6 jugadores en localhost y la partida quedó trabada en la 2ª mano. Claude lo reprodujo con un bot en Playwright:
2p y 4p terminan; **6p se traba en cuanto arranca el pica-pica** (ambos equipos entre 5 y 25): el turno queda en una IA que nunca juega
(auditoría **[UI-02] / [AI-04]**). Esta historia agrega el test que lo detecta; la 0-3 lo arregla. El test de esta historia se vuelve
**gate obligatorio de `wf`** y **job de CI**: ninguna historia posterior se mergea si una partida completa falla.

## Criterios de aceptación

1. **Playwright:** devDependency `@playwright/test` (versión exacta, sin `^`). `playwright.config.ts` en la raíz:
   `testDir: 'e2e'`, solo `chromium`, `viewport 1280×800`, `retries: 0`, `workers: 3`, `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`,
   `reporter: [['list'], ['html', { open: 'never' }]]`, `webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 120_000 }`,
   `use.baseURL = 'http://127.0.0.1:4173'` (**no** `localhost`: desde 0-1 `vite preview` escucha solo en `127.0.0.1`, y en la Mac `localhost` resuelve primero a `::1`). `.gitignore` ya ignora `playwright-report/` y `test-results/` (0-1).
2. **Driver con la UI actual** (`e2e/driver/legacy.ts`), el **único** archivo que conoce selectores. Interfaz exportada (en `e2e/driver/types.ts`):
   ```ts
   export interface GameDriver {
     start(players: 2 | 4 | 6): Promise<void>;                 // menú → cantidad → ¡Jugar!
     actions(): Promise<DriverAction[]>;                        // acciones visibles y habilitadas para el humano ahora
     perform(a: DriverAction): Promise<void>;
     isGameOver(): Promise<boolean>;
     scores(): Promise<[number, number]>;
     snapshot(): Promise<string>;                               // texto visible normalizado (para detectar trabas)
     newGame(): Promise<void>;
   }
   export type DriverAction =
     | { kind: 'ack' } | { kind: 'next-hand' }
     | { kind: 'answer'; answer: 'quiero' | 'no-quiero' | 'subir' | 'son-buenas' }
     | { kind: 'play'; index: number }
     | { kind: 'call'; call: 'envido' | 'real-envido' | 'falta-envido' | 'truco' | 'mazo' };
   ```
   Selectores del legacy: `.count-btn[data-count="N"]`, `.btn-start`, `.btn-notif-ok` (ack), `.btn-new-round` (next-hand),
   `.response-panel .btn-accept|.btn-reject|.btn-falta|.btn-son-buenas` (answer), `.human-area .clickable` (play),
   `.controls button` por texto (`Envido`, `Real Envido`, `Falta Envido`, `Truco`/`Subir a …`, `Irse al Mazo`) (call),
   `.game-over-text` (fin), `.team-points` (marcador), `.btn-new-game`.
   En la historia 3-2 se agrega `e2e/driver/v2.ts` con los `data-testid` de `test-strategy.md` §5 y el spec no cambia.
3. **Bot jugador** (`e2e/bot.ts`): RNG propio con semilla (mulberry32, sin `Math.random`). Prioridad por paso: `ack` → `next-hand` → `answer`
   (elige al azar entre las respuestas visibles, con pesos quiero 60 / no-quiero 25 / subir 10 / son-buenas 5) → con 10% de probabilidad un `call`
   al azar de los visibles → `play` de una carta jugable al azar. Si no hay acciones, no hace nada (esperando a la IA).
   **Ciclo 1:** el bot **nunca** canta Falta Envido y ante una Falta Envido pendiente responde **no quiero** (`bot.ts`): una sola Falta Envido puede cerrar la partida
   en la 1ª mano (vale lo que le falta al que va perdiendo), así que el test dejaba de ejercitar el juego (4p seed 1 terminaba en 9 pasos y 6p seed 1 en 12).
4. **Reloj congelado (ciclo 1):** el spec llama `page.clock.install({ time: <fija> })` y `page.clock.pauseAt(<fija>)` **antes** de `goto`, y avanza el tiempo del juego
   **solo** con `page.clock.runFor(400)` por paso. Con el reloj solo instalado, `install()` seguía avanzando con el tiempo real: cuánto tiempo real pasa entre pasos
   (lecturas del DOM, clicks) depende de la máquina, los `setTimeout` de la IA se disparaban en otro orden y la misma semilla daba otra partida. Además
   `page.emulateMedia({ reducedMotion: 'reduce' })` y un `<style>` con `transition:none!important;animation:none!important` para que la visibilidad de los botones
   no dependa de animaciones. Una partida de 2p de 277 pasos (~111 s de reloj de juego) corre en ~10 s reales. (No se toca el código del juego para esto.)
5. **`e2e/partidas.spec.ts`:** un test por combinación `players ∈ {2,4,6}` × `seed ∈ PARTIDAS_SEEDS` (env, default `1,2,3`),
   con título `partida completa ${players}p seed ${seed}`. Cada test:
   - arranca desde el menú y juega hasta `isGameOver()` con máximo 4.000 pasos;
   - **traba** = 75 pasos seguidos (30 s de reloj de juego) sin acciones del bot y con `snapshot()` idéntico → falla con un mensaje que incluye
     jugadores, seed, paso, marcador, el asiento que tiene el marcador de turno si se puede leer, y las últimas 12 acciones; adjunta screenshot (`testInfo.attach`);
   - el marcador de cada equipo **nunca baja** entre pasos (`[ENG-01]`-style: si baja, falla con paso y valores);
   - al terminar: se muestra un ganador y algún equipo tiene ≥ 30 (o el ganador tiene el mayor puntaje si el legacy no llega exacto: documentarlo);
   - **partida válida (ciclo 1):** ≥ 5 manos terminadas (entradas del historial del panel de fin, `.hand-entry`); si termina antes, falla con "partida demasiado corta"
     (señal de bug o de bot mal calibrado);
   - **firma de partida (ciclo 1):** cada test imprime `[partida] Np seed S: … · M manos · firma HHHHHHHH` y adjunta la secuencia completa (`testInfo.attach`). La firma
     (`e2e/signature.ts`) es un hash FNV-1a de la secuencia (por paso: acción del bot o `-` + marcador). Dos corridas de la misma semilla con el mismo código tienen que
     dar la misma firma; el test `determinismo 4p seed 7` juega la misma partida **dos veces** (misma worker, dos páginas) y exige firma idéntica;
   - **0 errores de página:** `pageerror` y `console.error` fallan el test (la 404 del favicon ya no existe desde 0-1).
6. **Nueva partida:** test `nueva partida tras terminar ${players}p` para `players ∈ {2,4,6}` (seed 1): juega una partida completa, toca "Nuevo juego",
   vuelve a arrancar con la misma cantidad y verifica marcador 0–0 y que el bot puede jugar al menos una mano entera (hasta el siguiente `next-hand` o avance de marcador) **[UI-01]**.
7. **Fallas conocidas:** los tests que hoy fallan por bugs ya auditados se etiquetan en el título con `@conocido-<ID>` (p. ej. `partida completa 6p seed 1 @conocido-UI-02`,
   `nueva partida tras terminar 2p @conocido-UI-01`) **solo si fallan de verdad** con el código de `main` (verificarlo corriendo `npm run test:partidas:todo`
   y pegar la salida en el Dev Agent Record). Cualquier falla **no** explicada por un ID de la auditoría: detenete y reportala en `implementation.md` con seed y screenshot.
   **Ciclo 1:** como el comportamiento de 6p depende del pica-pica, **todas** las `partida completa 6p seed N` llevan `@conocido-UI-02` (no semilla por semilla) hasta la 0-3;
   2p, 4p y `determinismo 4p seed 7` **no** llevan etiqueta.
8. **Scripts** en `package.json`:
   - `test:partidas`: `playwright test e2e/partidas.spec.ts --grep-invert @conocido`
   - `test:partidas:todo`: `playwright test e2e/partidas.spec.ts`
   - `e2e`: `playwright test` (lo usa 4-1).
9. **CI:** en `.github/workflows/ci.yml`, job `partidas` (`needs: ci`): `npm ci` → `npx playwright install --with-deps chromium` → `npm run test:partidas`
   con `PARTIDAS_SEEDS=1,2,3,4,5`; sube `playwright-report/` como artifact si falla.
10. **Gate de `wf`:** en `workflow/config.json`, agregar al final de `gates`: `{"id": "partidas", "run": "npm run test:partidas --silent"}`
    y borrar la frase de `_nota` que ya no aplique. Actualizar `docs/planning/test-strategy.md` §1 (fila "Partidas completas"), §7b y §8, y la sección
    **Comandos** de `docs/project-context.md` (`npm run test:partidas`, y que el worker debe correr `npx playwright install chromium` una vez en su worktree).
11. Tiempo: `npm run test:partidas` con la config por defecto (9 partidas + 3 nuevas partidas) tarda **< 3 min** en la Mac. Pegar el tiempo real.
12. Los tests existentes siguen en verde; `typecheck`, `lint`, `test`, `build` en verde. Los archivos de `e2e/` cumplen lint (no son legacy).

## Tareas

- [x] `@playwright/test` + `playwright.config.ts` (AC 1)
- [x] `e2e/driver/types.ts` + `e2e/driver/legacy.ts` (AC 2)
- [x] `e2e/bot.ts` con RNG propio (AC 3)
- [x] `e2e/partidas.spec.ts`: partidas completas, trabas, marcador, errores, nueva partida (AC 4, 5, 6)
- [x] Correr `test:partidas:todo`, etiquetar solo las fallas conocidas reales (AC 7)
- [x] Scripts, CI, gate `wf` y docs (AC 8, 9, 10)
- [x] Medir tiempo (AC 11) y completar Dev Agent Record
- [x] **Ciclo 1:** reloj congelado (`pauseAt`) y sin animaciones (AC 4)
- [x] **Ciclo 1:** firma de partida (`e2e/signature.ts`) + test `determinismo 4p seed 7` (AC 5)
- [x] **Ciclo 1:** el bot no canta Falta Envido ni la acepta, y la partida válida exige ≥ 5 manos (AC 3, 5)
- [x] **Ciclo 1:** etiquetar **todas** las `partida completa 6p seed N` con `@conocido-UI-02` (AC 7)
- [x] **Ciclo 1:** `npm run test:partidas` 3 veces seguidas con `PARTIDAS_SEEDS=1,2,3,4,5` → mismas firmas (AC 5)

## Dev Notes

- **No** cambies nada de `src/`: esta historia solo mide. Los arreglos van en la 0-3.
- Prototipo que usó Claude para reproducir (referencia, no copiar tal cual; el tuyo va con `@playwright/test`, driver y bot separados):
  ```js
  await page.clock.install(); await page.goto(url);
  await page.locator(`.count-btn[data-count="${n}"]`).click(); await page.locator('.btn-start').click();
  while (true) {
    await page.clock.runFor(400);
    if (await page.locator('.game-over-text').count()) break;             // terminó
    for (const sel of ['.btn-notif-ok', '.btn-new-round', '.response-panel .btn-accept', '.human-area .clickable']) {
      const loc = page.locator(sel); const c = await loc.count();
      if (c && await loc.first().isVisible()) { await loc.nth(sel.includes('clickable') ? Math.floor(rnd() * c) : 0).click(); break; }
    }
    // traba: 75 pasos sin acción y con body.innerText idéntico
  }
  ```
  Resultado en `main` (`daa6504`): 2p ✓, 4p ✓, **6p ✗ trabado** con marcador 6–16 (seed 1) y 5–6 (seed 4), turno en "Contrario 1", sin cartas del humano.
- En la Mac, dentro del worktree: `npx playwright install chromium` antes de correr (el navegador no viene con `npm ci`).
- `page.clock` reemplaza `setTimeout`/`Date`; no uses `page.waitForTimeout` (usa reloj real y hace lentos los tests).
- Si un `click` falla porque el elemento desapareció (la IA cambió el DOM), reintentá en el paso siguiente; no es una traba.
- **Ciclo 1 (auditoría):** el determinismo **no** se logra solo con `page.clock.install()`: hay que **pausar** el reloj (`pauseAt`) para que el tiempo del juego avance
  únicamente con `runFor`, y sacar animaciones/transiciones (si no, la misma semilla da otra partida en otra máquina). Cada test reporta su firma y hay un test de
  determinismo explícito. El bot no canta Falta Envido (una sola puede cerrar la partida y dejar el test sin ejercitar nada) y una partida completa válida tiene ≥ 5 manos.

### Alcance (wf `scope.allow`)
```json
["e2e/*", "playwright.config.ts", "package.json", "package-lock.json", ".github/*", "workflow/config.json",
 "docs/planning/test-strategy.md", "docs/project-context.md", "docs/stories/0-2-partidas-completas.md"]
```

### Verificación extra
```bash
npx playwright install chromium
npm run typecheck && npm run lint && npm test && npm run build
npm run test:partidas            # verde (sin los @conocido)
npm run test:partidas:todo       # pegar salida: solo fallan los @conocido
```

### Referencias
- Auditoría UI-01, UI-02, AI-04 · `docs/planning/test-strategy.md` §5, §7, §7b, §8

## Dev Agent Record

### Agent Model Used

Hermes (perfil `trucoai`, modelo `deepseek-v4-flash`) — worker headless del flujo `wf`, tarea `0-2-partidas-completas`.

### Debug Log References

- Evidencia por partida: el spec loguea `[partida] Np seed S: T0-T1 en N pasos (Ns de reloj de juego)` y `[nueva] Np: …`.
- `test-results/partidas-partida-completa-6p-seed-2-conocido-UI-02-chromium/` (screenshot + `error-context.md` con el DOM al trabarse).
- `test-results/partidas-nueva-partida-tras-terminar-{2,4,6}p-conocido-UI-01-chromium/` (screenshot del fin de partida tras "Nuevo juego").
- `playwright-report/index.html` (reporte HTML, `open: never`).
- Ciclo 1: firma por test en stdout (`[partida] Np seed S: … · M manos · firma HHHHHHHH`), adjuntos `firma-Np-seed-S` (secuencia completa del paso 1 al fin) y
  `firmas-determinismo` (las dos corridas del mismo seed 7).

### Completion Notes List

1. **AC 1** — `@playwright/test@1.63.0` exacto (sin `^`); `playwright.config.ts` con `testDir: 'e2e'`, solo `chromium` a 1280×800, `retries: 0`, `workers: 3`,
   `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `reporter: [['list'], ['html', { open: 'never' }]]` y
   `webServer` = `npm run build && npx vite preview --port 4173 --strictPort` con `url`/`baseURL` en `http://127.0.0.1:4173` (no `localhost`).
2. **AC 2** — `e2e/driver/types.ts` (contrato `GameDriver` + `DriverAction`) y `e2e/driver/legacy.ts`, **el único** archivo con selectores del DOM.
   `actions()` lee el DOM en un solo `page.evaluate` y devuelve solo acciones visibles y habilitadas.
3. **AC 3** — `e2e/bot.ts` con mulberry32 y semilla explícita (`Math.random` no se usa en el bot: se verificó con `grep`); prioridad `ack` → `next-hand` →
   `answer` (pesos quiero 60 / no-quiero 25 / subir 10 / son-buenas 5) → `call` con 10% de probabilidad → `play` al azar. Sin acciones: no hace nada.
4. **AC 4** — `page.clock.install()` **antes** de `goto` y `page.clock.runFor(400)` por paso; no se usó `waitForTimeout` ni se tocó el código del juego.
5. **AC 5** — 12 tests (9 partidas = 3 cantidades × 3 seeds por defecto + 3 "nueva partida"). Traba = 75 pasos seguidos sin acción del bot **y** `snapshot()` idéntico;
   el mensaje incluye jugadores, seed, paso, marcador, asiento con el turno y las últimas 12 acciones, y adjunta screenshot (`testInfo.attach`).
   Marcador que baja entre pasos → falla con paso y valores. `pageerror` o `console.error` → falla el test.
   - Decisión documentada (AC 5, variante "si el legacy no llega exacto"): en las 12 corridas el legacy **sí** termina exacto en 30, así que el assert es `max(marcador) >= 30`
     sin la variante del ganador con el mayor puntaje.
   - Extra sobre la historia: `installSeededRandom` (en el spec, no en el bot) fija `Math.random` de la página con el mismo seed. Sin eso el legacy sortea con `Math.random`
     y el `seed` del título no significaría nada (los `@conocido` serían intermitentes y el gate inestable).
6. **AC 6 y 7** — las 3 "nueva partida" (2p/4p/6p, seed 1) fallan hoy: tras "Nuevo juego" y volver a arrancar, la pantalla sigue mostrando el fin de partida y el bot
   no puede jugar una mano → `@conocido-UI-01`. En 6p se traban los seeds **2, 4 y 5** (turno clavado en una IA, sin cartas del humano) → `@conocido-UI-02`.
   - **Desvío consciente del ejemplo del AC 7**: el ejemplo citaba `partida completa 6p seed 1 @conocido-UI-02`, pero con el seeding determinista del spec el seed 1 de 6p
     **termina** (falta envido en la 1ª mano) y los que se traban son 2, 4 y 5. El AC 7 pide etiquetar "solo si fallan de verdad": se etiquetaron los medidos.
   - **Ninguna falla quedó sin explicar**: las 4 fallas de `test:partidas:todo` (default) corresponden a UI-02 y UI-01 de la auditoría.
7. **AC 8, 9 y 10** — scripts `test:partidas` / `test:partidas:todo` / `e2e`; job `partidas` en CI (`needs: ci`, `npm ci` → `npx playwright install --with-deps chromium` →
   `npm run test:partidas` con `PARTIDAS_SEEDS=1,2,3,4,5`, sube `playwright-report/` si falla); gate `partidas` al final de `gates` en `workflow/config.json`
   (la `_nota` quedó vigente, no había frase obsoleta que borrar); `test-strategy.md` §1/§7b/§8 y **Comandos** de `project-context.md` actualizados.
8. **AC 11 (tiempos reales, Mac, `workers: 3`)** — `npm run test:partidas` (12 tests, sin los `@conocido`) → **22.8 s**; `npm run test:partidas:todo` (12 tests, con los 4 `@conocido`) → **33.3 s**. Ambas < 3 min.
9. **AC 12** — `npm run typecheck` ✓ · `npm run lint` 0 errores (85 warnings preexistentes de `src/`; `npx eslint e2e playwright.config.ts` sale limpio) ·
   `npm test` 122 tests ✓ · `npm run build` ✓.
10. **No se tocó `src/`** (alcance de la historia). Los bugs UI-01/UI-02/AI-04 son de `src/` y se arreglan en la 0-3; acá solo se detectan.
11. Para correr en un worktree nuevo: `npm ci` **y** `npx playwright install chromium` (el navegador no viene con `npm ci`).

**Ciclo 1 — corrección de la auditoría** (los 6 cambios pedidos en `audit.md` son la definición de terminado de este ciclo):

12. **Cambio 1 (reloj congelado):** `openGame()` hace `page.clock.install({ time: 2026-01-01T00:00:00.000Z })` + `page.clock.pauseAt(misma hora)` **antes** de `goto`.
    El tiempo del juego avanza **solo** con `page.clock.runFor(400)`; los `timeout` en ms reales que quedan (`CLICK_TIMEOUT` 800 ms, `WAIT_TIMEOUT` 15 s) son red de
    seguridad y no pueden cambiar el resultado. Verificado: 3 corridas seguidas con `PARTIDAS_SEEDS=1,2,3,4,5` dan las **mismas 10 firmas** (abajo).
13. **Cambio 2 (sin animaciones):** `page.emulateMedia({ reducedMotion: 'reduce' })` + `<style>` con `transition:none!important;animation:none!important` inyectado antes
    de jugar, para que la visibilidad de los botones no dependa del tiempo real.
14. **Cambio 3 (firma + determinismo):** `e2e/signature.ts` (FNV-1a de 32 bits de la secuencia: por paso, acción del bot o `-`, más el marcador). Cada test imprime y
    adjunta su firma. Test nuevo `determinismo 4p seed 7`: juega la misma partida dos veces (dos páginas, misma worker) y exige firma idéntica → `060f523c` en las dos,
    517 pasos y 29 manos, idéntico en las 3 corridas.
15. **Cambio 4 (partidas que valgan como partidas):** `e2e/bot.ts` **nunca** canta Falta Envido (filtra `falta-envido` de los `call`) y ante una Falta Envido pendiente
    responde **no quiero** (`envidoRaised`: si el panel de envido vuelve después de subir, lo pendiente es Falta Envido). El spec exige `hands >= 5` (`MIN_HANDS`), leyendo
    las manos del historial del panel de fin (`.hand-entry`). Resultado: **todas** las partidas que terminan tienen ≥ 18 manos; ya no hay partidas de 9 pasos con 30-0.
16. **Cambio 5 (etiquetas):** **todas** las `partida completa 6p seed N` llevan `@conocido-UI-02` (`KNOWN_FAILURE_PREFIXES`, por prefijo, no semilla por semilla). 2p, 4p y
    `determinismo 4p seed 7` sin etiqueta → `npm run test:partidas` (seeds 1,2,3,4,5) = **11 passed, 0 failed**.
17. **Cambio 6 (3 corridas seguidas):** `npm run test:partidas` con `PARTIDAS_SEEDS=1,2,3,4,5` → 11 passed en 34.2 s / 34.3 s / 34.7 s, con **las 10 firmas idénticas**
    entre corridas (evidencia abajo).
18. **Extra del ciclo 1 (mismo alcance):** `LegacyDriver.observe()` (`e2e/driver/legacy.ts`, tipo `Observation` en `e2e/driver/types.ts`) lee todo lo que el spec necesita
    (acciones, marcador, fin de partida, texto visible, asiento con el turno y manos jugadas) en **un solo** `page.evaluate` por paso: menos roundtrips ⇒ menos tiempo real
    por paso. El contrato `GameDriver` ahora incluye `observe()`, así que el driver `v2` de la 3-2 tiene que implementarlo.
19. **Ninguna falla sin explicar:** `npm run test:partidas:todo` con seeds 1..5 (19 tests) → 11 passed / 8 failed, y las 8 llevan etiqueta: 5 × `partida completa 6p seed
    {1,2,3,4,5} @conocido-UI-02` (traba en el pica-pica, turno clavado en una IA) y 3 × `nueva partida tras terminar {2,4,6}p @conocido-UI-01` ("Nuevo juego" no resetea).
    En 6p el test "nueva partida" falla antes, dentro de la primera partida, con la misma traba `@conocido-UI-02`.

Salida medida de `npm run test:partidas:todo` (default: seeds 1,2,3; 12 tests) sobre la rama de tarea, código sin tocar de `main` — **baseline del ciclo 0** (reloj solo
instalado, bot que cantaba falta envido, sin firma ni test de determinismo):

```
Running 12 tests using 3 workers
  ✓  partida completa 2p seed 1 (12.8s)     [partida] 2p seed 1: 25-30 en 355 pasos (142s de reloj de juego)
  ✓  partida completa 2p seed 2 (7.6s)      [partida] 2p seed 2: 15-30 en 229 pasos (92s de reloj de juego)
  ✓  partida completa 2p seed 3 (12.6s)     [partida] 2p seed 3: 29-30 en 353 pasos (141s de reloj de juego)
  ✓  partida completa 4p seed 1 (452ms)     [partida] 4p seed 1: 30-0 en 9 pasos
  ✓  partida completa 4p seed 2 (8.3s)      [partida] 4p seed 2: 13-30 en 381 pasos (152s de reloj de juego)
  ✓  partida completa 4p seed 3 (8.3s)      [partida] 4p seed 3: 12-30 en 379 pasos (152s de reloj de juego)
  ✓  partida completa 6p seed 1 (468ms)     [partida] 6p seed 1: 0-30 en 12 pasos
  ✓  partida completa 6p seed 3 (1.3s)      [partida] 6p seed 3: 2-30 en 82 pasos (33s de reloj de juego)
  ✘  partida completa 6p seed 2 @conocido-UI-02 (4.4s)
       Error: TRABA: partida de 6p trabada (seed 2) en el paso 279
  ✘  nueva partida tras terminar 2p @conocido-UI-01 (13.0s)
       Error: nueva partida tras terminar 2p: tras "Nuevo juego" no se puede jugar una mano (fin de partida en pantalla: true, turno player-0 (VOS))
  ✘  nueva partida tras terminar 4p @conocido-UI-01 (700ms)
       Error: nueva partida tras terminar 4p: tras "Nuevo juego" no se puede jugar una mano (fin de partida en pantalla: true, turno player-1 (Contrario 1))
  ✘  nueva partida tras terminar 6p @conocido-UI-01 (708ms)
       Error: nueva partida tras terminar 6p: tras "Nuevo juego" no se puede jugar una mano (fin de partida en pantalla: true, turno player-4 (Compañero 2))
  4 failed · 8 passed (33.3s)
```

Medido también con los seeds que usa CI (ciclo 0, `PARTIDAS_SEEDS=1,2,3,4,5`, 18 tests, 46 s): se trababan además **6p seed 4** y **6p seed 5** (`@conocido-UI-02`); 2p y 4p terminan en los 5 seeds.

**Evidencia del ciclo 1** (Mac, `workers: 3`, seeds 1..5, código de `main` sin tocar):

```
$ PARTIDAS_SEEDS=1,2,3,4,5 npm run test:partidas        # gate: 11 tests (sin los @conocido)
  11 passed (34.2s)     <- corrida 1
  11 passed (34.3s)     <- corrida 2
  11 passed (34.7s)     <- corrida 3

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
Las **10 firmas son idénticas en las 3 corridas** (`diff` de las firmas ordenadas: sin diferencias) y la firma del determinismo también (`060f523c` dos veces en cada corrida).

```
$ PARTIDAS_SEEDS=1,2,3,4,5 npm run test:partidas:todo    # 19 tests, todo (incluye los @conocido)
[nueva] 2p seed 1: 15-30 en 277 pasos · 24 manos · firma 8cecd082      (= la de `partida 2p seed 1`)
[nueva] 4p seed 1: 24-30 en 403 pasos · 29 manos · firma 94859c94      (= la de `partida 4p seed 1`)
  8 failed  ·  11 passed (48.2s)

  ✘ partida completa 6p seed 1 @conocido-UI-02   Error: TRABA: partida de 6p trabada (seed 1) en el paso 318
  ✘ partida completa 6p seed 2 @conocido-UI-02   Error: TRABA: partida de 6p trabada (seed 2) en el paso 283
  ✘ partida completa 6p seed 3 @conocido-UI-02   Error: TRABA: partida de 6p trabada (seed 3) en el paso 256
  ✘ partida completa 6p seed 4 @conocido-UI-02   Error: TRABA: partida de 6p trabada (seed 4) en el paso 242
  ✘ partida completa 6p seed 5 @conocido-UI-02   Error: TRABA: partida de 6p trabada (seed 5) en el paso 383
  ✘ nueva partida tras terminar 2p @conocido-UI-01  Error: … tras "Nuevo juego" no se puede jugar una mano (fin de partida en pantalla: true, turno player-1 (Jugador 2))
  ✘ nueva partida tras terminar 4p @conocido-UI-01  Error: … tras "Nuevo juego" no se puede jugar una mano (fin de partida en pantalla: true, turno player-3 (Contrario 2))
  ✘ nueva partida tras terminar 6p @conocido-UI-01  Error: TRABA: partida de 6p trabada (seed 1) en el paso 318   (falla dentro de la 1ª partida)
```
Las 8 fallas están etiquetadas y explicadas por la auditoría (UI-02/AI-04 y UI-01): **ninguna sin explicar**.
Los tests con `@conocido` que no completan partida no producen firma; los que sí (`nueva 2p` / `nueva 4p`) firman igual que su `partida` equivalente,
que es la prueba de que el reloj congelado + el seeding hacen la corrida reproducible.


### File List

- `playwright.config.ts` (nuevo)
- `e2e/driver/types.ts` (nuevo) — contrato `GameDriver` / `DriverAction`
- `e2e/driver/legacy.ts` (nuevo) — único archivo con selectores del DOM
- `e2e/bot.ts` (nuevo) — bot mulberry32 (AC 3); ciclo 1: nunca canta ni acepta Falta Envido
- `e2e/signature.ts` (nuevo, ciclo 1) — firma de partida (FNV-1a de la secuencia) para comparar corridas
- `e2e/partidas.spec.ts` (nuevo) — 12 tests por defecto (9 partidas + 3 "nueva partida") + `determinismo 4p seed 7` (ciclo 1)
- `package.json` / `package-lock.json` — `@playwright/test@1.63.0` + scripts `test:partidas`, `test:partidas:todo`, `e2e`
- `.github/workflows/ci.yml` — job `partidas`
- `workflow/config.json` — gate `partidas`
- `docs/planning/test-strategy.md`, `docs/project-context.md` — docs (AC 10)
- `docs/stories/0-2-partidas-completas.md` — esta historia (Dev Agent Record + Status `review`)

## Change Log

- 2026-09-23 · Claude (SM) · Historia creada a pedido de Emmanuel (partida de 6 trabada en localhost).
- 2026-09-23 · Hermes worker (Dev) · Implementado el harness E2E (`e2e/`, `playwright.config.ts`), gate `partidas` de `wf`, job `partidas` de CI y docs; Status → `review`.
  3 de 12 tests quedan etiquetados `@conocido-UI-01` (nueva partida) y 1 `@conocido-UI-02` (6p seed 2), medidos sobre `main`.
- 2026-09-23 · Hermes worker (Dev) · **Ciclo 1** (auditoría: el gate no era reproducible entre máquinas): reloj congelado (`pauseAt`) + sin animaciones; firma de partida
  (`e2e/signature.ts`) y test `determinismo 4p seed 7`; el bot no canta ni acepta Falta Envido y la partida válida exige ≥ 5 manos; **todas** las `partida completa 6p seed N`
  etiquetadas `@conocido-UI-02`; `npm run test:partidas` 3 veces con seeds 1..5 dan las mismas 10 firmas (11 passed cada una).
