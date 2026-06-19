// DecisionEngine — AI decision-making for Truco/Envido calls
// US-15: IA — Decisión de cantar Truco
// US-16: IA — Decisión de cantar Envido
// US-17: IA — Decisión de irse al mazo

import { getCardRank } from '../core/Rules.js';
import { CardEvaluator } from './CardEvaluator.js';
import type { CardDef, PlayerConfig } from '../types.js';
import type { Player as CorePlayer } from '../core/Player.js';

/**
 * Truco card classification.
 * These are the "truco value" rankings used by the heuristic:
 *   - Excellent (>=10): 1♠(13), 1♣(12), 7♠(11), 7♦(10)
 *   - Good (>=8): any 3(9), any 2(8)
 *   - Medium (>=6): 1/copa(7), 12(6)
 *   - Weak (<=5): 11(5), 10(4), 7/basto-copa(3), 6(2), 5(1), 4(0)
 */
export const TRUCO_THRESHOLDS = {
  EXCELLENT: 10,  // 1♠,1♣,7♠,7♦
  GOOD: 8,       // any 3, any 2
  MEDIUM: 6,     // 1/copa, 12
  WEAK: 5,       // 11, 10
} as const;

/**
 * Get the "truco value" of a card — the ranking used for
 * determining whether to call/accept truco.
 */
function getCardTrucoValue(card: CardDef): number {
  return getCardRank(card);
}

// ─── Helper: count cards above a threshold ──────────────────────────────

function countCardsAbove(hand: CardDef[], threshold: number): number {
  return hand.filter(c => getCardTrucoValue(c) >= threshold).length;
}

// ─── Helper: check for a specific card ───────────────────────────────────

function hasCard(hand: CardDef[], suit: string, number: number): boolean {
  return hand.some(c => c.suit === suit && c.number === number);
}

// ─── Helper: get best truco value ────────────────────────────────────────

function getBestTrucoValue(hand: CardDef[]): number {
  if (hand.length === 0) return 0;
  return Math.max(...hand.map(c => getCardTrucoValue(c)));
}

// ─── DecisionEngine class ────────────────────────────────────────────────

/**
 * DecisionEngine — encapsulates all "call/response" heuristics for
 * the Truco AI: when to call truco, when to accept, when to call envido,
 * when to respond to envido, and when to go to the mazo.
 *
 * Each method returns an object with a `decision` (boolean or string)
 * and a `reason` string for explanation/debugging.
 */

export interface DecisionResult {
  decision: boolean | string;
  reason: string;
}

export class DecisionEngine {
  private evaluator: CardEvaluator;
  private playerId: string;
  private teamScore: number;
  private opponentScore: number;
  private envidoActive: boolean;

  constructor(playerId: string) {
    this.evaluator = new CardEvaluator();
    this.playerId = playerId;
    this.teamScore = 0;
    this.opponentScore = 0;
    this.envidoActive = false;
  }

  /** Update the engine with current game context */
  updateContext(teamScore: number, opponentScore: number, envidoActive: boolean): void {
    this.teamScore = teamScore;
    this.opponentScore = opponentScore;
    this.envidoActive = envidoActive;
  }

  // ─── T-036: Heurística para cantar truco ───────────────────────────────

  /**
   * Decide whether to call truco.
   *
   * Rules:
   *  - Call if hand has at least 1 card with valorTruco >= 10
   *  - Call if hand has 2 cards with valorTruco >= 8
   *  - Don't call if all cards have valorTruco <= 5
   *  - If winning by +10: more conservative
   *  - If losing by +10: more aggressive
   */
  shouldCallTruco(hand: CardDef[]): DecisionResult {
    const vals = hand.map(c => getCardTrucoValue(c));
    const maxVal = Math.max(...vals, 0);
    const avgVal = vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
    const goodCount = countCardsAbove(hand, TRUCO_THRESHOLDS.GOOD);  // >= 8
    const excellentCount = countCardsAbove(hand, TRUCO_THRESHOLDS.EXCELLENT); // >= 10

    // Score pressure modifiers
    const scoreDiff = this.teamScore - this.opponentScore;
    const losing = scoreDiff < -10;
    const winning = scoreDiff > 10;

    // Base: need at least 1 excellent card OR 2+ good cards
    if (excellentCount >= 1 || goodCount >= 2) {
      if (losing) {
        // Losing by +10 — more aggressive
        return { decision: true, reason: 'Losing by 10+ — calling truco aggressively' };
      }
      if (winning) {
        // Winning by +10 — more conservative
        // Only call if hand is truly excellent
        if (excellentCount >= 2 || (maxVal >= 12 && goodCount >= 2)) {
          return { decision: true, reason: 'Winning by 10+ but hand is excellent — calling truco' };
        }
        return { decision: false, reason: 'Winning by 10+ — playing conservatively, not calling truco' };
      }
      // Normal (neutral)
      return { decision: true, reason: `Hand has ${excellentCount} excellent + ${goodCount} good cards — calling truco` };
    }

    // All cards weak
    if (maxVal <= TRUCO_THRESHOLDS.WEAK) {
      return { decision: false, reason: 'All cards are weak (<=5) — not calling truco' };
    }

    // Borderline: if average is >= 6 and we have at least 1 good card
    if (avgVal >= 6 && goodCount >= 1) {
      // 50% chance — be unpredictable
      if (Math.random() > 0.5) {
        return { decision: true, reason: 'Borderline hand — calling truco (unpredictable)' };
      }
      return { decision: false, reason: 'Borderline hand — not calling (playing safe)' };
    }

    return { decision: false, reason: 'Hand too weak — not calling truco' };
  }

  // ─── T-037: Heurística para responder al truco ─────────────────────────

  /**
   * Decide whether to accept a truco challenge.
   *
   * Rules:
   *  - Accept if hand has at least 1 good card (valorTruco >= 8)
   *  - Reject if all cards are <= 5
   *  - Raise to retruco if 2+ excellent cards (>= 10)
   *  - Raise to vale4 only if best card is 13 and another is >=10
   */
  shouldAcceptTruco(hand: CardDef[], currentLevel: number): DecisionResult & { raiseTo?: number } {
    const excellentCount = countCardsAbove(hand, TRUCO_THRESHOLDS.EXCELLENT); // >= 10
    const goodCount = countCardsAbove(hand, TRUCO_THRESHOLDS.GOOD);         // >= 8
    const maxVal = getBestTrucoValue(hand);
    const avgVal = hand.reduce((s, c) => s + getCardTrucoValue(c), 0) / (hand.length || 1);

    // -- Accept if we have at least 1 good card --
    if (goodCount >= 1) {
      // Can we raise?
      if (currentLevel === 1) {
        // Retruco: need 2+ excellent cards
        if (excellentCount >= 2) {
          return { decision: 'retruco', reason: `2+ excellent cards — raising to retruco`, raiseTo: 2 };
        }
        // Vale4: only if best >= 12 and another >= 10
        if (maxVal >= 12 && excellentCount >= 1) {
          return { decision: 'vale4', reason: `Best card ${maxVal} + excellent — raising to vale4`, raiseTo: 3 };
        }
      }

      // Accept straightforward
      return { decision: true, reason: `At least 1 good card — accepting truco` };
    }

    // -- Reject if all are weak --
    if (goodCount === 0 && avgVal <= TRUCO_THRESHOLDS.WEAK) {
      return { decision: false, reason: 'All cards weak — rejecting truco' };
    }

    // -- Borderline --
    if (avgVal <= TRUCO_THRESHOLDS.GOOD && maxVal < TRUCO_THRESHOLDS.EXCELLENT) {
      // Borderline: 50% chance to accept (unpredictable)
      if (Math.random() > 0.5) {
        return { decision: true, reason: 'Borderline — accepting unpredictably' };
      }
      return { decision: false, reason: 'Borderline — rejecting' };
    }

    // Default: accept if at least 1 card can win
    return { decision: true, reason: `Average hand — accepting` };
  }

  // ─── T-038: Heurística para cantar envido ──────────────────────────────

  /**
   * Decide whether to call envido.
   *
   * Uses evaluateEnvido() to calculate envido score.
   *
   * Rules:
   *  - Call if envido score >= 27
   *  - Call "real envido" if score >= 30
   *  - Call "falta envido" if losing badly AND score >= 30
   *  - Don't call if score <= 22
   *  - 50% random if score between 23-26
   *
   * @param envidoScore The player's envido score (from evaluateEnvido())
   * @returns Decision with what level of envido to call
   */
  shouldCallEnvido(envidoScore: number): DecisionResult & { callType?: string } {
    if (envidoScore >= 30) {
      // Real envido or falta envido
      const scoreDiff = this.teamScore - this.opponentScore;

      // Falta envido: if very behind in game points
      if (scoreDiff <= -15 && envidoScore >= 30) {
        return {
          decision: 'falta-envido',
          reason: `Falta envido — score ${envidoScore} and losing badly`,
          callType: 'falta-envido',
        };
      }

      // Real envido
      return {
        decision: 'real-envido',
        reason: `Real envido — score ${envidoScore} is excellent`,
        callType: 'real-envido',
      };
    }

    if (envidoScore >= 27) {
      return {
        decision: 'envido',
        reason: `Envido — score ${envidoScore} is good`,
        callType: 'envido',
      };
    }

    if (envidoScore >= 23 && envidoScore <= 26) {
      // 50% random
      if (Math.random() > 0.5) {
        return {
          decision: 'envido',
          reason: `Borderline envido — score ${envidoScore} — calling`,
          callType: 'envido',
        };
      }
      return {
        decision: false,
        reason: `Borderline envido — score ${envidoScore} — not calling`,
      };
    }

    // Too weak
    if (envidoScore <= 22) {
      return {
        decision: false,
        reason: `Envido too weak — score ${envidoScore} — not calling`,
      };
    }

    return {
      decision: false,
      reason: `No valid envido — score ${envidoScore}`,
    };
  }

  // ─── T-039: Heurística para responder al envido ─────────────────────────

  /**
   * Decide whether to accept an envido challenge.
   *
   * Rules:
   *  - Accept if envido score >= 25
   *  - Reject if <= 20
   *  - 60% accept if between 21-24
   *  - 'Son buenas' if <= 18 and opponent showed strength
   *
   * @param myEnvidoScore The player's envido score
   * @param opponentEnvidoScore The opponent's envido score (if known)
   */
  shouldAcceptEnvido(myEnvidoScore: number, opponentEnvidoScore?: number): DecisionResult {
    if (myEnvidoScore >= 25) {
      return { decision: true, reason: `Envido ${myEnvidoScore} >= 25 — accepting` };
    }

    if (myEnvidoScore >= 21 && myEnvidoScore <= 24) {
      // 60% accept
      if (Math.random() < 0.6) {
        return { decision: true, reason: `Envido ${myEnvidoScore} — accepting (60% chance)` };
      }
      return { decision: false, reason: `Envido ${myEnvidoScore} — rejecting` };
    }

    if (myEnvidoScore <= 18 && opponentEnvidoScore !== undefined && opponentEnvidoScore >= 25) {
      return {
        decision: 'son-buenas',
        reason: `My envido ${myEnvidoScore} is weak — 'son buenas'`,
      };
    }

    return { decision: false, reason: `Envido ${myEnvidoScore} too weak — rejecting` };
  }

  // ─── T-040: Heurística para irse al mazo ──────────────────────────────

  /**
   * Decide whether to go to the mazo (fold/abandon the hand).
   *
   * Rules:
   *  - Irse if 3 cards with valorTruco <= 4 (very weak)
   *  - Irse if lost 2 tricks and truco was called (opponent will win)
   *  - Never if envido is pending
   *  - No irse in first 2 tricks (except catastrophically weak)
   *  - Probability inversely proportional to card quality
   *
   * @param hand Current hand
   * @param tricksLost Number of tricks lost in this hand
   * @param trucoLevel Current truco level (0=none)
   * @param envidoActive Whether envido is being played
   * @param trickNumber Which trick of the hand (0, 1, 2)
   */
  shouldGoToMazo(
    hand: CardDef[],
    tricksLost: number = 0,
    trucoLevel: number = 0,
    envidoActive: boolean = false,
    trickNumber: number = 0
  ): DecisionResult {
    // Never if envido is pending
    if (envidoActive) {
      return { decision: false, reason: 'Envido pending — never go to mazo' };
    }

    // No irse in first 2 tricks (except catastrophically weak)
    if (trickNumber <= 1 && hand.length >= 3) {
      const allWeak = hand.every(c => getCardTrucoValue(c) <= 4);
      if (allWeak) {
        return {
          decision: true,
          reason: 'All cards are very weak (<=4) — going to mazo',
        };
      }
      return { decision: false, reason: 'Early tricks — not going to mazo' };
    }

    // Irse if lost 2 tricks and truco was called
    if (tricksLost >= 2 && trucoLevel > 0) {
      return { decision: true, reason: `Lost ${tricksLost} tricks + truco — going to mazo` };
    }

    // Irse if all 3 cards are weak
    const totalWeakness = hand.reduce((s, c) => s + getCardTrucoValue(c), 0);
    const avgWeakness = totalWeakness / (hand.length || 1);
    const maxVal = getBestTrucoValue(hand);

    // Probability inversely proportional to quality
    // Strong hand (avg >= 8): < 10% chance
    // Weak hand (avg <= 4): > 60% chance
    const goProbability = avgWeakness <= 4 ? 0.60
      : avgWeakness <= 6 ? 0.30
      : avgWeakness <= 8 ? 0.10
      : 0.0;

    if (Math.random() < goProbability) {
      return {
        decision: true,
        reason: `Average ${avgWeakness.toFixed(1)} — random chance to go mazo`,
      };
    }

    return { decision: false, reason: `Hand is decent — not going to mazo` };
  }
}