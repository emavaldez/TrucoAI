# Asignación: Motor v2: flor configurable

- ID: `1-8-flor` · Rama: `task/1-8-flor` · Tipo (`--kind`): `refactor`
- Asignado por: Claude (supervisor) · Worker: Hermes perfil `trucoai` · Aprueba: Emmanuel

## Qué hacer

Implementá **exactamente** la historia BMAD `docs/stories/1-8-flor.md`: sus criterios de aceptación son el objetivo observable
y la definición de terminado. Antes de empezar leé, en este orden: `docs/project-context.md`, la historia, y las secciones de
`docs/planning/gdd.md`, `docs/planning/architecture.md` y `docs/planning/test-strategy.md` que la historia referencia.

## Alcance (lista blanca, copiada en `state.json` → `scope.allow`)

```json
["src/engine/*", "src/sim/*", "scripts/sim.ts", "docs/stories/1-8-flor.md"]
```

Además podés escribir en `workflow/runs/1-8-flor/` (implementation.md). Cualquier otro archivo tocado hace fallar el gate `alcance`.

## Fuera de alcance

- Código legacy (`src/core/`, `src/App.ts`, `src/ui/UIManager.ts`, `src/ai/AIPlayer.ts`, `src/ai/DecisionEngine.ts`, `src/ai/CardEvaluator.ts`) salvo que la historia lo diga.
- Otras historias. Si algo necesario cae fuera del alcance, **detenete** y explicalo en `implementation.md`.
- `git push`, merge, `audit.md`, aprobaciones.

## Cómo trabajar

1. En el worktree: `npm ci` (el worktree no trae `node_modules`).
2. Implementá con tests primero cuando se pueda (los tests con IDs de auditoría llevan el ID en el título: `it('[ENG-04] …')`).
3. Commits chicos en la rama `task/1-8-flor` con mensajes `feat(engine): …` / `test(engine): …` / `chore: …`.
4. Corré `wf verify -i 1-8-flor` hasta que esté en verde **sobre el último commit**.
5. Completá la sección **Dev Agent Record** de `docs/stories/1-8-flor.md` (modelo, notas, lista de archivos) y cambiá su `Status:` a `review`.
6. Escribí `workflow/runs/1-8-flor/implementation.md`: resumen, archivos, salida de los comandos de verificación, riesgos y cualquier desvío de la historia.
7. Commit final y `wf record-impl -i 1-8-flor`.

## Criterios de aceptación

- [ ] Todos los AC de `docs/stories/1-8-flor.md` cumplidos y cubiertos por tests.
- [ ] `wf verify -i 1-8-flor` en verde sobre el commit registrado.
- [ ] Dev Agent Record y `implementation.md` completos.

## Verificación (la corre también el supervisor)

```bash
npm ci && npm run typecheck && npm test && npm run build
```
(y lo que agregue la sección "Verificación extra" de la historia)

## Riesgos o decisiones abiertas

- Si una regla del GDD te parece ambigua o contradictoria: no inventes, detenete y anotalo. Las reglas las decide Emmanuel.
