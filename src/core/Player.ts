// Player - Player class

import type { Card } from './Card.js';
import { getCardRank } from './Rules.js';

export interface PlayerInfo {
  id: string;
  name: string;
  isHuman: boolean;
  isAI: boolean;
  difficulty?: 'easy' | 'normal' | 'hard';
  team?: number; // 0 or 1 for team-based play
}

export function getEnvidoValue(number: number): number {
  if (number >= 10) return 0;
  return number;
}

export class Player {
  public id: string;
  public name: string;
  public isHuman: boolean;
  public isAI: boolean;
  public difficulty: 'easy' | 'normal' | 'hard';
  
  private hand: Card[] = [];
  
  constructor(info: PlayerInfo) {
    this.id = info.id;
    this.name = info.name;
    this.isHuman = info.isHuman;
    this.isAI = info.isAI;
    this.difficulty = info.difficulty || 'normal';
  }
  
  addCard(card: Card): void {
    this.hand.push(card);
  }
  
  playCard(index: number): Card | null {
    if (index < 0 || index >= this.hand.length) return null;
    return this.hand.splice(index, 1)[0];
  }
  
  hasCard(index: number): boolean {
    return index >= 0 && index < this.hand.length;
  }
  
  get cards(): Card[] {
    return [...this.hand];
  }
  
calculateEnvido(): number {
    if (this.hand.length === 0) return 0;
    let maxScore = 0;

    const suitCounts: Record<string, number> = {};
    for (const card of this.hand) {
      suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    }

    for (const [suit, count] of Object.entries(suitCounts)) {
      if (count >= 2) {
        const suitCards = this.hand.filter(c => c.suit === suit);
        suitCards.sort((a, b) => getEnvidoValue(b.number) - getEnvidoValue(a.number));
        const score = 20 + getEnvidoValue(suitCards[0].number) + getEnvidoValue(suitCards[1].number);
        maxScore = Math.max(maxScore, score);
      }
    }

    if (maxScore === 0 && this.hand.length > 0) {
      maxScore = Math.max(...this.hand.map(c => getEnvidoValue(c.number)));
    }

    return maxScore;
  }
  
getTrucoStrength(): number {
    let strength = 0;

    const has7Sword = this.hand.some(c => c.suit === 'espada' && c.number === 7);
    const has1Sword = this.hand.some(c => c.suit === 'espada' && c.number === 1);

    if (has7Sword) strength += 30;
    if (has1Sword) strength += 25;

    const avgValue = this.hand.reduce((sum, c) => sum + getCardRank(c), 0) / (this.hand.length || 1);
    strength += avgValue * 2;

    return strength;
  }
  
  selectCardToPlay(_playedCards: Card[], _trucoLevel: number): number {
    if (this.difficulty === 'easy') {
      return Math.floor(Math.random() * this.hand.length);
    }
    
    const sortedIndices = this.hand
      .map((card, index) => ({ card, index }))
      .sort((a, b) => getCardRank(b.card) - getCardRank(a.card));
    
    return sortedIndices[0].index;
  }
}

