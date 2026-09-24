// Tests de src/engine/mazo.ts — historia 1-5, AC 1 y 2: cuándo se puede uno ir al mazo,
// cuánto paga cada camino y qué deja en el historial de la mano.
// [ENG-09]: con el envido pendiente no hay mazo para nadie; [ENG-10]: nada fuera de
// `getLegalActions` se puede aplicar.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../apply.js';
import { getActor, getLegalActions } from '../legal.js';
import { createMatch } from '../match.js';
import { canGoToMazo, mazoActions } from '../mazo.js';
import { trucoPoints } from '../truco.js';
import type { MatchState, PlayerId } from '../types.js';
import {
  answerEnvido,
  answerTruco,
  callEnvido,
  callTruco,
  deckFor,
  goToMazo,
  playFirstCard,
  withScores,
} from './helpers.js';

/** Manos fijas: el mano es p1 (equipo 1); el mejor envido es el de p1. */
const MANOS: Record<PlayerId, string[]> = {
  p1: ['1-espada', '7-espada', '4-copa'],
  p0: ['3-basto', '5-copa', '12-oro'],
};

/** Partida de 2 jugadores con mazo fijo: repartidor p0 → mano p1 (equipo 1). */
function match2p(): MatchState {
  return createMatch({ rules: { playerCount: 2 }, seed: 1, firstDealerSeat: 0, deck: deckFor(MANOS, 1, 2) });
}

/** Canta truco y lo quiere: el nivel 1 queda querido y sigue jugando el que cantó. */
function trucoQuerido(state: MatchState, caller: PlayerId, responder: PlayerId): MatchState {
  return answerTruco(callTruco(state, caller).state, responder, 'QUIERO').state;
}

/** Nivel 2 querido por el equipo 1, con el turno de p1 (el que había cantado el retruco). */
function hastaElRetrucoQuerido(): MatchState {
  let state = trucoQuerido(match2p(), 'p1', 'p0'); // nivel 1 querido por el equipo 0
  state = playFirstCard(state).state; // p1 juega: el turno pasa a p0
  state = callTruco(state, 'p0').state; // retruco (pendiente 2)
  state = answerTruco(state, 'p1', 'QUIERO').state; // nivel 2 querido por el equipo 1
  state = playFirstCard(state).state; // p0 juega: la 1ª baza es de p1
  return state;
}

/** Vale cuatro cantado (pendiente 3) por p1, con p0 de respondedor. */
function hastaElVale4Cantado(): MatchState {
  return callTruco(hastaElRetrucoQuerido(), 'p1').state;
}

describe('AC 1 [ENG-09]: cuándo se puede ir al mazo', () => {
  it('en PLAYING el mazo es del actor y va después de los cantos, antes de las cartas', () => {
    const state = match2p();

    expect(getActor(state)).toBe('p1');
    expect(canGoToMazo(state, 'p1')).toBe(true);
    expect(mazoActions(state, 'p1')).toEqual([{ type: 'MAZO' }]);
    expect(getLegalActions(state, 'p1')).toEqual([
      { type: 'CALL_TRUCO' },
      { type: 'CALL_ENVIDO', call: 'E' },
      { type: 'CALL_ENVIDO', call: 'R' },
      { type: 'CALL_ENVIDO', call: 'F' },
      { type: 'MAZO' },
      { type: 'PLAY_CARD', cardId: '1-espada' },
      { type: 'PLAY_CARD', cardId: '7-espada' },
      { type: 'PLAY_CARD', cardId: '4-copa' },
    ]);
  });

  it('en PLAYING el que no es el actor no puede: ni acción legal ni aplicar', () => {
    const state = match2p();

    expect(canGoToMazo(state, 'p0')).toBe(false);
    expect(getLegalActions(state, 'p0')).toEqual([]);
    expect(applyAction(state, 'p0', { type: 'MAZO' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });

  it('[ENG-09] con el envido pendiente no hay mazo para nadie', () => {
    const pedido = callEnvido(match2p(), 'p1', 'E').state; // responde p0

    expect(pedido.phase).toBe('AWAITING_ENVIDO');
    expect(getActor(pedido)).toBe('p0');
    // el respondedor tiene que contestar el envido primero: no puede irse al mazo
    expect(canGoToMazo(pedido, 'p0')).toBe(false);
    expect(mazoActions(pedido, 'p0')).toEqual([]);
    expect(getLegalActions(pedido, 'p0').some((action) => action.type === 'MAZO')).toBe(false);
    expect(applyAction(pedido, 'p0', { type: 'MAZO' })).toEqual({ ok: false, error: 'ILLEGAL_ACTION' });
    // y el que cantó tampoco (no es su turno)
    expect(canGoToMazo(pedido, 'p1')).toBe(false);
    expect(applyAction(pedido, 'p1', { type: 'MAZO' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });

  it('en AWAITING_TRUCO el mazo es del respondedor y no del que cantó', () => {
    const pedido = callTruco(match2p(), 'p1').state; // responde p0

    expect(getActor(pedido)).toBe('p0');
    expect(canGoToMazo(pedido, 'p0')).toBe(true);
    // va después de las respuestas al truco, los cantos de envido y antes que nada más
    expect(getLegalActions(pedido, 'p0')).toEqual([
      { type: 'ANSWER_TRUCO', answer: 'QUIERO' },
      { type: 'ANSWER_TRUCO', answer: 'NO_QUIERO' },
      { type: 'CALL_TRUCO' },
      { type: 'CALL_ENVIDO', call: 'E' },
      { type: 'CALL_ENVIDO', call: 'R' },
      { type: 'CALL_ENVIDO', call: 'F' },
      { type: 'MAZO' },
    ]);
    expect(canGoToMazo(pedido, 'p1')).toBe(false);
    expect(applyAction(pedido, 'p1', { type: 'MAZO' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });

  it('[ENG-09] en AWAITING_FLOR, HAND_OVER y MATCH_OVER no hay mazo', () => {
    const enFlor = match2p();
    enFlor.phase = 'AWAITING_FLOR'; // la 1-8 la implementa; acá solo se prueba que el mazo no entra

    expect(canGoToMazo(enFlor, 'p1')).toBe(false);
    expect(getLegalActions(enFlor, 'p1')).toEqual([]);
    expect(applyAction(enFlor, 'p1', { type: 'MAZO' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });

    const cerrada = goToMazo(match2p(), 'p1').state;
    expect(cerrada.phase).toBe('HAND_OVER');
    expect(canGoToMazo(cerrada, 'p1')).toBe(false);
    expect(canGoToMazo(cerrada, 'p0')).toBe(false);
    expect(getLegalActions(cerrada, 'p1')).toEqual([]);
    expect(applyAction(cerrada, 'p1', { type: 'MAZO' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });

    const terminada = goToMazo(withScores(match2p(), [29, 0]), 'p1').state;
    expect(terminada.phase).toBe('MATCH_OVER');
    expect(canGoToMazo(terminada, 'p1')).toBe(false);
    expect(getLegalActions(terminada, 'p0')).toEqual([]);
    expect(applyAction(terminada, 'p1', { type: 'MAZO' })).toEqual({ ok: false, error: 'MATCH_OVER' });
  });
});

describe('AC 2: puntaje y cierre del mazo', () => {
  it('sin truco el rival suma 1 y no hay punto extra por irse en primera sin envido', () => {
    const { state, events } = goToMazo(match2p(), 'p1');

    expect(events).toEqual([
      { type: 'MAZO', playerId: 'p1', team: 1 },
      { type: 'POINTS', team: 0, points: 1, reason: 'MAZO' },
      { type: 'HAND_OVER', winnerTeam: 0, points: 1, reason: 'MAZO' },
    ]);
    expect(state.phase).toBe('HAND_OVER');
    expect(state.scores).toEqual([1, 0]); // 1, sin extra por estar en la primera baza
    expect(state.hand.result).toEqual({ winnerTeam: 0, points: 1, reason: 'MAZO' });
    expect(state.hand.cantos).toEqual([{ kind: 'MAZO', by: 'p1', team: 1 }]);
    expect(state.hand.tricks).toEqual([]); // no se jugó ninguna carta
    expect(state.hand.currentTrick.plays).toEqual([]);
    expect(state.history[0]).toMatchObject({
      number: 1,
      dealerId: 'p0',
      manoId: 'p1',
      winnerTeam: 0,
      points: 1,
      reason: 'MAZO',
      scoresAfter: [1, 0],
    });
    expect(state.history[0].cantos).toEqual([{ kind: 'MAZO', by: 'p1', team: 1 }]);
  });

  it('con el truco querido el rival suma 2 (el nivel querido, no el cantado)', () => {
    const conTruco = trucoQuerido(match2p(), 'p1', 'p0'); // nivel 1 querido, sigue p1
    expect(trucoPoints(conTruco)).toBe(2);

    const { state } = goToMazo(conTruco, 'p1');

    expect(state.scores).toEqual([2, 0]);
    expect(state.hand.result).toEqual({ winnerTeam: 0, points: 2, reason: 'MAZO' });
    expect(state.history[0].cantos).toEqual([
      { kind: 'TRUCO', by: 'p1', team: 1, answer: 'QUIERO', points: 2, pointsTo: 0 },
      { kind: 'MAZO', by: 'p1', team: 1 },
    ]);
  });

  it('con el retruco querido el rival suma 3', () => {
    const conRetruco = hastaElRetrucoQuerido();
    expect(conRetruco.hand.truco.level).toBe(2);

    const { state } = goToMazo(conRetruco, 'p1');

    expect(state.scores).toEqual([3, 0]);
    expect(state.hand.result).toEqual({ winnerTeam: 0, points: 3, reason: 'MAZO' });
  });

  it('con el vale cuatro querido el rival suma 4', () => {
    const pedido = hastaElVale4Cantado();
    expect(pedido.hand.truco.pending).toEqual({ level: 3, callerId: 'p1', callerTeam: 1, responderId: 'p0' });

    const conVale4 = answerTruco(pedido, 'p0', 'QUIERO').state;
    expect(trucoPoints(conVale4)).toBe(4);

    const { state } = goToMazo(conVale4, 'p1');

    expect(state.scores).toEqual([4, 0]);
    expect(state.hand.result).toEqual({ winnerTeam: 0, points: 4, reason: 'MAZO' });
  });

  it('irse al mazo respondiendo a un truco vale el no querido: 1 al que cantó', () => {
    const pedido = callTruco(match2p(), 'p1').state; // pendiente 1, responde p0

    const { state, events } = goToMazo(pedido, 'p0');

    expect(events).toEqual([
      { type: 'MAZO', playerId: 'p0', team: 0 },
      { type: 'POINTS', team: 1, points: 1, reason: 'MAZO' },
      { type: 'HAND_OVER', winnerTeam: 1, points: 1, reason: 'MAZO' },
    ]);
    expect(state.scores).toEqual([0, 1]); // rejected[1] = 1 para el equipo que cantó
    expect(state.hand.truco.pending).toBeNull(); // AWAITING_TRUCO ⇔ pending (ENG-18)
    expect(state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'MAZO' });
    expect(state.hand.cantos).toEqual([
      { kind: 'TRUCO', by: 'p1', team: 1, answer: 'NO_QUIERO', points: 1, pointsTo: 1 },
      { kind: 'MAZO', by: 'p0', team: 0 },
    ]);
  });

  it('irse al mazo respondiendo a un vale cuatro: 3 al que cantó', () => {
    const { state } = goToMazo(hastaElVale4Cantado(), 'p0');

    expect(state.scores).toEqual([0, 3]); // rejected[3] = 3 para el equipo 1, que cantó
    expect(state.hand.result).toEqual({ winnerTeam: 1, points: 3, reason: 'MAZO' });
    expect(state.hand.cantos.at(-2)).toEqual({
      kind: 'VALE4',
      by: 'p1',
      team: 1,
      answer: 'NO_QUIERO',
      points: 3,
      pointsTo: 1,
    });
    expect(state.hand.cantos.at(-1)).toEqual({ kind: 'MAZO', by: 'p0', team: 0 });
  });

  it('los puntos del envido ya resueltos no se tocan: se suman los del mazo', () => {
    const conEnvido = answerEnvido(callEnvido(match2p(), 'p1', 'E').state, 'p0', 'QUIERO').state;
    expect(conEnvido.scores).toEqual([0, 2]); // el mejor envido es el de p1

    // sigue p1 y ahora se va al mazo: el rival (equipo 0) suma 1
    const { state } = goToMazo(conEnvido, 'p1');

    expect(state.scores).toEqual([1, 2]);
    expect(state.history[0]).toMatchObject({ points: 1, reason: 'MAZO', scoresAfter: [1, 2] });
    expect(state.history[0].cantos).toEqual([
      { kind: 'ENVIDO', by: 'p1', team: 1, answer: 'QUIERO', points: 2, pointsTo: 1 },
      { kind: 'MAZO', by: 'p1', team: 1 },
    ]);
  });

  it('applyAction clona: el estado de entrada no cambia y la versión sube', () => {
    const state = match2p();
    const antes = structuredClone(state);

    const result = applyAction(state, 'p1', { type: 'MAZO' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state).toEqual(antes);
    expect(result.state).not.toBe(state);
    expect(result.state.version).toBe(state.version + 1);
    expect(result.state.scores).toEqual([1, 0]);
  });
});
