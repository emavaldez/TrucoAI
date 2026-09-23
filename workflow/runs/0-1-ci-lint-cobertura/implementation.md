# Implementación: CI, lint y cobertura

- ID: `0-1-ci-lint-cobertura`
- Worker: Hermes headless (perfil `trucoai`) en `/Users/emmanuelvaldez/GameDev/.worktrees/0-1-ci-lint-cobertura`, rama `task/0-1-ci-lint-cobertura`
- Estado: implementado y verificado en verde (`wf verify`: los 5 gates OK sobre el último commit).
- Historia: `docs/stories/0-1-ci-lint-cobertura.md` (Status: `review`)

## Resumen

Se implementaron los 8 criterios de aceptación de la historia 0-1: CI en GitHub Actions, scripts nuevos en
`package.json`, ESLint 9 flat config con override del legacy, cobertura v8 con umbrales por carpeta, `.nvmrc`/`.gitignore`,
favicon ([UI-16]) y `README.md`. **No se tocó `src/`** (ni una línea): el legacy queda linteado con las reglas ruidosas
en `warn`/`off` y excluido de cobertura, tal como pide la historia.

Dependencias nuevas (devDependencies, ninguna de runtime): `eslint@^9.39.5`, `@eslint/js@^9.39.5`,
`typescript-eslint@^8.70.1`, `globals@^17.12.0`, `@vitest/coverage-v8@^4.1.9` (misma versión menor que `vitest@4.1.9`),
`tsx@^4.23.15`.

## Archivos modificados

- `.github/workflows/ci.yml` (nuevo) — AC 1. `push` (todas las ramas) + `pull_request`, Node 20 con cache de npm,
  `npm ci → typecheck → lint → test:coverage → build`, y sube `coverage/` como artifact con `if: always()`.
- `package.json` — AC 2. Scripts `typecheck`, `lint`, `test:coverage`, `sim`, `arena` (`test` y `test:watch` sin cambios)
  y las devDependencies de arriba.
- `package-lock.json` — AC 2/3/4. Lockfile actualizado por `npm install -D` (los 6 paquetes nuevos con sus transitivas).
- `eslint.config.js` (nuevo) — AC 3. Flat config: ignores pedidos, `js.configs.recommended` + `tseslint.configs.recommended`,
  `globals` de browser/node y override del legacy.
- `vitest.config.ts` (nuevo) — AC 4. `mergeConfig(viteConfig, …)` (conserva `vite-tsconfig-paths`), `environment: 'node'`,
  `include: ['src/**/*.test.ts']`, exclude `node_modules`/`dist`/`e2e`/`coverage`, cobertura v8 con
  `text-summary`+`html`+`json-summary` y umbrales `src/engine/**` (90/85) y `src/app/**` (80/70) ya activos.
- `vite.config.ts` — fuera de los AC originales pero dentro de `scope.allow`: `preview.host = '127.0.0.1'`.
  Sin eso el gate `@arranque` de `wf` (que hace `GET http://127.0.0.1:<port>/`) queda en rojo, porque `vite preview`
  con el `host` por defecto se ata sólo a `[::1]` (`localhost` → IPv6) y en `127.0.0.1` no escucha. No se tocó el resto
  de la config (`plugins: [tsconfigPaths()]`, `server.port`, `build`).
- `scripts/sim.ts`, `scripts/arena.ts` (nuevos) — AC 2. Placeholders que imprimen `Pendiente: historia 1-6` /
  `Pendiente: historia 2-1` y salen con código 0.
- `.nvmrc` (nuevo) — AC 5. Contenido: `20`.
- `.gitignore` — AC 5. Suma `coverage/`, `playwright-report/`, `test-results/`, `.worktrees/`.
- `public/favicon.svg` (nuevo) — AC 6. Naipe con espada estilizada, SVG a mano (sin dependencias ni binarios).
- `index.html` — AC 6. `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` en `<head>` → sin 404.
- `README.md` (nuevo) — AC 7. Qué es, requisitos, cómo correr/dev, tabla de scripts, estructura de carpetas, reglas
  duras del motor, testing/CI y flujo BMAD + `wf` con links a `docs/project-context.md`, `docs/planning/*` y `AGENTS.md`.
- `docs/stories/0-1-ci-lint-cobertura.md` — Status a `review` + Dev Agent Record completo (modelo, logs, notas por AC, file list).
- `workflow/runs/0-1-ci-lint-cobertura/state.json` — sólo lo que escribió `wf dispatch` (status `dispatched` y `worktree`).
  No se tocaron `dispatch`, `audit` ni `merge`.

## Verificación ejecutada

### Local (worktree, sobre el contenido final)

```text
$ npm ci
added 58 packages, and audited 59 packages in 1s

# Al final, con el lockfile ya actualizado (misma corrida que hace el CI en un clon limpio):
$ npm ci
(exit 0 — lockfile en sync con package.json; único efecto lateral: reescribe node_modules/.package-lock.json,
 ver "Nota sobre node_modules" abajo)
$ npm run typecheck && npm run lint && npm run test:coverage && npm run build
TYPECHECK_EXIT=0  LINT_EXIT=0  COVERAGE_EXIT=0 (7 files / 122 tests)  BUILD_EXIT=0 (✓ built in 111ms)

$ npm run typecheck        # tsc --noEmit
(exit 0, sin salida)

$ npm run lint             # eslint .
✖ 85 problems (0 errors, 85 warnings)
(exit 0 — todos los avisos son de código legacy/tests/scripts; 0 errores)

$ npm test                 # baseline antes de tocar nada
Test Files  7 passed (7)
     Tests  122 passed (122)

$ npm run test:coverage    # vitest run --coverage
Test Files  7 passed (7)
     Tests  122 passed (122)
 % Coverage report from v8
Statements   : 100% ( 0/0 )
Branches     : 100% ( 0/0 )
Functions    : 100% ( 0/0 )
Lines        : 100% ( 0/0 )
(exit 0)

$ npm run build            # tsc && vite build
dist/index.html                  0.45 kB │ gzip:  0.30 kB
dist/assets/index-9stWTwtA.css  11.68 kB │ gzip:  2.92 kB
dist/assets/index-JHTUSXb_.js   62.80 kB │ gzip: 14.99 kB │ map: 194.34 kB
✓ built in 105ms
(exit 0)

$ npm run sim
Pendiente: historia 1-6
(exit 0)

$ npm run arena
Pendiente: historia 2-1
(exit 0)

$ npx vite preview --port 4321 --strictPort   # favicon / UI-16
GET /                    -> 200
GET /favicon.svg         -> 200 image/svg+xml
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />   # presente en el HTML servido
```

### Cadena completa del CI (misma secuencia que `ci.yml`)

```text
npm run typecheck && npm run lint && npm run test:coverage && npm run build
TYPECHECK_EXIT=0  LINT_EXIT=0  COVERAGE_EXIT=0  BUILD_EXIT=0
```

### wf verify

```text
$ wf verify -i 0-1-ci-lint-cobertura
OK    alcance         0.0s  @alcance
OK    tipos           0.6s  npx --no-install tsc --noEmit
OK    tests           1.9s  npm test --silent
OK    build           0.8s  npm run build --silent
OK    arranque        0.7s  @arranque


VERIFICACIÓN EN VERDE
(head verificado: ver `workflow/runs/0-1-ci-lint-cobertura/verify.json` → `"ok": true`)

Detalle de los gates:
- alcance: "archivos tocados: .github/workflows/ci.yml, .gitignore, .nvmrc, README.md,
  docs/stories/0-1-ci-lint-cobertura.md, eslint.config.js, index.html, package-lock.json, package.json,
  public/favicon.svg, scripts/arena.ts, scripts/sim.ts, vite.config.ts, vitest.config.ts,
  workflow/runs/0-1-ci-lint-cobertura/{implementation.md,state.json,verify.json}" → todos dentro de `scope.allow`.
- tipos: exit 0, sin salida.
- tests: `Test Files 7 passed (7)` / `Tests 122 passed (122)`.
- build: `✓ built in 114ms`.
- arranque: `200 /`.

Primera corrida (commit cc7f0b0 anterior), para dejar constancia del fallo que se corrigió:

$ wf verify -i 0-1-ci-lint-cobertura
OK    alcance         0.0s  @alcance
OK    tipos           0.6s  npx --no-install tsc --noEmit
OK    tests           2.4s  npm test --silent
OK    build           0.8s  npm run build --silent
FALLA arranque       63.6s  @arranque

La app no respondió en 60s en el puerto 63961.

VERIFICACIÓN EN ROJO
```

## Riesgos o desviaciones del alcance

- **Desviación 1 (necesaria)**: el override del legacy en `eslint.config.js` incluye además `src/main.ts` y `src/types.ts`.
  La lista del AC 3 no los nombra, pero ambos usan `any` y la historia prohíbe tocar `src/`; sin incluirlos `npm run lint`
  no puede salir con código 0. Sólo se relajan reglas para esas rutas: para `src/engine`, `src/app`, `src/ui/views` y
  `src/ai` nuevo las reglas `recommended` quedan como error.
- **Desviación 2 (necesaria)**: se agrega `@typescript-eslint/no-unsafe-function-type: warn` al override. La dispara
  `src/core/GameEngine.ts` (campo con tipo `Function`) y el AC 3 autoriza "cualquier otra regla que haga falta apagar/avisar
  sólo ahí". Es la única regla extra que hizo falta.
- **AC 4 / umbrales**: no se comentaron ni se bajaron. `npm run test:coverage` sale 0 hoy porque las carpetas con umbral
  (`src/engine`, `src/app`) todavía no existen y el resto de `src/` es legacy excluido (resumen `0/0`). Se comprobó que los
  umbrales **sí se evalúan**: con un `src/engine/__probe.ts` temporal la corrida falló con
  `ERROR: Coverage for branches (50%) does not meet "src/engine/**" threshold (85%)` (exit 1). El temporal se borró y el
  árbol quedó limpio; no está en ningún commit. Queda listo para la historia 1-1.
- **Desviación 3 (necesaria para el gate `arranque`)**: `vite.config.ts` suma `preview: { host: '127.0.0.1' }`.
  La primera corrida de `wf verify` quedó en rojo en `arranque` ("La app no respondió en 60s"): `vite preview` con el
  `host` por defecto (`localhost`) se ata **sólo a `[::1]`** (`lsof … TCP [::1]:63961 (LISTEN)`) y el gate consulta
  `http://127.0.0.1:<port>/`, así que nunca conectaba. Con `host: '127.0.0.1'` el listener pasa a
  `TCP 127.0.0.1:<port> (LISTEN)` y `GET /` responde 200. No es una decisión de arquitectura (no cambia build, dev server
  ni runtime; sólo el bind del server de preview) y `vite.config.ts` está en `scope.allow`. Afecta a todas las tareas
  futuras, porque el gate `@arranque` es igual para todo el repo.
- **Nota sobre `node_modules`**: el repo tiene `node_modules/` **versionado por error** (456 archivos en el índice, aunque
  `.gitignore` lo ignora). `npm ci`/`npm install` reescriben `node_modules/.package-lock.json`, un archivo generado que
  queda fuera de `scope.allow` y haría fallar el gate `alcance`. Se restauró a su contenido commiteado
  (`git restore node_modules/.package-lock.json`) para que el árbol quede limpio; el grafo real de dependencias está en
  `package-lock.json` (sí commiteado). Sugerencia para el supervisor: `git rm -r --cached node_modules` en una historia aparte.
- **Nota sobre `state.json`**: `wf dispatch` modificó `workflow/runs/0-1-ci-lint-cobertura/state.json` (status `dispatched`
  + `worktree`) y `wf record-impl` lo pasa a `implemented`. El primero va commiteado en esta rama (lo necesita
  `wf merge`, que lee el estado **versionado** de `task/<id>`); el segundo queda sin commitear a propósito, porque
  `wf record-impl` exige que `verify.json.head` sea el commit registrado. No se modificaron campos de aprobación ni `audit.md`.
- Sin riesgos para el runtime: no hay dependencias nuevas de runtime, no se tocó `src/` y el bundle no cambió de forma
  relevante (mismo orden de tamaño que antes de la tarea).
