# TrucoAI

Truco argentino para jugar en el navegador contra la máquina (1v1, 2v2 y 3v3 con pica-pica).
Vite + TypeScript, sin frameworks ni dependencias de runtime. Deploy automático de `main` en Vercel.

> Estado: **v2.0** (2026-09-25). Motor puro `src/engine/` con reglas del GDD (truco, envido, flor configurable,
> pica-pica), IA en tres dificultades y la mesa "v2". El motor viejo se retiró. Auditoría y cierre:
> `docs/planning/qa-2026-09-25.md`.

## Cómo se juega

Elegí 2, 4 o 6 jugadores, la dificultad de los rivales (tus compañeros juegan siempre en normal) y si querés flor o
pica-pica (solo con 6). En tu turno tocás una carta para jugarla o un botón para cantar; cuando te cantan, respondés en
el panel de papel. Atajos: `1`/`2`/`3` juegan tus cartas, `Q` quiero, `N` no quiero, `R` sube el truco, `Enter` pasa
a la mano siguiente y `Escape` pausa. En el celular se juega en vertical.

URL para probar o reproducir: `?seed=7&players=4&difficulty=hard&flor=1&autostart=1` (y `&fast=1` sin esperas).

## Requisitos

- Node 20 (`.nvmrc`) y npm.

## Cómo correr

```bash
npm ci          # instala exactamente lo del lockfile
npm run dev     # servidor de desarrollo en http://localhost:3003
```

Build de producción y preview local:

```bash
npm run build    # tsc + vite build → dist/
npm run preview  # sirve dist/
```

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite, puerto 3003). |
| `npm run build` | Typecheck + build de producción en `dist/`. |
| `npm run preview` | Sirve el build de `dist/`. |
| `npm run typecheck` | `tsc --noEmit` (TypeScript `strict`). |
| `npm run lint` | ESLint 9 (flat config, `eslint.config.js`). |
| `npm test` | Vitest en modo run (unit + escenarios). |
| `npm run test:watch` | Vitest en modo watch. |
| `npm run test:coverage` | Vitest con cobertura v8 (reportes en `coverage/`). |
| `npm run sim` | Simulación masiva con invariantes (`-- --games 1000 --players 4 --flor`). |
| `npm run arena` | Enfrentamiento de IA con IC de Wilson (`-- --a hard --b normal --players 4 --games 300`). |
| `npm run test:partidas` / `npm run e2e` | Playwright: partidas completas 2/4/6 en el navegador, layout + axe, flujos. |

Verificación completa antes de commitear (lo mismo que corre el CI):

```bash
npm run typecheck && npm run lint && npm run test:coverage && npm run build
```

## Estructura

```
index.html            entrada de Vite
public/               estáticos servidos tal cual (favicon)
src/
  engine/             motor puro: estado, acciones legales, reglas
  ai/                 políticas de IA: reciben sólo Observation (fácil / normal / difícil) + arena
  app/                GameController (driver de IA, pausas, nueva partida) y scheduler, sin DOM
  ui/                 mesa, menú, resumen y fin de partida: render desde el estado y las acciones legales
  sim/                simulador con invariantes
  main.ts             bootstrap del navegador
e2e/                  Playwright
docs/
  project-context.md  reglas duras para agentes (leer antes de tocar código)
  planning/           GDD, arquitectura y estrategia de testing
  stories/            historias BMAD (una por tarea)
workflow/             estado del flujo supervisado `wf`
```

Reglas duras del motor nuevo: sin DOM, sin timers, sin `Math.random` (se usa `Rng` con semilla), sin mutar el
estado recibido, y toda acción pasa por `getLegalActions` / `applyAction`. Detalle en `docs/project-context.md`.

## Testing y CI

Vitest para unit, escenarios y simulación; Playwright para E2E. Cobertura con
`@vitest/coverage-v8` y umbrales por carpeta (`vitest.config.ts`). Qué testear, invariantes y testids:
`docs/planning/test-strategy.md`.

Cada push y cada PR corren en GitHub Actions (`.github/workflows/ci.yml`, Node 20):
`npm ci` → `npm run typecheck` → `npm run lint` → `npm run test:coverage` → `npm run build`,
y `coverage/` queda como artifact; después, el job `partidas` corre toda la suite de Playwright. El CI no deploya: Vercel está conectado a `main` por su integración de GitHub,
y `main` sólo recibe merges con CI en verde y auditoría aprobada.

## Flujo de trabajo (BMAD + `wf`)

La planificación es BMAD (PM, arquitecto, scrum master y QA escriben GDD, arquitectura, historias y tests) y la
ejecución la maneja `wf`, un flujo supervisado supervisor-worker:

1. El supervisor planifica y escribe `workflow/runs/<id>/assignment.md` (apunta a la historia BMAD).
2. Emmanuel aprueba el despacho (`wf approve -i <id> --gate dispatch`) y `wf dispatch` crea el worktree
   y la rama `task/<id>`.
3. El worker implementa **sólo** el alcance declarado, corre `wf verify -i <id>` y registra con `wf record-impl`.
4. El supervisor audita el diff y registra el dictamen con `wf record-audit`.
5. Con el merge aprobado, `wf merge -i <id>` integra a `main`.

Documentos que mandan (en orden): `docs/planning/gdd.md` (reglas del juego), `docs/planning/architecture.md`
(tipos y estructura), `docs/planning/test-strategy.md`, `docs/stories/<historia>.md` y
`docs/planning/audit-2026-09.md` (bugs conocidos con IDs). `docs/legacy/` y `.kanban/` son históricos y no son
especificación.

- Contexto para agentes: [`docs/project-context.md`](docs/project-context.md)
- Reglas del juego: [`docs/planning/gdd.md`](docs/planning/gdd.md)
- Arquitectura y ADRs: [`docs/planning/architecture.md`](docs/planning/architecture.md)
- Estrategia de testing: [`docs/planning/test-strategy.md`](docs/planning/test-strategy.md)
- Contrato del flujo: [`AGENTS.md`](AGENTS.md)
