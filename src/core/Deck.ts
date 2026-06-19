// Deck - Card deck for Truco

import type { CardDef, Suit, CardNumber } from '../types.js';

/** Truco ranking map: higher = stronger */
const TRUCO_RANKING: Record<string, number> = {
  'espada-1': 13,
  'basto-1': 12,
  'espada-7': 11,
  'oro-7': 10,
  'any-3': 9,
  'any-2': 8,
  'oro-1': 7,
  'copa-1': 7,
  'any-12': 6,
  'any-11': 5,
  'any-10': 4,
  'basto-7': 3,
  'copa-7': 3,
  'any-6': 2,
  'any-5': 1,
  'any-4': 0,
};

/** Spanish display names for each card (valor + palo) */
function getNombreDisplay(valor: CardNumber, palo: Suit): string {
  const nombresNumero: Record<number, string> = {
    1: 'Ancho',
    2: 'Dos',
    3: 'Tres',
    4: 'Cuatro',
    5: 'Cinco',
    6: 'Seis',
    7: 'Siete',
    10: 'Diez',
    11: 'Once',
    12: 'Doce',
  };
  const nombresPalo: Record<string, string> = {
    espada: 'Espada',
    basto: 'Basto',
    oro: 'Oro',
    copa: 'Copa',
  };
  return `${nombresNumero[valor]} de ${nombresPalo[palo]}`;
}

/**
 * Get the Envido value of a card number.
 * Figures (10, 11, 12) are worth 0; numbers 1-7 are worth face value.
 */
export function getValorEnvido(numero: CardNumber): number {
  return numero >= 10 ? 0 : numero;
}

/**
 * Get the Truco ranking value of a card (higher = stronger).
 * Ranking follows Argentine Truco hierarchy:
 *   1-espada(13) > 1-basto(12) > 7-espada(11) > 7-oro(10) > 3(9) > 2(8)
 *   > 1-oro/copa(7) > 12(6) > 11(5) > 10(4) > 7-basto/copa(3) > 6(2) > 5(1) > 4(0)
 */
export function getValorTruco(palo: Suit, numero: CardNumber): number {
  const key = `${palo}-${numero}`;
  if (TRUCO_RANKING[key] !== undefined) {
    return TRUCO_RANKING[key];
  }
  // Fallback: generic rank key
  const genericKey = `any-${numero}`;
  if (TRUCO_RANKING[genericKey] !== undefined) {
    return TRUCO_RANKING[genericKey];
  }
  return 0;
}

const SUITS: Suit[] = ['espada', 'basto', 'oro', 'copa'];
const NUMBERS: CardNumber[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

/**
 * Create a full 40-card Truco deck with pre-computed valorEnvido and valorTruco,
 * then shuffle using the Fisher-Yates algorithm.
 *
 * Returns a new shuffled array of CardDef with:
 * - valor (1-12)
 * - palo (espada/basto/oro/copa)
 * - valorEnvido (0-7)
 * - valorTruco (0-13)
 * - nombreDisplay (Spanish name)
 * - estado (all 'en_mano' initially)
 */
export function generarMazo(): CardDef[] {
  const deck: CardDef[] = [];

  for (const suit of SUITS) {
    for (const number of NUMBERS) {
      deck.push({
        number,
        suit,
        valorEnvido: getValorEnvido(number),
        valorTruco: getValorTruco(suit, number),
        nombreDisplay: getNombreDisplay(number, suit),
        estado: 'en_mano' as const,
      });
    }
  }

  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

export class Deck {
  private cards: CardDef[] = [];

  constructor() {
    this.initialize();
  }

  /**
   * Initialize deck with all Truco cards
   */
  private initialize(): void {
    this.cards = generarMazo();
  }

  /**
   * Shuffle deck using Fisher-Yates algorithm
   */
  shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  /**
   * Draw a card from the deck
   */
  draw(): CardDef | null {
    if (this.cards.length === 0) return null;
    return this.cards.pop()!;
  }

  /**
   * Check if deck is empty
   */
  isEmpty(): boolean {
    return this.cards.length === 0;
  }

  /**
   * Get remaining cards count
   */
  get remaining(): number {
    return this.cards.length;
  }

  /**
   * Reset and reshuffle deck
   */
  reset(): void {
    this.initialize();
  }
}