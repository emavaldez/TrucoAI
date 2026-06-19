// AIPlayer — AI decision-making for playing cards in Truco
// US-14: IA — Decisión de qué carta jugar

import { getCardRank } from '../core/Rules.js';
import type { Card } from '../core/Card.js';
import type { PlayerConfig, CardDef, Suit } from '../types.js';

/**
 * Hand strength classification for card-play decisions.
 * Used by US-14 (IA carta) and US-17 (IA irse al mazo).
 */
export type HandStrength = 'muy-mala' | 'mala' | 'regular' | 'buena' | 'muy-buena' | 'excelente';

/**
 * Strategy flags for AI behavior during a hand.
 */
export interface AIStrategy {
  /** Current score situation: 'losing', 'winning', 'neutral' */
  scorePressure: 'losing' | 'winning' | 'neutral';
  /** Truco has been called */
  trucoCalled: boolean;
  /** Truco level (0=no truco, 1=truco, 2=retruco, 3=vale4) */
  trucoLevel: number;
  /** How many tricks this team has won in current hand */
  tricksWon: number;
  /** How many tricks this team has lost in current hand */
  tricksLost: number;
  /** Current envido state */
  envidoActive: boolean;
}

// ─── Card ranking helper ───────────────────────────────────────────────────

/**
 * Get the Truco ranking value of a card (higher = stronger).
 * Uses existing getCardRank from Rules.
 */
export function getValorTruco(card: CardDef | Card): number {
  // CardDef and Card are structurally compatible
  return getCardRank(card as any);
}

/**
 * Classify a card's value for truco purposes.
 * Returns true if the card is "good" (valorTruco >= 10 means:
 * 1♠ espada=13, 1♣ basto=12, 7♠ espada=11, 7♦ oro=10, any 3=9, any 2=8)
 * For this heuristic, "good" = valorTruco >= 8 (any 3 or better).
 */
export function isGoodTrucoCard(card: CardDef | Card): boolean {
  return getValorTruco(card) >= 8;
}

/**
 * Classify a card as "very good" for truco (valorTruco >= 10).
 * These are the top-tier cards: 1♠(13), 1♣(12), 7♠(11), 7♦(10).
 */
export function isExcellentTrucoCard(card: CardDef | Card): boolean {
  return getValorTruco(card) >= 10;
}

// ─── Envido helper ──────────────────────────────────────────────────────────

/**
 * Get the envido value of a card number (0 for figures 10/11/12,
 * face value for 1-7). Used for envido scoring.
 */
export function getEnvidoValue(num: number): number {
  if (num >= 10) return 0;
  return num;
}

// ─── AIPlayer class ─────────────────────────────────────────────────────────

/**
 * AIPlayer — AI decision-making module.
 * Encapsulates all heuristics for what card to play, when to call truco,
 * when to respond to envido, and when to go to the mazo.
 *
 * This class does NOT have access to hidden information (it doesn't see
 * the opponent's cards). It only sees:
 *   - Its own cards (hand)
 *   - Cards played on the table (playedCards)
 *   - The current game state (truco level, envido state, scores)
 */
export class AIPlayer {
  private playerId: string;
  private strategy: AIStrategy;
  private hand: CardDef[] = [];

  constructor(playerId: string) {
    this.playerId = playerId;
    this.strategy = {
      scorePressure: 'neutral',
      trucoCalled: false,
      trucoLevel: 0,
      tricksWon: 0,
      tricksLost: 0,
      envidoActive: false,
    };
  }

  /** Set the player's current hand */
  setHand(cards: CardDef[]): void {
    this.hand = [...cards];
  }

  /** Update strategy context based on game state */
  updateStrategy(context: Partial<AIStrategy>): void {
    this.strategy = { ...this.strategy, ...context };
  }

  // ─── T-034: Estrategia base de juego de carta ──────────────────────────

  /**
   * Decide which card to play from the hand.
   *
   * Rules:
   * - Turno normal: jugar la carta más baja (conservar las buenas)
   * - Si el equipo va ganando la baza: jugar la mínima que gane
   * - Si el equipo va perdiendo la baza: evaluar si usar carta alta o la más baja
   *
   * @param playedCards Cards already played in the current trick (opponent + partner)
   * @param tricksInfo 0 = first trick of hand, 1 = second trick, 2 = third trick
   * @returns Index into this.hand of the card to play
   */
  selectCardToPlay(
    playedCards: CardDef[],
    tricksInfo?: { tricksWon: number; tricksLost: number; currentTrickNumber: number }
  ): number {
    if (this.hand.length === 0) return -1;

    const info = tricksInfo || {
      tricksWon: this.strategy.tricksWon,
      tricksLost: this.strategy.tricksLost,
      currentTrickNumber: 0,
    };

    // Sort hand by strength (strongest first)
    const sorted = this.hand
      .map((card, i) => ({ card, index: i, valorTruco: getValorTruco(card) }))
      .sort((a, b) => b.valorTruco - a.valorTruco);

    const strongestCard = sorted[0];
    const weakestCard = sorted[sorted.length - 1];

    // -- Determine if we're ahead or behind in the current trick --
    const isLeadingTrick = playedCards.length === 0;

    if (isLeadingTrick) {
      // We're leading the trick — play conservatively (lowest card)
      // But only if we're not losing badly
      if (info.tricksLost >= 2) {
        // We're losing badly — play the strongest card to try to win
        return strongestCard.index;
      }
      // Normal: play the weakest card to save good cards
      return weakestCard.index;
    }

    // There are cards on the table. Check if our partner or we have
    // already shown strength.
    const highestPlayed = Math.max(...playedCards.map(c => getValorTruco(c)));
    const ourCardHighest = getValorTruco(strongestCard.card);

    // If we can win the trick with a low card, do it
    // Find the lowest card that still beats all played cards
    const canWinCards = this.hand.filter(
      c => getValorTruco(c) > highestPlayed
    );

    if (canWinCards.length > 0) {
      // We have cards that can beat the current best — play the
      // lowest one that wins (don't waste a high card)
      const minWinning = canWinCards
        .map((c, i) => ({ card: c, index: i, valorTruco: getValorTruco(c) }))
        .sort((a, b) => a.valorTruco - b.valorTruco)[0];

      // But if we're already winning the hand (2 tricks won),
      // we can be more aggressive with a low card
      if (info.tricksWon >= 2) {
        // Already won the hand — play the absolute weakest
        return weakestCard.index;
      }

      // Otherwise, play the minimum winning card
      return this.hand.indexOf(minWinning.card);
    }

    // We can't beat the current best — play our weakest card
    // (save strong cards for later)
    return weakestCard.index;
  }

  // ─── T-035: Delays realistas (async) ───────────────────────────────────

  /**
   * Generate a realistic delay before playing.
   * 800-2000ms, random, async.
   */
  async delay(): Promise<void> {
    const ms = 800 + Math.floor(Math.random() * 1200); // 800–2000
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─── US-15 / US-16 / US-17 helper ──────────────────────────────────────

  /** Get the current hand */
  getHand(): CardDef[] {
    return [...this.hand];
  }

  /** Get the player's ID */
  getPlayerId(): string {
    return this.playerId;
  }
}