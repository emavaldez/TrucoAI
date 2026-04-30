// Card type definition for Truco

export type Suit = 'espada' | 'basto' | 'oro' | 'copa';

export interface Card {
  suit: Suit;
  number: number;
}

/**
 * Re-export getCardRank from Rules for convenience
 * CardEvaluator.ts imports this as getCardRanking
 */
export { getCardRank } from './Rules.js';
