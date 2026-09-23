# Auditoría: Motor v2 — dominio, RNG, reparto y rotación

- ID: `1-1-dominio-rng-reparto` · Auditor: Claude (supervisor) · Fecha: 2026-09-23
- Dictamen: **APROBADA** (tras ciclo 1)

## Verificación independiente (checkout limpio de la rama + config de 0-1 superpuesta, `npm ci`, Linux)

| Comando | Resultado |
|---|---|
| `tsc --noEmit` | exit 0 |
| `eslint src/engine` | **2 errores**: `src/engine/tricks.ts:11` `_state` y `_events` sin usar (`@typescript-eslint/no-unused-vars`) |
| `vitest run --coverage` | 187/187 tests (65 nuevos del motor); `src/engine/**` 100% líneas, 95,45% ramas (umbral 90/85) ✔ |
| Alcance | solo `src/engine/**`, la historia y `workflow/runs/1-1-*` ✔ |

## Revisión del código contra los AC

- AC1 `types.ts`: coincide con arquitectura §4 (solo difiere el formato multilínea). ✔
- AC2 `rng.ts`: mulberry32 serializable, `nextInt`, `shuffle` sin mutar; estado guardado en `rngState`. ✔
- AC3 `cards.ts`: mazo de 40, orden estable, ranking, envido, nombres y apodos. ✔
- AC4/AC5 `createMatch` y reparto de 3 vueltas desde el mano; `dealt` y `hands` independientes; caso literal de 2p testeado. ✔
- AC6 `startNextHand` con rotación [ENG-06] y `NOT_HAND_OVER`. ✔
- AC7 `getActor`/`getLegalActions`/`applyAction` sin mutar, errores `NOT_YOUR_TURN`/`ILLEGAL_ACTION`/`MATCH_OVER` [ENG-10]; stub de `completeTrick`. ✔
- AC8 `index.ts` re-exporta solo la API pedida. ✔
- AC9 determinismo, serialización y test de pureza [AI-11]. ✔
- AC10 lint en rojo (ver abajo); `@arranque` en rojo por causa ambiental que corrige 0-1.

## Cambios pedidos

1. **Rebase sobre `main`** (que ya trae 0-1: lint, cobertura, `preview.host`). Sin conflictos esperados (archivos disjuntos).
2. **Lint:** en `eslint.config.js`, para todo el código (bloque general, no el override legacy), configurar
   `'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }]`
   — convención del proyecto para stubs y parámetros no usados. Se amplía el alcance de la tarea a `eslint.config.js` (ya está en `state.json`).
3. `wf verify -i 1-1-dominio-rng-reparto` en verde **incluyendo** `lint` y `arranque`, y `wf record-impl`.
4. Actualizar el Dev Agent Record (ciclo 1) y `implementation.md` con la salida nueva.

## Re-auditoría ciclo 1 (commit `6b59a4f`)

Checkout limpio de `task/1-1-dominio-rng-reparto` rebasada sobre `main` (con 0-1), `npm ci`, Linux:
typecheck exit 0 · lint exit 0 (0 errores, 82 warnings de legacy) · 187/187 tests · `src/engine/**` 100% líneas / 95,45% ramas · build OK.
`eslint.config.js`: convención `^_` en `no-unused-vars` aplicada al bloque general, el override legacy no cambia. Alcance: solo `src/engine/**`,
`eslint.config.js` (ampliado por el supervisor), la historia y `workflow/runs/1-1-*`. Nota de proceso: el `record-audit changes_requested`
del ciclo 1 no se registró porque `wf` exige implementación registrada antes de auditar; queda este dictamen como única auditoría registrada.
