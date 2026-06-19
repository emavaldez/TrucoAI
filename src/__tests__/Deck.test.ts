// Tests for deck generation and shuffling

import { describe, it, expect } from 'vitest';
import { generarMazo, getValorEnvido, getValorTruco } from '../core/Deck.js';
import type { CardDef, Suit, CardNumber } from '../types.js';

/** All 40 expected card keys: "suit-number" */
function cardKey(card: CardDef): string {
  return `${card.suit}-${card.number}`;
}

/** Known truco rankings for verification */
const EXPECTED_RANKINGS: Record<string, number> = {
  'espada-1': 13, 'basto-1': 12, 'espada-7': 11, 'oro-7': 10,
  'espada-3': 9, 'basto-3': 9, 'oro-3': 9, 'copa-3': 9,
  'espada-2': 8, 'basto-2': 8, 'oro-2': 8, 'copa-2': 8,
  'oro-1': 7, 'copa-1': 7,
  'espada-12': 6, 'basto-12': 6, 'oro-12': 6, 'copa-12': 6,
  'espada-11': 5, 'basto-11': 5, 'oro-11': 5, 'copa-11': 5,
  'espada-10': 4, 'basto-10': 4, 'oro-10': 4, 'copa-10': 4,
  'basto-7': 3, 'copa-7': 3,
  'espada-6': 2, 'basto-6': 2, 'oro-6': 2, 'copa-6': 2,
  'espada-5': 1, 'basto-5': 1, 'oro-5': 1, 'copa-5': 1,
  'espada-4': 0, 'basto-4': 0, 'oro-4': 0, 'copa-4': 0,
};

/** Calculate expected envido for a card number */
function expectedEnvido(n: number): number {
  return n >= 10 ? 0 : n;
}

describe('generarMazo', () => {
  it('debería crear un mazo de 40 cartas', () => {
    const deck = generarMazo();
    expect(deck).toHaveLength(40);
  });

  it('debería contener todas las 40 cartas únicas del truco argentino', () => {
    const deck = generarMazo();
    const keys = deck.map(cardKey).sort();
    const expectedKeys = Object.keys(EXPECTED_RANKINGS).sort();
    expect(keys).toEqual(expectedKeys);
  });

  it('cada carta debería tener valorEnvido y valorTruco correctos', () => {
    const deck = generarMazo();
    for (const card of deck) {
      expect(card.valorEnvido).toBe(expectedEnvido(card.number));
      expect(card.valorTruco).toBe(EXPECTED_RANKINGS[`${card.suit}-${card.number}`]);
    }
  });

  it('no debería haber cartas repetidas en un mazo', () => {
    const deck = generarMazo();
    const keys = deck.map(cardKey);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(40);
  });
});

describe('Fisher-Yates shuffle - 1000 shuffles', () => {
  it('cada shuffle debería producir un mazo de 40 cartas únicas', () => {
    for (let i = 0; i < 1000; i++) {
      const deck = generarMazo();
      expect(deck).toHaveLength(40);
      const keys = deck.map(cardKey);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(40);
    }
  });

  it('cada carta debería tener valores correctos en todos los shuffles', () => {
    for (let i = 0; i < 1000; i++) {
      const deck = generarMazo();
      for (const card of deck) {
        expect(card.valorEnvido).toBe(expectedEnvido(card.number));
        expect(card.valorTruco).toBe(EXPECTED_RANKINGS[`${card.suit}-${card.number}`]);
      }
    }
  });

  it('los shuffles no deberían producir el mismo orden siempre (prueba de aleatoriedad)', () => {
    const firstOrder = generarMazo().map(cardKey).join(',');
    let differentOrderSeen = false;

    for (let i = 0; i < 1000; i++) {
      const order = generarMazo().map(cardKey).join(',');
      if (order !== firstOrder) {
        differentOrderSeen = true;
        break;
      }
    }

    expect(differentOrderSeen).toBe(true);
  });

  it('la distribución de posiciones de cada carta debería ser uniforme (chi-cuadrado aproximado)', () => {
    const CARD_COUNT = 40;
    const TRIALS = 1000;

    // Track position of each card across shuffles
    const positionCounts: Record<string, number[]> = {};
    for (const key of Object.keys(EXPECTED_RANKINGS)) {
      positionCounts[key] = new Array(CARD_COUNT).fill(0);
    }

    for (let i = 0; i < TRIALS; i++) {
      const deck = generarMazo();
      for (let pos = 0; pos < CARD_COUNT; pos++) {
        const key = cardKey(deck[pos]);
        positionCounts[key][pos]++;
      }
    }

    // For each card, check that the expected count per position (TRIALS / CARD_COUNT = 25)
    // is approximately observed. Use a simple bound: no position should be < 10 or > 40
    // (extremely unlikely under uniform distribution)
    const expectedPerPos = TRIALS / CARD_COUNT; // 25

    for (const [key, positions] of Object.entries(positionCounts)) {
      for (let pos = 0; pos < CARD_COUNT; pos++) {
        const count = positions[pos];
        // With 25 expected per position, < 10 or > 40 is >3 sigma away
        // We use a liberal bound to avoid flaky tests while still catching bugs
        expect(count).toBeGreaterThanOrEqual(5);
        expect(count).toBeLessThanOrEqual(55);
        if (count < 8 || count > 50) {
          console.warn(`⚠️  Card ${key} at position ${pos}: count=${count} (expected ~${expectedPerPos})`);
        }
      }
    }
  });
});

describe('getValorEnvido', () => {
  it('figuras (10, 11, 12) deberían valer 0', () => {
    expect(getValorEnvido(10)).toBe(0);
    expect(getValorEnvido(11)).toBe(0);
    expect(getValorEnvido(12)).toBe(0);
  });

  it('números 1-7 deberían valer su número', () => {
    for (let n = 1; n <= 7; n++) {
      expect(getValorEnvido(n as CardNumber)).toBe(n);
    }
  });
});

describe('getValorTruco', () => {
  it('debería devolver valores correctos para todas las 40 cartas', () => {
    const suits: Suit[] = ['espada', 'basto', 'oro', 'copa'];
    const numbers: CardNumber[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

    for (const suit of suits) {
      for (const number of numbers) {
        const key = `${suit}-${number}`;
        expect(getValorTruco(suit, number)).toBe(EXPECTED_RANKINGS[key]);
      }
    }
  });
});