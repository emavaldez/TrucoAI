// Escenarios de la historia 1-5 — AC 7: mazo con mazo fijo (2 jugadores), convivencia con
// el envido y fin de partida por los cuatro caminos [ENG-01].
// Todo entra por `applyAction` (helpers) y el estado se arma con `withScores`, que es solo
// para tests de fin de partida.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../../apply.js';
import { getActor, getLegalActions } from '../../legal.js';
import { createMatch, startNextHand } from '../../match.js';
import type { MatchState, PlayerId, TeamId } from '../../types.js';
import {
  answerEnvido,
  answerTruco,
  callEnvido,
  callTruco,
  deckFor,
  goToMazo,
  playTricks,
  withScores,
} from '../helpers.js';

/** Manos fijas: el mano es p1 (equipo 1), gana las dos primeras bazas y tiene el mejor envido. */
const MANOS: Record<PlayerId, string[]> = {
  p1: ['1-espada', '7-espada', '4-copa'],
  p0: ['3-basto', '5-copa', '12-oro'],
};

/** Partida de 2 jugadores con mazo fijo: repartidor p0 → mano p1 (equipo 1). */
function match2p(): MatchState {
  return createMatch({ rules: { playerCount: 2 }, seed: 1, firstDealerSeat: 0, deck: deckFor(MANOS, 1, 2) });
}

/**
 * AC 4 [ENG-01]: la partida quedó cerrada del todo.
 * `getActor` en null, sin acciones legales para nadie, `applyAction` rechazado con
 * `MATCH_OVER`, una sola vez el evento `MATCH_OVER` y no se puede repartir otra mano.
 */
function expectMatchOver(state: MatchState, winnerTeam: TeamId, events: { type: string }[]): void {
  expect(state.phase).toBe('MATCH_OVER');
  expect(state.winnerTeam).toBe(winnerTeam);
  expect(state.scores[winnerTeam]).toBe(30); // tope: nunca pasa de 30
  expect(events.filter((event) => event.type === 'MATCH_OVER')).toHaveLength(1);
  expect(events.at(-1)).toMatchObject({ type: 'MATCH_OVER', winnerTeam });
  expect(events.some((event) => event.type === 'HAND_OVER')).toBe(false);
  expect(getActor(state)).toBeNull();
  for (const seat of state.seats) {
    expect(getLegalActions(state, seat.id), seat.id).toEqual([]);
  }
  expect(applyAction(state, state.seats[0].id, { type: 'MAZO' })).toEqual({ ok: false, error: 'MATCH_OVER' });
  expect(() => startNextHand(state)).toThrow('NOT_HAND_OVER');
}

describe('mazo en manos reales (AC 2 y 7)', () => {
  it('mazo sin truco: 1 al rival, con las bazas ya jugadas en el historial', () => {
    const primera = playTricks(match2p(), { p1: '1-espada', p0: '3-basto' });

    const { state, events } = goToMazo(primera.state, 'p1');

    expect(events).toEqual([
      { type: 'MAZO', playerId: 'p1', team: 1 },
      { type: 'POINTS', team: 0, points: 1, reason: 'MAZO' },
      { type: 'HAND_OVER', winnerTeam: 0, points: 1, reason: 'MAZO' },
    ]);
    expect(state.scores).toEqual([1, 0]);
    expect(state.hand.result).toEqual({ winnerTeam: 0, points: 1, reason: 'MAZO' });
    expect(state.history[0]).toMatchObject({ reason: 'MAZO', points: 1, scoresAfter: [1, 0] });
    expect(state.history[0].tricks).toHaveLength(1); // la baza jugada queda en el record
    expect(state.history[0].cantos).toEqual([{ kind: 'MAZO', by: 'p1', team: 1 }]);
    // el mazo no juega cartas: la baza queda cerrada y no hay jugadas nuevas
    expect(state.hand.currentTrick.plays).toEqual([]);
  });

  it('mazo con el truco querido y una baza jugada: 2 al rival', () => {
    let state = answerTruco(callTruco(match2p(), 'p1').state, 'p0', 'QUIERO').state; // nivel 1, sigue p1
    state = playTricks(state, { p1: '1-espada', p0: '3-basto' }).state;

    const { state: cerrada } = goToMazo(state, 'p1');

    expect(cerrada.scores).toEqual([2, 0]);
    expect(cerrada.history[0].cantos).toEqual([
      { kind: 'TRUCO', by: 'p1', team: 1, answer: 'QUIERO', points: 2, pointsTo: 0 },
      { kind: 'MAZO', by: 'p1', team: 1 },
    ]);
  });

  it('mazo respondiendo al truco: 1 al que cantó', () => {
    const pedido = callTruco(match2p(), 'p1');

    const { state } = goToMazo(pedido.state, 'p0');

    expect(state.scores).toEqual([0, 1]);
    expect(state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'MAZO' });
  });

  it('con el envido pendiente el mazo no está en las acciones legales y applyAction lo rechaza [ENG-09]', () => {
    const conEnvidoPendiente = callEnvido(match2p(), 'p1', 'E').state;

    expect(conEnvidoPendiente.phase).toBe('AWAITING_ENVIDO');
    // el respondedor solo puede contestar el envido o subir la cadena: MAZO no está
    expect(getLegalActions(conEnvidoPendiente, 'p0').map((action) => action.type)).toEqual([
      'ANSWER_ENVIDO',
      'ANSWER_ENVIDO',
      'CALL_ENVIDO',
      'CALL_ENVIDO',
      'CALL_ENVIDO',
    ]);
    expect(applyAction(conEnvidoPendiente, 'p0', { type: 'MAZO' })).toEqual({
      ok: false,
      error: 'ILLEGAL_ACTION',
    });
  });

  it('envido querido y resuelto + mazo después: se conservan los 2 del envido y se suma 1', () => {
    const conEnvido = answerEnvido(callEnvido(match2p(), 'p1', 'E').state, 'p0', 'QUIERO').state;
    expect(conEnvido.scores).toEqual([0, 2]);
    expect(conEnvido.phase).toBe('PLAYING');
    expect(conEnvido.hand.envido.result).toMatchObject({ winnerTeam: 1, points: 2, accepted: true });

    const { state } = goToMazo(conEnvido, 'p1');

    expect(state.scores).toEqual([1, 2]);
    expect(state.hand.envido.result).toMatchObject({ winnerTeam: 1, points: 2, accepted: true });
    expect(state.history[0]).toMatchObject({ reason: 'MAZO', points: 1, scoresAfter: [1, 2] });
    expect(state.history[0].cantos).toEqual([
      { kind: 'ENVIDO', by: 'p1', team: 1, answer: 'QUIERO', points: 2, pointsTo: 1 },
      { kind: 'MAZO', by: 'p1', team: 1 },
    ]);
  });

  it('AC 5: cada mano cerrada por mazo se numera y guarda a su repartidor', () => {
    const primera = goToMazo(match2p(), 'p1').state; // mano 1: reparte p0, es mano p1

    const segunda = goToMazo(startNextHand(primera).state, 'p0').state; // mano 2: reparte p1, es mano p0

    expect(segunda.scores).toEqual([1, 1]);
    expect(segunda.history.map((record) => record.number)).toEqual([1, 2]);
    expect(segunda.history.map((record) => record.dealerId)).toEqual(['p0', 'p1']);
    expect(segunda.history.map((record) => record.manoId)).toEqual(['p1', 'p0']);
    expect(segunda.history.map((record) => record.reason)).toEqual(['MAZO', 'MAZO']);
    expect(segunda.history.map((record) => record.scoresAfter)).toEqual([
      [1, 0],
      [1, 1],
    ]);
  });
});

describe('fin de partida por cada camino (AC 4 y 5) [ENG-01]', () => {
  it('por bazas: la mano que llega a 30 cierra la partida', () => {
    const base = withScores(match2p(), [0, 29]); // el equipo 1 está a 1 del objetivo

    const { state, events } = playTricks(base, { p1: '1-espada', p0: '3-basto' }, { p1: '7-espada', p0: '5-copa' });

    expectMatchOver(state, 1, events);
    expect(state.scores).toEqual([0, 30]);
    expect(state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'BAZAS' });
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({ reason: 'BAZAS', points: 1, scoresAfter: [0, 30] });
  });

  it('por truco no querido: el que cantó llega a 30 y la mano no se juega', () => {
    const base = withScores(match2p(), [0, 29]);

    const { state, events } = answerTruco(callTruco(base, 'p1').state, 'p0', 'NO_QUIERO');

    expectMatchOver(state, 1, events);
    expect(state.scores).toEqual([0, 30]);
    expect(state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'NO_QUIERO' });
    expect(state.hand.currentTrick.plays).toEqual([]);
    expect(state.history[0]).toMatchObject({ reason: 'NO_QUIERO', points: 1, scoresAfter: [0, 30] });
  });

  it('por mazo: el rival llega a 30 y la mano se cierra con la razón del mazo', () => {
    const base = withScores(match2p(), [29, 0]);

    const { state, events } = goToMazo(base, 'p1');

    expectMatchOver(state, 0, events);
    expect(state.scores).toEqual([30, 0]);
    expect(state.hand.result).toEqual({ winnerTeam: 0, points: 1, reason: 'MAZO' });
    expect(state.history[0]).toMatchObject({ reason: 'MAZO', points: 1, scoresAfter: [30, 0] });
  });

  it('por envido: la partida termina en medio de la mano y el record queda en MATCH_ENDED', () => {
    const base = withScores(match2p(), [0, 28]); // el equipo 1 está a 2: el envido lo lleva a 30

    const { state, events } = answerEnvido(callEnvido(base, 'p1', 'E').state, 'p0', 'QUIERO');

    expectMatchOver(state, 1, events);
    expect(state.scores).toEqual([0, 30]);
    // la mano no se jugó: no hay `hand.result` ni `HAND_OVER`, pero sí el record [UI-16]
    expect(state.hand.result).toBeNull();
    expect(state.hand.tricks).toEqual([]);
    expect(state.hand.hands['p1']).toHaveLength(3);
    expect(state.history).toEqual([
      {
        number: 1,
        dealerId: 'p0',
        manoId: 'p1',
        picaPica: false,
        tricks: [],
        cantos: [{ kind: 'ENVIDO', by: 'p1', team: 1, answer: 'QUIERO', points: 2, pointsTo: 1 }],
        winnerTeam: 1,
        points: 0,
        reason: 'MATCH_ENDED',
        scoresAfter: [0, 30],
      },
    ]);
  });
});
