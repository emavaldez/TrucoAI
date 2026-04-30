// AIPlayer - AI opponent for Truco

import { GameEngine } from '../core/GameEngine.js';
import { getCardRank } from '../core/Rules.js';
import type { Card } from '../core/Card.js';

export type Difficulty = 'easy' | 'normal' | 'hard';

export class AIPlayer {
  private difficulty: Difficulty;
  private gameEngine: GameEngine;

  constructor(difficulty: Difficulty = 'normal') {
    this.difficulty = difficulty;
    this.gameEngine = new GameEngine();
  }

  setGameEngine(engine: GameEngine): void {
    this.gameEngine = engine;
  }

  /**
   * AI decides which card to play (by index in its hand)
   */
  chooseCard(hand: Card[], currentTrick: number, playerWonLastTrick: boolean): number {
    if (hand.length === 0) return -1;

    // Sort hand by rank (highest first)
    const indexedCards = hand.map((card, index) => ({ card, index }));
    indexedCards.sort((a, b) => getCardRank(b.card) - getCardRank(a.card));

    switch (this.difficulty) {
      case 'easy':
        return this.easyPlay(indexedCards);
      case 'normal':
        return this.normalPlay(indexedCards, currentTrick, playerWonLastTrick);
      case 'hard':
        return this.hardPlay(indexedCards, currentTrick, playerWonLastTrick);
      default:
        return this.normalPlay(indexedCards, currentTrick, playerWonLastTrick);
    }
  }

  /**
   * Easy AI: plays random card
   */
  private easyPlay(indexedCards: { card: Card; index: number }[]): number {
    const pick = indexedCards[Math.floor(Math.random() * indexedCards.length)];
    return pick.index;
  }

  /**
   * Normal AI: plays highest card on first trick, lowest on last trick
   */
  private normalPlay(
    indexedCards: { card: Card; index: number }[],
    currentTrick: number,
    playerWonLastTrick: boolean
  ): number {
    if (currentTrick === 0) {
      // First trick: play highest card to try to win
      return indexedCards[0].index;
    }

    if (currentTrick === 2) {
      // Last trick: if we're ahead, play lowest. If behind, play highest.
      return indexedCards[indexedCards.length - 1].index;
    }

    // Middle trick: play highest
    return indexedCards[0].index;
  }

  /**
   * Hard AI: strategic card play based on trick position and score
   */
  private hardPlay(
    indexedCards: { card: Card; index: number }[],
    currentTrick: number,
    playerWonLastTrick: boolean
  ): number {
    const highest = indexedCards[0];
    const lowest = indexedCards[indexedCards.length - 1];

    if (currentTrick === 0) {
      // First trick: play highest card to establish control
      return highest.index;
    }

    if (currentTrick === 2) {
      // Last trick: if we won previous tricks, play lowest to save high cards
      // If we lost previous tricks, play highest to try to salvage
      if (playerWonLastTrick) {
        return lowest.index;
      }
      return highest.index;
    }

    // Middle trick: play highest
    return highest.index;
  }

  /**
   * AI decides whether to challenge truco
   */
  shouldChallengeTruco(hand: Card[], currentLevel: number): boolean {
    // Calculate hand strength
    const strength = this.evaluateHandStrength(hand);

    // Thresholds for each level
    const thresholds = {
      easy:   { 1: 10, 2: 25, 3: 40 },
      normal: { 1: 18, 2: 35, 3: 50 },
      hard:   { 1: 22, 2: 40, 3: 55 },
    };

    const threshold = thresholds[this.difficulty as keyof typeof thresholds][currentLevel + 1 as 1 | 2 | 3] ?? 20;
    return strength >= threshold;
  }

  /**
   * AI decides whether to accept a truco challenge
   */
  shouldAcceptTruco(hand: Card[]): boolean {
    const strength = this.evaluateHandStrength(hand);
    return strength >= 15;
  }

  /**
   * AI decides whether to challenge envido
   */
  shouldChallengeEnvido(hand: Card[]): boolean {
    const score = this.calculateEnvidoForHand(hand);
    return score >= 28;
  }

  /**
   * Calculate envido score for a hand
   */
  private calculateEnvidoForHand(cards: Card[]): number {
    if (cards.length === 0) return 0;

    const suitCounts: Record<string, number> = {};
    for (const card of cards) {
      suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    }

    let maxScore = 0;
    for (const [suit, count] of Object.entries(suitCounts)) {
      if (count >= 2) {
        const suitCards = cards.filter(c => c.suit === suit);
        suitCards.sort((a, b) => b.number - a.number);
        const score = 20 + suitCards[0].number + suitCards[1].number;
        maxScore = Math.max(maxScore, score);
      }
    }

    if (maxScore === 0 && cards.length > 0) {
      maxScore = Math.max(...cards.map(c => c.number));
    }

    return maxScore;
  }

  /**
   * Evaluate overall hand strength (0-100)
   */
  private evaluateHandStrength(hand: Card[]): number {
    if (hand.length === 0) return 0;

    let totalRank = 0;
    for (const card of hand) {
      totalRank += getCardRank(card);
    }

    // Normalize: max rank is 13 (1 Espada), so max total is 39
    // Scale to 0-100
    return Math.min(100, (totalRank / 39) * 100);
  }
}
