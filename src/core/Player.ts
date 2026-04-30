// Player - represents a game player (human or AI)

import { Card } from './Card.js';

export type PlayerState = 'waiting' | 'playing' | 'folded';

export interface PlayerInfo {
  id: string;
  name: string;
  points: number;
  isHuman: boolean;
  isAI: boolean;
  difficulty?: 'easy' | 'normal' | 'hard';
}

export class Player {
  id: string;
  name: string;
  points: number = 0;
  isHuman: boolean;
  isAI: boolean;
  difficulty: 'easy' | 'normal' | 'hard';
  
  // Round state
  cards: Card[] = [];
  playedCards: Card[] = [];
  handWins: number = 0;
  isHand: boolean = false; // mano - who goes first
  state: PlayerState = 'waiting';

  constructor(info: PlayerInfo) {
    this.id = info.id;
    this.name = info.name;
    this.isHuman = info.isHuman;
    this.isAI = info.isAI;
    this.difficulty = info.difficulty || 'normal';
  }

  resetRound(): void {
    this.cards = [];
    this.playedCards = [];
    this.handWins = 0;
    this.state = 'waiting';
  }

  hasCards(): boolean {
    return this.cards.length > 0;
  }

  playCard(index: number): Card | null {
    if (index < 0 || index >= this.cards.length) return null;
    
    const card = this.cards.splice(index, 1)[0];
    if (card) {
      this.playedCards.push(card);
      this.state = 'playing';
    }
    return card;
  }

  /**
   * Calculate envido score for current hand.
   * Score is based on suits and card values.
   * Max possible: 33 (dos 7's of same suit + flute)
   */
  calculateEnvido(): number {
    if (this.cards.length === 0) return 0;

    const suitCounts: Record<string, number> = {};
    const suitValues: Record<string, number[]> = {};

    // Group cards by suit and calculate values
    for (const card of this.cards) {
      suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
      if (!suitValues[card.suit]) {
        suitValues[card.suit] = [];
      }
      suitValues[card.suit].push(this.getEnvidoValue(card));
    }

    // Calculate best envido combination
    let maxScore = 0;

    // Check for pairs (same suit)
    for (const suit in suitCounts) {
      if (suitCounts[suit] >= 2) {
        const values = suitValues[suit];
        // Sort descending, take top 2
        values.sort((a, b) => b - a);
        const pairScore = 20 + values[0] + values[1];
        maxScore = Math.max(maxScore, pairScore);
      }
    }

    // Check highest single card (flute)
    for (const suit in suitValues) {
      const maxSingle = Math.max(...suitValues[suit]);
      maxScore = Math.max(maxScore, maxSingle);
    }

    return maxScore;
  }

  /**
   * Get envido value of a card.
   * Cards 1-7 have their face value for envido.
   * Cards 10, 11, 12 = 8 points each.
   */
  private getEnvidoValue(card: Card): number {
    if (card.number >= 1 && card.number <= 7) {
      return card.number;
    }
    // 10, 11, 12 are worth 8 points each for envido
    return 8;
  }

  /**
   * Calculate strength of current hand for AI decision making.
   * Returns a value between 0 and 39 (sum of card rankings).
   */
  getTrucoStrength(): number {
    return this.cards.reduce((sum, card) => sum + getCardRankingForPlayer(card), 0);
  }

  /**
   * Get the strongest card in hand.
   */
  getBestCard(): Card | null {
    if (this.cards.length === 0) return null;
    
    let bestCard = this.cards[0];
    let bestRanking = getCardRankingForPlayer(bestCard);
    
    for (const card of this.cards) {
      const ranking = getCardRankingForPlayer(card);
      if (ranking > bestRanking) {
        bestRanking = ranking;
        bestCard = card;
      }
    }
    
    return bestCard;
  }

  /**
   * Get the weakest card in hand.
   */
  getWorstCard(): Card | null {
    if (this.cards.length === 0) return null;
    
    let worstCard = this.cards[0];
    let worstRanking = getCardRankingForPlayer(worstCard);
    
    for (const card of this.cards) {
      const ranking = getCardRankingForPlayer(card);
      if (ranking < worstRanking) {
        worstRanking = ranking;
        worstCard = card;
      }
    }
    
    return worstCard;
  }

  /**
   * Should this player play a card now?
   * AI decision based on difficulty and hand evaluation.
   */
  shouldPlayCard(card: Card, trucoLevel: number): boolean {
    const ranking = getCardRankingForPlayer(card);
    
    // Easy AI: plays randomly
    if (this.difficulty === 'easy') {
      return Math.random() > 0.3;
    }
    
    // Normal AI: plays strong cards
    if (this.difficulty === 'normal') {
      return ranking >= 5;
    }
    
    // Hard AI: strategic play
    if (this.difficulty === 'hard') {
      // Play high cards when ahead, save for critical moments
      const strength = this.getTrucoStrength();
      return ranking >= (trucoLevel > 0 ? 6 : 5);
    }
    
    return true;
  }

  /**
   * Should this player declare envido?
   */
  shouldDeclareEnvido(): boolean {
    const envidoScore = this.calculateEnvido();
    
    // Easy: declares if score >= 15
    if (this.difficulty === 'easy') {
      return envidoScore >= 15;
    }
    
    // Normal: declares if score >= 20
    if (this.difficulty === 'normal') {
      return envidoScore >= 20;
    }
    
    // Hard: strategic
    if (this.difficulty === 'hard') {
      return envidoScore >= 25 || this.points > 10; // Aggressive when winning
    }
    
    return false;
  }

  /**
   * Should this player respond to envido?
   */
  shouldRespondEnvido(currentScore: number, challengerScore: number): boolean {
    // Easy: accepts if score is decent
    if (this.difficulty === 'easy') {
      return currentScore >= 18;
    }
    
    // Normal: accepts if score is good
    if (this.difficulty === 'normal') {
      return currentScore >= 22;
    }
    
    // Hard: calculates odds
    if (this.difficulty === 'hard') {
      return currentScore >= 25 || currentScore > challengerScore * 0.8;
    }
    
    return false;
  }

  /**
   * Should this player declare truco?
   */
  shouldDeclareTruco(trucoLevel: number): boolean {
    const strength = this.getTrucoStrength();
    
    // Can only declare truco at levels 0, 1, 2
    if (trucoLevel >= 3) return false;
    
    // Easy: rarely declares truco
    if (this.difficulty === 'easy') {
      return strength >= 25 && Math.random() > 0.7;
    }
    
    // Normal: moderate truco declaration
    if (this.difficulty === 'normal') {
      return strength >= 20;
    }
    
    // Hard: strategic truco
    if (this.difficulty === 'hard') {
      const maxStrength = 39; // Max possible (1 espada + 2 basto)
      const strengthRatio = strength / maxStrength;
      
      // Declares when hand is strong enough for current truco level
      const requiredRatio = 0.5 + trucoLevel * 0.1;
      return strengthRatio >= requiredRatio && Math.random() > 0.2;
    }
    
    return false;
  }

  /**
   * Should this player respond to truco?
   */
  shouldRespondTruco(trucoLevel: number): boolean {
    const strength = this.getTrucoStrength();
    
    // Easy: rarely accepts high truco
    if (this.difficulty === 'easy') {
      return strength >= 20 - trucoLevel * 5;
    }
    
    // Normal: reasonable acceptance
    if (this.difficulty === 'normal') {
      return strength >= 18 - trucoLevel * 4;
    }
    
    // Hard: calculated risk
    if (this.difficulty === 'hard') {
      const maxStrength = 39;
      const strengthRatio = strength / maxStrength;
      const requiredRatio = 0.4 + trucoLevel * 0.1;
      return strengthRatio >= requiredRatio || this.points > 12; // Gamble when losing
    }
    
    return false;
  }
}

/**
 * Helper to get card ranking without circular dependency.
 */
function getCardRankingForPlayer(card: Card): number {
  switch (card.number) {
    case 4: return 0;
    case 5: return 1;
    case 6: return 2;
    case 7:
      if (card.suit === 'basto' || card.suit === 'copa') return 3;
      if (card.suit === 'oro') return 10;
      return 11; // espada
    case 10: return 4;
    case 11: return 5;
    case 12: return 6;
    case 1:
      if (card.suit === 'oro' || card.suit === 'copa') return 7;
      if (card.suit === 'basto') return 12;
      return 13; // espada
    case 2: return 8;
    case 3: return 9;
    default: return -1;
  }
}
