// Tests de src/engine/truco.ts — en esta historia solo el puntaje de la mano.

import { describe, expect, it } from 'vitest';
import { createMatch } from '../match.js';
import { trucoPoints } from '../truco.js';
import type { MatchState, TrucoLevel } from '../types.js';
import { deckFor } from './helpers.js';

function match2p(): MatchState {
  return createMatch({ rules: { playerCount: 2 }, seed: 1, firstDealerSeat: 0, deck: deckFor({}, 1, 2) });
}

describe('trucoPoints', () => {
  it('sin canto la mano vale 1', () => {
    const state = match2p();
    expect(state.hand.truco.level).toBe(0);
    expect(trucoPoints(state)).toBe(1);
  });

  it('según el nivel querido: truco 2, retruco 3, vale cuatro 4 (GDD §5)', () => {
    const tabla: [TrucoLevel, number][] = [
      [1, 2],
      [2, 3],
      [3, 4],
    ];
    for (const [level, points] of tabla) {
      const state = match2p();
      state.hand.truco.level = level;
      expect(trucoPoints(state), `nivel ${level}`).toBe(points);
    }
  });
});
