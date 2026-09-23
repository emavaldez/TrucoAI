# TrucoAI v2 — Épicas e historias

**Fuentes:** `gdd.md` (reglas), `architecture.md` (contrato técnico), `test-strategy.md`, `audit-2026-09.md`.
**Flujo:** cada historia tiene su archivo en `docs/stories/<clave>.md` (se crean justo antes de desarrollarla, ver `docs/sprint-status.yaml`)
y se ejecuta como tarea `wf` con el mismo ID: Claude (supervisor) asigna y audita, Hermes perfil `trucoai` implementa, Emmanuel aprueba despacho y merge.

## Inventario de requisitos

### Funcionales
- **FR1** Mesa de 2/4/6 con equipos intercalados, repartidor al azar y rotación de repartidor y mano (GDD §2).
- **FR2** Ranking de cartas y resolución de bazas/manos con pardas según reglamento clásico (GDD §3–4).
- **FR3** Truco/retruco/vale cuatro con derecho a subir, respuestas y valores (GDD §5).
- **FR4** Envido: puntaje, ventana, cadena acumulativa, falta, empates, envido está primero, info pública (GDD §6).
- **FR5** Flor configurable con contraflor y contraflor al resto (GDD §7).
- **FR6** Irse al mazo (GDD §8).
- **FR7** Puntaje a 30, fin inmediato, historial, nueva partida limpia (GDD §9).
- **FR8** Pica-pica configurable en 6 jugadores con submanos 1v1 completas y falta = 7 (GDD §10).
- **FR9** IA justa sobre `Observation` con 3 dificultades medibles; compañeros en normal (GDD §11).
- **FR10** UI que solo ofrece acciones legales, panel de respuesta completo, avisos no bloqueantes, resumen de mano, fin de partida con historial (GDD §12).
- **FR11** Menú con cantidad de jugadores, dificultad, flor y pica-pica.

### No funcionales
- **NFR1** Motor puro, determinista con semilla, estado serializable, sin dependencias de runtime.
- **NFR2** 0 cuelgues / 0 violaciones de invariantes en 1.000 partidas simuladas por modo.
- **NFR3** Cobertura: engine ≥ 90% líneas, ai ≥ 80%, app ≥ 80%.
- **NFR4** Responsive (390×844 y 1280×800), táctil ≥ 44 px, jugable con teclado, textos escapados.
- **NFR5** CI en GitHub Actions; Vercel deploya `main`; `main` siempre verde.
- **NFR6** Después de cada historia se juegan partidas completas de 2, 4 y 6 jugadores en el juego real (gate `partidas`) y en el motor (simulación): ninguna se traba.

### Mapa de cobertura

| FR/NFR | Historias |
|---|---|
| FR1 | 1-1 |
| FR2 | 1-2 |
| FR3 | 1-3 |
| FR4 | 1-4 |
| FR5 | 1-8, 2-4, 3-2 |
| FR6 | 1-5 |
| FR7 | 1-5, 3-3 |
| FR8 | 1-7 |
| FR9 | 1-6, 2-1…2-5 |
| FR10 | 3-1, 3-2, 3-3 |
| FR11 | 3-3 |
| NFR1 | 1-1, 1-6 |
| NFR2 | 1-6 |
| NFR3 | 0-1, cada historia |
| NFR4 | 3-2, 3-4 |
| NFR5 | 0-1, 0-2, 4-1, 4-2 |
| NFR6 | 0-2, 0-3, 1-5, 1-6 |

---

## Épica 0 — Fundaciones de calidad

Objetivo: que desde la primera historia exista una red de seguridad automática (CI, lint, cobertura).

### Historia 0-1: CI, lint y cobertura
Como desarrollador, quiero que cada push corra typecheck, lint, tests con cobertura y build, para que `main` nunca se rompa sin enterarme.
- **AC1** Existe `.github/workflows/ci.yml` que en push y PR a cualquier rama corre `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:coverage`, `npm run build` con Node 20.
- **AC2** `package.json` tiene scripts `typecheck`, `lint`, `test`, `test:coverage`, `sim`, `arena` (los dos últimos pueden imprimir "pendiente" hasta 1-6/2-1).
- **AC3** ESLint (flat config, typescript-eslint) configurado; `npm run lint` pasa sobre el código actual (el legacy puede tener reglas relajadas vía override, el código nuevo no).
- **AC4** Cobertura v8 configurada en `vitest.config.ts` con umbrales por carpeta para `src/engine/**` (90/85), `src/ai/**` excepto legacy (80/70), `src/app/**` (80/70); legacy excluido. Con carpetas vacías la corrida no falla.
- **AC5** `.nvmrc` = 20; favicon agregado (sin 404); `README.md` con cómo correr, testear y el flujo BMAD+wf.
- **AC6** Todos los tests existentes siguen en verde.

### Historia 0-2: Test de partidas completas 2/4/6 (gate `partidas`)
Como Emmanuel, quiero que después de cada historia se juegue sola una partida completa de 2, 4 y 6 jugadores en el juego real, para detectar trabas antes del merge.
- **AC** Playwright + driver de UI intercambiable + bot con semilla y reloj acelerado; 3 partidas por modo; detecta trabas, marcador que baja y errores de página; "nueva partida" **[UI-01]**.
- **AC** Gate `partidas` en `wf` y job en CI. Fallas conocidas etiquetadas `@conocido-<ID>` hasta la 0-3.

### Historia 0-3: Hotfix del juego actual — partidas completas sin trabas
Excepción acotada al ADR-1: el juego publicado se traba en 6p (pica-pica) y "Nuevo juego" nace terminado.
- **AC** Submanos de pica-pica disparan el turno de la IA **[UI-02, AI-04]**; nuevo juego limpio **[UI-01, ENG-01]**; timers viejos descartados **[UI-08]**.
- **AC** `test:partidas` verde con 10 semillas por modo, sin etiquetas `@conocido`.

### Historia 0-4: UI "mesa v2" sobre el juego actual
Aplica el rediseño aprobado (`docs/planning/ux-design.md`, `docs/design/mesa-v2/`) a la UI legacy para que se pueda jugar cómodo ya.
- **AC** Cartas legibles (SVG propios, sin opacidad), mesa elíptica con asientos por fórmula para 2/4/6, baza en el paño con "va ganando", turno visible, marcador Nosotros/Ellos con fósforos, panel de respuesta que no tapa la mesa, globos de canto, celular 390×844.
- **AC** Test de layout (nada fuera del viewport en 2/4/6 × 3 tamaños, capturas commiteadas) + axe sin violaciones serias; `test:partidas` en verde.

## Épica 1 — Motor de reglas v2 (`src/engine/`)

Objetivo: un motor puro, determinista y completamente testeado que implemente el GDD §2–10.

### Historia 1-1: Dominio, RNG, reparto y rotación
- **AC1** `types.ts` con los tipos de `architecture.md` §4; `rng.ts` con `mulberry32(seed)` serializable; `cards.ts` (`createDeck`, `cardRank`, `envidoValue`, `cardName`, `cardId`).
- **AC2** `createMatch({rules, seed, names?, firstDealerSeat?, deck?})` crea asientos (humano p0, equipos intercalados), elige repartidor con el RNG (o `firstDealerSeat`), reparte 3 cartas desde el mano, guarda `dealt` y deja `phase='PLAYING'`, `turnId = manoId`.
- **AC3** Mano = asiento siguiente al repartidor. Al empezar cada mano nueva, el repartidor rota +1 **[ENG-06]**.
- **AC4** `getActor`, `getLegalActions` (por ahora solo `PLAY_CARD` de las cartas propias para el actor), `applyAction` (valida actor y legalidad, errores `NOT_YOUR_TURN` / `ILLEGAL_ACTION` **[ENG-10]**), turno avanza en orden dentro de la baza.
- **AC5** Mismo seed ⇒ mismo reparto; `deck` fijo ⇒ reparto exacto documentado; estado serializable (`JSON.parse(JSON.stringify(s))` equivalente).
- **AC6** Sin `Math.random` en `src/engine` (test que lo verifica con grep).

### Historia 1-2: Bazas y resolución de la mano
- **AC1** `resolveTrick` según GDD §4.1 (mejor carta por equipo, parda entre equipos, mismo equipo no es parda).
- **AC2** `resolveHandWinner` cubre las 27 secuencias de 3 bazas (gana/pierde/parda) según GDD §4.2, test tabla completo **[ENG-08]**.
- **AC3** Quién abre: ganador de la baza anterior; después de parda, el mismo que abrió la parda **[ENG-07]**.
- **AC4** La mano termina en cuanto está decidida; `phase='HAND_OVER'`, `hand.result`, evento `HAND_OVER`, 1 punto al ganador (sin truco). Eventos `TRICK_WON` emitidos después de actualizar el estado **[ENG-16]**.
- **AC5** `startNextHand` desde `HAND_OVER` reparte la siguiente con rotación.

### Historia 1-3: Truco
- **AC1** Legalidad de `CALL_TRUCO` (en su turno antes de jugar; subir solo quien tiene el quiero; un escalón), responder (`ANSWER_TRUCO`, subir con `CALL_TRUCO`, `MAZO` como no quiero).
- **AC2** Con truco pendiente (`AWAITING_TRUCO`) no es legal `PLAY_CARD` **[ENG-02]**; responde el jugador definido en GDD §5.
- **AC3** Valores querido/no querido según tabla; "no quiero" termina la mano en el acto **[ENG-03]**; los puntos de truco se pagan en `HAND_OVER` al ganador de la mano.
- **AC4** Una sola tabla de valores de truco **[ENG-20]**; `pending` y `quieroTeam` siempre coherentes **[ENG-18]**.

### Historia 1-4: Envido
- **AC1** `envidoScore` sobre `dealt` **[ENG-05]**; tabla de cadena y puntos del GDD §6.3 completa como test **[ENG-04]**.
- **AC2** Ventana: primera baza, en su turno antes de jugar, una cadena por mano; no después de truco querido ni por el que cantó el truco pendiente **[ENG-13]**.
- **AC3** El envido está primero: con truco pendiente en primera baza el respondedor puede `CALL_ENVIDO`; al resolverse vuelve a `AWAITING_TRUCO` **[UI-05]**.
- **AC4** Falta: lo que le falta al que va ganando; por el partido si está en malas **[ENG-11]**.
- **AC5** Resolución: empate para el más cercano al mano **[ENG-12]**; `revealed` solo con lo público; puntos inmediatos; si llega a 30 → `MATCH_OVER`.
- **AC6** Con envido pendiente no es legal `PLAY_CARD` ni `MAZO` **[ENG-02]**.

### Historia 1-5: Irse al mazo, puntaje y fin de partida
- **AC1** `MAZO` legal en su turno o como respuesta a truco; no legal con envido/flor pendiente **[ENG-09]**.
- **AC2** Puntos del mazo según GDD §8; un solo `endHand` y un solo `addPoints` para todos los caminos.
- **AC3** Fin inmediato al llegar a 30 desde cualquier camino; marcador con tope 30; `MATCH_OVER` sin acciones legales.
- **AC4** Historial por mano (`HandRecord`) con número de mano correcto **[ENG-15]** y cantos.
- **AC5** `createMatch` siempre produce estado limpio; test "jugar partida completa, crear otra, jugar otra" en **2, 4 y 6 jugadores** **[ENG-01]**.

### Historia 1-6: Observación pública y simulación
- **AC1** `getObservation` según contrato; no incluye cartas ocultas ni envidos no revelados; test de fuga serializando **[AI-09]**.
- **AC2** `scripts/sim.ts` y `simulation.test.ts` con los 11 invariantes de `test-strategy.md` §2; 200 partidas por modo en CI, 1.000 con `npm run sim`.
- **AC3** Test de determinismo por hash.

### Historia 1-7: Pica-pica
- **AC1** Activación (ambos equipos 5–25), alternancia pica-pica/redonda, opción `rules.picaPica`.
- **AC2** Submanos 1v1 en el orden del GDD §10, cada una con bazas, envido, flor, truco y mazo propios; puntos al equipo en el momento; falta envido = 7 **[ENG-14]**.
- **AC3** `getActor` nunca `null` entre submanos (arrancan solas, sin depender de la UI) **[AI-04, UI-02]**; repartidor rota normalmente.
- **AC4** Simulación 6p con pica-pica sin violaciones.

### Historia 1-8: Flor (configurable)
- **AC1** Con `rules.flor=false` nada cambia (tests de 1-4 siguen verdes).
- **AC2** Con flor: declaración automática/obligatoria, anula envido, 3 por flor, con flor me achico, contraflor, contraflor al resto (GDD §7), tabla única de valores.
- **AC3** Simulación con flor sin violaciones.

## Épica 2 — IA heurística

### Historia 2-1: Contrato de política, política aleatoria y arena
- **AC1** `Policy`, `randomPolicy`, `firstLegalPolicy`; `decide` siempre devuelve una acción de `obs.legalActions` (test con 1.000 observaciones de simulación).
- **AC2** `scripts/arena.ts --a normal --b easy --players 4 --games 1000 --seed 1` imprime win% con IC de Wilson; asientos alternados.
- **AC3** La IA no importa nada de `src/engine` salvo tipos y helpers puros (test de imports).

### Historia 2-2: Juego de cartas y juego en equipo
- Abre bajo, gana con la mínima, no le gana al compañero que va ganando, juega para ganar cuando es obligatorio, emparda cuando conviene **[AI-05, AI-06]**. Tests por situación.

### Historia 2-3: Decisiones de truco
- Cantar/aceptar/subir según fuerza de mano, bazas, cartas vistas y marcador; nunca saltos ilegales; mazo solo cuando mejora el resultado esperado **[AI-02, AI-07, AI-08]**.

### Historia 2-4: Decisiones de envido y flor
- Umbrales por posición (mano/pie), falta por presión de marcador, respuestas con lo público; en 4p/6p canta con frecuencia realista **[AI-10]**; contraflor.

### Historia 2-5: Perfiles de dificultad
- Fácil/normal/difícil según GDD §11.2; `arena.test.ts` (300 partidas por cruce, 2p y 4p): difícil > normal y normal > fácil con IC que excluya 50%; reporte de 1.000 partidas en `docs/planning/arena-report.md` **[AI-03]**.

## Épica 3 — Aplicación y UI sobre el motor v2

### Historia 3-1: GameController y scheduler
- Driver de IA único con versión y cancelación; `autoAck`; `newMatch`; hooks `?seed/fast/aiDelay/autoAck/scores/dealer`; `window.__truco` **[UI-03, UI-06, UI-08]**. Tests sin DOM con scheduler instantáneo: 100 partidas completas sin humano (humano = política) sin dobles acciones.

### Historia 3-2: Mesa renderizada desde estado y acciones legales
- Cartas y botones solo si son legales **[UI-04, UI-09]**; panel de respuesta con todas las subidas y envido está primero **[UI-10]**; indicador de turno = `getActor` **[UI-07]**; toasts no bloqueantes **[UI-15]**; textos correctos **[UI-11]**; `data-testid`; sin `onclick` inline; `escapeHtml`.

### Historia 3-3: Menú, reglas, nueva partida, fin de partida
- Menú con jugadores, dificultad, flor, pica-pica; nueva partida limpia **[UI-01]**; resumen de mano; fin de partida con historial con scroll **[UI-12]**; "Nosotros/Ellos" **[UI-16]**.

### Historia 3-4: Responsive y accesibilidad
- 2/4/6 sin cortes en 1280×800 y 390×844 **[UI-13, UI-14]**; táctil ≥ 44 px; cartas como `<button>` con `aria-label`; `aria-live` para eventos; foco en paneles.

### Historia 3-5: Retiro del legacy
- `main.ts` usa solo engine/ai/app/ui v2; se borran `src/core/`, `src/App.ts`, `src/ai/{AIPlayer,DecisionEngine,CardEvaluator}.ts`, tests y scripts legacy; docs viejos a `docs/legacy/`; cobertura global activada **[AI-01, AI-12]**.

## Épica 4 — E2E y release

### Historia 4-1: Suite E2E Playwright
- Los 12 escenarios de `test-strategy.md` §7; job `e2e` en CI; gate `e2e` en `wf`.

### Historia 4-2: Release 2.0
- Versión 2.0.0, README y ayuda de reglas in-game (resumen del GDD), smoke manual en la URL de Vercel, `CHANGELOG.md`.
