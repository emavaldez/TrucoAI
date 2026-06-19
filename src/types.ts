// Shared types for the Truco game

export type Suit = 'espada' | 'basto' | 'oro' | 'copa';
export type CardNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;
export type PlayerCount = 2 | 4 | 6;
export type Difficulty = 'easy' | 'normal' | 'hard';

/** Record of a single canto (shout) during a hand */
export interface CantoRecord {
  type: 'envido' | 'envido-envido' | 'real-envido' | 'falta-envido' | 'truco' | 'retruco' | 'vale4';
  callerTeam: number;
  accepted: boolean;
  points: number;
  winnerTeam: number;
}

/** Card state: in hand (en_mano) or already played (jugada) */
export type CardState = 'en_mano' | 'jugada';

export interface CardDef {
  number: CardNumber;
  suit: Suit;
  /** Envido value: figures (10/11/12) = 0, numbers 1-7 = face value */
  valorEnvido: number;
  /** Truco ranking: 0 (weakest, 4) to 13 (strongest, 1-espada) */
  valorTruco: number;
  /** Spanish display name for the card (e.g. 'Ancho de Espada', 'Siete de Basto') */
  nombreDisplay: string;
  /** Whether the card is in hand or has been played */
  estado: CardState;
}

export interface PlayerConfig {
  id: string;
  name: string;
  isHuman: boolean;
  isAI: boolean;
  difficulty?: Difficulty;
  team: number; // 0 or 1
  position: number; // 0..n-1, position around the table
}

export interface PlayedCard {
  card: CardDef;
  playerId: string;
}

export interface RoundResult {
  roundNumber: number;
  teamWinner: number | -1; // 0, 1, or -1 for draw
  cards: PlayedCard[];
  highestCard: CardDef | null;
  highestCardPlayerId: string | null;
}

export interface PicaPicaSubmanoResult {
  submanoNumber: number;
  teamWinner: number | -1;
  cards: PlayedCard[];
}

export interface GameConfig {
  playerCount: PlayerCount;
  difficulty: Difficulty;
}

// ---- Partida (Match) model ----

/**
 * Complete record of a single hand within a partida.
 */
export interface HandRecord {
  handNumber: number;          // 0-indexed hand number
  dealerId: string;            // Who dealt this hand
  starterId: string;           // Who started (mano, right of dealer)
  roundResults: RoundResult[]; // All rounds in this hand
  handWinnerTeam: number | -1; // Team that won this hand (or -1 if draw)
  pointsAwarded: number;       // Points awarded for this hand (truco + total)
  team0Score: number;          // Team 0's cumulative score after this hand
  team1Score: number;          // Team 1's cumulative score after this hand
  envidoCalled: boolean;
  envidoWinner: number | null;  // Team that won envido (or null if not called)
  envidoPoints: number;         // Points awarded for envido
  trucoCalled: boolean;
  trucoWinner: number | -1;     // Team that won the truco/hand
  trucoPoints: number;          // Points awarded for truco (hand)
  cantos: CantoRecord[];        // All shouts made during this hand
  isPicaPica: boolean;
  picaPicaSubmano?: number;
}

/**
 * Full partida (match) history, tracking every hand from start to finish.
 */
export interface PartidaHistory {
  /** Initial dealer (randomly chosen) */
  initialDealerId: string;
  /** All hands played in this match */
  hands: HandRecord[];
  /** Final scores when the game ended */
  finalScores: { team0: number; team1: number };
  /** Team that won (0 or 1), or -1 if game hasn't ended */
  winningTeam: number | -1;
  /** Total number of hands played */
  totalHands: number;
  /** Timestamp when the match was started */
  startedAt: number;
  /** Timestamp when the match ended */
  endedAt: number | null;
}

export interface EnvidoState {
  phase: 'none' | 'opening' | 'response' | 'resolution';
  callerTeam: number | null;
  level: 'envido' | 'envido-envido' | 'real-envido' | 'falta-envido';
  accepted: boolean;
  pointsAwarded: number;
  totalPoints: number;
  team0Scored: number;
  team1Scored: number;
  envidoWinner: number | null;  // Team that won envido scoring
  // For showing envido scores
  team0Player0Envido: number | null;
  team0Player1Envido: number | null;
  team1Player0Envido: number | null;
  team1Player1Envido: number | null;
  team1Player2Envido: number | null;
  team0Player2Envido: number | null;
}

export interface TrucoState {
  level: 0 | 1 | 2 | 3; // 0=none, 1=truco, 2=retruco, 3=vale4
  lastChallengerTeam: number | null;
  accepted: boolean;
  pointsAwarded: number;
  team0Scored: number;
  team1Scored: number;
}

// ---- Baza (Trick) model ----

/**
 * A single baza (trick) within a mano — the sequence of cards
 * played by each player in one round.
 * Each player plays exactly one card per baza.
 * In a 4-player game, each baza has 4 PlayedCard entries.
 */
export interface Baza {
  bazaNumber: number;           // 0-indexed trick number within the hand
  starterPlayerId: string;        // Who started this trick (played first)
  cards: PlayedCard[];           // The cards played, in play order
  winnerId: string;               // Player ID of the winner (highest card)
  winnerTeam: number;            // 0 or 1, or -1 for tie
  winningCard: CardDef;          // The card that won this trick
  highestCardRank: number;        // Ranking value of the winning card
}

// ---- Mano (Hand) model ----

/**
 * A single mano (hand) in a partida — consists of 3 bazas
 * (one per round), each with its own set of played cards.
 * The winner is determined by best-of-3: first team to win 2 bazas.
 */
export interface Mano {
  handNumber: number;            // 0-indexed hand number
  dealerId: string;              // Who dealt this hand
  starterId: string;             // Who started (mano, right of dealer)
  bazas: Baza[];                 // All 3 tricks in this hand
  handWinnerTeam: number;        // Team that won this hand
  pointsAwarded: number;         // Points for this hand
  team0Score: number;            // Team 0's score after this hand
  team1Score: number;            // Team 1's score after this hand
  envidoCalled: boolean;
  trucoCalled: boolean;
  isPicaPica: boolean;
  picaPicaSubmano?: number;
  isSecondHand: boolean;         // true if this is the 2nd hand of a 2-hand partida
}

export interface GameEvent {
  type: string;
  [key: string]: any;
}

/**
 * Complete serializable game state for save/load and UI reconstruction.
 * Contains all fields needed to fully reconstruct a game in progress.
 */
export interface FullGameState {
  players: PlayerConfig[];
  scores: { team0: number; team1: number };
  targetScore: number;
  currentHand: number;
  currentRound: number;
  currentTrickNumber: number;
  dealerId: string;
  starterId: string;
  currentTurnPlayerId: string;
  hands: { [playerId: string]: CardDef[] };
  currentTrick: PlayedCard[];
  roundResults: RoundResult[];
  envido: EnvidoState;
  truco: TrucoState;
  isPicaPica: boolean;
  picaPicaSubmano: number;
  picapicaResults: PicaPicaSubmanoResult[];
  firstHandCompleted: boolean;
  gameOver: boolean;
  partidaHistory: PartidaHistory;
  phase: string;
}