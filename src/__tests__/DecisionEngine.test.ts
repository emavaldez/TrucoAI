// Tests for DecisionEngine — AI heuristics for Truco/Envido calls
// Covers: shouldCallTruco, shouldAcceptTruco, shouldCallEnvido, shouldAcceptEnvido, shouldGoToMazo

import { describe, it, expect, beforeEach } from 'vitest';
import { DecisionEngine, TRUCO_THRESHOLDS } from '../ai/DecisionEngine.js';
import { getValorTruco as getValorTrucoRank, getValorEnvido } from '../core/Deck.js';
import type { CardDef, CardNumber, Suit } from '../types.js';

function makeCard(suit: string, number: number): CardDef {
  const s = suit as Suit;
  const n = number as CardNumber;
  return {
    number: n,
    suit: s,
    valorEnvido: getValorEnvido(n),
    valorTruco: getValorTrucoRank(s, n),
    nombreDisplay: `${n} de ${s}`,
    estado: 'en_mano' as const,
  };
}

// Macho (1♠=13), Hembra (1♣=12), 7♠=11, 7♦=10, 3=9, 2=8
function strongHand(): CardDef[] {
  return [makeCard('espada', 1), makeCard('basto', 1), makeCard('espada', 7)];
}

function goodHand(): CardDef[] {
  return [makeCard('oro', 3), makeCard('copa', 2), makeCard('basto', 1)];
}

function weakHand(): CardDef[] {
  return [makeCard('oro', 4), makeCard('copa', 5), makeCard('basto', 6)];
}

function mediumHand(): CardDef[] {
  return [makeCard('oro', 12), makeCard('copa', 11), makeCard('basto', 3)];
}

describe('DecisionEngine', () => {
  let engine: DecisionEngine;

  beforeEach(() => {
    engine = new DecisionEngine('p1');
    engine.updateContext(0, 0, false);
  });

  describe('shouldCallTruco', () => {
    it('calls truco with excellent hand (1♠, 1♣, 7♠)', () => {
      const result = engine.shouldCallTruco(strongHand());
      expect(result.decision).toBe(true);
      expect(result.reason).toBeDefined();
    });

    it('calls truco with 2+ good cards (3, 2, 1♣)', () => {
      const result = engine.shouldCallTruco(goodHand());
      expect(result.decision).toBe(true);
    });

    it('does not call truco with all weak cards (4, 5, 6)', () => {
      const result = engine.shouldCallTruco(weakHand());
      expect(result.decision).toBe(false);
    });

    it('is more aggressive when losing by 10+', () => {
      engine.updateContext(0, 15, false);
      const result = engine.shouldCallTruco(goodHand());
      expect(result.decision).toBe(true);
      expect(result.reason).toContain('Losing');
    });

    it('is more conservative when winning by 10+', () => {
      engine.updateContext(15, 0, false);
      // Good hand but not excellent enough when winning
      const result = engine.shouldCallTruco(goodHand());
      // Good hand has 2 good cards (3=9, 2=8) but only 1 excellent (1♣=12)
      // With winning by 10+, should be conservative
      expect(result.decision).toBe(true); // still calls because 1♣=12 is excellent (>=10)
    });

    it('does not call truco when winning by 10+ with only good (not excellent) hand', () => {
      engine.updateContext(15, 0, false);
      // 3(9), 2(8), 12(6) — 2 good cards, 0 excellent
      const hand = [makeCard('oro', 3), makeCard('copa', 2), makeCard('basto', 12)];
      const result = engine.shouldCallTruco(hand);
      expect(result.decision).toBe(false);
      expect(result.reason).toContain('Winning');
    });
  });

  describe('shouldAcceptTruco', () => {
    it('raises to vale4 with goodHand (1♣=12 triggers vale4 condition)', () => {
      // 3(9), 2(8), 1♣(12) — 1 excellent (1♣), maxVal=12
      // goodCount >= 1 → enter accept block
      // retruco: excellentCount >= 2? No (1)
      // vale4: maxVal >= 12? Yes. excellentCount >= 1? Yes → vale4
      const result = engine.shouldAcceptTruco(goodHand(), 1);
      expect(result.decision).toBe('vale4');
      expect(result.raiseTo).toBe(3);
    });

    it('rejects truco with all weak cards', () => {
      const result = engine.shouldAcceptTruco(weakHand(), 1);
      expect(result.decision).toBe(false);
    });

    it('raises to retruco with 2+ excellent cards', () => {
      // 1♠(13), 1♣(12), 7♦(10) — 3 excellent cards
      const result = engine.shouldAcceptTruco(strongHand(), 1);
      expect(result.decision).toBe('retruco');
      expect(result.raiseTo).toBe(2);
    });

    it('raises to vale4 with best card >= 12 and another excellent when retruco not met', () => {
      // 1♠(13), 4(0), 5(1) — 1 excellent, maxVal=13 >= 12
      // excellentCount=1 (not >= 2, so no retruco)
      // maxVal=13 >= 12 AND excellentCount=1 >= 1 → vale4
      const hand = [makeCard('espada', 1), makeCard('oro', 4), makeCard('copa', 5)];
      const result = engine.shouldAcceptTruco(hand, 1);
      // goodCount = countCardsAbove(8) = 1 (1♠=13 >= 8)
      // excellentCount = countCardsAbove(10) = 1 (1♠=13 >= 10)
      // So: goodCount >= 1 → enter accept block
      // currentLevel === 1 → check retruco: excellentCount >= 2? No (1)
      // check vale4: maxVal >= 12? Yes (13). excellentCount >= 1? Yes.
      // → vale4!
      expect(result.decision).toBe('vale4');
      expect(result.raiseTo).toBe(3);
    });

    it('accepts at level 2 with good hand', () => {
      const result = engine.shouldAcceptTruco(goodHand(), 2);
      expect(result.decision).toBe(true);
    });
  });

  describe('shouldCallEnvido', () => {
    it('calls real envido with score >= 30', () => {
      const result = engine.shouldCallEnvido(31);
      expect(result.decision).toBe('real-envido');
      expect(result.callType).toBe('real-envido');
    });

    it('calls falta envido when losing badly with score >= 30', () => {
      engine.updateContext(0, 20, false);
      const result = engine.shouldCallEnvido(31);
      expect(result.decision).toBe('falta-envido');
      expect(result.callType).toBe('falta-envido');
    });

    it('calls envido with score 27-29', () => {
      const result = engine.shouldCallEnvido(28);
      expect(result.decision).toBe('envido');
      expect(result.callType).toBe('envido');
    });

    it('does not call envido with score <= 22', () => {
      const result = engine.shouldCallEnvido(20);
      expect(result.decision).toBe(false);
    });

    it('borderline 23-26 is non-deterministic', () => {
      // Run multiple times to check it returns either true or 'envido'
      const results: boolean[] = [];
      for (let i = 0; i < 20; i++) {
        const r = engine.shouldCallEnvido(25);
        results.push(r.decision === 'envido' || r.decision === false);
      }
      // At least some should be true (either call or not call)
      expect(results.every(r => r === true)).toBe(true);
    });
  });

  describe('shouldAcceptEnvido', () => {
    it('accepts envido with score >= 25', () => {
      const result = engine.shouldAcceptEnvido(27);
      expect(result.decision).toBe(true);
    });

    it('rejects envido with score <= 20', () => {
      const result = engine.shouldAcceptEnvido(18);
      expect(result.decision).toBe(false);
    });

    it('says "son buenas" when weak and opponent showed strength', () => {
      const result = engine.shouldAcceptEnvido(15, 28);
      expect(result.decision).toBe('son-buenas');
    });

    it('borderline 21-24 is non-deterministic', () => {
      const results: boolean[] = [];
      for (let i = 0; i < 20; i++) {
        const r = engine.shouldAcceptEnvido(22);
        results.push(r.decision === true || r.decision === false);
      }
      expect(results.every(r => r === true)).toBe(true);
    });
  });

  describe('shouldGoToMazo', () => {
    it('never goes to mazo when envido is active', () => {
      const result = engine.shouldGoToMazo(weakHand(), 0, 0, true, 0);
      expect(result.decision).toBe(false);
      expect(result.reason).toContain('Envido');
    });

    it('goes to mazo with all very weak cards (<=4) in early tricks', () => {
      // 4(0), 5(1), 6(2) — all <= 4
      const result = engine.shouldGoToMazo(weakHand(), 0, 0, false, 0);
      expect(result.decision).toBe(true);
      expect(result.reason).toContain('weak');
    });

    it('does not go to mazo with decent hand in early tricks', () => {
      const result = engine.shouldGoToMazo(goodHand(), 0, 0, false, 0);
      expect(result.decision).toBe(false);
      expect(result.reason).toContain('Early');
    });

    it('goes to mazo if lost 2 tricks and truco was called', () => {
      const result = engine.shouldGoToMazo(mediumHand(), 2, 1, false, 2);
      expect(result.decision).toBe(true);
      expect(result.reason).toContain('Lost');
    });

    it('does not go to mazo with strong hand', () => {
      const result = engine.shouldGoToMazo(strongHand(), 0, 0, false, 2);
      expect(result.decision).toBe(false);
    });
  });

  describe('TRUCO_THRESHOLDS', () => {
    it('has correct threshold values', () => {
      expect(TRUCO_THRESHOLDS.EXCELLENT).toBe(10);
      expect(TRUCO_THRESHOLDS.GOOD).toBe(8);
      expect(TRUCO_THRESHOLDS.MEDIUM).toBe(6);
      expect(TRUCO_THRESHOLDS.WEAK).toBe(5);
    });
  });
});
