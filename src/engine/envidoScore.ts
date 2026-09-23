// Puntaje de envido de un jugador — GDD §6.1.
// Módulo puro y sin estado: no sabe qué cartas quedan en la mano ni de quién son.
// Se calcula SIEMPRE sobre las 3 cartas repartidas (`hand.dealt`) [ENG-05] y el valor
// de cada carta para el envido vive en `cards.ts` (única fuente).

import { envidoValue } from './cards.js';
import type { Card, Suit } from './types.js';

/**
 * Puntaje de envido (0–33):
 * - dos o tres cartas del mismo palo → 20 + la suma de las dos más altas (las figuras valen 0);
 * - sin dos del mismo palo → el valor de la carta más alta (las figuras valen 0).
 */
export function envidoScore(cards: readonly Card[]): number {
  const valuesBySuit = new Map<Suit, number[]>();
  for (const card of cards) {
    const suitValues = valuesBySuit.get(card.suit);
    if (suitValues === undefined) valuesBySuit.set(card.suit, [envidoValue(card)]);
    else suitValues.push(envidoValue(card));
  }

  let bestPair = -1;
  for (const suitValues of valuesBySuit.values()) {
    if (suitValues.length < 2) continue;
    const [highest, second] = [...suitValues].sort((a, b) => b - a);
    bestPair = Math.max(bestPair, highest + second);
  }
  if (bestPair >= 0) return 20 + bestPair;

  return cards.reduce((highest, card) => Math.max(highest, envidoValue(card)), 0);
}
