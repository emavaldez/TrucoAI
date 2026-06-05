// Rules - Truco rules and card comparison logic (Custom ranking)

import type { Card } from './Card.js';

/**
 * Custom Argentine Truco card ranking (highest to lowest):
 * 1.  1 Espada    (13) — strongest
 * 2.  1 Basto     (12)
 * 3.  7 Espada    (11)
 * 4.  7 Oro       (10)
 * 5.  Any 3       (9)
 * 6.  Any 2       (8)
 * 7.  1 Oro/Copa  (7)  — equal, no suit precedence
 * 8.  Any 12      (6)
 * 9.  Any 11      (5)
 * 10. Any 10      (4)
 * 11. 7 Basto/Copa(3)  — equal, no suit precedence
 * 12. Any 6       (2)
 * 13. Any 5       (1)
 * 14. Any 4       (0)  — weakest
 */
const SPECIAL_RANKS: Record<string, number> = {
  'espada-1': 13,
  'basto-1':  12,
  'espada-7': 11,
  'oro-7':    10,
  'any-3':     9,
  'any-2':     8,
  'oro-1':     7,
  'copa-1':    7,
  'any-12':    6,
  'any-11':    5,
  'any-10':    4,
  'basto-7':   3,
  'copa-7':    3,
  'any-6':     2,
  'any-5':     1,
  'any-4':     0,
};

/**
 * Get the Truco ranking value for a card (higher = stronger)
 */
export function getCardRank(card: Card): number {
  const suitKey = `${card.suit}-${card.number}`;
  if (SPECIAL_RANKS[suitKey] !== undefined) {
    return SPECIAL_RANKS[suitKey];
  }

  // Generic ranks (same across all suits)
  const genericRanks: Record<number, number> = {
    3:   9,
    2:   8,
    12:  6,
    11:  5,
    10:  4,
    6:   2,
    5:   1,
    4:   0,
  };

  if (genericRanks[card.number] !== undefined) {
    return genericRanks[card.number];
  }

  // 7 (non-special: basto, copa) are already in special
  // 1 (non-special: copa, oro) are already in special
  // Nothing else left — all 16 cards per suit are covered
  return card.number;
}

/**
 * Compare two cards according to Truco rules
 * Returns: 1 if card1 wins, -1 if card2 wins, 0 if equal
 */
export function compareCards(card1: Card, card2: Card): number {
  const rank1 = getCardRank(card1);
  const rank2 = getCardRank(card2);

  if (rank1 > rank2) return 1;
  if (rank2 > rank1) return -1;
  return 0;
}

/**
 * Get the name of a card for display
 */
export function getCardName(card: Card): string {
  const suitNames: Record<string, string> = {
    espada: 'Espada',
    basto: 'Basto',
    oro: 'Oro',
    copa: 'Copa',
  };
  return `${card.number} de ${suitNames[card.suit] || card.suit}`;
}

/**
 * Check if two cards form a "Flor" (same suit, 1+2 or 1+3)
 * Note: Flor is optional in many variants
 */
export function hasFlor(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const suits = cards.map(c => c.suit);
  return suits[0] === suits[1] && suits[1] === suits[2];
}
