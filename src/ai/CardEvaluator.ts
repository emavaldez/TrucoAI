// Card Evaluator - assesses hand strength for AI decision making

import { Card } from '../core/Card.js';
import { getCardRank } from '../core/Rules.js';
import { Player } from '../core/Player.js';

export type HandStrength = 'very-weak' | 'weak' | 'average' | 'good' | 'excellent';

export interface HandEvaluation {
  trucoStrength: number;       // Sum of card rankings (0-39)
  envidoScore: number;         // Envido potential (0-33)
  bestCard: Card | null;       // Strongest card in hand
  worstCard: Card | null;      // Weakest card in hand
  bestRanking: number;         // Ranking of best card (0-13)
  worstRanking: number;        // Ranking of worst card (0-13)
  strength: HandStrength;      // Overall classification
  hasPairOfSuit: boolean;      // Two or more cards of same suit (envido potential)
  bestSuit: string | null;     // Suit with most cards
  bestSuitCount: number;       // Number of cards in best suit
}

export class CardEvaluator {
  /** Evaluate a player's hand for AI decision making */
  evaluate(player: Player): HandEvaluation {
    const cards = player.cards;

    if (cards.length === 0) {
      return {
        trucoStrength: 0, envidoScore: 0, bestCard: null, worstCard: null,
        bestRanking: 0, worstRanking: 13, strength: 'very-weak',
        hasPairOfSuit: false, bestSuit: null, bestSuitCount: 0
      };
    }

    // Calculate truco strength (sum of rankings)
    let totalStrength = 0;
    let bestRanking = -1;
    let worstRanking = 99;
    let bestCard: Card | null = null;
    let worstCard: Card | null = null;

    for (const card of cards) {
      const ranking = getCardRank(card);
      totalStrength += ranking;

      if (ranking > bestRanking) {
        bestRanking = ranking;
        bestCard = card;
      }
      if (ranking < worstRanking) {
        worstRanking = ranking;
        worstCard = card;
      }
    }

    // Calculate envido score
    const envidoScore = player.calculateEnvido();

    // Check for same-suit pairs
    const suitCounts: Record<string, number> = {};
    for (const card of cards) {
      suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    }

    let bestSuit: string | null = null;
    let bestSuitCount = 0;
    for (const suit in suitCounts) {
      if (suitCounts[suit] > bestSuitCount) {
        bestSuit = suit;
        bestSuitCount = suitCounts[suit];
      }
    }

    const hasPairOfSuit = bestSuitCount >= 2;

    // Classify overall strength
    const strength = this.classifyStrength(totalStrength, envidoScore);

    return {
      trucoStrength: totalStrength,
      envidoScore,
      bestCard,
      worstCard,
      bestRanking,
      worstRanking,
      strength,
      hasPairOfSuit,
      bestSuit,
      bestSuitCount,
    };
  }

  /** Classify hand strength based on truco and envido values */
  private classifyStrength(trucoScore: number, envidoScore: number): HandStrength {
    // Truco scoring thresholds (sum of 3 card rankings, max ~39)
    const trucoAvg = trucoScore / 3;

    // Envido scoring thresholds (0-33)
    const envidoGood = envidoScore >= 27;
    const envidoOk = envidoScore >= 20;

    if (trucoAvg > 9 && envidoGood) return 'excellent';
    if (trucoAvg > 8 && envidoOk) return 'good';
    if (trucoAvg > 6 || envidoOk) return 'average';
    if (trucoAvg > 4) return 'weak';
    return 'very-weak';
  }

  /** Get probability of winning a hand with current card vs unknown opponent */
  getWinProbability(card: Card): number {
    const ranking = getCardRank(card);

    // Simple probability model based on card ranking
    // Higher ranking = higher win probability
    const probabilities: Record<number, number> = {
      0: 0.05,   // 4 (ancho falso) - almost always loses
      1: 0.15,   // 5
      2: 0.25,   // 6
      3: 0.35,   // 7 basto/copa
      4: 0.40,   // 10
      5: 0.45,   // 11
      6: 0.50,   // 12
      7: 0.55,   // 1 oro/copa
      8: 0.60,   // 3 (any) - actually this should be higher
      9: 0.65,   // 2 (any) - actually this should be higher
      10: 0.75,  // 7 oro
      11: 0.82,  // 7 espada
      12: 0.93,  // 1 basto
      13: 1.0,   // 1 espada (ancho) - always wins
    };

    return probabilities[ranking] || 0.5;
  }

  /** Get probability of winning envido with current hand */
  getEnvidoWinProbability(player: Player): number {
    const myScore = player.calculateEnvido();

    // Probability opponent has better envido
    // Based on distribution of possible envido scores
    if (myScore >= 32) return 0.95; // Almost certain
    if (myScore >= 30) return 0.85;
    if (myScore >= 28) return 0.75;
    if (myScore >= 26) return 0.65;
    if (myScore >= 24) return 0.55;
    if (myScore >= 20) return 0.45;
    if (myScore >= 10) return 0.25;
    return 0.1;
  }

  /** Get probability of winning truco round with current cards */
  getTrucoWinProbability(player: Player): number {
    const evaluation = this.evaluate(player);

    // Probability of winning 2 out of 3 hands
    if (evaluation.strength === 'excellent') return 0.9;
    if (evaluation.strength === 'good') return 0.75;
    if (evaluation.strength === 'average') return 0.55;
    if (evaluation.strength === 'weak') return 0.35;
    return 0.15;
  }
}
