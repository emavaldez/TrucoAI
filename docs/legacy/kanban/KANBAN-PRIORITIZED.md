# 🎴 TRUCOAI — KANBAN FINAL (v2)

> **Fuente**: `truco_argentino_backlog.xlsx` — 22 User Stories, 49 Tasks técnicas, 172 Story Points  
> **Stack**: TypeScript + Vite (sin backend real — todo frontend)  
> **Reglas**: Truco argentino completo (sin flor), equipos fijos intercalados, 30 pts  
> **Estado actual**: `170/170` tests pasan | `3,749` LOC en `src/` | `10` archivos `*.ts`

---

## 📋 Leyenda

| Columna | Significado |
|---------|-------------|
| 🟦 **Backlog** | Sin empezar |
| 🟨 **En Progreso** | Asignado, trabajando |
| 🟩 **En Review** | Commiteado, pendiente de QA |
| ✅ **Done** | Commiteado + QA pasa |

---

## 🗺 MAPA DE EPICS vs CÓDIGO EXISTENTE

| Épica | US | SP | Archivos clave | Estado actual |
|-------|----|----|---------------|---------------|
| **E-01** Mazo y Reparto | US-01, US-02 | 8 SP | `src/core/Deck.ts` (151 LOC), `src/core/Card.ts` | ✅ `Deck.ts` tiene `createDeck()`, `Card.ts` tiene `CardDef` |
| **E-02** Partida y Turnos | US-03, US-04, US-05 | 17 SP | `src/core/GameEngine.ts` (1155 LOC), `src/types.ts` | ✅ `GameEngine` tiene `players[]`, `nextTurn()`, fases |
| **E-03** Bazas y Truco | US-06, US-07 | 18 SP | `src/core/Rules.ts`, `src/core/GameEngine.ts` | ✅ `Rules.ts` tiene `compareCards()`, falta resolución de mano |
| **E-04** Cantos – Truco | US-08 | 16 SP | `src/core/GameEngine.ts` | 🟡 `truco.level` existe, `trucoState` parcial |
| **E-05** Cantos – Envido | US-09, US-10 | 30 SP | `src/ai/CardEvaluator.ts`, `src/core/GameEngine.ts` | 🟡 `canCallEnvido` existe, falta `envidoStateMachine` |
| **E-06** Irse al Mazo | US-11 | 7 SP | `src/core/GameEngine.ts` | 🟦 No existe `irseAlMazo()` |
| **E-07** Puntuación y Fin | US-12, US-13 | 14 SP | `src/core/GameEngine.ts`, `src/ui/UIManager.ts` | 🟡 `scores`, `checkWinCondition()` parcial |
| **E-08** IA Básica | US-14 a US-17 | 29 SP | `src/ai/` (`CardEvaluator.ts`, `AIPlayer.ts`, `DecisionEngine.ts`) | 🟡 Heurísticas parciales, falta delay realista |
| **E-09** Game Loop | US-18, US-19 | 18 SP | `src/core/GameEngine.ts`, `src/App.ts` | 🟡 `GameEngine.ts` con fases, `App.ts` con event handlers |
| **E-10** Casos Borde | US-20, US-21, US-22 | 15 SP | `src/core/GameEngine.ts`, `src/core/Rules.ts` | 🟦 Sin implementar |

---

## 🟦 BACKLOG COMPLETO (22 US, 49 TASKS)

### 🃏 Epic E-01: Mazo y Reparto de Cartas (8 SP)

| US | Task | Descripción | AC | Prioridad | SP |
|----|------|------------|----|-----------|----|
| **US-01** | — | **Definición y modelado del mazo español** — 40 cartas, 4 palos (espada, basto, copa, oro), valores 1-7 y 10-12 | Carta con: `valor`, `palo`, `valorEnvido`, `valorTruco`, `nombreDisplay` | 🔴 Alta | 5 |
| US-01 | **T-001** | Crear estructura `Carta` con `valorEnvido` (0-7) y `valorTruco` (0-14) según ranking oficial | 1-esp=14, 1-basto=13, 7-esp=12, 7-oro=11, 3=10, 2=9, 1copa/oro=8, figuras=7-4 | 🔴 Alta | 3 |
| US-01 | **T-002** | `generarMazo()` — Fisher-Yates shuffle, 40 cartas únicas, sin 8/9 | Test unicidad + completitud | 🔴 Alta | 2 |
| **US-02** | — | **Reparto inicial** — 3 cartas a cada jugador al inicio de cada mano | Mano primero, sentido horario, sin duplicar | 🔴 Alta | 3 |
| US-02 | **T-003** | `repartirCartas(mazo, jugadores)` — asigna 3 cartas, `mano` recibe primero | 6j=18 cartas, 4j=12, 2j=6 | 🔴 Alta | 2 |
| US-02 | **T-004** | Estado `en_mano` / `jugada` — IA solo ve sus cartas, cartas jugadas visibles en mesa | | 🟡 Media | 1 |

### 🏗 Epic E-02: Estructura de Partida y Turnos (17 SP)

| US | Task | Descripción | AC | Prioridad | SP |
|----|------|------------|----|-----------|----|
| **US-03** | — | **Configuración inicial** — elegir 2/4/6 jugadores + equipos | Humano en pos 0, parejas fijas intercaladas | 🔴 Alta | 5 |
| US-03 | **T-005** | Modelo `Partida`: modo, equipos, puntaje[2], historial, `mano_actual` | `nJugadores`, `equipos[]`, `puntajeEquipo[2]` | 🔴 Alta | 3 |
| US-03 | **T-006** | `mano` inicial al azar + rotación por mano | Cada nueva mano rota al siguiente jugador en sentido horario | 🔴 Alta | 2 |
| **US-04** | — | **Modelo de Mano** — 3 bazas, `estadoEnvido`, `estadoTruco`, `ganadorMano` | `bazas[3]`, `puntosEnJuego`, estado `en_curso`/`resuelta` | 🔴 Alta | 5 |
| US-04 | **T-007** | `Mano`: `bazas`, `cartasJugadas`, `estadoEnvido`, `estadoTruco`, `ganadorMano` | | 🔴 Alta | 3 |
| US-04 | **T-008** | Modelo `Baza`: `cartasJugadas[porJugador]`, `ganadorBaza`, orden respeta turno | `ganadorBaza: equipoId | 'parda'` | 🔴 Alta | 2 |
| **US-05** | — | **Gestión de turnos** — orden dentro de cada baza | Baza 1: mano juega primero; baza 2+: ganador baza anterior | 🔴 Alta | 4 |
| US-05 | **T-009** | Quién juega en cada momento: baza 1 → mano; baza 2/3 → ganador | Parda → conserva el que era mano | 🔴 Alta | 2 |
| US-05 | **T-010** | Validar turno: `No es tu turno`, IA espera | | 🔴 Alta | 1 |

### 🏆 Epic E-03: Lógica de Bazas y Resolución del Truco (18 SP)

| US | Task | Descripción | AC | Prioridad | SP |
|----|------|------------|----|-----------|----|
| **US-06** | — | **Comparación de cartas** — `valorTruco` determina ganadora o `parda` | `1esp > 1bas > 7esp > 7oro > 3 > 2 > 1cop > 1oro > ...` | 🔴 Alta | 5 |
| US-06 | **T-011** | `compararCartas(A, B)` → ganadora o `parda` | Funciona para 40 cartas, test: 1esp vs 1bas | 🔴 Alta | 2 |
| US-06 | **T-012** | `resolverBaza(baza, nJugadores)` → mejor carta de cada equipo compite | En equipo, la mejor carta del equipo = la que compite | 🔴 Alta | 3 |
| **US-07** | — | **Resolución de mano** — 3 bazas, determinar ganador | Gana 2 de 3, casos especiales de parda | 🔴 Alta | 8 |
| US-07 | **T-013** | Lógica completa con 7 casos: todas las combinaciones de baza | Caso 4: parda baza1 y baza2 → gana MANO | 🔴 Alta | 5 |
| US-07 | **T-014** | Optimización: no jugar baza3 si baza1+baza2 ya definieron | Si 1-2 → no 3ra; si parda 1 + gana 2 → fin | 🟡 Media | 2 |

### 🎯 Epic E-04: Sistema de Cantos – Truco (16 SP)

| US | Task | Descripción | AC | Prioridad | SP |
|----|------|------------|----|-----------|----|
| **US-08** | — | **Cadena de escalada del Truco** — Truco → Retruco → Vale Cuatro | `nivel: none|truco|retruco|valecuatro`, puntos 1-4 | 🔴 Alta | 8 |
| US-08 | **T-015** | `estadoTruco`: `nivel`, `cantadoPor`, `estado`, `puntosEnJuego` | Truco no querido=1pt, Retruco no=2pt, Vale4 no=3pt | 🔴 Alta | 3 |
| US-08 | **T-016** | Quién puede cantar: NO el que cantó, solo ANTES de jugar todas | Excepción: equipo contrario puede escalar directo | 🔴 Alta | 3 |
| US-08 | **T-017** | Respuestas: `quiero`, `no quiero`, `escalar` — reglas | Vale4 → solo quiero/no quiero | 🔴 Alta | 3 |
| US-08 | **T-018** | Puntos al final de mano: sin truco=1pt, con truco=nivel | | 🔴 Alta | 2 |

### 📯 Epic E-05: Sistema de Cantos – Envido (30 SP)

| US | Task | Descripción | AC | Prioridad | SP |
|----|------|------------|----|-----------|----|
| **US-09** | — | **Cálculo de envido** — `calcularEnvido(3 cartas)` → puntaje | Sumar 2 del mismo palo + 20, figuras=0 | 🔴 Alta | 5 |
| US-09 | **T-019** | `calcularEnvido()` — par más alto, mejor individual si no hay par | `3+5+20=28` (par), `max(3,5,7)=7` (sin par) | 🔴 Alta | 3 |
| US-09 | **T-020** | En 4j/6j: mejor jugador del equipo representa al equipo | 15/28/22 → 28 compite, gana el más cercano al mano | 🔴 Alta | 2 |
| **US-10** | — | **Cadena de escalada del Envido** — Env→Env+Env→Real→Falta | Solo primera baza, después ya no | 🔴 Alta | 10 |
| US-10 | **T-021** | `estadoEnvido`: `cantos[]`, `estado`, `puntosEnJuego`, `cantadoPor` | Cadena: env→env+env→real→falta | 🔴 Alta | 4 |
| US-10 | **T-022** | Tabla completa de puntos (no querido vs querido) | Falta env: puntos que faltan al perdedor para 30 | 🔴 Alta | 5 |
| US-10 | **T-023** | Cálculo Falta Envido — siempre ≥1, nunca >30 | Perdedor 20pt → vale 10 (30-20) | 🔴 Alta | 3 |
| US-10 | **T-024** | Cuándo se puede y NO se puede cantar envido | Antes de 2da baza, si ya comenzó → error | 🔴 Alta | 2 |
| US-10 | **T-025** | Respuestas: quiero, no quiero, escalar, son buenas | `Son buenas` = concesión, pierde sin mostrar | 🔴 Alta | 3 |
| US-10 | **T-026** | Mostrar tantos al resolver envido (ganador revela) | En equipos: revelar mejor puntaje + quién | 🟡 Media | 2 |

### 🏃 Epic E-06: Irse al Mazo (7 SP)

| US | Task | Descripción | AC | Prioridad | SP |
|----|------|------------|----|-----------|----|
| **US-11** | — | **Irse al mazo** — rendición con consecuencias | Cualquier momento del turno, todo el equipo se va | 🔴 Alta | 4 |
| US-11 | **T-027** | `irseAlMazo(jugadorId)` — valida, ejecuta, da puntos | Si envido pendiente → resolver primero | 🔴 Alta | 3 |
| US-11 | **T-028** | Puntos al irse: envido resuelto + truco según nivel | Si envido querido → rival cobra TODO | 🔴 Alta | 2 |

### 🏅 Epic E-07: Puntuación y Fin de Partida (14 SP)

| US | Task | Descripción | AC | Prioridad | SP |
|----|------|------------|----|-----------|----|
| **US-12** | — | **Sistema de puntuación a 30** — acumular, verificar fin, terminar | Llegar a 30 = fin, envido capa en 30 | 🔴 Alta | 5 |
| US-12 | **T-029** | `agregarPuntos(equipo, pts)` — acumula, verifica, emite eventos | `partidaFinalizada` si ≥30 | 🔴 Alta | 3 |
| US-12 | **T-030** | Calcular puntos al fin de mano: truco+envido pueden ir a distintos equipos | Truco al equipo A, envido al B | 🔴 Alta | 3 |
| US-12 | **T-031** | Detectar fin mid-mano: si envido llega a 30, no se juega truco | Envido → 30, partida termina | 🟡 Media | 2 |
| **US-13** | — | **Historial y marcador** — estado completo serializable | `historialManos[]`, `puntajeEquipos`, `manoActual` | 🟡 Media | 3 |
| US-13 | **T-032** | Historial de manos: `nroMano`, `ganadorTruco`, `ganadorEnvido`, `cartas` | | 🟡 Media | 2 |
| US-13 | **T-033** | Estado serializable = todo el estado para reconstruir partida | | 🟡 Media | 1 |

### 🤖 Epic E-08: IA Básica (29 SP)

| US | Task | Descripción | AC | Prioridad | SP |
|----|------|------------|----|-----------|----|
| **US-14** | — | **IA: qué carta jugar** — más baja/alta según contexto | Conservar buenas, no desperdiciar altas | 🔴 Alta | 8 |
| US-14 | **T-034** | Estrategia base: jugar la más baja (conservar), si va ganando → mínima que gane | Solo ve sus cartas + cartas en mesa, sin memoria | 🔴 Alta | 5 |
| US-14 | **T-035** | Delays realistas: 800-2000ms aleatorio, no bloquea | `setTimeout` asíncrono | 🟡 Baja | 1 |
| **US-15** | — | **IA: cantar Truco** — heurística | 1 carta ≥10 → cantar; si pierde por 10+ → agresivo | 🔴 Alta | 5 |
| US-15 | **T-036** | Cantar truco si 1+ carta buena, no si todas ≤5 | Si va perdiendo por 10+ → cantar con menos | 🔴 Alta | 3 |
| US-15 | **T-037** | Responder: quiero si 1+ buena, escalar a retruco si 2+ | | 🔴 Alta | 2 |
| **US-16** | — | **IA: cantar Envido** — según puntaje propio | ≥27 → envido, ≥30 → real, ≤22 → no | 🔴 Alta | 5 |
| US-16 | **T-038** | Cantar envido si puntaje ≥ 27, real si ≥30, falta si desesperación | | 🔴 Alta | 3 |
| US-16 | **T-039** | Responder: aceptar si ≥25, rechazar si ≤20, `son buenas` si ≤18 | | 🔴 Alta | 2 |
| **US-17** | — | **IA: irse al mazo** — cuándo rendirse | 3 cartas ≤4 → irse, si envido pendiente → no | 🟡 Media | 3 |
| US-17 | **T-040** | Heurística: si todas ≤4 → mazo, si perdió 2 bazas + truco cantado → mazo | | 🟡 Media | 2 |

### 🔄 Epic E-09: Motor de Juego – Game Loop (18 SP)

| US | Task | Descripción | AC | Prioridad | SP |
|----|------|------------|----|-----------|----|
| **US-18** | — | **Game Loop principal** — máquina de estados que coordina todo | `INICIO_PARTIDA→INICIO_MANO→TURNO_JUGADOR→...→FIN_PARTIDA` | 🔴 Alta | 8 |
| US-18 | **T-041** | `GameEngine` con estados: solo acciones válidas en estado correcto | Máquina de 7 estados (ver sheet) | 🔴 Alta | 5 |
| US-18 | **T-042** | Interfaz pública: `jugarCarta`, `cantarTruco`, `responderTruco`, etc. | Todos `{ok, error?, estado}` | 🔴 Alta | 3 |
| US-18 | **T-043** | Eventos: `cartaJugada`, `bazaResuelta`, `trucoCantado`, `partidaFinalizada` | Observer/EventEmitter | 🔴 Alta | 2 |
| **US-19** | — | **Validaciones y manejo de errores** | Rechazar inválido con mensaje, log para debug | 🔴 Alta | 4 |
| US-19 | **T-044** | Validar todo: turno, acción válida en estado, cantos en orden | | 🔴 Alta | 3 |
| US-19 | **T-045** | Test integración: partida completa IA vs IA, 100 partidas, sin loops | | 🔴 Alta | 2 |

### ⚠️ Epic E-10: Casos Borde y Reglas Especiales (15 SP)

| US | Task | Descripción | AC | Prioridad | SP |
|----|------|------------|----|-----------|----|
| **US-20** | — | **Coexistencia truco + envido** — ambos pendientes al mismo tiempo | Envido se resuelve primero, truco no se pierde | 🔴 Alta | 4 |
| US-20 | **T-046** | Si ambos cantados: resolver envido primero, después retomar truco | El envido tiene prioridad | 🔴 Alta | 3 |
| US-20 | **T-047** | No cantar envido después de 1ra baza | Ventana: desde mano hasta 1ra carta de 2da baza | 🔴 Alta | 2 |
| **US-21** | — | **Mazo con truco y envido** — puntos al irse al mazo con cantos | Resolver envido primero, luego dar puntos de truco | 🔴 Alta | 3 |
| US-21 | **T-048** | Todos los puntos pendientes al irse al mazo | Si envido pendiente → resolver, luego dar truco | 🔴 Alta | 2 |
| **US-22** | — | **Todas las pardas posibles** — 9 escenarios | Cada escenario → test unitario | 🔴 Alta | 3 |
| US-22 | **T-049** | Test: parda baza1 y baza2 → gana mano; parda todas → gana mano | `parda × 3 → ganador = mano` | 🔴 Alta | 2 |

---

## 📊 RESUMEN DE PROYECTO

| Métrica | Valor |
|---------|-------|
| **Total User Stories** | 22 |
| **Total Tareas Técnicas** | 49 |
| **Story Points** | 172 |
| **Archivos fuente** | 10 `.ts` (3,749 LOC) |
| **Tests QA** | 170 (actuales) |
| **Tareas implementadas** | 0 de 49 (TODO en backlog) |

---

## 🎯 ORDEN DE IMPLEMENTACIÓN (por dependencias)

### Fase 1 — Fundación (7 US, 16 tasks, 45 SP)
1. **US-01 (T-001, T-002)** — Modelo de carta + mazo ✅ (`Deck.ts` ya existe)
2. **US-02 (T-003, T-004)** — Reparto inicial ✅ (parcial en `GameEngine`)
3. **US-03 (T-005, T-006)** — Partida + equipos + mano
4. **US-04 (T-007, T-008)** — Modelo de mano y baza
5. **US-05 (T-009, T-010)** — Turnos + validación
6. **US-06 (T-011, T-012)** — Comparación de cartas
7. **US-07 (T-013, T-014)** — Resolución de mano

### Fase 2 — Cantos y apuestas (4 US, 14 tasks, 50 SP)
8. **US-08 (T-015→T-018)** — Cadena de truco (8 tasks)
9. **US-09 (T-019, T-020)** — Cálculo de envido
10. **US-10 (T-021→T-026)** — Cadena de envido (6 tasks)
11. **US-11 (T-027, T-028)** — Irse al mazo

### Fase 3 — Puntuación y fin (2 US, 5 tasks, 14 SP)
12. **US-12 (T-029→T-031)** — Score a 30 + fin de partida
13. **US-13 (T-032, T-033)** — Historial + estado serializable

### Fase 4 — IA (4 US, 7 tasks, 29 SP)
14. **US-14 (T-034, T-035)** — Decisión de carta + delay
15. **US-15 (T-036, T-037)** — Decisión de truco
16. **US-16 (T-038, T-039)** — Decisión de envido
17. **US-17 (T-040)** — Decisión de irse al mazo

### Fase 5 — Motor + Edge Cases (4 US, 9 tasks, 37 SP)
18. **US-18 (T-041→T-043)** — Game loop + eventos
19. **US-19 (T-044, T-045)** — Validaciones + tests
20. **US-20 (T-046, T-047)** — Coexistencia truco/envido
21. **US-21 (T-048)** — Mazo con cantos pendientes
22. **US-22 (T-049)** — Pardas exhaustivas

---

## ✅ DONE: Commits existentes (fixes previos)

| Commit | Archivos | Fix |
|--------|----------|-----|
| `df2fc18` | `GameEngine.ts`, `UIManager.ts` | Botones de envido no reaparecían, `canCallEnvido` más restrictivo |
| `17055fb` | `UIManager.ts`, `App.ts` | Cartas jugadas con brillo, `showRoundOverPanel` simplificado |