# TrucoAI — Contexto para agentes de código

Leé esto antes de tocar código. Es corto a propósito.

## Qué es
Truco argentino web (Vite + TypeScript, sin frameworks ni dependencias de runtime) contra IA. Deploy automático de `main` en Vercel.

## Documentos que mandan (en este orden)
1. `docs/planning/gdd.md` — **reglas del juego** (fuente de verdad).
2. `docs/planning/architecture.md` — tipos, API, estructura de carpetas, ADRs.
3. `docs/planning/test-strategy.md` — qué testear, invariantes, testids, CI.
4. `docs/stories/<historia>.md` — tu asignación concreta.
5. `docs/planning/audit-2026-09.md` — bugs conocidos del código viejo con IDs (ENG-xx, AI-xx, UI-xx).

`docs/legacy/*`, `.kanban/*` y `trucoai-kanban.html` son históricos: **no los uses como especificación**.

## Reglas duras
- El motor nuevo vive en `src/engine/` y es **puro**: sin DOM, sin timers, sin `Math.random` (usar `Rng`), sin mutar el estado recibido.
- **No importes nada del código legacy** (`src/core/`, `src/App.ts`, `src/ui/UIManager.ts` viejo, `src/ai/AIPlayer.ts`, `src/ai/DecisionEngine.ts`, `src/ai/CardEvaluator.ts`) desde código nuevo, y no modifiques el legacy salvo que tu historia lo diga (hoy solo la 0-3).
- Toda acción pasa por `getLegalActions` / `applyAction`. Nada de acceder a funciones privadas con `obj['x']`.
- La IA solo recibe `Observation`. Nunca manos ajenas.
- TypeScript `strict`, sin `any` en `src/engine` ni `src/ai`. Imports con extensión `.js`.
- Tests con vitest. Cada regla que implementes tiene un test que la nombra; cada bug de la auditoría que tu historia cubre tiene un test con su ID en el título: `it('[ENG-04] …')`.
- Nombres de código en inglés; textos visibles y docs en español rioplatense.
- No agregues dependencias de runtime. DevDependencies solo si tu historia lo pide.
- Tocá **solo** los archivos del alcance de tu historia (el gate `alcance` de `wf` lo verifica).

## Comandos
```bash
npm ci
npm run typecheck      # tsc --noEmit
npm run lint           # desde la historia 0-1
npm test               # vitest run
npm run test:coverage
npm run build
npm run sim            # desde 1-6: 1.000 partidas con invariantes
npm run arena          # desde 2-1: enfrentamientos de IA
wf verify -i <id>      # gates del flujo supervisado
```

## Flujo de trabajo
BMAD para planificar (Claude: PM/arquitecto/scrum master/QA) + `wf` para ejecutar (Hermes perfil `trucoai` implementa en un worktree `task/<id>`,
Claude audita, Emmanuel aprueba despacho y merge). Al terminar una historia: completar la sección **Dev Agent Record** del archivo de la historia,
`implementation.md` de la tarea, `wf verify` en verde y `wf record-impl`.
