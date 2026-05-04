// Deck - Card deck for Truco

import type { CardDef } from '../types.js';

export class Deck {
  private cards: CardDef[] = [];
  
  constructor() {
    this.initialize();
  }
  
  /**
   * Initialize deck with all Truco cards
   */
  private initialize(): void {
    this.cards = [];
    
    const suits: ('espada' | 'basto' | 'oro' | 'copa')[] = ['espada', 'basto', 'oro', 'copa'];
    
    for (const suit of suits) {
      // 1-7 and 10-12 for each suit
      for (let i = 1; i <= 7; i++) {
        this.cards.push({ suit, number: i as CardDef['number'] });
      }
      for (let i = 10; i <= 12; i++) {
        this.cards.push({ suit, number: i as CardDef['number'] });
      }
    }
    
    // Shuffle
    this.shuffle();
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

