// Shared types for the Truco game

export type Suit = 'espada' | 'basto' | 'oro' | 'copa';
export type CardNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;
export type PlayerCount = 2 | 4 | 6;
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface CardDef {
  number: CardNumber;
  suit: Suit;
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

export interface EnvidoState {
  phase: 'none' | 'opening' | 'response' | 'resolution';
  callerTeam: number | null;
  level: 'envido' | 'real-envido' | 'falta-envido';
  accepted: boolean;
  pointsAwarded: number;
  team0Scored: number;
  team1Scored: number;
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

export interface GameEvent {
  type: string;
  [key: string]: any;
}
