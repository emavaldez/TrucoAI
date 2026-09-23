// Tests for EnvidoScorer — pure envido score calculation
import { describe, it, expect } from 'vitest';
import { getEnvidoScore, getEnvidoCardValue, getEnvidoPlayerScores, getEnvidoWinningTeam } from '../core/EnvidoScorer.js';
import { getValorTruco, getValorEnvido } from '../core/Deck.js';
import type { CardDef, CardNumber, Suit } from '../types.js';

function makeCard(suit: string, number: number): CardDef {
  const s = suit as Suit;
  const n = number as CardNumber;
  return {
    number: n,
    suit: s,
    valorEnvido: getValorEnvido(n),
    valorTruco: getValorTruco(s, n),
    nombreDisplay: `${n} de ${s}`,
    estado: 'en_mano' as const,
  };
}

describe('EnvidoScorer', () => {
  describe('getEnvidoCardValue', () => {
    it('returns face value for 1-7', () => {
      expect(getEnvidoCardValue(makeCard('oro', 1))).toBe(1);
      expect(getEnvidoCardValue(makeCard('oro', 7))).toBe(7);
    });

    it('returns 0 for figures', () => {
      expect(getEnvidoCardValue(makeCard('oro', 10))).toBe(0);
      expect(getEnvidoCardValue(makeCard('oro', 11))).toBe(0);
      expect(getEnvidoCardValue(makeCard('oro', 12))).toBe(0);
    });
  });

  describe('getEnvidoScore', () => {
    it('returns 0 for empty hand', () => {
      expect(getEnvidoScore([])).toBe(0);
    });

    it('returns single card value when no pair', () => {
      const cards = [makeCard('oro', 7), makeCard('basto', 5), makeCard('copa', 3)];
      // No pair: max single = 7
      expect(getEnvidoScore(cards)).toBe(7);
    });

    it('calculates pair score: 20 + two highest of same suit', () => {
      // 7 oro + 5 oro + 3 basto = 20 + 7 + 5 = 32
      const cards = [makeCard('oro', 7), makeCard('oro', 5), makeCard('basto', 3)];
      expect(getEnvidoScore(cards)).toBe(32);
    });

    it('calculates max pair: 7+6 same suit = 33', () => {
      const cards = [makeCard('oro', 7), makeCard('oro', 6), makeCard('basto', 3)];
      expect(getEnvidoScore(cards)).toBe(33);
    });

    it('figures count as 0 in pairs', () => {
      // 12 oro + 7 oro + 3 basto = 20 + 0 + 7 = 27
      const cards = [makeCard('oro', 12), makeCard('oro', 7), makeCard('basto', 3)];
      expect(getEnvidoScore(cards)).toBe(27);
    });

    it('two figures same suit = 20', () => {
      // 12 oro + 11 oro + 3 basto = 20 + 0 + 0 = 20
      const cards = [makeCard('oro', 12), makeCard('oro', 11), makeCard('basto', 3)];
      expect(getEnvidoScore(cards)).toBe(20);
    });

    it('picks best suit when multiple pairs exist', () => {
      // 7 oro + 5 oro + 6 basto + 4 basto = max(32, 30) = 32
      const cards = [makeCard('oro', 7), makeCard('oro', 5), makeCard('basto', 6), makeCard('basto', 4)];
      expect(getEnvidoScore(cards)).toBe(32);
    });

    it('all figures = 0', () => {
      const cards = [makeCard('oro', 10), makeCard('basto', 11), makeCard('copa', 12)];
      expect(getEnvidoScore(cards)).toBe(0);
    });
  });

  describe('getEnvidoPlayerScores', () => {
    it('calculates scores for all players', () => {
      const hands = {
        p0: [makeCard('oro', 7), makeCard('oro', 6), makeCard('basto', 3)], // 33
        p1: [makeCard('copa', 4), makeCard('basto', 5), makeCard('oro', 12)], // 5
      };
      const scores = getEnvidoPlayerScores(hands);
      expect(scores.p0).toBe(33);
      expect(scores.p1).toBe(5);
    });

    it('handles empty hands', () => {
      const hands = { p0: [], p1: [] };
      const scores = getEnvidoPlayerScores(hands);
      expect(scores.p0).toBe(0);
      expect(scores.p1).toBe(0);
    });
  });

  describe('getEnvidoWinningTeam', () => {
    it('returns team 0 when team 0 has higher score', () => {
      const scores = { p0: 30, p1: 20 };
      const teamMap = { p0: 0, p1: 1 };
      expect(getEnvidoWinningTeam(scores, teamMap)).toBe(0);
    });

    it('returns team 1 when team 1 has higher score', () => {
      const scores = { p0: 20, p1: 30 };
      const teamMap = { p0: 0, p1: 1 };
      expect(getEnvidoWinningTeam(scores, teamMap)).toBe(1);
    });

    it('returns -1 on tie', () => {
      const scores = { p0: 25, p1: 25 };
      const teamMap = { p0: 0, p1: 1 };
      expect(getEnvidoWinningTeam(scores, teamMap)).toBe(-1);
    });

    it('handles 4 players (2v2)', () => {
      const scores = { p0: 28, p1: 20, p2: 30, p3: 15 };
      const teamMap = { p0: 0, p1: 1, p2: 0, p3: 1 };
      // Team 0 best: 30 (p2), Team 1 best: 20 (p1)
      expect(getEnvidoWinningTeam(scores, teamMap)).toBe(0);
    });
  });
});
