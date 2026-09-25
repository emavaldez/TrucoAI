// Tipos del motor v2 — contrato con el resto de las historias.
// Fuente de verdad: docs/planning/architecture.md §4.
// Este archivo no importa nada: no conoce DOM, timers ni aleatoriedad.

// ---------- básicos ----------

export type Suit = 'espada' | 'basto' | 'oro' | 'copa';
export type CardNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

/** Carta de la baraja española de 40. `id` = `${number}-${suit}`, ej. "1-espada". */
export interface Card {
  id: string;
  number: CardNumber;
  suit: Suit;
}

export type TeamId = 0 | 1;

/** "p0".."p5" */
export type PlayerId = string;

export interface Seat {
  id: PlayerId;
  seat: number;
  team: TeamId;
  name: string;
  isHuman: boolean;
}

export interface RuleSet {
  playerCount: 2 | 4 | 6;
  targetScore: 30;
  /** default false */
  flor: boolean;
  /** default true si playerCount === 6, ignorado si no */
  picaPica: boolean;
}

/** Aleatoriedad inyectada. `next()` en [0, 1). */
export interface Rng {
  next(): number;
}

// ---------- estado ----------

export type Phase =
  | 'PLAYING' // alguien tiene que jugar carta o cantar
  | 'AWAITING_TRUCO' // truco/retruco/vale4 pendiente de respuesta
  | 'AWAITING_ENVIDO' // canto de envido pendiente de respuesta
  | 'AWAITING_FLOR' // contraflor/contraflor al resto pendiente
  | 'HAND_OVER' // mano terminada; esperar startNextHand()
  | 'MATCH_OVER';

/** 0 nada, 1 truco, 2 retruco, 3 vale4 */
export type TrucoLevel = 0 | 1 | 2 | 3;

export interface TrucoState {
  /** nivel QUERIDO vigente */
  level: TrucoLevel;
  pending: null | {
    level: 1 | 2 | 3;
    callerId: PlayerId;
    callerTeam: TeamId;
    responderId: PlayerId;
  };
  /** equipo que tiene el quiero (puede subir) */
  quieroTeam: TeamId | null;
}

export type EnvidoCall = 'E' | 'R' | 'F';

/**
 * Lo que dice cada jugador al cantar los tantos (GDD §6.6, decisión 2026-09-25):
 * `SCORE` dice su número; `ME_DIO` no llega pero todavía le queda un compañero por hablar;
 * `SON_BUENAS` no llega y era el último de su equipo: el equipo se rinde. `against` es el
 * número que no pudo superar (público: sirve para acotar su envido).
 */
export interface EnvidoSaying {
  playerId: PlayerId;
  kind: 'SCORE' | 'ME_DIO' | 'SON_BUENAS';
  score?: number;
  against?: number;
}

export interface EnvidoState {
  chain: { call: EnvidoCall; by: PlayerId; team: TeamId }[];
  pending: null | { responderId: PlayerId };
  /** cancelled = anulado por flor */
  status: 'none' | 'calling' | 'resolved' | 'cancelled';
  /** "el envido está primero": volver a AWAITING_TRUCO al resolver */
  resumeTrucoAfter: boolean;
  /** solo lo público */
  result: null | {
    winnerTeam: TeamId;
    points: number;
    accepted: boolean;
    /** los números dichos en voz alta (solo `SCORE`) */
    revealed: { playerId: PlayerId; score: number }[];
    /** todo lo dicho, en orden (vacío si no se quiso) */
    sayings: EnvidoSaying[];
    /** quién ganó (muestra sus cartas al final de la mano); null si no se quiso */
    winnerId: PlayerId | null;
  };
}

/** Siempre presente; inerte si !ruleset.flor. */
export interface FlorState {
  declared: { playerId: PlayerId; team: TeamId }[];
  pending: null | {
    kind: 'RESPUESTA_FLOR' | 'CONTRAFLOR' | 'CONTRAFLOR_AL_RESTO';
    responderId: PlayerId;
    callerTeam: TeamId;
  };
  /** a qué fase volver al resolver la flor */
  resumePhase: 'PLAYING' | 'AWAITING_TRUCO' | null;
  status: 'none' | 'declared' | 'resolved';
  result: null | {
    winnerTeam: TeamId;
    points: number;
    revealed: { playerId: PlayerId; score: number }[];
  };
}

export interface TrickPlay {
  playerId: PlayerId;
  card: Card;
}

export interface TrickResult {
  plays: TrickPlay[];
  winnerTeam: TeamId | 'PARDA';
  winnerPlayerId: PlayerId | null;
  leaderId: PlayerId;
}

export interface SubmanoResult {
  pair: [PlayerId, PlayerId];
  winnerTeam: TeamId;
  points: number;
  /** motivo del cierre de la submano (bazas, no quiero o mazo) */
  reason: 'BAZAS' | 'NO_QUIERO' | 'MAZO';
  /** bazas jugadas en la submano */
  tricks: TrickResult[];
  /** cartas de una baza que quedó sin terminar (la submano cerró por no quiero o mazo) */
  openPlays: TrickPlay[];
}

export interface CantoRecord {
  kind:
    | 'TRUCO'
    | 'RETRUCO'
    | 'VALE4'
    | 'ENVIDO'
    | 'REAL_ENVIDO'
    | 'FALTA_ENVIDO'
    | 'FLOR'
    | 'CONTRAFLOR'
    | 'CONTRAFLOR_AL_RESTO'
    | 'MAZO';
  by: PlayerId;
  team: TeamId;
  answer?: 'QUIERO' | 'NO_QUIERO' | 'ACHICO';
  pointsTo?: TeamId;
  points?: number;
}

export interface HandRecord {
  number: number;
  dealerId: PlayerId;
  manoId: PlayerId;
  picaPica: boolean;
  tricks: TrickResult[];
  cantos: CantoRecord[];
  winnerTeam: TeamId;
  points: number;
  reason: string;
  scoresAfter: [number, number];
}

export interface HandState {
  /** 1-based */
  number: number;
  dealerId: PlayerId;
  manoId: PlayerId;
  /** las 3 repartidas (inmutables en la mano) */
  dealt: Record<PlayerId, Card[]>;
  /** las que quedan */
  hands: Record<PlayerId, Card[]>;
  /** bazas terminadas */
  tricks: TrickResult[];
  currentTrick: { leaderId: PlayerId; plays: TrickPlay[] };
  /** a quién le toca jugar carta */
  turnId: PlayerId;
  /** todos, o el par activo en una submano de pica-pica */
  participants: PlayerId[];
  truco: TrucoState;
  envido: EnvidoState;
  flor: FlorState;
  picaPica: null | {
    submano: 0 | 1 | 2;
    pairs: [PlayerId, PlayerId][];
    results: SubmanoResult[];
    /** marcador al empezar la mano (para saber qué equipo sumó más en toda la mano) */
    startScores: [number, number];
  };
  /** log de cantos de la mano (va al HandRecord) */
  cantos: CantoRecord[];
  result: null | { winnerTeam: TeamId; points: number; reason: 'BAZAS' | 'NO_QUIERO' | 'MAZO' | 'PICA_PICA' };
}

export interface MatchState {
  /** +1 en cada acción aplicada (para descartar callbacks viejos) */
  version: number;
  rules: RuleSet;
  seed: number;
  /** estado serializable del rng */
  rngState: number;
  seats: Seat[];
  scores: [number, number];
  phase: Phase;
  hand: HandState;
  /** alternancia */
  picaPicaNext: boolean;
  history: HandRecord[];
  winnerTeam: TeamId | null;
}

// ---------- acciones ----------

export type Action =
  | { type: 'PLAY_CARD'; cardId: string }
  | { type: 'CALL_TRUCO' } // canta o sube al siguiente nivel (también como respuesta)
  | { type: 'ANSWER_TRUCO'; answer: 'QUIERO' | 'NO_QUIERO' }
  | { type: 'CALL_ENVIDO'; call: EnvidoCall } // abre o sube (también "el envido está primero")
  | { type: 'ANSWER_ENVIDO'; answer: 'QUIERO' | 'NO_QUIERO' }
  | { type: 'DECLARE_FLOR' } // obligatoria para quien tiene flor sin declarar (ver historia 1-8)
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
  | {
      type: 'ENVIDO_RESOLVED';
      winnerTeam: TeamId;
      points: number;
      revealed: { playerId: PlayerId; score: number }[];
      sayings: EnvidoSaying[];
      winnerId: PlayerId | null;
    }
  | { type: 'FLOR_DECLARED'; playerId: PlayerId }
  | { type: 'FLOR_ANSWERED'; playerId: PlayerId; answer: string }
  | { type: 'FLOR_RESOLVED'; winnerTeam: TeamId; points: number; revealed: { playerId: PlayerId; score: number }[] }
  | { type: 'MAZO'; playerId: PlayerId; team: TeamId }
  | { type: 'POINTS'; team: TeamId; points: number; reason: 'ENVIDO' | 'FLOR' | 'TRUCO' | 'MANO' | 'NO_QUIERO' | 'MAZO' }
  | { type: 'HAND_OVER'; winnerTeam: TeamId; points: number; reason: string }
  | { type: 'MATCH_OVER'; winnerTeam: TeamId; scores: [number, number] };

// ---------- observación (lo único que ve la IA) ----------

export interface Observation {
  selfId: PlayerId;
  selfTeam: TeamId;
  /** seats sin info de cartas */
  seats: Seat[];
  rules: RuleSet;
  scores: [number, number];
  phase: Phase;
  dealerId: PlayerId;
  manoId: PlayerId;
  isMano: boolean;
  isPie: boolean;
  /** mis cartas */
  myHand: Card[];
  myDealt: Card[];
  currentTrick: { leaderId: PlayerId; plays: TrickPlay[] };
  tricks: TrickResult[];
  /** mazo − mis repartidas − jugadas por otros */
  unseenCards: Card[];
  truco: TrucoState;
  envidoChain: EnvidoState['chain'];
  envidoStatus: EnvidoState['status'];
  publicScores: { playerId: PlayerId; score: number; kind: 'ENVIDO' | 'FLOR' }[];
  /** lo que se dijo al cantar los tantos en esta mano/submano (números, "me dio", "son buenas") */
  envidoSayings: EnvidoSaying[];
  florDeclared: PlayerId[];
  picaPica: HandState['picaPica'];
  legalActions: Action[];
}
