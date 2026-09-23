// Escenarios completos del truco — AC 10: mazo fijo, 2 y 4 jugadores.
// Todo entra por `applyAction`: la mano se cierra sola, por bazas o por no quiero.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../../apply.js';
import { getActor, getLegalActions } from '../../legal.js';
import { createMatch } from '../../match.js';
import { trucoPoints } from '../../truco.js';
import type { MatchState, PlayerId } from '../../types.js';
import { answerTruco, callTruco, deckFor, playFirstCard, playTrick, playTricks } from '../helpers.js';

/** Manos de 2 jugadores: el mano es p1 (equipo 1) y gana las dos primeras bazas. */
const MANOS: Record<PlayerId, string[]> = {
  p1: ['1-espada', '7-espada', '4-copa'],
  p0: ['3-basto', '5-copa', '12-oro'],
};

/** Manos de 2 jugadores que se van 1-1 y se definen en la 3ª baza (la gana p1). */
const MANOS_HASTA_LA_TERCERA: Record<PlayerId, string[]> = {
  p1: ['1-espada', '4-copa', '7-espada'],
  p0: ['3-basto', '2-oro', '5-copa'],
};

/** Manos de 4 jugadores: p1/p3 = equipo 1, p2/p0 = equipo 0; 1ª y 3ª baza para el equipo 1. */
const MANOS_4P: Record<PlayerId, string[]> = {
  p1: ['1-espada', '4-copa', '7-espada'],
  p2: ['2-espada', '5-copa', '10-oro'],
  p3: ['3-espada', '2-oro', '11-oro'],
  p0: ['12-espada', '3-oro', '6-oro'],
};

/** Partida de 2 jugadores con mazo fijo: repartidor p0 → mano p1 (equipo 1). */
function match2p(hands: Record<PlayerId, string[]>): MatchState {
  return createMatch({ rules: { playerCount: 2 }, seed: 1, firstDealerSeat: 0, deck: deckFor(hands, 1, 2) });
}

/** Partida de 4 jugadores con mazo fijo: repartidor p0 → mano p1; participantes p1, p2, p3, p0. */
function match4p(hands: Record<PlayerId, string[]>): MatchState {
  return createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: 0, deck: deckFor(hands, 1, 4) });
}

/** Canta truco y lo quiere: la mano sigue en `PLAYING` con el truco querido y el turno del que cantó. */
function trucoQuerido(state: MatchState, caller: PlayerId, responder: PlayerId): MatchState {
  return answerTruco(callTruco(state, caller).state, responder, 'QUIERO').state;
}

/** Juega `cuantas` cartas seguidas con el actor que marque el motor (el orden lo decide el turno). */
function jugarCartas(state: MatchState, cuantas: number): MatchState {
  let actual = state;
  for (let i = 0; i < cuantas; i++) actual = playFirstCard(actual).state;
  return actual;
}

/** Llega al vale cuatro cantado (pendiente 3) con el truco y el retruco ya queridos. */
function hastaElVale4Cantado(): MatchState {
  let state = trucoQuerido(match2p(MANOS), 'p1', 'p0'); // nivel 1 querido por el equipo 0
  state = playFirstCard(state).state; // p1 juega 1-espada: el turno pasa a p0
  state = callTruco(state, 'p0').state; // retruco (pendiente 2)
  state = answerTruco(state, 'p1', 'QUIERO').state; // nivel 2 querido por el equipo 1
  state = playFirstCard(state).state; // p0 juega 3-basto: la 1ª baza es de p1
  return callTruco(state, 'p1').state; // vale cuatro (pendiente 3), sin responder
}

describe('2 jugadores: truco querido y la mano por bazas', () => {
  it('truco querido y mano ganada → 2 puntos (GDD §5)', () => {
    const state = trucoQuerido(match2p(MANOS), 'p1', 'p0');
    expect(state.hand.truco).toEqual({ level: 1, pending: null, quieroTeam: 0 });
    expect(trucoPoints(state)).toBe(2);

    const mano = playTricks(state, { p1: '1-espada', p0: '3-basto' }, { p1: '7-espada', p0: '5-copa' });

    expect(mano.state.phase).toBe('HAND_OVER');
    expect(mano.state.scores).toEqual([0, 2]);
    expect(mano.state.hand.result).toEqual({ winnerTeam: 1, points: 2, reason: 'BAZAS' });
    expect(mano.state.history[0]).toMatchObject({
      winnerTeam: 1,
      points: 2,
      reason: 'BAZAS',
      scoresAfter: [0, 2],
      cantos: [{ kind: 'TRUCO', by: 'p1', team: 1, answer: 'QUIERO' }],
    });
    expect(mano.events.map((event) => event.type)).toContain('HAND_OVER');
  });

  it('retruco querido → 3 puntos', () => {
    let state = trucoQuerido(match2p(MANOS), 'p1', 'p0');
    state = playFirstCard(state).state; // p1 juega el 1 de espada
    state = callTruco(state, 'p0').state; // retruco del equipo que tenía el quiero
    state = answerTruco(state, 'p1', 'QUIERO').state;
    expect(state.hand.truco).toEqual({ level: 2, pending: null, quieroTeam: 1 });
    expect(state.hand.turnId).toBe('p0'); // sigue jugando el que había cantado el retruco

    // la 1ª baza la cierra p1 con el 1 de espada y la 2ª la gana con el 7
    const mano = jugarCartas(state, 3);

    expect(mano.hand.tricks.map((trick) => trick.winnerTeam)).toEqual([1, 1]);
    expect(mano.phase).toBe('HAND_OVER');
    expect(mano.scores).toEqual([0, 3]);
    expect(mano.hand.result).toEqual({ winnerTeam: 1, points: 3, reason: 'BAZAS' });
    expect(mano.hand.cantos).toEqual([
      { kind: 'TRUCO', by: 'p1', team: 1, answer: 'QUIERO' },
      { kind: 'RETRUCO', by: 'p0', team: 0, answer: 'QUIERO' },
    ]);
  });

  it('vale cuatro querido → 4 puntos', () => {
    let state = hastaElVale4Cantado();
    expect(state.hand.truco.pending).toEqual({ level: 3, callerId: 'p1', callerTeam: 1, responderId: 'p0' });

    state = answerTruco(state, 'p0', 'QUIERO').state;
    expect(state.hand.truco).toEqual({ level: 3, pending: null, quieroTeam: 0 });
    expect(trucoPoints(state)).toBe(4);

    const mano = playTricks(state, { p1: '7-espada', p0: '5-copa' });

    expect(mano.state.phase).toBe('HAND_OVER');
    expect(mano.state.scores).toEqual([0, 4]);
    expect(mano.state.hand.result).toEqual({ winnerTeam: 1, points: 4, reason: 'BAZAS' });
    expect(mano.state.hand.cantos).toEqual([
      { kind: 'TRUCO', by: 'p1', team: 1, answer: 'QUIERO' },
      { kind: 'RETRUCO', by: 'p0', team: 0, answer: 'QUIERO' },
      { kind: 'VALE4', by: 'p1', team: 1, answer: 'QUIERO' },
    ]);
  });
});

describe('2 jugadores: no quiero', () => {
  it('truco no querido → 1 al que cantó y la mano termina en el acto (AC 6)', () => {
    const pedido = callTruco(match2p(MANOS), 'p1');
    const fin = answerTruco(pedido.state, 'p0', 'NO_QUIERO');

    expect(fin.state.phase).toBe('HAND_OVER');
    expect(fin.state.scores).toEqual([0, 1]);
    expect(fin.state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'NO_QUIERO' });
    expect(fin.events.map((event) => event.type)).toEqual(['TRUCO_ANSWERED', 'POINTS', 'HAND_OVER']);

    // no se jugó ninguna carta y ya no hay nada que decidir
    expect(fin.state.hand.tricks).toEqual([]);
    expect(fin.state.hand.currentTrick.plays).toEqual([]);
    expect(fin.state.hand.hands['p0']).toHaveLength(3);
    expect(getActor(fin.state)).toBeNull();
    expect(getLegalActions(fin.state, 'p1')).toEqual([]);
    expect(getLegalActions(fin.state, 'p0')).toEqual([]);
    expect(applyAction(fin.state, 'p0', { type: 'PLAY_CARD', cardId: '3-basto' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });

  it('retruco no querido → 2 puntos al que lo cantó', () => {
    let state = trucoQuerido(match2p(MANOS), 'p1', 'p0');
    state = playFirstCard(state).state;
    const fin = answerTruco(callTruco(state, 'p0').state, 'p1', 'NO_QUIERO');

    expect(fin.state.scores).toEqual([2, 0]);
    expect(fin.state.hand.result).toEqual({ winnerTeam: 0, points: 2, reason: 'NO_QUIERO' });
    expect(fin.state.hand.result?.reason).toBe('NO_QUIERO');
  });

  it('vale cuatro no querido → 3 puntos al que lo cantó', () => {
    const fin = answerTruco(hastaElVale4Cantado(), 'p0', 'NO_QUIERO');

    expect(fin.state.scores).toEqual([0, 3]);
    expect(fin.state.hand.result).toEqual({ winnerTeam: 1, points: 3, reason: 'NO_QUIERO' });
    expect(fin.state.hand.truco.pending).toBeNull(); // el canto deja de estar pendiente
    expect(fin.state.hand.truco.level).toBe(2); // lo querido hasta ahí no se pierde... pero la mano ya terminó
  });
});

describe('subir como respuesta: "quiero retruco" y después "quiero vale cuatro" (AC 5)', () => {
  it('encadena los tres cantos y la mano se paga 4', () => {
    let state = callTruco(match2p(MANOS), 'p1').state; // truco pedido (pendiente 1)
    state = callTruco(state, 'p0').state; // "quiero retruco"
    expect(state.hand.truco).toEqual({
      level: 1,
      pending: { level: 2, callerId: 'p0', callerTeam: 0, responderId: 'p1' },
      quieroTeam: 0,
    });

    state = callTruco(state, 'p1').state; // "quiero vale cuatro"
    expect(state.hand.truco).toEqual({
      level: 2,
      pending: { level: 3, callerId: 'p1', callerTeam: 1, responderId: 'p0' },
      quieroTeam: 1,
    });
    expect(state.phase).toBe('AWAITING_TRUCO');

    state = answerTruco(state, 'p0', 'QUIERO').state;
    expect(state.phase).toBe('PLAYING');
    expect(state.hand.turnId).toBe('p1'); // el canto no cambia quién juega la carta

    const mano = playTricks(state, { p1: '1-espada', p0: '3-basto' }, { p1: '7-espada', p0: '5-copa' });

    expect(mano.state.hand.cantos).toEqual([
      { kind: 'TRUCO', by: 'p1', team: 1, answer: 'QUIERO' },
      { kind: 'RETRUCO', by: 'p0', team: 0, answer: 'QUIERO' },
      { kind: 'VALE4', by: 'p1', team: 1, answer: 'QUIERO' },
    ]);
    expect(mano.state.scores).toEqual([0, 4]);
    expect(mano.state.hand.result).toEqual({ winnerTeam: 1, points: 4, reason: 'BAZAS' });
  });
});

describe('4 jugadores: quién responde el canto (AC 2 y 10)', () => {
  it('p1 canta y responde el humano; p0 canta y responde p1; p2 canta y responde p3', () => {
    let state = match4p(MANOS_4P);
    expect(state.hand.participants).toEqual(['p1', 'p2', 'p3', 'p0']);

    // p1 canta: entre los rivales (p2 y p0) está el humano, así que responde p0
    const porP1 = callTruco(state, 'p1').state;
    expect(porP1.hand.truco.pending).toEqual({ level: 1, callerId: 'p1', callerTeam: 1, responderId: 'p0' });
    expect(getActor(porP1)).toBe('p0');
    expect(getLegalActions(porP1, 'p0')).toEqual([
      { type: 'ANSWER_TRUCO', answer: 'QUIERO' },
      { type: 'ANSWER_TRUCO', answer: 'NO_QUIERO' },
      { type: 'CALL_TRUCO' },
    ]);

    // p2 canta en su turno: el rival es p3
    state = playFirstCard(state).state; // juega p1 → turno de p2
    expect(getActor(state)).toBe('p2');
    const porP2 = callTruco(state, 'p2').state;
    expect(porP2.hand.truco.pending).toEqual({ level: 1, callerId: 'p2', callerTeam: 0, responderId: 'p3' });
    expect(getActor(porP2)).toBe('p3');

    // p0 canta en el último turno de la vuelta: responde p1
    state = playFirstCard(state).state; // juega p2 → turno de p3
    state = playFirstCard(state).state; // juega p3 → turno de p0
    expect(getActor(state)).toBe('p0');
    const porP0 = callTruco(state, 'p0').state;
    expect(porP0.hand.truco.pending).toEqual({ level: 1, callerId: 'p0', callerTeam: 0, responderId: 'p1' });
    expect(getActor(porP0)).toBe('p1');
  });

  it('truco querido en 4 jugadores: la mano la paga el equipo que se lleva dos bazas', () => {
    const state = trucoQuerido(match4p(MANOS_4P), 'p1', 'p0');
    expect(state.hand.turnId).toBe('p1');

    const mano = playTricks(
      state,
      { p1: '1-espada', p2: '2-espada', p3: '3-espada', p0: '12-espada' }, // 1ª: p1
      { p1: '4-copa', p2: '5-copa', p3: '2-oro', p0: '3-oro' }, // 2ª: p0
      { p0: '6-oro', p1: '7-espada', p2: '10-oro', p3: '11-oro' }, // 3ª: p1
    );

    expect(mano.state.hand.tricks.map((trick) => trick.winnerTeam)).toEqual([1, 0, 1]);
    expect(mano.state.phase).toBe('HAND_OVER');
    expect(mano.state.scores).toEqual([0, 2]);
    expect(mano.state.hand.result).toEqual({ winnerTeam: 1, points: 2, reason: 'BAZAS' });
    expect(mano.state.history[0]).toMatchObject({
      manoId: 'p1',
      picaPica: false,
      points: 2,
      scoresAfter: [0, 2],
      cantos: [{ kind: 'TRUCO', by: 'p1', team: 1, answer: 'QUIERO' }],
    });
  });
});

describe('[ENG-02] el canto congela las cartas', () => {
  it('con el truco pendiente nadie juega carta: NOT_YOUR_TURN o ILLEGAL_ACTION', () => {
    const state = callTruco(match2p(MANOS), 'p1').state;
    expect(getActor(state)).toBe('p0'); // decide el respondedor, no el que tenía el turno

    expect(applyAction(state, 'p1', { type: 'PLAY_CARD', cardId: '1-espada' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(applyAction(state, 'p0', { type: 'PLAY_CARD', cardId: '3-basto' })).toEqual({
      ok: false,
      error: 'ILLEGAL_ACTION',
    });
    expect(getLegalActions(state, 'p1')).toEqual([]);
    expect(getLegalActions(state, 'p0').some((action) => action.type === 'PLAY_CARD')).toBe(false);
  });

  it('en 4 jugadores el que venía jugando tampoco puede tirar la carta', () => {
    const state = match4p(MANOS_4P);
    const pedido = callTruco(state, 'p1').state; // p1 canta antes de jugar
    expect(getActor(pedido)).toBe('p0');

    expect(applyAction(pedido, 'p1', { type: 'PLAY_CARD', cardId: '1-espada' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(applyAction(pedido, 'p2', { type: 'PLAY_CARD', cardId: '2-espada' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(getLegalActions(pedido, 'p2')).toEqual([]);
  });
});

describe('truco en la 2ª y en la 3ª baza', () => {
  it('truco cantado al abrir la 2ª baza y querido → la mano vale 2', () => {
    const primera = playTrick(match2p(MANOS), { p1: '1-espada', p0: '3-basto' });
    expect(primera.state.phase).toBe('PLAYING');
    expect(getActor(primera.state)).toBe('p1'); // abre el que ganó
    expect(getLegalActions(primera.state, 'p1')[0]).toEqual({ type: 'CALL_TRUCO' });

    let state = callTruco(primera.state, 'p1').state;
    expect(state.hand.truco.pending).toMatchObject({ level: 1, responderId: 'p0' });
    state = answerTruco(state, 'p0', 'QUIERO').state;

    const mano = playTrick(state, { p1: '7-espada', p0: '5-copa' });

    expect(mano.state.hand.tricks).toHaveLength(2);
    expect(mano.state.phase).toBe('HAND_OVER');
    expect(mano.state.scores).toEqual([0, 2]);
    expect(mano.state.history[0].cantos).toEqual([{ kind: 'TRUCO', by: 'p1', team: 1, answer: 'QUIERO' }]);
  });

  it('truco cantado en la 3ª baza con la mano 1-1 → se define ahí y vale 2', () => {
    const primera = playTrick(match2p(MANOS_HASTA_LA_TERCERA), { p1: '1-espada', p0: '3-basto' });
    const segunda = playTrick(primera.state, { p1: '4-copa', p0: '2-oro' });

    expect(segunda.state.hand.tricks.map((trick) => trick.winnerTeam)).toEqual([1, 0]);
    expect(segunda.state.phase).toBe('PLAYING');
    expect(getActor(segunda.state)).toBe('p0'); // abre el que ganó la 2ª

    // el que abre la 3ª canta truco; como p0 es el humano, responde el rival p1
    let state = callTruco(segunda.state, 'p0').state;
    expect(state.hand.truco.pending).toEqual({ level: 1, callerId: 'p0', callerTeam: 0, responderId: 'p1' });
    state = answerTruco(state, 'p1', 'QUIERO').state;
    expect(state.hand.turnId).toBe('p0');

    const tercera = playTrick(state, { p0: '5-copa', p1: '7-espada' });

    expect(tercera.state.hand.tricks).toHaveLength(3);
    expect(tercera.state.hand.tricks[2]).toMatchObject({ winnerTeam: 1, winnerPlayerId: 'p1' });
    expect(tercera.state.phase).toBe('HAND_OVER');
    expect(tercera.state.scores).toEqual([0, 2]);
    expect(tercera.state.hand.result).toEqual({ winnerTeam: 1, points: 2, reason: 'BAZAS' });
    expect(tercera.state.hand.cantos).toEqual([{ kind: 'TRUCO', by: 'p0', team: 0, answer: 'QUIERO' }]);
  });
});
