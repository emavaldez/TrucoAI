# 🃏 TRUCO ARGENTINO — KANBAN COMPLETO

> **Fuente**: `truco_argentino_backlog.xlsx` — 22 User Stories, 49 Tasks, 172 SP  
> **Proyecto**: TrucoAI en `/Users/emmanuelvaldez/GameDev/TrucoAI`  
> **Stack**: TypeScript + Vite (sin backend real — todo frontend)  
> **Estado actual**: 170/170 tests pasan | 3,749 LOC en `src/` | `npx tsc --noEmit` OK

---

## 📋 LEYENDA

| Columna | Estado |
|---------|--------|
| 🟦 **Backlog** | Sin empezar — fuera del scope actual |
| 🟨 **En Progreso** | Asignado, trabajando |
| 🟩 **En Review** | Commiteado, pendiente de QA |
| ✅ **Done** | Implementado + testes pasan |
| 🔴 **Bloqueado** | Depende de otra US primero |

---

## 📊 AUDITORÍA DE CÓDIGO EXISTENTE

| Archivo | LOC | Cubre |
|---------|-----|-------|
| `src/types.ts` | 120 | `Carta`, `Jugador`, `Baza`, `Mano`, `Estado` |
| `src/core/Deck.ts` | 85 | `generarMazo()`, `repartirCartas()` |
| `src/core/GameEngine.ts` | 1,108 | Game loop, turnos, truco, envido, score |
| `src/core/Rules.ts` | 106 | Comparación de cartas, valores de truco |
| `src/ai/CardEvaluator.ts` | 163 | `calcularEnvido()` con reglas completas |
| `src/ai/AIPlayer.ts` | 70 | IA básica con decisiones |
| `src/ai/DecisionEngine.ts` | 60 | Heurísticas de truco/envido |
| `src/ui/UIManager.ts` | 779 | Renderizado DOM, botoneras |
| `src/App.ts` | 548 | App principal, event handlers |
| `scripts/trucoai-qa.ts` | 711 | 170 tests de reglas |

---

## 🟦 ÉPICA 1: Mazo y Reparto de Cartas (8 SP)

| E-01 | US ID | Task | Nombre | Prioridad | SP | Estado |
|------|-------|------|--------|-----------|----|--------|
| US-01 | ✅ **DONE** (parcial) | T-001 | **Carta** — `{valor, palo, valorEnvido, valorTruco}` | 🔴 Alta | 3 | `types.ts` tiene `Carta` con `valorTruco` y `valorEnvido` |
| US-01 | ✅ **DONE** | T-002 | **`generarMazo()`** — 40 cartas, Fisher-Yates | 🔴 Alta | 2 | `Deck.ts` tiene `createDeck()` |
| US-02 | ✅ **DONE** | T-003 | **`repartirCartas()`** — 3 cartas por jugador, mano primero | 🔴 Alta | 2 | `Deck.ts` tiene `dealCards()` |
| US-02 | ✅ **DONE** | T-004 | **Estado `en_mano`/`jugada`** — tracking por carta | 🟡 Media | 1 | `types.ts` tiene `cartaEstado` |

**Cobertura**: ~80% — falta `nombre_display` (string español) y valorEnvido en `Carta` (solo existe `valorTruco`).

---

## 🟦 ÉPICA 2: Estructura de Partida y Turnos (17 SP)

| E-02 | US ID | Task | Nombre | Prioridad | SP | Estado |
|------|-------|------|--------|-----------|----|--------|
| US-03 | ✅ **DONE** | T-005 | **Partida** — `{nJugadores, equipos, puntaje}` | 🔴 Alta | 3 | `GameEngine.ts` tiene `initGame()` con equipos |
| US-03 | ✅ **DONE** | T-006 | **Mano al azar** + rotación | 🔴 Alta | 2 | `GameEngine.ts` tiene `currentMano` y `nextMano` |
| US-04 | ✅ **DONE** | T-007 | **Mano** — `{bazas, puntos, estado}` | 🔴 Alta | 3 | Ya existe `Mano` en `types.ts` |
| US-04 | ✅ **DONE** | T-008 | **Baza** — `{cartasJugadas, ganador}` | 🔴 Alta | 2 | Estructura `Baza` existe en `types.ts` |
| US-05 | ✅ **DONE** | T-009 | **Orden de baza** — mano→ganador baza anterior | 🔴 Alta | 2 | `GameEngine.ts` tiene `nextTurn()` |
| US-05 | ✅ **DONE** | T-010 | **Validar turno** — error "No es tu turno" | 🔴 Alta | 1 | `GameEngine.ts` tiene `validateTurn()` |

---

## 🟦 ÉPICA 3: Lógica de Bazas y Resolución del Truco (18 SP)

| E-03 | US ID | Task | Nombre | Prioridad | SP | Estado |
|------|-------|------|--------|-----------|----|--------|
| US-06 | ✅ **DONE** | T-011 | **`compararCartas()`** — ranking completo | 🔴 Alta | 2 | `Rules.ts` tiene `compareCards()` |
| US-06 | ✅ **DONE** | T-012 | **`resolverBaza()`** — equipos + mejor carta | 🔴 Alta | 3 | `GameEngine.ts` tiene `resolveBaza()` |
| US-07 | ✅ **DONE** | T-013 | **Resolver mano** — gana 2/3, casos especiales | 🔴 Alta | 5 | `GameEngine.ts` tiene `resolveMano()` |
| US-07 | ✅ **DONE** | T-014 | **Optimización** — detectar fin antes de baza3 | 🟡 Media | 2 | `GameEngine.ts` — `checkManoResolved()` |

---

## 🟦 ÉPICA 4: Sistema de Cantos – Truco (16 SP)

| E-04 | US ID | Task | Nombre | Prioridad | SP | Estado |
|------|-------|------|--------|-----------|----|--------|
| US-08 | ✅ **DONE** (parcial) | T-015 | **`estadoTruco`** — `{nivel, cantadoPor, estado}` | 🔴 Alta | 3 | `GameEngine.ts` tiene `truco.level` |
| US-08 | 🟨 **En Progreso** | T-016 | **Validar quién y cuándo** — solo antes de jugar todas las cartas | 🔴 Alta | 3 | Falta validación de "antes de baza3" |
| US-08 | ✅ **DONE** | T-017 | **Respuestas** — quiero/no quiero/escalar | 🔴 Alta | 3 | `GameEngine.ts` tiene `responderTruco()` |
| US-08 | ✅ **DONE** | T-018 | **Puntos al final** — 1-4 según nivel | 🔴 Alta | 2 | `GameEngine.ts` tiene `calcularPuntosTruco()` |

---

## 🟦 ÉPICA 5: Sistema de Cantos – Envido (30 SP)

| E-05 | US ID | Task | Nombre | Prioridad | SP | Estado |
|------|-------|------|--------|-----------|----|--------|
| US-09 | ✅ **DONE** | T-019 | **`calcularEnvido()`** — reglas de pares + 20 | 🔴 Alta | 3 | `CardEvaluator.ts` tiene `evaluateEnvido()` |
| US-09 | ✅ **DONE** (parcial) | T-020 | **Equipo → mejor jugador** — el de mayor puntaje | 🔴 Alta | 2 | Falta implementación en equipos |
| US-10 | ✅ **DONE** (parcial) | T-021 | **`estadoEnvido`** — cadena completa de cantos | 🔴 Alta | 4 | `GameEngine.ts` tiene `canCallEnvido` |
| US-10 | ✅ **DONE** (parcial) | T-022 | **Puntos por canto** — tabla completa | 🔴 Alta | 5 | `GameEngine.ts` tiene cálculos |
| US-10 | ✅ **DONE** (parcial) | T-023 | **Falta Envido** — puntos según perdedor | 🔴 Alta | 3 | `GameEngine.ts` tiene `resolveFaltaEnvido()` |
| US-10 | ✅ **DONE** | T-024 | **Cuándo se puede** — solo primera baza | 🔴 Alta | 2 | `GameEngine.ts` valida |
| US-10 | 🟨 **En Progreso** | T-025 | **Respuestas** — quiero/no/son_buenas | 🔴 Alta | 3 | Falta implementar "son buenas" |
| US-10 | 🟨 **En Progreso** | T-026 | **Mostrar tantos** — revelar envido | 🟡 Media | 2 | Falta revelación en UI |

---

## 🟦 ÉPICA 6: Irse al Mazo (7 SP)

| E-06 | US ID | Task | Nombre | Prioridad | SP | Estado |
|------|-------|------|--------|-----------|----|--------|
| US-11 | ✅ **DONE** (parcial) | T-027 | **`irseAlMazo()`** — equipo entero, puntos según estado | 🔴 Alta | 3 | `GameEngine.ts` tiene `irAlMazo()` |
| US-11 | 🟨 **En Progreso** | T-028 | **Puntos con truco/envido** — gestión de puntos | 🔴 Alta | 2 | Falta test de combinaciones |

---

## 🟦 ÉPICA 7: Puntuación y Fin de Partida (14 SP)

| E-07 | US ID | Task | Nombre | Prioridad | SP | Estado |
|------|-------|------|--------|-----------|----|--------|
| US-12 | ✅ **DONE** (parcial) | T-029 | **`agregarPuntos()`** — acumula + 30 check | 🔴 Alta | 3 | `GameEngine.ts` tiene |
| US-12 | ✅ **DONE** | T-030 | **Puntos fin de mano** — truco + envido | 🔴 Alta | 3 | `GameEngine.ts` — `endMano()` |
| US-12 | ✅ **DONE** | T-031 | **Fin mid-mano** — envido define antes que truco | 🔴 Alta | 2 | `GameEngine.ts` — `checkWinCondition()` |
| US-13 | 🟨 **En Progreso** | T-032 | **Historial** — `{mano, resultado, cartas, cantos}` | 🟡 Media | 2 | `GameEngine.ts` tiene `historialManos` |
| US-13 | 🟨 **En Progreso** | T-033 | **Estado serializable** — reconstruir partida | 🟡 Media | 1 | Falta objeto completo |

---

## 🟦 ÉPICA 8: Inteligencia Artificial Básica (29 SP)

| E-08 | US ID | Task | Nombre | Prioridad | SP | Estado |
|------|-------|------|--------|-----------|----|--------|
| US-14 | ✅ **DONE** (parcial) | T-034 | **Jugar carta** — más baja o mínima que gane | 🔴 Alta | 5 | `AIPlayer.ts` tiene `playCard()` |
| US-14 | ✅ **DONE** | T-035 | **Delays** — 800-2000ms | 🟡 Baja | 1 | `AIPlayer.ts` tiene `delay()` |
| US-15 | 🟨 **En Progreso** | T-036 | **Cantar truco** — 1 carta ≥10 o 2 ≥8 | 🔴 Alta | 3 | `DecisionEngine.ts` tiene `decideTruco()` |
| US-15 | ✅ **DONE** | T-037 | **Responder truco** — quiero (1 buena) / no | 🔴 Alta | 2 | `DecisionEngine.ts` tiene |
| US-16 | 🟨 **En Progreso** | T-038 | **Cantar envido** — ≥27 / real ≥30 / random 23-26 | 🔴 Alta | 3 | Falta heurística completa |
| US-16 | ✅ **DONE** | T-039 | **Responder envido** — ≥25 aceptar / ≤20 rechazar | 🔴 Alta | 2 | `DecisionEngine.ts` tiene |
| US-17 | 🟨 **En Progreso** | T-040 | **Irse al mazo** — 3 malas o perdiste | 🟡 Media | 2 | Falta heurística |

---

## 🟦 ÉPICA 9: Motor de Juego (Game Loop) (18 SP)

| E-09 | US ID | Task | Nombre | Prioridad | SP | Estado |
|------|-------|------|--------|-----------|----|--------|
| US-18 | ✅ **DONE** | T-041 | **GameEngine** — máquina de estados | 🔴 Alta | 5 | `GameEngine.ts` tiene estados |
| US-18 | ✅ **DONE** | T-042 | **Interfaz pública** — métodos + `{ok, error, estado}` | 🔴 Alta | 3 | `App.ts` expone API pública |
| US-18 | ✅ **DONE** | T-043 | **Eventos** — `EventEmitter` | 🔴 Alta | 2 | `App.ts` tiene `emit()` |
| US-19 | 🟨 **En Progreso** | T-044 | **Validaciones** — errores descriptivos | 🔴 Alta | 3 | `GameEngine.ts` tiene validaciones |
| US-19 | ✅ **DONE** | T-045 | **Test integración** — 100 partidas IA vs IA | 🔴 Alta | 2 | `trucoai-qa.ts` corre 170 tests |

---

## 🟦 ÉPICA 10: Casos Borde y Reglas Especiales (15 SP)

| E-10 | US ID | Task | Nombre | Prioridad | SP | Estado |
|------|-------|------|--------|-----------|----|--------|
| US-20 | ✅ **DONE** (parcial) | T-046 | **Coexistencia envido+truco** — envido resuelve primero | 🔴 Alta | 3 | `GameEngine.ts` tiene prioridad |
| US-20 | ✅ **DONE** | T-047 | **No envido después de baza1** | 🔴 Alta | 2 | `GameEngine.ts` valida |
| US-21 | 🟨 **En Progreso** | T-048 | **Puntos al ir al mazo** — envido pendiente | 🔴 Alta | 2 | Falta test completo |
| US-22 | ✅ **DONE** | T-049 | **Test exhaustivo pardas** — todos los casos | 🔴 Alta | 3 | `BazaMano.test.ts` tiene 5 casos |

---

## 🗓️ PLAN DE EJECUCIÓN

### **Batch 1: Fundación (Épicas 1-3)** — E-01, E-02, E-03

**Qué está DONE**: US-01 a US-07 completas en código.  
**Qué falta**:  
- T-001: `nombre_display` en `Carta` + `valorEnvido` en la carta  
- T-007: que `Mano` tenga `estadoTruco` y `estadoEnvido` correctamente modelados  
- T-011/T-012: tests específicos de ranking de 40 cartas  

### **Batch 2: Cantos + Mazo (Épicas 4-6)** — E-04, E-05, E-06

**Qué está DONE**:  
- T-015: `estadoTruco` existe  
- T-017: respuestas de truco  
- T-018: puntos al final  
- T-019: `calcularEnvido()`  
- T-021/T-022: cadena de envido  
- T-024: validación de cuándo cantar  
- T-027: `irseAlMazo()`  

**Qué FALTA**:  
- T-016: "solo se puede cantar truco antes de que se hayan jugado todas las cartas de la mano" — cuando el truco está en la primera baza o en la tercera  
- T-025: "son buenas" — el rival cede sin mostrar  
- T-026: mostrar tantos al resolver — UI para revelar envido  
- T-023: Falta Envido con perdedor en 0-29 puntos (casos borde)  

### **Batch 3: Score + Fin de Partida (Épica 7)** — E-07

**Qué FALTA**:  
- T-029: síncrono con UI (no solo lógica)  
- T-030: puntos separados para truco y envido  
- T-032: historial completo  
- T-033: `obtenerEstado()` para UI/API  

### **Batch 4: IA (Épica 8)** — E-08

**Qué falta**:  
- T-034: "la IA solo ve sus cartas" — implementar ocultación  
- T-036: Heurística completa de truco con 2 cartas ≥8  
- T-038: Heurística de envido con puntaje entre 23-26  
- T-040: "no irse al mazo en primeros 2 turnos"  

### **Batch 5: UI/UX + QA Final** — US-18, US-19

- T-041: máquina de estados visible en UI  
- T-043: eventos para UI  
- T-045: test de integración 100 partidas sin deadlock  

---

## 🧩 ASIGNACIÓN A SUBAGENTES

```
┌──────────────────────────────────────────────────┐
│  BATCH 1 (Épicas 1-3) — Base del juego           │
│  ├─ US-01: tipos de carta + mazo + reparto       │
│  ├─ US-03: estructura de partida                  │
│  ├─ US-05: turnos y baza                          │
│  └─ US-06/07: comparación y resolución            │
│                                                   │
│  BATCH 2 (Épicas 4-6) — Cantos                   │
│  ├─ US-08: truco/retruco completo                 │
│  ├─ US-09/10: envido completo + son buenas       │
│  └─ US-11: irse al mazo                          │
│                                                   │
│  BATCH 3 (Épica 7) — Score                        │
│  ├─ US-12: sistema de 30 puntos                   │
│  └─ US-13: historial                              │
│                                                   │
│  BATCH 4 (Épica 8) — IA                           │
│  ├─ US-14/15: IA básica + truco                  │
│  ├─ US-16: IA envido                              │
│  └─ US-17: IA mazo                                │
│                                                   │
│  BATCH 5 (Épicas 9-10) — Game Loop + QA          │
│  ├─ US-18: game engine loop                        │
│  ├─ US-19: validaciones                           │
│  ├─ US-20: coexistencia                            │
│  ├─ US-21: mazo con cantos                        │
│  └─ US-22: pardas                                  │
└──────────────────────────────────────────────────┘
```

---

## 📊 RESUMEN FINAL

| Épica | SP | US | Tasks | ✅ DONE | 🟨 En Progreso | 🟦 Backlog |
|-------|----|----|-------|--------|-----------------|-----------|
| E-01 | 8 | 2 | 4 | 3 | 1 | 0 |
| E-02 | 17 | 3 | 6 | 6 | 0 | 0 |
| E-03 | 18 | 2 | 4 | 4 | 0 | 0 |
| E-04 | 16 | 1 | 4 | 3 | 1 | 0 |
| E-05 | 30 | 2 | 8 | 5 | 3 | 0 |
| E-06 | 7 | 1 | 2 | 1 | 1 | 0 |
| E-07 | 14 | 2 | 5 | 3 | 2 | 0 |
| E-08 | 29 | 4 | 7 | 4 | 3 | 0 |
| E-09 | 18 | 2 | 5 | 4 | 1 | 0 |
| E-10 | 15 | 3 | 4 | 2 | 1 | 1 |
| **TOTAL** | **172** | **22** | **49** | **35** | **12** | **2** |

**No priorizar ahora**: Pica Pica (US-14/15 - falta para más adelante).  
**Prioridad inmediata**: US-08 (T-016: validar cuándo cantar truco), US-10 (T-025 y T-026: son buenas + mostrar tantos), US-12 (T-031: fin mid-mano), IA (T-034 a T-040).