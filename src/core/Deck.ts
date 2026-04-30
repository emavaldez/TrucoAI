// Deck of 40 Argentine Truco cards

import { Card, CardNumber, Suit, createCard } from './Card.js';

const SUITS: Suit[] = ['espada', 'basto', 'oro', 'copa'];
const NUMBERS: CardNumber[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

export class Deck {
  private cards: Card[] = [];

  constructor() {
    this.buildDeck();
  }

  buildDeck(): void {
    this.cards = [];
    for (const suit of SUITS) {
      for (const number of NUMBERS) {
        this.cards.push(createCard(number, suit));
      }
    }
  }

  get size(): number {
    return this.cards.length;
  }

  /** Fisher-Yates shuffle */
  shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(count: number): Card[] {
    const dealt: Card[] = [];
    for (let i = 0; i < count && this.cards.length > 0; i++) {
      dealt.push(this.cards.pop()!);
    }
    return dealt;
  }

  peek(): Card | null {
    return this.cards.length > 0 ? this.cards[this.cards.length - 1] : null;
  }

  getRemaining(): number {
    return this.cards.length;
  }
}
