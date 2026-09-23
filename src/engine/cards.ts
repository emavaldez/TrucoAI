// Baraja española de 40 (sin 8 ni 9): mazo, jerarquía de truco y valores de envido.
// Jerarquía: docs/planning/gdd.md §3 (fuente de verdad).

import type { Card, CardNumber, Suit } from './types.js';

/** Orden estable de palos del mazo: espada, basto, oro, copa. */
const SUITS: readonly Suit[] = ['espada', 'basto', 'oro', 'copa'];

/** Orden estable de números del mazo: 1..7, 10, 11, 12. */
const NUMBERS: readonly CardNumber[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

/**
 * Jerarquía para el truco (§3), 0..13.
 * Las cartas con rango propio: los 4 matadores y los 4 "falsos" de 7 y 1.
 */
const RANK_BY_ID: Record<string, number> = {
  '1-espada': 13, // ancho de espada
  '1-basto': 12, // ancho de basto
  '7-espada': 11, // siete de espada
  '7-oro': 10, // siete de oro
  '1-oro': 7, // falso
  '1-copa': 7, // falso
  '7-basto': 3, // falso
  '7-copa': 3, // falso
};

/** Jerarquía de truco por número, para las cartas que no tienen rango propio. */
const RANK_BY_NUMBER: Record<CardNumber, number> = {
  1: 7,
  2: 8,
  3: 9,
  4: 0,
  5: 1,
  6: 2,
  7: 3,
  10: 4,
  11: 5,
  12: 6,
};

/** Apodos de las cartas con nombre propio (el resto usa `cardName`). */
const NICKNAMES: Record<string, string> = {
  '1-espada': 'Ancho de espada',
  '1-basto': 'Ancho de basto',
  '7-espada': 'Siete de espada',
  '7-oro': 'Siete de oro',
};

/** Las 40 cartas, en orden estable: palos espada/basto/oro/copa × números 1..7,10..12. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const number of NUMBERS) {
      deck.push({ id: `${number}-${suit}`, number, suit });
    }
  }
  return deck;
}

/** Jerarquía para el truco: 0 (4 de cualquier palo) a 13 (ancho de espada). */
export function cardRank(card: Card): number {
  return RANK_BY_ID[card.id] ?? RANK_BY_NUMBER[card.number];
}

/** Valor para envido/flor: 1–7 valen su número; 10, 11 y 12 valen 0. */
export function envidoValue(card: Card): number {
  return card.number <= 7 ? card.number : 0;
}

/** Nombre de la carta en español: "1 de espada", "7 de oro", "12 de copa". */
export function cardName(card: Card): string {
  return `${card.number} de ${card.suit}`;
}

/** Apodo de la carta: "Ancho de espada", "Siete de oro"; el resto igual a `cardName`. */
export function cardNickname(card: Card): string {
  return NICKNAMES[card.id] ?? cardName(card);
}
