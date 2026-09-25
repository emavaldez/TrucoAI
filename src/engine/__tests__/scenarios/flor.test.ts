// Escenarios de flor (historia 1-8, GDD §7) con mazo fijo.
// 2 jugadores: reparte p1, es mano p0. 4 jugadores: reparte p3, es mano p0.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../../apply.js';
import { getActor, getLegalActions } from '../../legal.js';
import { createMatch } from '../../match.js';
import { getObservation } from '../../observation.js';
import type { Action, GameEvent, MatchState, PlayerId } from '../../types.js';
import { callEnvido, callTruco, deckFor, playTrick, withScores } from '../helpers.js';

const FLOR_ORO = ['1-oro', '2-oro', '3-oro']; // 26
const FLOR_COPA = ['1-copa', '2-copa', '3-copa']; // 26
const FLOR_ESPADA = ['7-espada', '6-espada', '5-espada']; // 38
const COMUN = ['4-basto', '5-basto', '12-oro'];

function match2p(p0: string[], p1: string[], flor = true): MatchState {
  return createMatch({ rules: { playerCount: 2, flor }, seed: 1, firstDealerSeat: 1, deck: deckFor({ p0, p1 }, 0, 2) });
}

function act(state: MatchState, playerId: PlayerId, action: Action): { state: MatchState; events: GameEvent[] } {
  const result = applyAction(state, playerId, action);
  if (!result.ok) throw new Error(`${playerId} ${JSON.stringify(action)}: ${result.error}`);
  return { state: result.state, events: result.events };
}

const DECLARE: Action = { type: 'DECLARE_FLOR' };
const answer = (a: 'ACHICO' | 'CONTRAFLOR' | 'CONTRAFLOR_AL_RESTO' | 'QUIERO' | 'NO_QUIERO'): Action => ({
  type: 'ANSWER_FLOR',
  answer: a,
});

/** p0 y p1 con flor: p0 la canta y juega; p1 la canta y queda a cargo de responder. */
function florContraFlor(p0 = FLOR_ORO, p1 = FLOR_ESPADA, scores?: [number, number]): MatchState {
  let state = match2p(p0, p1);
  if (scores) state = withScores(state, scores);
  state = act(state, 'p0', DECLARE).state;
  state = act(state, 'p0', { type: 'PLAY_CARD', cardId: p0[2] }).state;
  expect(getLegalActions(state, 'p1')).toEqual([DECLARE]);
  state = act(state, 'p1', DECLARE).state;
  expect(state.phase).toBe('AWAITING_FLOR');
  expect(getActor(state)).toBe('p1');
  return state;
}

describe('flor apagada', () => {
  it('con rules.flor = false nunca es legal cantar flor, aunque se tenga', () => {
    const state = match2p(FLOR_ORO, COMUN, false);
    const legal = getLegalActions(state, 'p0');
    expect(legal.some((a) => a.type === 'DECLARE_FLOR')).toBe(false);
    expect(legal.some((a) => a.type === 'CALL_ENVIDO')).toBe(true);
  });
});

describe('flor de un solo equipo', () => {
  it('es obligatoria, anula el envido y suma 3 al completarse la primera baza', () => {
    let state = match2p(FLOR_ORO, COMUN);
    expect(getLegalActions(state, 'p0')).toEqual([DECLARE]);
    const declared = act(state, 'p0', DECLARE);
    state = declared.state;
    expect(declared.events).toContainEqual({ type: 'FLOR_DECLARED', playerId: 'p0' });
    expect(state.phase).toBe('PLAYING');
    expect(getActor(state)).toBe('p0');
    expect(getLegalActions(state, 'p0').some((a) => a.type === 'CALL_ENVIDO')).toBe(false);
    expect(state.hand.envido.status).toBe('cancelled');

    const trick = playTrick(state, { p0: '3-oro', p1: '4-basto' });
    expect(trick.state.scores).toEqual([3, 0]);
    expect(trick.events).toContainEqual({
      type: 'FLOR_RESOLVED',
      winnerTeam: 0,
      points: 3,
      revealed: [{ playerId: 'p0', score: 26 }],
    });
    expect(getObservation(trick.state, 'p1').publicScores).toEqual([{ playerId: 'p0', score: 26, kind: 'FLOR' }]);
  });

  it('la flor anula un envido pendiente sin puntos', () => {
    let state = match2p(COMUN, FLOR_COPA);
    state = callEnvido(state, 'p0', 'R').state;
    expect(getActor(state)).toBe('p1');
    expect(getLegalActions(state, 'p1')).toEqual([DECLARE]);
    state = act(state, 'p1', DECLARE).state;
    expect(state.hand.envido.status).toBe('cancelled');
    expect(state.hand.envido.pending).toBeNull();
    expect(state.phase).toBe('PLAYING');
    expect(getActor(state)).toBe('p0');
    expect(state.scores).toEqual([0, 0]);
  });

  it('respondiendo a un truco en primera baza: canta la flor y el truco sigue pendiente', () => {
    let state = match2p(COMUN, FLOR_COPA);
    state = callTruco(state, 'p0').state;
    expect(getLegalActions(state, 'p1')).toEqual([DECLARE]);
    state = act(state, 'p1', DECLARE).state;
    expect(state.phase).toBe('AWAITING_TRUCO');
    expect(getActor(state)).toBe('p1');
    expect(getLegalActions(state, 'p1')).toContainEqual({ type: 'ANSWER_TRUCO', answer: 'QUIERO' });
  });

  it('si la mano termina antes de la primera baza, la flor declarada se cobra igual', () => {
    let state = match2p(FLOR_ORO, COMUN);
    state = act(state, 'p0', DECLARE).state;
    state = callTruco(state, 'p0').state;
    state = act(state, 'p1', { type: 'ANSWER_TRUCO', answer: 'NO_QUIERO' }).state;
    expect(state.scores).toEqual([4, 0]); // 3 de flor + 1 del truco no querido
  });

  it('dos flores del mismo equipo (4 jugadores) suman 6', () => {
    const deck = deckFor({ p0: FLOR_ORO, p2: FLOR_COPA, p1: COMUN, p3: ['4-espada', '5-oro', '6-basto'] }, 0, 4);
    let state = createMatch({ rules: { playerCount: 4, flor: true }, seed: 2, firstDealerSeat: 3, deck });
    state = act(state, 'p0', DECLARE).state;
    state = act(state, 'p0', { type: 'PLAY_CARD', cardId: '1-oro' }).state;
    state = act(state, 'p1', { type: 'PLAY_CARD', cardId: '4-basto' }).state;
    expect(getLegalActions(state, 'p2')).toEqual([DECLARE]);
    state = act(state, 'p2', DECLARE).state;
    state = act(state, 'p2', { type: 'PLAY_CARD', cardId: '1-copa' }).state;
    state = act(state, 'p3', { type: 'PLAY_CARD', cardId: '4-espada' }).state;
    expect(state.scores).toEqual([6, 0]);
  });
});

describe('flor contra flor', () => {
  it('con flor me achico: el primer equipo suma 4', () => {
    let state = florContraFlor();
    expect(getLegalActions(state, 'p1')).toEqual([answer('ACHICO'), answer('CONTRAFLOR'), answer('CONTRAFLOR_AL_RESTO')]);
    state = act(state, 'p1', answer('ACHICO')).state;
    expect(state.scores).toEqual([4, 0]);
    expect(state.phase).toBe('PLAYING');
    expect(getActor(state)).toBe('p1');
  });

  it('contraflor querida: se comparan las flores y el mejor suma 6', () => {
    let state = florContraFlor();
    state = act(state, 'p1', answer('CONTRAFLOR')).state;
    expect(getActor(state)).toBe('p0');
    expect(getLegalActions(state, 'p0')).toEqual([answer('QUIERO'), answer('NO_QUIERO'), answer('CONTRAFLOR_AL_RESTO')]);
    const resolved = act(state, 'p0', answer('QUIERO'));
    expect(resolved.state.scores).toEqual([0, 6]); // espada 38 > oro 26
    expect(resolved.events).toContainEqual({
      type: 'FLOR_RESOLVED',
      winnerTeam: 1,
      points: 6,
      revealed: [
        { playerId: 'p0', score: 26 },
        { playerId: 'p1', score: 38 },
      ],
    });
  });

  it('contraflor no querida: el que la cantó suma 4', () => {
    let state = florContraFlor();
    state = act(state, 'p1', answer('CONTRAFLOR')).state;
    state = act(state, 'p0', answer('NO_QUIERO')).state;
    expect(state.scores).toEqual([0, 4]);
  });

  it('contraflor al resto querida: el ganador suma la falta', () => {
    let state = florContraFlor(FLOR_ORO, FLOR_ESPADA, [20, 18]);
    state = act(state, 'p1', answer('CONTRAFLOR_AL_RESTO')).state;
    expect(getLegalActions(state, 'p0')).toEqual([answer('QUIERO'), answer('NO_QUIERO')]);
    state = act(state, 'p0', answer('QUIERO')).state;
    expect(state.scores).toEqual([20, 28]); // falta: al que va ganando (20) le faltan 10
  });

  it('contraflor al resto no querida: el que la cantó suma 6', () => {
    let state = florContraFlor();
    state = act(state, 'p1', answer('CONTRAFLOR')).state;
    state = act(state, 'p0', answer('CONTRAFLOR_AL_RESTO')).state;
    expect(getActor(state)).toBe('p1');
    state = act(state, 'p1', answer('NO_QUIERO')).state;
    expect(state.scores).toEqual([6, 0]);
  });

  it('empate de flores: gana el más cercano al mano', () => {
    let state = florContraFlor(FLOR_ORO, FLOR_COPA);
    state = act(state, 'p1', answer('CONTRAFLOR')).state;
    state = act(state, 'p0', answer('QUIERO')).state;
    expect(state.scores).toEqual([6, 0]);
  });

  it('con la flor pendiente no se puede jugar carta, cantar ni irse al mazo', () => {
    const state = florContraFlor();
    const legal = getLegalActions(state, 'p1');
    expect(legal.every((a) => a.type === 'ANSWER_FLOR')).toBe(true);
    expect(applyAction(state, 'p1', { type: 'MAZO' }).ok).toBe(false);
  });
});
