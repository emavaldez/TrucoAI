# Auditoría: CI, lint y cobertura

- ID: `0-1-ci-lint-cobertura` · Auditor: Claude (supervisor) · Fecha: 2026-09-23
- Dictamen: **APROBADA**

## Verificación independiente (checkout limpio de `task/0-1-ci-lint-cobertura` en Linux, `npm ci`)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 — 0 errores, 85 warnings (todos en legacy/tests/scripts, override del AC3) |
| `npm run test:coverage` | 122/122 tests; cobertura sin archivos en carpetas con umbral (esperado hasta 1-1) |
| `npm run build` | exit 0 |
| Alcance | 16 archivos, todos dentro de `scope.allow` + `workflow/runs/0-1-*`; nada en `src/`, nada en `node_modules/` |

## Revisión del diff contra los AC

- AC1 `ci.yml`: push a todas las ramas + PR, Node 20 con cache npm, pasos en el orden pedido, artifact `coverage/` con `if: always()`. ✔
- AC2 scripts `typecheck`, `lint`, `test`, `test:coverage`, `sim`, `arena`; placeholders con exit 0. ✔
- AC3 ESLint 9 flat + typescript-eslint recommended; override legacy. ✔ Desvío aceptado: se agregan `src/main.ts` y `src/types.ts` al override (legacy con `any`; la historia prohíbe tocar `src/`).
- AC4 `vitest.config.ts` con `mergeConfig`, v8, reporters, umbrales por glob `src/engine/**` 90/85 y `src/app/**` 80/70. ✔
- AC5 `.nvmrc` 20; `.gitignore` con coverage/playwright-report/test-results/.worktrees. ✔
- AC6 favicon SVG original + `<link rel="icon">` [UI-16]. ✔
- AC7 README en español. ✔
- AC8 122 tests verdes, build y typecheck OK. ✔

## Observaciones (no bloqueantes)

1. `vite.config.ts` → `preview.host: '127.0.0.1'`: correcto para destrabar `@arranque` (en la Mac `localhost` → `::1`). Consecuencia registrada en la historia 0-2: Playwright usa `http://127.0.0.1:4173`.
2. El worker no ejecutó `wf record-impl`; lo registra el operador sobre el mismo commit verificado.
3. Deuda (no de esta historia): `node_modules/` estaba trackeado en el repo; se deja de trackear en `main` junto con las historias 0-2/0-3.
