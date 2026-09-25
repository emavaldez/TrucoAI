// Índices fijos de cartas para la codificación (mismo orden que `createDeck()`).

import { cardRank, createDeck, envidoValue } from '../../src/engine/index.js';
import type { Card, Suit } from '../../src/engine/index.js';

export const DECK: Card[] = createDeck();
export const SUITS: Suit[] = ['espada', 'basto', 'oro', 'copa'];
const INDEX = new Map(DECK.map((card, index) => [card.id, index]));

/** 0..39 */
export function cardIndex(card: Card): number {
  const index = INDEX.get(card.id);
  if (index === undefined) throw new Error(`carta desconocida: ${card.id}`);
  return index;
}

export function suitIndex(card: Card): number {
  return SUITS.indexOf(card.suit);
}

/** Mis cartas en un orden estable: de la más fuerte a la más débil (desempate por id). */
export function sortedHand(hand: readonly Card[]): Card[] {
  return [...hand].sort((a, b) => cardRank(b) - cardRank(a) || cardIndex(a) - cardIndex(b));
}

export { cardRank, envidoValue };
