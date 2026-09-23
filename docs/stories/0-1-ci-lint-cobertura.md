# Historia 0-1: CI, lint y cobertura

Status: review
wf-id: `0-1-ci-lint-cobertura` · kind: `mecanico`

## Historia

Como desarrollador del proyecto,
quiero que cada push corra typecheck, lint, tests con cobertura y build en GitHub Actions,
para que `main` (que Vercel deploya solo) nunca se rompa sin que nos enteremos.

## Criterios de aceptación

1. Existe `.github/workflows/ci.yml` que en `push` (todas las ramas) y `pull_request` corre, con Node 20 y cache de npm:
   `npm ci` → `npm run typecheck` → `npm run lint` → `npm run test:coverage` → `npm run build`. Sube `coverage/` como artifact.
2. `package.json` tiene los scripts:
   - `typecheck`: `tsc --noEmit`
   - `lint`: `eslint .`
   - `test`: `vitest run` (sin cambios)
   - `test:coverage`: `vitest run --coverage`
   - `sim`: `tsx scripts/sim.ts`
   - `arena`: `tsx scripts/arena.ts`
   y `scripts/sim.ts` / `scripts/arena.ts` existen como placeholders que imprimen `Pendiente: historia 1-6` / `Pendiente: historia 2-1` y salen con código 0.
3. ESLint 9 flat config en `eslint.config.js` con `@eslint/js` + `typescript-eslint` (recommended):
   - ignora `dist/`, `coverage/`, `node_modules/`, `Papers/`, `docs/`, `public/`, `playwright-report/`, `test-results/`;
   - **override para legacy** (`src/core/**`, `src/App.ts`, `src/ui/UIManager.ts`, `src/ai/AIPlayer.ts`, `src/ai/DecisionEngine.ts`, `src/ai/CardEvaluator.ts`, `src/__tests__/**`, `scripts/**`) con `@typescript-eslint/no-explicit-any: off`, `@typescript-eslint/no-unused-vars: warn`, `no-empty: warn`, `prefer-const: warn` y cualquier otra regla que haga falta **apagar/avisar solo ahí** para que `npm run lint` salga con código 0;
   - para el resto del código (futuro `src/engine`, `src/ai/**` nuevo, `src/app`, `src/ui/views`) las reglas recommended quedan como error.
   - `npm run lint` sale con código 0 sobre el repo actual (warnings permitidos).
4. Cobertura con `@vitest/coverage-v8` (versión compatible con el `vitest` instalado, 4.1.x). Crear `vitest.config.ts`:
   ```ts
   import { defineConfig, mergeConfig } from 'vitest/config';
   import viteConfig from './vite.config';
   export default mergeConfig(viteConfig, defineConfig({ test: { /* … */ } }));
   ```
   con `environment: 'node'`, `include: ['src/**/*.test.ts']`, `exclude` que incluya `node_modules`, `dist`, `e2e/**`, y `coverage`:
   - `provider: 'v8'`, `reporter: ['text-summary', 'html', 'json-summary']`, `include: ['src/**/*.ts']`,
   - `exclude`: tests, `src/main.ts`, y el legacy listado en el AC3 (menos `src/__tests__`, que ya es test),
   - `thresholds` por glob: `'src/engine/**': { lines: 90, branches: 85 }`, `'src/app/**': { lines: 80, branches: 70 }`.
     (Los de `src/ai/**` se agregan en la épica 2 porque hoy `src/ai` es legacy.)
   - `npm run test:coverage` sale con código 0 hoy (no hay archivos en esas carpetas todavía; si vitest falla por glob sin archivos, documentarlo en Dev Notes y dejar los umbrales comentados con TODO para 1-1 — **no** bajar umbrales).
5. `.nvmrc` con `20`. `.gitignore` agrega `coverage/`, `playwright-report/`, `test-results/`, `.worktrees/`.
6. Favicon: `public/favicon.svg` (SVG simple, original: por ejemplo un naipe con una espada estilizada) y `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` en `index.html` → sin 404 **[UI-16]**.
7. `README.md` (nuevo) en español: qué es, cómo correr (`npm ci`, `npm run dev`), testear, scripts, estructura, y el flujo BMAD + `wf` (links a `docs/project-context.md` y `docs/planning/*`).
8. Los 122 tests existentes siguen en verde; `npm run build` sigue funcionando; `npm run typecheck` sin errores.

## Tareas

- [ ] Instalar devDependencies: `eslint@^9`, `@eslint/js@^9`, `typescript-eslint@^8`, `globals`, `@vitest/coverage-v8` (misma versión menor que vitest), `tsx` (AC 2, 3, 4)
- [ ] `eslint.config.js` con ignores + override legacy (AC 3)
- [ ] `vitest.config.ts` con cobertura y umbrales (AC 4)
- [ ] Scripts en `package.json` + placeholders `scripts/sim.ts` y `scripts/arena.ts` (AC 2)
- [ ] `.github/workflows/ci.yml` (AC 1)
- [ ] `.nvmrc`, `.gitignore` (AC 5)
- [ ] Favicon (AC 6)
- [ ] `README.md` (AC 7)
- [ ] Correr `npm run typecheck && npm run lint && npm run test:coverage && npm run build` localmente y pegar el resumen en Dev Agent Record (AC 8)

## Dev Notes

- **No** cambies código de `src/` (ni para arreglar lint: para eso está el override legacy).
- `vite.config.ts` hoy usa `vite-tsconfig-paths`; mantenelo. Si al crear `vitest.config.ts` vitest deja de leer algo de `vite.config.ts`, el `mergeConfig` lo resuelve.
- El CI no deploya: Vercel ya está conectado a `main` por la integración de GitHub.
- CI ejemplo mínimo:
  ```yaml
  name: CI
  on: { push: { branches: ['**'] }, pull_request: {} }
  jobs:
    ci:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: 20, cache: npm }
        - run: npm ci
        - run: npm run typecheck
        - run: npm run lint
        - run: npm run test:coverage
        - run: npm run build
        - uses: actions/upload-artifact@v4
          if: always()
          with: { name: coverage, path: coverage/ }
  ```

### Alcance (wf `scope.allow`)
```json
[".github/*", "package.json", "package-lock.json", "eslint.config.js", "vitest.config.ts", "vite.config.ts",
 ".nvmrc", ".gitignore", "public/*", "index.html", "README.md", "scripts/sim.ts", "scripts/arena.ts",
 "docs/stories/0-1-ci-lint-cobertura.md"]
```

### Verificación extra
```bash
npm run typecheck && npm run lint && npm run test:coverage && npm run build
```

### Referencias
- `docs/planning/test-strategy.md` §3 y §8 · `docs/planning/architecture.md` §9 · `docs/project-context.md`

## Dev Agent Record

### Agent Model Used
Hermes Agent (perfil `trucoai`), worker headless en el worktree `/Users/emmanuelvaldez/GameDev/.worktrees/0-1-ci-lint-cobertura`,
rama `task/0-1-ci-lint-cobertura`. Sin cambios en `src/` (sólo config, CI, docs y estáticos).

### Debug Log References
- `npm ci` → `added 58 packages` (worktree sin `node_modules` útil; `node_modules` quedó en 180 paquetes después de instalar las devDependencies nuevas).
- `npm run typecheck` → exit 0, sin salida.
- `npm run lint` → exit 0, `85 problems (0 errors, 85 warnings)`.
- `npm test` (baseline, antes de tocar nada) → `7 passed (7) / 122 passed (122)`.
- `npm run test:coverage` → exit 0, `7 passed (7) / 122 passed (122)`, cobertura `0/0` (todo `src/` es legacy excluido: ver AC 4).
- `npm run build` → exit 0, `dist/index.html 0.45 kB`, `index-9stWTwtA.css 11.68 kB`, `index-JHTUSXb_.js 62.80 kB`.
- `npm run sim` → `Pendiente: historia 1-6`, exit 0. `npm run arena` → `Pendiente: historia 2-1`, exit 0.
- `npx vite preview` + `curl` → `GET /` 200, `GET /favicon.svg` 200 `image/svg+xml` (sin 404, [UI-16]).
- Prueba de que los umbrales por glob se aplican de verdad (no son decorativos): con un archivo temporal en
  `src/engine/` la corrida falló con `ERROR: Coverage for branches (50%) does not meet "src/engine/**" threshold (85%)`;
  el archivo temporal se borró (el árbol quedó limpio) y no forma parte de ningún commit.
- `wf verify -i 0-1-ci-lint-cobertura` → ver `workflow/runs/0-1-ci-lint-cobertura/implementation.md`.

### Completion Notes List
- AC 1: `.github/workflows/ci.yml` con `on: push (branches '**') + pull_request`, Node 20, `cache: npm`,
  pasos `npm ci → typecheck → lint → test:coverage → build` y `upload-artifact@v4` de `coverage/` con `if: always()`.
  Vercel sigue deployando `main` por su integración de GitHub (el CI no deploya).
- AC 2: scripts agregados en `package.json` (`typecheck`, `lint`, `test:coverage`, `sim`, `arena`); `test` quedó igual.
  `scripts/sim.ts` y `scripts/arena.ts` son placeholders que imprimen `Pendiente: historia 1-6` / `2-1` y salen con 0.
- AC 3: ESLint 9 flat config (`eslint.config.js`) con `@eslint/js` + `typescript-eslint` recommended para el código
  nuevo e ignores de `dist/`, `coverage/`, `node_modules/`, `Papers/`, `docs/`, `public/`, `playwright-report/`,
  `test-results/`. Override del legacy (`src/core/**`, `src/App.ts`, `src/ui/UIManager.ts`, `src/ai/{AIPlayer,DecisionEngine,CardEvaluator}.ts`,
  `src/__tests__/**`, `scripts/**`) con `no-explicit-any: off` y el resto en `warn`. `npm run lint` sale 0.
  Desviación mínima y necesaria: `src/main.ts` y `src/types.ts` también entran en el override (usan `any`; sin eso el
  lint no llega a 0 y no se puede tocar `src/`), más `@typescript-eslint/no-unsafe-function-type: warn` (lo dispara
  `src/core/GameEngine.ts` con el tipo `Function`). Sólo se relajan reglas en rutas legacy: no se apagó nada global.
- AC 4: `vitest.config.ts` con `mergeConfig(viteConfig, …)` (mantiene `vite-tsconfig-paths`), `environment: 'node'`,
  `include: ['src/**/*.test.ts']`, `coverage.provider: 'v8'`, reporters `text-summary`/`html`/`json-summary`,
  `include: ['src/**/*.ts']` y exclude de tests, `src/main.ts` y legacy. **Los umbrales quedan activos** (no hizo falta
  comentarlos): `npm run test:coverage` sale 0 hoy y la prueba con archivo temporal mostró que sí se evalúan.
- AC 5: `.nvmrc` = `20`; `.gitignore` suma `coverage/`, `playwright-report/`, `test-results/`, `.worktrees/`.
- AC 6: `public/favicon.svg` (naipe con espada hecho a mano) + `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`
  en `index.html`; verificado 200 con `vite preview` ([UI-16]).
- AC 7: `README.md` nuevo en español rioplatense: qué es, requisitos, cómo correr/testear, tabla de scripts,
  estructura, reglas duras del motor, CI y flujo BMAD + `wf` con links a `docs/project-context.md`, `docs/planning/*` y `AGENTS.md`.
- AC 8: los 122 tests siguen verdes, `npm run build` y `npm run typecheck` sin errores.
- Extra (gate `arranque` de `wf`): `vite.config.ts` suma `preview: { host: '127.0.0.1' }`. Sin eso `wf verify` queda en rojo
  en `arranque` porque `vite preview` con el `host` por defecto se ata sólo a `[::1]` y el gate consulta
  `http://127.0.0.1:<port>/`. Cambio mínimo, dentro de `scope.allow`, detallado en `implementation.md` (desviación 3).

### File List
- `.github/workflows/ci.yml` (nuevo) — CI GitHub Actions.
- `package.json` — scripts `typecheck`, `lint`, `test:coverage`, `sim`, `arena` + devDependencies.
- `package-lock.json` — lockfile actualizado (`eslint@^9.39.5`, `@eslint/js@^9.39.5`, `typescript-eslint@^8.70.1`,
  `globals@^17.12.0`, `@vitest/coverage-v8@^4.1.9`, `tsx@^4.23.15`).
- `eslint.config.js` (nuevo) — flat config con override legacy.
- `vitest.config.ts` (nuevo) — cobertura v8 y umbrales por carpeta.
- `vite.config.ts` — `preview.host = '127.0.0.1'` (gate `arranque` de `wf`).
- `.nvmrc` (nuevo) — `20`.
- `.gitignore` — `coverage/`, `playwright-report/`, `test-results/`, `.worktrees/`.
- `public/favicon.svg` (nuevo) — favicon.
- `index.html` — `<link rel="icon">`.
- `README.md` (nuevo) — documentación de entrada.
- `scripts/sim.ts`, `scripts/arena.ts` (nuevos) — placeholders de 1-6 y 2-1.
- `docs/stories/0-1-ci-lint-cobertura.md` — este registro.

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
- 2026-09-23 · Hermes (worker, perfil `trucoai`) · Implementación completa en `task/0-1-ci-lint-cobertura`: CI, scripts, ESLint flat config, cobertura v8, `.nvmrc`/`.gitignore`, favicon [UI-16], README y `preview.host` en `vite.config.ts`. `wf verify` en verde (5 gates OK).
