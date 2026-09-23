# Historia 0-2: Test de partidas completas 2/4/6 (gate `partidas`)

Status: ready-for-dev
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
4. **Reloj acelerado:** el spec llama `page.clock.install()` **antes** de `goto` y avanza con `page.clock.runFor(400)` en cada paso,
   así una partida de 6 corre en segundos aunque la IA use `setTimeout` de 700 ms. (No se toca el código del juego para esto.)
5. **`e2e/partidas.spec.ts`:** un test por combinación `players ∈ {2,4,6}` × `seed ∈ PARTIDAS_SEEDS` (env, default `1,2,3`),
   con título `partida completa ${players}p seed ${seed}`. Cada test:
   - arranca desde el menú y juega hasta `isGameOver()` con máximo 4.000 pasos;
   - **traba** = 75 pasos seguidos (30 s de reloj de juego) sin acciones del bot y con `snapshot()` idéntico → falla con un mensaje que incluye
     jugadores, seed, paso, marcador, el asiento que tiene el marcador de turno si se puede leer, y las últimas 12 acciones; adjunta screenshot (`testInfo.attach`);
   - el marcador de cada equipo **nunca baja** entre pasos (`[ENG-01]`-style: si baja, falla con paso y valores);
   - al terminar: se muestra un ganador y algún equipo tiene ≥ 30 (o el ganador tiene el mayor puntaje si el legacy no llega exacto: documentarlo);
   - **0 errores de página:** `pageerror` y `console.error` fallan el test (la 404 del favicon ya no existe desde 0-1).
6. **Nueva partida:** test `nueva partida tras terminar ${players}p` para `players ∈ {2,4,6}` (seed 1): juega una partida completa, toca "Nuevo juego",
   vuelve a arrancar con la misma cantidad y verifica marcador 0–0 y que el bot puede jugar al menos una mano entera (hasta el siguiente `next-hand` o avance de marcador) **[UI-01]**.
7. **Fallas conocidas:** los tests que hoy fallan por bugs ya auditados se etiquetan en el título con `@conocido-<ID>` (p. ej. `partida completa 6p seed 1 @conocido-UI-02`,
   `nueva partida tras terminar 2p @conocido-UI-01`) **solo si fallan de verdad** con el código de `main` (verificarlo corriendo `npm run test:partidas:todo`
   y pegar la salida en el Dev Agent Record). Cualquier falla **no** explicada por un ID de la auditoría: detenete y reportala en `implementation.md` con seed y screenshot.
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

- [ ] `@playwright/test` + `playwright.config.ts` (AC 1)
- [ ] `e2e/driver/types.ts` + `e2e/driver/legacy.ts` (AC 2)
- [ ] `e2e/bot.ts` con RNG propio (AC 3)
- [ ] `e2e/partidas.spec.ts`: partidas completas, trabas, marcador, errores, nueva partida (AC 4, 5, 6)
- [ ] Correr `test:partidas:todo`, etiquetar solo las fallas conocidas reales (AC 7)
- [ ] Scripts, CI, gate `wf` y docs (AC 8, 9, 10)
- [ ] Medir tiempo (AC 11) y completar Dev Agent Record

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
### Debug Log References
### Completion Notes List
### File List

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada a pedido de Emmanuel (partida de 6 trabada en localhost).
