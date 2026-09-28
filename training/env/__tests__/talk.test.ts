// r4: la red que habla y escucha. La observación de las redes viejas no cambia; la nueva suma lo dicho al final;
// los momentos de hablar son los del juego; las salidas nuevas (qué decir) tienen su propia máscara.

import { describe, expect, it } from 'vitest';
import { applyAction, createMatch, getActor, getObservation } from '../../../src/engine/index.js';
import type { Action, MatchState, PlayerId } from '../../../src/engine/index.js';
import { N_ACTIONS, talkIndex, talkMask, talkOf, FIRST_TALK_ACTION } from '../../../src/ai/rl/actions.js';
import { encodeObs, layoutHash, obsLayout } from '../../../src/ai/rl/encode.js';
import { claimMoments, latestClaims, trueLevel } from '../../../src/ai/talk/claims.js';
import { card, deckFor } from '../../../src/engine/__tests__/helpers.js';

const HANDS = {
  p0: ['7-oro', '6-oro', '4-basto'],
  p1: ['4-copa', '5-espada', '6-basto'],
  p2: ['1-espada', '12-copa', '3-oro'],
  p3: ['7-copa', '6-copa', '2-basto'],
};

function match(): MatchState {
  return createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: 3, deck: deckFor(HANDS, 0, 4) });
}

function act(state: MatchState, action: Action): MatchState {
  const result = applyAction(state, getActor(state) as PlayerId, action);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('observación con lo dicho', () => {
  const sample = getObservation(match(), 'p0');

  it('las redes hasta r3 ven lo mismo de siempre; la de r4 suma 48 entradas al final', () => {
    expect(layoutHash(obsLayout(sample))).toBe('78d8b04c');
    const withClaims = obsLayout(sample, true);
    expect(withClaims.at(-1)).toEqual({ name: 'claims', size: 48 });
    expect(withClaims.slice(0, -1)).toEqual(obsLayout(sample));
    expect(encodeObs(sample).length).toBe(1006);
    expect(encodeObs(sample, { claims: [] }).length).toBe(1054);
  });

  it('lo último que dijo cada uno, por asiento relativo', () => {
    const x = encodeObs(sample, {
      claims: [
        { from: 'p2', about: 'tanto', level: 'mucho' },
        { from: 'p2', about: 'tanto', level: 'nada' },
        { from: 'p3', about: 'tanto', level: 'calla' },
      ],
    });
    const claims = x.slice(1006);
    // p2 es el asiento relativo 2 de p0: su último dicho del tanto es "nada" (índice 2 de 4).
    expect(claims[(2 * 2 + 0) * 4 + 2]).toBe(1);
    expect(claims[(2 * 2 + 0) * 4 + 0]).toBe(0);
    expect(claims[(3 * 2 + 0) * 4 + 3]).toBe(1);
    expect(claims.reduce((a, b) => a + b, 0)).toBe(2);
    expect(
      latestClaims([
        { from: 'p2', about: 'tanto', level: 'mucho' },
        { from: 'p2', about: 'tanto', level: 'nada' },
      ]),
    ).toHaveLength(1);
  });
});

describe('qué se dice', () => {
  it('salidas 19–26 con su máscara por tema', () => {
    expect(N_ACTIONS).toBe(27);
    expect(talkIndex('tanto', 'mucho')).toBe(FIRST_TALK_ACTION);
    expect(talkOf(talkIndex('cartas', 'calla'))).toEqual({ topic: 'cartas', level: 'calla' });
    const mask = talkMask('tanto');
    expect([...mask].map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([19, 20, 21, 22]);
    expect(() => talkOf(5)).toThrow();
  });

  it('lo que tiene de verdad', () => {
    expect(trueLevel('tanto', [card('7-oro'), card('6-oro'), card('1-copa')], [])).toBe('mucho');
    expect(trueLevel('tanto', [card('4-oro'), card('3-oro'), card('1-copa')], [])).toBe('algo');
    expect(trueLevel('tanto', [card('4-oro'), card('5-copa'), card('12-basto')], [])).toBe('nada');
    expect(trueLevel('cartas', [], [card('1-espada'), card('7-oro'), card('4-copa')])).toBe('mucho');
    expect(trueLevel('cartas', [], [card('4-oro'), card('5-copa'), card('12-basto')])).toBe('nada');
  });
});

describe('cuándo se habla (los mismos momentos que el juego)', () => {
  it('antes de que el pie decida en la 1ra baza, su compañero dice algo del tanto (una vez)', () => {
    let state = match();
    // p0 (mano) no es pie: nadie habla todavía.
    expect(claimMoments(state, 'p0', new Set(), ['tanto'])).toEqual([]);
    state = act(state, { type: 'PLAY_CARD', cardId: '4-basto' });
    state = act(state, { type: 'PLAY_CARD', cardId: '4-copa' });
    // Le toca a p2, el pie del equipo 0: habla p0.
    const moments = claimMoments(state, 'p2', new Set(), ['tanto']);
    expect(moments).toEqual([{ speaker: 'p0', topic: 'tanto', key: 'tanto-p0' }]);
    expect(claimMoments(state, 'p2', new Set(['tanto-p0']), ['tanto'])).toEqual([]);
    // Si no se habla del tanto (solo cartas), no hay momento.
    expect(claimMoments(state, 'p2', new Set(), ['cartas'])).toEqual([]);
  });

  it('cuando cantan truco, los compañeros del que contesta dicen algo de sus cartas', () => {
    let state = match();
    state = act(state, { type: 'CALL_TRUCO' });
    const responder = state.hand.truco.pending?.responderId as PlayerId;
    const moments = claimMoments(state, responder, new Set(), ['tanto', 'cartas']);
    expect(moments.every((m) => m.topic === 'cartas' && m.speaker !== responder)).toBe(true);
    expect(moments.length).toBe(1);
  });

  it('en 2 jugadores nadie habla', () => {
    const state = createMatch({ rules: { playerCount: 2 }, seed: 1 });
    expect(claimMoments(state, getActor(state) as PlayerId, new Set(), ['tanto', 'cartas'])).toEqual([]);
  });
});
