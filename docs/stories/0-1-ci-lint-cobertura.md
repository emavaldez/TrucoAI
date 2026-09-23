# Historia 0-1: CI, lint y cobertura

Status: ready-for-dev
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
### Debug Log References
### Completion Notes List
### File List

## Change Log
- 2026-09-23 · Claude (SM) · Historia creada.
