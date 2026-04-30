// Shared types for the Truco game

export type Suit = 'espada' | 'basto' | 'oro' | 'copa';
export type CardNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;
export type TrucoLevel = 0 | 1 | 2 | 3; // none, truco, retruco, vale4
export type EnvidoLevel = 0 | 1 | 2 | 3 | 4; // none, envido, envido-envido, real-envido, falta-envido
export type GameMode = 'solo' | 'multiplayer';
export type PlayerCount = 2 | 4 | 6;
export type Difficulty = 'easy' | 'normal' | 'hard';
export type MPAction = 'create' | 'join';

export interface CardDef {
  number: CardNumber;
  suit: Suit;
}

export interface PlayerInfo {
  id: string;
  name: string;
  points: number;
  isHuman: boolean;
  isAI: boolean;
  difficulty?: Difficulty;
  team: number; // 0 or 1 for team-based play (4/6 players)
  isHand: boolean; // mano/pie - who goes first
}

export interface PlayedCard {
  card: CardDef;
  playerId: string;
}

export type GameState = 'menu' | 'waiting' | 'dealing' | 'playing' | 'envido-pending'
  | 'truco-pending' | 'round-over' | 'game-over';

export interface GameConfig {
  mode: GameMode;
  playerCount: PlayerCount;
  difficulty: Difficulty;
  roomCode?: string;
}
