// Tests de src/engine/cards.ts — mazo de 40, jerarquía del GDD §3, envido y nombres.

import { describe, expect, it } from 'vitest';
import { cardName, cardNickname, cardRank, createDeck, envidoValue } from '../cards.js';
import { ids } from './helpers.js';

/** Tabla literal del GDD §3 (de mayor a menor), transcrita carta por carta. */
const EXPECTED_RANKS: Record<string, number> = {
  '1-espada': 13,
  '2-espada': 8,
  '3-espada': 9,
  '4-espada': 0,
  '5-espada': 1,
  '6-espada': 2,
  '7-espada': 11,
  '10-espada': 4,
  '11-espada': 5,
  '12-espada': 6,
  '1-basto': 12,
  '2-basto': 8,
  '3-basto': 9,
  '4-basto': 0,
  '5-basto': 1,
  '6-basto': 2,
  '7-basto': 3,
  '10-basto': 4,
  '11-basto': 5,
  '12-basto': 6,
  '1-oro': 7,
  '2-oro': 8,
  '3-oro': 9,
  '4-oro': 0,
  '5-oro': 1,
  '6-oro': 2,
  '7-oro': 10,
  '10-oro': 4,
  '11-oro': 5,
  '12-oro': 6,
  '1-copa': 7,
  '2-copa': 8,
  '3-copa': 9,
  '4-copa': 0,
  '5-copa': 1,
  '6-copa': 2,
  '7-copa': 3,
  '10-copa': 4,
  '11-copa': 5,
  '12-copa': 6,
};

/** Orden estable esperado del mazo: palos espada/basto/oro/copa × números 1..7,10..12. */
const EXPECTED_DECK = ['espada', 'basto', 'oro', 'copa'].flatMap((suit) =>
  [1, 2, 3, 4, 5, 6, 7, 10, 11, 12].map((number) => `${number}-${suit}`),
);

describe('createDeck', () => {
  it('devuelve las 40 cartas en orden estable, sin 8 ni 9', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(40);
    expect(ids(deck)).toEqual(EXPECTED_DECK);
    expect(deck.some((c) => c.id.startsWith('8-') || c.id.startsWith('9-'))).toBe(false);
    expect(new Set(cardIdsOf(deck)).size).toBe(40);
  });

  it('cada carta tiene id `${number}-${suit}` y palo válido', () => {
    for (const card of createDeck()) {
      expect(card.id).toBe(`${card.number}-${card.suit}`);
      expect(['espada', 'basto', 'oro', 'copa']).toContain(card.suit);
    }
  });
});

describe('cardRank', () => {
  it('cubre las 40 cartas con la tabla del GDD §3', () => {
    expect(Object.keys(EXPECTED_RANKS)).toHaveLength(40);
    for (const card of createDeck()) {
      expect(cardRank(card), card.id).toBe(EXPECTED_RANKS[card.id]);
    }
  });

  it('los 4 matadores van en orden: ancho de espada > ancho de basto > 7 de espada > 7 de oro', () => {
    const [espada, basto, sieteEspada, sieteOro] = ['1-espada', '1-basto', '7-espada', '7-oro'].map(
      (id) => EXPECTED_RANKS[id],
    );
    expect(espada).toBeGreaterThan(basto);
    expect(basto).toBeGreaterThan(sieteEspada);
    expect(sieteEspada).toBeGreaterThan(sieteOro);
    expect(sieteOro).toBeGreaterThan(EXPECTED_RANKS['3-espada']);
  });
});

describe('envidoValue', () => {
  it('1–7 valen su número y las figuras (10, 11, 12) valen 0', () => {
    for (const card of createDeck()) {
      const expected = card.number <= 7 ? card.number : 0;
      expect(envidoValue(card), card.id).toBe(expected);
    }
  });
});

describe('cardName / cardNickname', () => {
  it('cardName nombra en español', () => {
    expect(cardName({ id: '1-espada', number: 1, suit: 'espada' })).toBe('1 de espada');
    expect(cardName({ id: '7-oro', number: 7, suit: 'oro' })).toBe('7 de oro');
    expect(cardName({ id: '12-copa', number: 12, suit: 'copa' })).toBe('12 de copa');
  });

  it('cardNickname usa los apodos de las cartas con nombre propio', () => {
    expect(cardNickname({ id: '1-espada', number: 1, suit: 'espada' })).toBe('Ancho de espada');
    expect(cardNickname({ id: '1-basto', number: 1, suit: 'basto' })).toBe('Ancho de basto');
    expect(cardNickname({ id: '7-espada', number: 7, suit: 'espada' })).toBe('Siete de espada');
    expect(cardNickname({ id: '7-oro', number: 7, suit: 'oro' })).toBe('Siete de oro');
  });

  it('cardNickname cae a cardName en el resto de las cartas', () => {
    const withNickname = new Set(['1-espada', '1-basto', '7-espada', '7-oro']);
    for (const card of createDeck()) {
      const expected = withNickname.has(card.id) ? cardNickname(card) : cardName(card);
      expect(cardNickname(card), card.id).toBe(expected);
    }
    expect(cardNickname({ id: '3-basto', number: 3, suit: 'basto' })).toBe('3 de basto');
    expect(cardNickname({ id: '1-oro', number: 1, suit: 'oro' })).toBe('1 de oro');
  });
});

function cardIdsOf(cards: { id: string }[]): string[] {
  return cards.map((c) => c.id);
}
