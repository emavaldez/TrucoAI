# TrucoAI — Arquitectura (v2)

**Estado:** aprobada para implementación · **Fecha:** 2026-09-23 · **Reglas:** `docs/planning/gdd.md` (fuente de verdad)

## 1. Por qué una v2

La auditoría de septiembre 2026 (`docs/planning/audit-2026-09.md`) encontró 48 bugs confirmados. Las causas raíz son estructurales:

1. `GameEngine.ts` (1.794 líneas) es una clase dios con **tres caminos distintos para cerrar una mano**
   (`resolveHand`, `resolveTruco`, `irseAlMazo`), cada uno con su propio scoring.
2. La validación solo cubre `playCard`; truco/envido/mazo se invocan por `engine['metodoPrivado']` desde `App.ts`.
3. La fase se **infiere** después (`getPhase`) en vez de ser un estado explícito → se pueden jugar cartas con cantos pendientes.
4. La IA real está embebida en `App.ts` (tirando monedas); `src/ai/` es código muerto.
5. El flujo depende de `setTimeout` no cancelables encadenados → dobles ejecuciones y jugadas "fantasma" en la mano siguiente.

**Decisión (ADR-1):** construir un motor nuevo, **puro y determinista**, en `src/engine/`, al lado del viejo;
montar IA y app sobre él; y recién al final borrar el código legacy (`src/core/`, `src/App.ts`, `src/ai/` viejo).
No se parchea el motor viejo salvo que bloquee algo.
**Excepción registrada (2026-09-23):** la historia 0-3 parchea el legacy solo para que las partidas publicadas no se traben
(pica-pica en 6p, "Nuevo juego"). Las reglas mal implementadas del legacy no se tocan: las resuelve el motor v2.

## 2. Principios

- **Motor puro:** `applyAction(state, playerId, action) → { state, events }`. Sin DOM, sin timers, sin `Math.random`.
  El estado es un objeto plano serializable (JSON). Nunca se muta el estado recibido (se clona con `structuredClone`).
- **Una sola fuente de legalidad:** `getLegalActions(state, playerId)`. `applyAction` rechaza (resultado `{ ok:false, error }`)
  toda acción que no esté en esa lista. UI e IA derivan todo de ahí.
- **Un solo actor a la vez:** `getActor(state)` devuelve el `playerId` que debe decidir ahora (o `null` si la mano/partida terminó).
  No existen acciones "fuera de turno".
- **Fases explícitas** (`state.phase`), nunca inferidas.
- **Un solo `endHand`** y un solo `addPoints` para todos los caminos de puntaje.
- **Aleatoriedad inyectada:** `Rng` con semilla (mulberry32). Misma semilla + mismas acciones = misma partida.
- **Información oculta protegida:** la IA solo recibe `getObservation(state, playerId)`.
- **Sin dependencias de runtime** (solo devDependencies).

## 3. Estructura de carpetas (objetivo)

```
src/
  engine/                 # Motor v2 — puro, sin DOM
    types.ts              # Todos los tipos públicos del motor
    rng.ts                # Rng + mulberry32(seed)
    cards.ts              # createDeck, rank, envidoValue, cardId, cardName
    envidoScore.ts        # envido/flor score de 3 cartas
    match.ts              # createMatch, startHand (reparto, dealer/mano, pica-pica)
    tricks.ts             # resolveTrick, resolveHandWinner, nextLeader
    truco.ts              # reglas de truco (legal + apply)
    envido.ts             # cadena, tabla de puntos, falta, resolución
    flor.ts               # flor/contraflor (solo si ruleset.flor)
    picapica.ts           # activación, alternancia, submanos
    scoring.ts            # addPoints, endHand, fin de partida, historial
    legal.ts              # getLegalActions, getActor
    apply.ts              # applyAction (valida contra legal.ts y despacha)
    observation.ts        # getObservation (solo info pública)
    index.ts              # API pública (re-exporta lo de abajo, nada más)
    __tests__/            # unit + escenarios + simulación con invariantes
  ai/                     # IA v2 — políticas puras sobre Observation
    policy.ts             # interface Policy
    randomPolicy.ts
    handStrength.ts
    heuristics/           # cardPlay.ts, truco.ts, envido.ts, flor.ts
    profiles.ts           # DifficultyProfile: easy | normal | hard
    createPolicy.ts
    __tests__/
  app/                    # Orquestación (sin DOM)
    GameController.ts     # estado actual, dispatch, driver de IA, suscripción
    scheduler.ts          # Scheduler (real / instantáneo) con cancelación
    urlConfig.ts          # ?seed= &fast=1 &aiDelay= &autoAck=1
    testHooks.ts          # window.__truco (solo si ?test=1 o DEV)
    __tests__/
  ui/                     # Render DOM a partir de (state, legalActions, events)
    UIManager.ts          # delgado: monta y re-renderiza vistas
    views/                # menu.ts, table.ts, hand.ts, actions.ts, responsePanel.ts,
                          # toasts.ts, scoreboard.ts, handSummary.ts, gameOver.ts
    escape.ts             # escapeHtml
  main.ts
  styles.css
e2e/                      # Playwright
scripts/
  sim.ts                  # N partidas random-legal con invariantes
  arena.ts                # enfrentamientos de dificultades, reporte con IC de Wilson
```

Mientras convivan, el código legacy (`src/core/`, `src/App.ts`, `src/ai/{AIPlayer,DecisionEngine,CardEvaluator}.ts`,
`src/ui/UIManager.ts` viejo) **no se toca** salvo en la historia 3-5, que lo borra. Los módulos nuevos **no importan nada del legacy**.

## 4. Tipos del motor (contrato)

Los nombres y formas de abajo son el contrato entre historias. Se pueden **agregar** campos; no renombrar ni cambiar semántica sin actualizar este documento.

```ts
// ---------- básicos ----------
export type Suit = 'espada' | 'basto' | 'oro' | 'copa';
export type CardNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;
export interface Card { id: string; number: CardNumber; suit: Suit }   // id = `${number}-${suit}`, ej "1-espada"
export type TeamId = 0 | 1;
export type PlayerId = string;                                           // "p0".."p5"
export interface Seat { id: PlayerId; seat: number; team: TeamId; name: string; isHuman: boolean }

export interface RuleSet {
  playerCount: 2 | 4 | 6;
  targetScore: 30;
  flor: boolean;          // default false
  picaPica: boolean;      // default true si playerCount === 6, ignorado si no
}

export interface Rng { next(): number /* [0,1) */; }                     // rng.ts: mulberry32(seed)

// ---------- estado ----------
export type Phase =
  | 'PLAYING'                 // alguien tiene que jugar carta o cantar
  | 'AWAITING_TRUCO'          // truco/retruco/vale4 pendiente de respuesta
  | 'AWAITING_ENVIDO'         // canto de envido pendiente de respuesta
  | 'AWAITING_FLOR'           // contraflor/contraflor al resto pendiente
  | 'HAND_OVER'               // mano terminada; esperar startNextHand()
  | 'MATCH_OVER';

export type TrucoLevel = 0 | 1 | 2 | 3;                                  // 0 nada, 1 truco, 2 retruco, 3 vale4
export interface TrucoState {
  level: TrucoLevel;          // nivel QUERIDO vigente
  pending: null | { level: 1 | 2 | 3; callerId: PlayerId; callerTeam: TeamId; responderId: PlayerId };
  quieroTeam: TeamId | null;  // equipo que tiene el quiero (puede subir)
}

export type EnvidoCall = 'E' | 'R' | 'F';
export interface EnvidoState {
  chain: { call: EnvidoCall; by: PlayerId; team: TeamId }[];
  pending: null | { responderId: PlayerId };
  status: 'none' | 'calling' | 'resolved' | 'cancelled';               // cancelled = anulado por flor
  resumeTrucoAfter: boolean;  // "el envido está primero": volver a AWAITING_TRUCO al resolver
  result: null | { winnerTeam: TeamId; points: number; accepted: boolean;
                   revealed: { playerId: PlayerId; score: number }[] }; // solo lo público
}

export interface FlorState {           // siempre presente; inerte si !ruleset.flor
  declared: { playerId: PlayerId; team: TeamId }[];
  pending: null | { kind: 'RESPUESTA_FLOR' | 'CONTRAFLOR' | 'CONTRAFLOR_AL_RESTO'; responderId: PlayerId; callerTeam: TeamId };
  resumePhase: 'PLAYING' | 'AWAITING_TRUCO' | null;                   // a qué fase volver al resolver la flor
  status: 'none' | 'declared' | 'resolved';
  result: null | { winnerTeam: TeamId; points: number; revealed: { playerId: PlayerId; score: number }[] };
}

export interface TrickPlay { playerId: PlayerId; card: Card }
export interface TrickResult { plays: TrickPlay[]; winnerTeam: TeamId | 'PARDA'; winnerPlayerId: PlayerId | null; leaderId: PlayerId }

export interface SubmanoResult { pair: [PlayerId, PlayerId]; winnerTeam: TeamId; points: number }
export interface CantoRecord {
  kind: 'TRUCO' | 'RETRUCO' | 'VALE4' | 'ENVIDO' | 'REAL_ENVIDO' | 'FALTA_ENVIDO' | 'FLOR' | 'CONTRAFLOR' | 'CONTRAFLOR_AL_RESTO' | 'MAZO';
  by: PlayerId; team: TeamId; answer?: 'QUIERO' | 'NO_QUIERO' | 'ACHICO'; pointsTo?: TeamId; points?: number;
}
export interface HandRecord {
  number: number; dealerId: PlayerId; manoId: PlayerId; picaPica: boolean;
  tricks: TrickResult[]; cantos: CantoRecord[];
  winnerTeam: TeamId; points: number; reason: string; scoresAfter: [number, number];
}

export interface HandState {
  number: number;                        // 1-based
  dealerId: PlayerId;
  manoId: PlayerId;
  dealt: Record<PlayerId, Card[]>;       // las 3 repartidas (inmutables en la mano)
  hands: Record<PlayerId, Card[]>;       // las que quedan
  tricks: TrickResult[];                 // bazas terminadas
  currentTrick: { leaderId: PlayerId; plays: TrickPlay[] };
  turnId: PlayerId;                      // a quién le toca jugar carta
  participants: PlayerId[];              // todos, o el par activo en una submano de pica-pica
  truco: TrucoState;
  envido: EnvidoState;
  flor: FlorState;
  picaPica: null | { submano: 0 | 1 | 2; pairs: [PlayerId, PlayerId][]; results: SubmanoResult[] };
  cantos: CantoRecord[];                 // log de cantos de la mano (va al HandRecord)
  result: null | { winnerTeam: TeamId; points: number; reason: 'BAZAS' | 'NO_QUIERO' | 'MAZO' | 'PICA_PICA' };
}

export interface MatchState {
  version: number;                       // +1 en cada acción aplicada (para descartar callbacks viejos)
  rules: RuleSet;
  seed: number;
  rngState: number;                      // estado serializable del rng
  seats: Seat[];
  scores: [number, number];
  phase: Phase;
  hand: HandState;
  picaPicaNext: boolean;                 // alternancia
  history: HandRecord[];
  winnerTeam: TeamId | null;
}

// ---------- acciones ----------
export type Action =
  | { type: 'PLAY_CARD'; cardId: string }
  | { type: 'CALL_TRUCO' }                                   // canta o sube al siguiente nivel (también como respuesta)
  | { type: 'ANSWER_TRUCO'; answer: 'QUIERO' | 'NO_QUIERO' }
  | { type: 'CALL_ENVIDO'; call: EnvidoCall }                // abre o sube (también "el envido está primero")
  | { type: 'ANSWER_ENVIDO'; answer: 'QUIERO' | 'NO_QUIERO' }
  | { type: 'DECLARE_FLOR' }                                 // obligatoria para quien tiene flor sin declarar (ver historia 1-8)
  | { type: 'ANSWER_FLOR'; answer: 'ACHICO' | 'CONTRAFLOR' | 'CONTRAFLOR_AL_RESTO' | 'QUIERO' | 'NO_QUIERO' }
  | { type: 'MAZO' };

// ---------- eventos (para UI/avisos/log; nunca revelan info oculta) ----------
export type GameEvent =
  | { type: 'HAND_STARTED'; hand: number; dealerId: PlayerId; manoId: PlayerId; picaPica: boolean }
  | { type: 'SUBMANO_STARTED'; submano: number; pair: [PlayerId, PlayerId] }
  | { type: 'CARD_PLAYED'; playerId: PlayerId; card: Card }
  | { type: 'TRICK_WON'; trick: number; winnerTeam: TeamId | 'PARDA'; winnerPlayerId: PlayerId | null }
  | { type: 'TRUCO_CALLED'; playerId: PlayerId; level: 1 | 2 | 3 }
  | { type: 'TRUCO_ANSWERED'; playerId: PlayerId; answer: 'QUIERO' | 'NO_QUIERO' }
  | { type: 'ENVIDO_CALLED'; playerId: PlayerId; call: EnvidoCall }
  | { type: 'ENVIDO_ANSWERED'; playerId: PlayerId; answer: 'QUIERO' | 'NO_QUIERO' }
  | { type: 'ENVIDO_RESOLVED'; winnerTeam: TeamId; points: number; revealed: { playerId: PlayerId; score: number }[] }
  | { type: 'FLOR_DECLARED'; playerId: PlayerId }
  | { type: 'FLOR_ANSWERED'; playerId: PlayerId; answer: string }
  | { type: 'FLOR_RESOLVED'; winnerTeam: TeamId; points: number; revealed: { playerId: PlayerId; score: number }[] }
  | { type: 'MAZO'; playerId: PlayerId; team: TeamId }
  | { type: 'POINTS'; team: TeamId; points: number; reason: 'ENVIDO' | 'FLOR' | 'TRUCO' | 'MANO' | 'NO_QUIERO' | 'MAZO' }
  | { type: 'HAND_OVER'; winnerTeam: TeamId; points: number; reason: string }
  | { type: 'MATCH_OVER'; winnerTeam: TeamId; scores: [number, number] };

// ---------- observación (lo único que ve la IA) ----------
export interface Observation {
  selfId: PlayerId; selfTeam: TeamId; seats: Seat[];     // seats sin info de cartas
  rules: RuleSet; scores: [number, number]; phase: Phase;
  dealerId: PlayerId; manoId: PlayerId; isMano: boolean; isPie: boolean;
  myHand: Card[]; myDealt: Card[];                         // mis cartas
  currentTrick: { leaderId: PlayerId; plays: TrickPlay[] };
  tricks: TrickResult[];
  unseenCards: Card[];                                      // mazo − mis repartidas − jugadas por otros
  truco: TrucoState; envidoChain: EnvidoState['chain']; envidoStatus: EnvidoState['status'];
  publicScores: { playerId: PlayerId; score: number; kind: 'ENVIDO' | 'FLOR' }[];
  florDeclared: PlayerId[];
  picaPica: HandState['picaPica'];
  legalActions: Action[];
}
```

## 5. API pública del motor (`src/engine/index.ts`)

```ts
createMatch(opts: { rules: RuleSet; seed: number; names?: string[]; firstDealerSeat?: number; deck?: Card[] }): MatchState
startNextHand(state: MatchState, opts?: { deck?: Card[] }): { state: MatchState; events: GameEvent[] }  // solo en HAND_OVER
getActor(state: MatchState): PlayerId | null
getLegalActions(state: MatchState, playerId: PlayerId): Action[]
applyAction(state: MatchState, playerId: PlayerId, action: Action):
  { ok: true; state: MatchState; events: GameEvent[] } | { ok: false; error: string }
getObservation(state: MatchState, playerId: PlayerId): Observation
// helpers puros exportados para UI/IA/tests:
cardRank(card), envidoValue(card), envidoScore(cards), florScore(cards), cardName(card), createDeck()
```

- `deck` (opcional) fija el orden del mazo para tests: se reparte en orden a partir del mano, una carta por jugador por vuelta.
- `createMatch` deja la partida en la primera mano ya repartida (`phase: 'PLAYING'`) y emite `HAND_STARTED` al llamar `startNextHand`; la primera mano se considera iniciada al crear.
- `applyAction` con `playerId !== getActor(state)` → `{ ok:false, error:'NOT_YOUR_TURN' }`. Con acción no incluida en `getLegalActions` → `{ ok:false, error:'ILLEGAL_ACTION' }`.
- Si durante `applyAction` la partida termina, `phase = 'MATCH_OVER'`, `winnerTeam` seteado, evento `MATCH_OVER`.

## 6. Orquestación (`src/app/GameController.ts`)

```ts
interface Scheduler { schedule(ms: number, fn: () => void): () => void /* cancel */; cancelAll(): void }
class GameController {
  constructor(opts: { rules: RuleSet; seed: number; difficulty: Difficulty; scheduler: Scheduler;
                      aiDelay: [number, number]; policyFactory?: (...) => Policy })
  getState(): MatchState
  getLegalActionsForHuman(): Action[]
  dispatchHuman(action: Action): { ok: boolean; error?: string }
  continueAfterHand(): void                 // HAND_OVER → startNextHand
  newMatch(opts?): void                     // cancela todo y crea partida nueva
  subscribe(listener: (s: MatchState, events: GameEvent[]) => void): () => void
}
```

- **Driver de IA único:** después de cada cambio de estado, si `getActor(state)` es IA, programa **una** decisión
  con `scheduler.schedule(delay, ...)`, guardando `state.version`. Al ejecutarse, si `state.version` cambió, no hace nada.
- **Nueva partida / fin de mano** → `scheduler.cancelAll()`.
- La IA recibe `getObservation(state, actorId)` y su `Policy` devuelve una acción de `obs.legalActions`
  (si devolviera otra cosa → se loguea y se juega la primera acción legal: nunca se cuelga).
- En `HAND_OVER` el controller espera `continueAfterHand()` (botón "Siguiente mano"), salvo `autoAck`.

## 7. IA (`src/ai/`)

```ts
interface Policy { decide(obs: Observation, rng: Rng): Action }        // pura; debe devolver algo de obs.legalActions
type Difficulty = 'easy' | 'normal' | 'hard';
interface DifficultyProfile { randomActionRate: number; bluffRate: number; useScorePressure: boolean;
                              usePartnerAwareness: boolean; thresholds: {...} }
createPolicy(difficulty: Difficulty): Policy
```

Las heurísticas (ver GDD §11) se implementan como funciones puras sobre `Observation`.
`scripts/arena.ts` enfrenta políticas en partidas con semilla y reporta % de victorias con IC 95% de Wilson.

## 8. UI (`src/ui/`)

- Render a partir de `(state, legalActionsHumano, eventos recientes)`. Toda la UI se re-renderiza en cada notificación del controller.
- Los botones y las cartas clickeables se derivan **exclusivamente** de `getLegalActions`.
- Handlers con `addEventListener` sobre elementos con `data-action`; **sin** `window._uiCallbacks` ni `onclick` inline.
- Todo texto dinámico pasa por `escapeHtml`.
- `data-testid` según la lista de `docs/planning/test-strategy.md` §5.
- Avisos no bloqueantes (cola de toasts con auto-dismiss); bloquean solo resumen de mano y fin de partida.

## 9. Testing y CI

Ver `docs/planning/test-strategy.md`. Resumen: vitest (unit + escenarios + simulación), cobertura v8 con umbrales por carpeta,
Playwright E2E contra `vite preview` con `?seed&fast=1&autoAck=1&test=1`, GitHub Actions en cada push/PR, Vercel deploya `main`.

## 10. Convenciones

- TypeScript `strict`. Imports con extensión `.js` (como hoy). Sin `any` en `src/engine` ni `src/ai`.
- Nombres de código en inglés; textos de UI y docs en español rioplatense.
- Funciones del motor puras; nada de clases con estado en `src/engine`.
- Un archivo de test por módulo (`src/engine/__tests__/truco.test.ts`, etc.).
- Commits: `feat(engine): …`, `fix(ui): …`, `test(ai): …`, `chore: …`, `docs: …`.

## 11. ADRs

| # | Decisión | Motivo |
|---|---|---|
| ADR-1 | Motor v2 nuevo en `src/engine/`, legacy se borra al final (historia 3-5) | 3 caminos de scoring y validación parcial hacen inviable el parche |
| ADR-2 | Motor puro + estado serializable + RNG con semilla | Tests deterministas, simulación masiva, base para IA entrenada futura |
| ADR-3 | Un solo actor por vez (`getActor`) | Elimina acciones fuera de turno y carreras de timers |
| ADR-4 | IA solo ve `Observation` | Justicia verificable; mismo contrato servirá para CFR/RL |
| ADR-5 | Avisos no bloqueantes | Elimina la clase de bugs "OK ejecuta la acción equivocada" |
| ADR-6 | Sin dependencias de runtime | Bundle chico, sin superficie de supply chain |
| ADR-7 | Flujo de trabajo: BMAD (planificación) + `wf` (supervisor Claude, worker Hermes, gates) | Pedido de Emmanuel 2026-09-23 |
