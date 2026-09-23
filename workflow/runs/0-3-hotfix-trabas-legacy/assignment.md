# Asignación: Hotfix del juego actual: partidas completas sin trabas

- ID: `0-3-hotfix-trabas-legacy` · Rama: `task/0-3-hotfix-trabas-legacy` · Tipo (`--kind`): `default`
- Asignado por: Claude (supervisor) · Worker: Hermes perfil `trucoai` · Aprueba: Emmanuel

## Qué hacer

Implementá **exactamente** la historia BMAD `docs/stories/0-3-hotfix-trabas-legacy.md`: sus criterios de aceptación son el objetivo observable
y la definición de terminado. Antes de empezar leé, en este orden: `docs/project-context.md`, la historia, y las secciones de
`docs/planning/gdd.md`, `docs/planning/architecture.md` y `docs/planning/test-strategy.md` que la historia referencia.

## Alcance (lista blanca, copiada en `state.json` → `scope.allow`)

```json
["src/core/*", "src/App.ts", "src/ui/UIManager.ts", "src/__tests__/*", "e2e/*", "docs/stories/0-3-hotfix-trabas-legacy.md"]
```

Además podés escribir en `workflow/runs/0-3-hotfix-trabas-legacy/` (implementation.md). Cualquier otro archivo tocado hace fallar el gate `alcance`.

## Fuera de alcance

- Código legacy (`src/core/`, `src/App.ts`, `src/ui/UIManager.ts`, `src/ai/AIPlayer.ts`, `src/ai/DecisionEngine.ts`, `src/ai/CardEvaluator.ts`) salvo que la historia lo diga.
- Otras historias. Si algo necesario cae fuera del alcance, **detenete** y explicalo en `implementation.md`.
- `git push`, merge, `audit.md`, aprobaciones.

## Cómo trabajar

1. En el worktree: `npm ci` (el worktree no trae `node_modules`).
2. Implementá con tests primero cuando se pueda (los tests con IDs de auditoría llevan el ID en el título: `it('[ENG-04] …')`).
3. Commits chicos en la rama `task/0-3-hotfix-trabas-legacy` con mensajes `feat(engine): …` / `test(engine): …` / `chore: …`.
4. Corré `wf verify -i 0-3-hotfix-trabas-legacy` hasta que esté en verde **sobre el último commit**.
5. Completá la sección **Dev Agent Record** de `docs/stories/0-3-hotfix-trabas-legacy.md` (modelo, notas, lista de archivos) y cambiá su `Status:` a `review`.
6. Escribí `workflow/runs/0-3-hotfix-trabas-legacy/implementation.md`: resumen, archivos, salida de los comandos de verificación, riesgos y cualquier desvío de la historia.
7. Commit final y `wf record-impl -i 0-3-hotfix-trabas-legacy`.

## Criterios de aceptación

- [ ] Todos los AC de `docs/stories/0-3-hotfix-trabas-legacy.md` cumplidos y cubiertos por tests.
- [ ] `wf verify -i 0-3-hotfix-trabas-legacy` en verde sobre el commit registrado.
- [ ] Dev Agent Record y `implementation.md` completos.

## Verificación (la corre también el supervisor)

```bash
npm ci && npm run typecheck && npm test && npm run build
```
(y lo que agregue la sección "Verificación extra" de la historia)

## Riesgos o decisiones abiertas

- Si una regla del GDD te parece ambigua o contradictoria: no inventes, detenete y anotalo. Las reglas las decide Emmanuel.

## Nota del supervisor

Esta es la **única** historia autorizada a modificar el legacy (`src/core/`, `src/App.ts`, `src/ui/UIManager.ts`). Cambios mínimos, sin refactors ni arreglos de reglas. Corré `npx playwright install chromium` en el worktree antes de verificar.
