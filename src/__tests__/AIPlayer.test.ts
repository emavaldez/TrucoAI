// Tests for AIPlayer — AI card selection and strategy
// Covers: selectCardToPlay, setHand, updateStrategy, delay, getValorTruco helpers

import { describe, it, expect, beforeEach } from 'vitest';
import { AIPlayer, getValorTruco, isGoodTrucoCard, isExcellentTrucoCard, getEnvidoValue } from '../ai/AIPlayer.js';
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

describe('AIPlayer', () => {
  let ai: AIPlayer;

  beforeEach(() => {
    ai = new AIPlayer('p1');
  });

  describe('constructor and basic methods', () => {
    it('creates AIPlayer with correct id', () => {
      expect(ai.getPlayerId()).toBe('p1');
    });

    it('starts with empty hand', () => {
      expect(ai.getHand()).toEqual([]);
    });

    it('setHand sets the hand', () => {
      const hand = [makeCard('espada', 1), makeCard('basto', 1), makeCard('oro', 7)];
      ai.setHand(hand);
      expect(ai.getHand()).toHaveLength(3);
    });

    it('setHand copies the array (no mutation)', () => {
      const hand = [makeCard('espada', 1), makeCard('basto', 1)];
      ai.setHand(hand);
      hand.push(makeCard('oro', 7));
      expect(ai.getHand()).toHaveLength(2);
    });
  });

  describe('selectCardToPlay', () => {
    it('returns -1 for empty hand', () => {
      ai.setHand([]);
      const result = ai.selectCardToPlay([]);
      expect(result).toBe(-1);
    });

    it('plays weakest card when leading a trick (normal situation)', () => {
      // 1♠(13), 7♦(10), 4(0) — should play 4 (weakest)
      const hand = [makeCard('espada', 1), makeCard('oro', 7), makeCard('copa', 4)];
      ai.setHand(hand);
      const idx = ai.selectCardToPlay([]); // no cards played = leading
      const playedCard = hand[idx];
      expect(getValorTruco(playedCard)).toBe(0); // 4 has rank 0 (weakest)
    });

    it('plays strongest card when losing badly (2 tricks lost)', () => {
      // 1♠(13), 7♦(10), 4(0) — should play 1♠ (strongest) when losing
      const hand = [makeCard('espada', 1), makeCard('oro', 7), makeCard('copa', 4)];
      ai.setHand(hand);
      ai.updateStrategy({ tricksLost: 2 });
      const idx = ai.selectCardToPlay([]); // leading but losing badly
      const playedCard = hand[idx];
      expect(getValorTruco(playedCard)).toBe(13); // 1♠ = 13 (strongest)
    });

    it('plays minimum winning card when can beat table', () => {
      // Hand: 1♠(13), 3(9), 2(8)
      // Table: 12(6) — we can beat with 2(8), 3(9), or 1♠(13)
      // Should play the minimum winning card: 2(8)
      const hand = [makeCard('espada', 1), makeCard('oro', 3), makeCard('copa', 2)];
      ai.setHand(hand);
      const tableCard = makeCard('basto', 12); // rank 6
      const idx = ai.selectCardToPlay([tableCard]);
      const playedCard = hand[idx];
      // Should play 2(8) — minimum that beats 12(6)
      expect(getValorTruco(playedCard)).toBe(8);
    });

    it('plays weakest card when cannot beat table', () => {
      // Hand: 4(0), 5(1), 6(2)
      // Table: 1♠(13) — cannot beat
      // Should play weakest (4)
      const hand = [makeCard('oro', 4), makeCard('copa', 5), makeCard('basto', 6)];
      ai.setHand(hand);
      const tableCard = makeCard('espada', 1); // rank 13
      const idx = ai.selectCardToPlay([tableCard]);
      const playedCard = hand[idx];
      expect(getValorTruco(playedCard)).toBe(0); // 4 = rank 0
    });

    it('plays weakest when already won 2 tricks', () => {
      // Already won the hand — play absolute weakest
      const hand = [makeCard('espada', 1), makeCard('oro', 3), makeCard('copa', 4)];
      ai.setHand(hand);
      ai.updateStrategy({ tricksWon: 2 });
      const tableCard = makeCard('basto', 12); // rank 6, beatable
      const idx = ai.selectCardToPlay([tableCard], { tricksWon: 2, tricksLost: 0, currentTrickNumber: 2 });
      const playedCard = hand[idx];
      expect(getValorTruco(playedCard)).toBe(0); // 4 = rank 0 (weakest)
    });
  });

  describe('delay', () => {
    it('returns a promise that resolves', async () => {
      await expect(ai.delay()).resolves.toBeUndefined();
    });
  });

  describe('updateStrategy', () => {
    it('updates strategy context', () => {
      ai.updateStrategy({ trucoCalled: true, trucoLevel: 1, tricksWon: 1 });
      // Internal state is private, but we can verify behavior changes
      // by checking that selectCardToPlay still works
      ai.setHand([makeCard('espada', 1), makeCard('oro', 3), makeCard('copa', 4)]);
      const idx = ai.selectCardToPlay([]);
      expect(idx).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('AIPlayer helper functions', () => {
  describe('getValorTruco', () => {
    it('returns 13 for 1♠ (Macho)', () => {
      expect(getValorTruco(makeCard('espada', 1))).toBe(13);
    });

    it('returns 12 for 1♣ (Hembra)', () => {
      expect(getValorTruco(makeCard('basto', 1))).toBe(12);
    });

    it('returns 11 for 7♠ (Siete Bravo)', () => {
      expect(getValorTruco(makeCard('espada', 7))).toBe(11);
    });

    it('returns 9 for any 3', () => {
      expect(getValorTruco(makeCard('oro', 3))).toBe(9);
    });

    it('returns 8 for any 2', () => {
      expect(getValorTruco(makeCard('copa', 2))).toBe(8);
    });

    it('returns 0 for 4', () => {
      expect(getValorTruco(makeCard('basto', 4))).toBe(0);
    });
  });

  describe('isGoodTrucoCard', () => {
    it('returns true for cards with valor >= 8', () => {
      expect(isGoodTrucoCard(makeCard('espada', 1))).toBe(true); // 13
      expect(isGoodTrucoCard(makeCard('oro', 3))).toBe(true); // 9
      expect(isGoodTrucoCard(makeCard('copa', 2))).toBe(true); // 8
    });

    it('returns false for cards with valor < 8', () => {
      expect(isGoodTrucoCard(makeCard('oro', 12))).toBe(false); // 6
      expect(isGoodTrucoCard(makeCard('copa', 4))).toBe(false); // 0
    });
  });

  describe('isExcellentTrucoCard', () => {
    it('returns true for cards with valor >= 10', () => {
      expect(isExcellentTrucoCard(makeCard('espada', 1))).toBe(true); // 13
      expect(isExcellentTrucoCard(makeCard('basto', 1))).toBe(true); // 12
      expect(isExcellentTrucoCard(makeCard('espada', 7))).toBe(true); // 11
      expect(isExcellentTrucoCard(makeCard('oro', 7))).toBe(true); // 10
    });

    it('returns false for cards with valor < 10', () => {
      expect(isExcellentTrucoCard(makeCard('oro', 3))).toBe(false); // 9
      expect(isExcellentTrucoCard(makeCard('copa', 2))).toBe(false); // 8
    });
  });

  describe('getEnvidoValue', () => {
    it('returns face value for 1-7', () => {
      expect(getEnvidoValue(1)).toBe(1);
      expect(getEnvidoValue(7)).toBe(7);
    });

    it('returns 0 for figures (10, 11, 12)', () => {
      expect(getEnvidoValue(10)).toBe(0);
      expect(getEnvidoValue(11)).toBe(0);
      expect(getEnvidoValue(12)).toBe(0);
    });
  });
});
