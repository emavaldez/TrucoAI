// EnvidoScorer — Pure functions for envido score calculation
// Extracted from GameEngine.ts to reduce God class size.
// These functions have no dependencies on game state.

import type { CardDef, CardNumber } from '../types.js';

/**
 * Get the envido value of a single card.
 * Figures (10, 11, 12) = 0, numbers 1-7 = face value.
 */
export function getEnvidoCardValue(card: CardDef): number {
  switch (card.number) {
    case 1: return 1;
    case 2: return 2;
    case 3: return 3;
    case 4: return 4;
    case 5: return 5;
    case 6: return 6;
    case 7: return 7;
    case 10: return 0;
    case 11: return 0;
    case 12: return 0;
    default: return 0;
  }
}

/**
 * Calculate the envido score for a set of cards (typically 3 cards in hand).
 *
 * Rules:
 * - If 2+ cards share the same suit: 20 + value of 2 highest cards of that suit
 * - If no 2 cards share a suit: highest single card value
 * - Maximum: 33 (7+7+20-1... actually 7+6+20=33)
 * - Minimum: 0 (all figures)
 *
 * @param cards Array of cards (usually 3 from the player's hand)
 * @returns Envido score (0-33)
 */
export function getEnvidoScore(cards: CardDef[]): number {
  if (cards.length === 0) return 0;

  const suitCounts: { [suit: string]: number } = {};
  for (const card of cards) {
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  }

  let maxScore = 0;
  for (const [suit, count] of Object.entries(suitCounts)) {
    if (count >= 2) {
      const suitCards = cards.filter(c => c.suit === suit);
      suitCards.sort((a, b) => getEnvidoCardValue(b) - getEnvidoCardValue(a));
      maxScore = Math.max(maxScore, 20 + getEnvidoCardValue(suitCards[0]) + getEnvidoCardValue(suitCards[1]));
    }
  }

  if (maxScore === 0 && cards.length > 0) {
    maxScore = Math.max(...cards.map(c => getEnvidoCardValue(c)));
  }

  return maxScore;
}

/**
 * Calculate envido scores for multiple players at once.
 *
 * @param hands Map of playerId -> cards
 * @returns Map of playerId -> envido score
 */
export function getEnvidoPlayerScores(hands: { [playerId: string]: CardDef[] }): { [playerId: string]: number } {
  const scores: { [playerId: string]: number } = {};
  for (const [playerId, cards] of Object.entries(hands)) {
    scores[playerId] = getEnvidoScore(cards || []);
  }
  return scores;
}

/**
 * Determine which team has the highest envido score.
 *
 * @param scores Map of playerId -> envido score
 * @param teamMap Map of playerId -> team number (0 or 1)
 * @returns Winning team (0 or 1), or -1 if tie
 */
export function getEnvidoWinningTeam(
  scores: { [playerId: string]: number },
  teamMap: { [playerId: string]: number }
): number {
  let team0Best = 0;
  let team1Best = 0;

  for (const [playerId, score] of Object.entries(scores)) {
    const team = teamMap[playerId];
    if (team === 0 && score > team0Best) team0Best = score;
    if (team === 1 && score > team1Best) team1Best = score;
  }

  if (team0Best > team1Best) return 0;
  if (team1Best > team0Best) return 1;
  return -1; // tie
}
