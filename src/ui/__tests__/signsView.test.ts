// Qué señas de los compañeros ve el pie (humano) a lo largo de la mano.

import { describe, expect, it } from 'vitest';
import { applyAction, createMatch, getActor, getObservation } from '../../engine/index.js';
import type { MatchState, PlayerId } from '../../engine/index.js';
import type { Signal } from '../../ai/signs.js';
import { visibleSignals } from '../signsView.js';

function afterFirstTrick(): MatchState {
  let state = createMatch({ rules: { playerCount: 4, flor: false, picaPica: false }, seed: 7 });
  while (state.hand.tricks.length === 0) {
    const actor = getActor(state) as PlayerId;
    const play = getObservation(state, actor).legalActions.find((a) => a.type === 'PLAY_CARD');
    if (!play) throw new Error('sin carta');
    state = (applyAction(state, actor, play) as { state: MatchState }).state;
  }
  return state;
}

describe('señas a la vista del pie', () => {
  it('después de la 1ra baza sigue viendo "nada" (y las cartas que su compañero no jugó); 27+ ya no', () => {
    const state = afterFirstTrick();
    const signals: Signal[] = [
      { from: 'p2', kind: 'NADA', cardId: null },
      { from: 'p2', kind: 'ENVIDO', cardId: null },
    ];
    expect(visibleSignals(state, signals).map((s) => s.kind)).toEqual(['NADA']);
  });
});
