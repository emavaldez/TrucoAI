// Tests de src/engine/envido.ts — AC 2 a 9 de la historia 1-4: ventana de envido,
// "el envido está primero" [UI-05], cadena y subidas [ENG-04], tabla de puntos,
// falta envido [ENG-11], desempate desde el mano [ENG-12], punto de corte después de
// un truco querido [ENG-13], puntajes por jugador [ENG-17] y congelamiento de las
// cartas mientras hay un canto pendiente [ENG-02].

import { describe, expect, it } from 'vitest';
import { applyAction } from '../apply.js';
import { envidoPoints, faltaValue, nextEnvidoCalls } from '../envido.js';
import { getActor, getLegalActions } from '../legal.js';
import { createMatch } from '../match.js';
import type { EnvidoCall, MatchState, PlayerId } from '../types.js';
import { answerEnvido, answerTruco, callEnvido, callTruco, deckFor, ids, playFirstCard, playTrick, withScores } from './helpers.js';

/** Manos fijas de 2 jugadores: p1 tiene 33 de envido (7+6 de espada) y p0 25 (3+2 de basto). */
const MANOS: Record<PlayerId, string[]> = {
  p1: ['7-espada', '6-espada', '4-copa'],
  p0: ['3-basto', '2-basto', '12-oro'],
};

/** Partida de 2 jugadores con mazo fijo y el mano en `manoSeat` (repartidor = manoSeat + 1). */
function match2p(manoSeat = 1, hands: Record<PlayerId, string[]> = MANOS): MatchState {
  return createMatch({
    rules: { playerCount: 2 },
    seed: 1,
    firstDealerSeat: (manoSeat + 1) % 2,
    deck: deckFor(hands, manoSeat, 2),
  });
}

/** Manos fijas de 4 jugadores: p1/p3 son equipo 1 y p2/p0 equipo 0. */
const MANOS_4P: Record<PlayerId, string[]> = {
  p1: ['5-espada', '7-basto', '10-copa'], // 7 (sin dos del mismo palo)
  p2: ['4-oro', '1-oro', '6-basto'], // 25
  p3: ['6-copa', '12-basto', '11-oro'], // 6
  p0: ['6-espada', '5-copa', '11-oro'], // 6
};

/** Partida de 4 jugadores con mazo fijo y el mano en `manoSeat`. */
function match4p(manoSeat = 1): MatchState {
  return createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: (manoSeat + 3) % 4, deck: deckFor(MANOS_4P, manoSeat, 4) });
}

describe('nextEnvidoCalls (AC 4) [ENG-04]', () => {
  const TABLA: [EnvidoCall[], EnvidoCall[]][] = [
    [[], ['E', 'R', 'F']],
    [['E'], ['E', 'R', 'F']],
    [['E', 'E'], ['R', 'F']],
    [['E', 'R'], ['F']],
    [['R'], ['F']],
    [['E', 'E', 'R'], ['F']],
    [['F'], []],
    [['E', 'F'], []],
    [['R', 'F'], []],
    [['E', 'E', 'F'], []],
    [['E', 'R', 'F'], []],
    [['E', 'E', 'R', 'F'], []],
  ];

  it('[ENG-04] nunca se baja: cada cadena solo habilita su escalón siguiente', () => {
    for (const [chain, esperado] of TABLA) {
      expect(nextEnvidoCalls(chain), `cadena ${chain.join('-') || '(vacía)'}`).toEqual(esperado);
    }
    expect(nextEnvidoCalls(['F'])).not.toContain('E');
    expect(nextEnvidoCalls(['E', 'R'])).not.toContain('E');
  });
});

describe('envidoPoints (AC 5) [ENG-04]', () => {
  /** Valor de la falta con el que se corre la tabla. */
  const FALTA = 30;
  const TABLA: { chain: EnvidoCall[]; querido: number | 'FALTA'; noQuerido: number }[] = [
    { chain: ['E'], querido: 2, noQuerido: 1 },
    { chain: ['R'], querido: 3, noQuerido: 1 },
    { chain: ['F'], querido: 'FALTA', noQuerido: 1 },
    { chain: ['E', 'E'], querido: 4, noQuerido: 2 },
    { chain: ['E', 'R'], querido: 5, noQuerido: 2 },
    { chain: ['E', 'F'], querido: 'FALTA', noQuerido: 2 },
    { chain: ['R', 'F'], querido: 'FALTA', noQuerido: 3 },
    { chain: ['E', 'E', 'R'], querido: 7, noQuerido: 4 },
    { chain: ['E', 'E', 'F'], querido: 'FALTA', noQuerido: 4 },
    { chain: ['E', 'R', 'F'], querido: 'FALTA', noQuerido: 5 },
    { chain: ['E', 'E', 'R', 'F'], querido: 'FALTA', noQuerido: 7 },
  ];

  it('[ENG-04] la tabla completa del GDD §6.3 (querido y no querido)', () => {
    for (const row of TABLA) {
      const nombre = `cadena ${row.chain.join('-')}`;
      const querido = row.querido === 'FALTA' ? FALTA : row.querido;
      expect(envidoPoints(row.chain, FALTA), nombre).toEqual({ querido, noQuerido: row.noQuerido });
    }
  });

  it('la falta reemplaza la suma de los cantos: el valor entra por parámetro', () => {
    expect(envidoPoints(['F'], 7).querido).toBe(7);
    expect(envidoPoints(['E', 'E', 'R', 'F'], 3).querido).toBe(3);
    // sin F el valor de la falta no se usa
    expect(envidoPoints(['E', 'E', 'R'], 7).querido).toBe(7);
  });
});

describe('faltaValue (AC 6) [ENG-11]', () => {
  const state = match2p();

  it('[ENG-11] vale lo que le falta al que va ganando', () => {
    expect(faltaValue(withScores(state, [20, 10]), 0)).toBe(10);
    expect(faltaValue(withScores(state, [20, 10]), 1)).toBe(10);
    expect(faltaValue(withScores(state, [10, 20]), 0)).toBe(10);
    expect(faltaValue(withScores(state, [10, 20]), 1)).toBe(10);
    expect(faltaValue(withScores(state, [29, 29]), 0)).toBe(1);
  });

  it('[ENG-11] si el que va ganando está en las malas, vale lo que necesita el que gana el envido', () => {
    expect(faltaValue(withScores(state, [14, 3]), 0)).toBe(16); // el de 14 llega a 30
    expect(faltaValue(withScores(state, [14, 3]), 1)).toBe(27); // el de 3 llega a 30
    expect(faltaValue(withScores(state, [0, 0]), 0)).toBe(30);
    expect(faltaValue(withScores(state, [0, 0]), 1)).toBe(30);
  });

  it('[ENG-11] en pica-pica la falta vale 7 fijo', () => {
    const conPicaPica = withScores(state, [20, 10]);
    conPicaPica.hand.picaPica = { submano: 0, pairs: [['p1', 'p0']], results: [], startScores: [0, 0] };

    expect(faltaValue(conPicaPica, 0)).toBe(7);
    expect(faltaValue(conPicaPica, 1)).toBe(7);
  });
});

describe('ventana de envido (AC 2) [ENG-13]', () => {
  it('al empezar la mano el actor puede cantar E, R o F', () => {
    const state = match2p();
    expect(getActor(state)).toBe('p1');
    expect(getLegalActions(state, 'p1').slice(0, 4)).toEqual([
      { type: 'CALL_TRUCO' },
      { type: 'CALL_ENVIDO', call: 'E' },
      { type: 'CALL_ENVIDO', call: 'R' },
      { type: 'CALL_ENVIDO', call: 'F' },
    ]);
    expect(getLegalActions(state, 'p0')).toEqual([]); // no es su turno
  });

  it('cantar envido abre la cadena: chain, pending, fase, evento y CantoRecord (AC 4)', () => {
    const state = match2p();
    const snapshot = JSON.parse(JSON.stringify(state));

    const result = applyAction(state, 'p1', { type: 'CALL_ENVIDO', call: 'R' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([{ type: 'ENVIDO_CALLED', playerId: 'p1', call: 'R' }]);
    expect(result.state.phase).toBe('AWAITING_ENVIDO');
    expect(result.state.hand.envido.chain).toEqual([{ call: 'R', by: 'p1', team: 1 }]);
    expect(result.state.hand.envido.status).toBe('calling');
    expect(result.state.hand.envido.pending).toEqual({ responderId: 'p0' });
    expect(result.state.hand.cantos).toEqual([{ kind: 'REAL_ENVIDO', by: 'p1', team: 1 }]);
    expect(getActor(result.state)).toBe('p0');
    // el estado recibido no se toca
    expect(state).toEqual(snapshot);
  });

  it('[ENG-13] después de un truco querido no hay envido', () => {
    const querido = answerTruco(callTruco(match2p(), 'p1').state, 'p0', 'QUIERO').state;
    expect(querido.phase).toBe('PLAYING');
    expect(querido.hand.truco.level).toBe(1);

    expect(getLegalActions(querido, 'p1').some((action) => action.type === 'CALL_ENVIDO')).toBe(false);
    expect(applyAction(querido, 'p1', { type: 'CALL_ENVIDO', call: 'E' })).toEqual({
      ok: false,
      error: 'ILLEGAL_ACTION',
    });
  });

  it('con un truco pendiente el que tenía el turno tampoco puede cantar envido (AC 2)', () => {
    const pedido = callTruco(match2p(), 'p1').state;

    expect(applyAction(pedido, 'p1', { type: 'CALL_ENVIDO', call: 'E' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN', // decide el respondedor del truco
    });
    expect(getLegalActions(pedido, 'p1')).toEqual([]);
  });

  it('con flor declarada el envido queda anulado (GDD §7)', () => {
    const state = match2p();
    state.hand.flor.declared.push({ playerId: 'p0', team: 0 });

    expect(getLegalActions(state, 'p1').some((action) => action.type === 'CALL_ENVIDO')).toBe(false);
  });

  it('una vez resuelta la cadena no se puede volver a cantar', () => {
    const resuelto = answerEnvido(callEnvido(match2p(), 'p1', 'E').state, 'p0', 'QUIERO').state;

    expect(resuelto.hand.envido.status).toBe('resolved');
    expect(getLegalActions(resuelto, 'p1').some((action) => action.type === 'CALL_ENVIDO')).toBe(false);
    expect(applyAction(resuelto, 'p1', { type: 'CALL_ENVIDO', call: 'E' })).toEqual({
      ok: false,
      error: 'ILLEGAL_ACTION',
    });
  });
});

describe('AWAITING_ENVIDO: actor y acciones del respondedor (AC 4) [ENG-02]', () => {
  it('decide el respondedor y puede querer, no querer y subir', () => {
    const state = callEnvido(match2p(), 'p1', 'E').state;

    expect(getActor(state)).toBe('p0');
    expect(getLegalActions(state, 'p0')).toEqual([
      { type: 'ANSWER_ENVIDO', answer: 'QUIERO' },
      { type: 'ANSWER_ENVIDO', answer: 'NO_QUIERO' },
      { type: 'CALL_ENVIDO', call: 'E' },
      { type: 'CALL_ENVIDO', call: 'R' },
      { type: 'CALL_ENVIDO', call: 'F' },
    ]);
    expect(getLegalActions(state, 'p1')).toEqual([]);
    expect(applyAction(state, 'p1', { type: 'ANSWER_ENVIDO', answer: 'QUIERO' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });

  it('la subida acota las siguientes: [E] → E, R, F · [E,E] → R, F · [E,R] → F · [F] → nada', () => {
    const trasE = callEnvido(match2p(), 'p1', 'E').state;
    expect(getLegalActions(trasE, 'p0').filter((action) => action.type === 'CALL_ENVIDO')).toEqual([
      { type: 'CALL_ENVIDO', call: 'E' },
      { type: 'CALL_ENVIDO', call: 'R' },
      { type: 'CALL_ENVIDO', call: 'F' },
    ]);

    const trasEE = callEnvido(trasE, 'p0', 'E').state;
    expect(trasEE.hand.envido.chain).toHaveLength(2);
    expect(getLegalActions(trasEE, 'p1').filter((action) => action.type === 'CALL_ENVIDO')).toEqual([
      { type: 'CALL_ENVIDO', call: 'R' },
      { type: 'CALL_ENVIDO', call: 'F' },
    ]);

    const trasER = callEnvido(callEnvido(match2p(), 'p1', 'E').state, 'p0', 'R').state;
    expect(getLegalActions(trasER, 'p1').filter((action) => action.type === 'CALL_ENVIDO')).toEqual([
      { type: 'CALL_ENVIDO', call: 'F' },
    ]);

    const trasF = callEnvido(callEnvido(match2p(), 'p1', 'E').state, 'p0', 'F').state;
    expect(getLegalActions(trasF, 'p1').filter((action) => action.type === 'CALL_ENVIDO')).toEqual([]);
    expect(applyAction(trasF, 'p1', { type: 'CALL_ENVIDO', call: 'E' })).toEqual({
      ok: false,
      error: 'ILLEGAL_ACTION',
    });
  });

  it('subir acepta el canto anterior: queda el answer en el historial y la cadena completa', () => {
    const state = callEnvido(callEnvido(match2p(), 'p1', 'E').state, 'p0', 'R').state;

    expect(state.hand.cantos).toEqual([
      { kind: 'ENVIDO', by: 'p1', team: 1, answer: 'QUIERO' },
      { kind: 'REAL_ENVIDO', by: 'p0', team: 0 },
    ]);
    expect(state.hand.envido.chain).toEqual([
      { call: 'E', by: 'p1', team: 1 },
      { call: 'R', by: 'p0', team: 0 },
    ]);
  });

  it('[ENG-02] con el envido pendiente no se juega carta ni se canta truco', () => {
    const state = callEnvido(match2p(), 'p1', 'E').state;

    expect(getLegalActions(state, 'p0').some((action) => action.type === 'PLAY_CARD')).toBe(false);
    expect(getLegalActions(state, 'p0').some((action) => action.type === 'CALL_TRUCO')).toBe(false);
    expect(applyAction(state, 'p0', { type: 'PLAY_CARD', cardId: state.hand.hands['p0'][0].id })).toEqual({
      ok: false,
      error: 'ILLEGAL_ACTION',
    });
    expect(applyAction(state, 'p0', { type: 'CALL_TRUCO' })).toEqual({ ok: false, error: 'ILLEGAL_ACTION' });
    expect(applyAction(state, 'p1', { type: 'PLAY_CARD', cardId: state.hand.hands['p1'][0].id })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });
});

describe('"el envido está primero" (AC 3) [UI-05]', () => {
  /** p0 es el mano: canta truco y le responde p1 (el truco queda pendiente). */
  function trucoDeP0(): MatchState {
    return callTruco(match2p(0), 'p0').state;
  }

  it('[UI-05] el respondedor del truco puede cantar E, R o F en lugar de responderlo', () => {
    const state = trucoDeP0();
    expect(state.phase).toBe('AWAITING_TRUCO');
    expect(state.hand.truco.pending).toEqual({ level: 1, callerId: 'p0', callerTeam: 0, responderId: 'p1' });

    expect(getLegalActions(state, 'p1').filter((action) => action.type === 'CALL_ENVIDO')).toEqual([
      { type: 'CALL_ENVIDO', call: 'E' },
      { type: 'CALL_ENVIDO', call: 'R' },
      { type: 'CALL_ENVIDO', call: 'F' },
    ]);
    // el que cantó el truco no puede cantar envido
    expect(getLegalActions(state, 'p0')).toEqual([]);
  });

  it('[UI-05] cantarlo anota resumeTrucoAfter y pasa a la cadena de envido', () => {
    const state = callEnvido(trucoDeP0(), 'p1', 'E').state;

    expect(state.hand.envido.resumeTrucoAfter).toBe(true);
    expect(state.phase).toBe('AWAITING_ENVIDO');
    expect(state.hand.envido.chain).toEqual([{ call: 'E', by: 'p1', team: 1 }]);
    expect(state.hand.envido.pending).toEqual({ responderId: 'p0' }); // responde el que cantó el truco
    expect(getActor(state)).toBe('p0');
    // el truco sigue pendiente, sin responder
    expect(state.hand.truco.pending).not.toBeNull();
  });

  it('[UI-05] al resolver vuelve a AWAITING_TRUCO con el mismo pendiente y el mismo respondedor', () => {
    const conCadena = callEnvido(trucoDeP0(), 'p1', 'E').state;

    const resuelto = answerEnvido(conCadena, 'p0', 'QUIERO').state;

    expect(resuelto.phase).toBe('AWAITING_TRUCO');
    expect(resuelto.hand.truco.pending).toEqual({ level: 1, callerId: 'p0', callerTeam: 0, responderId: 'p1' });
    expect(getActor(resuelto)).toBe('p1'); // el mismo de antes tiene que contestar el truco
    expect(getLegalActions(resuelto, 'p1').slice(0, 3)).toEqual([
      { type: 'ANSWER_TRUCO', answer: 'QUIERO' },
      { type: 'ANSWER_TRUCO', answer: 'NO_QUIERO' },
      { type: 'CALL_TRUCO' },
    ]);
    // y ya no queda envido para cantar
    expect(getLegalActions(resuelto, 'p1').some((action) => action.type === 'CALL_ENVIDO')).toBe(false);
    // los puntos del envido ya están en el marcador (p1 tiene el mejor envido: equipo 1)
    expect(resuelto.scores).toEqual([0, 2]);
  });

  it('un truco que no es el primero (retruco pendiente) no habilita el envido', () => {
    // p0 truco → p1 "quiero retruco": queda pendiente el nivel 2 y responde p0
    const retruco = callTruco(trucoDeP0(), 'p1').state;
    expect(retruco.hand.truco.pending).toMatchObject({ level: 2, responderId: 'p0' });

    expect(getLegalActions(retruco, 'p0').some((action) => action.type === 'CALL_ENVIDO')).toBe(false);
  });

  it('[ENG-05] el puntaje sale de las cartas repartidas aunque ya se haya jugado una', () => {
    // p1 (mano) juega su 7 de espada; la baza sigue abierta y p0 todavía puede cantar envido
    const conCarta = playFirstCard(match2p()).state;
    expect(conCarta.hand.tricks).toEqual([]);
    expect(ids(conCarta.hand.hands['p1'])).toEqual(['6-espada', '4-copa']);
    expect(ids(conCarta.hand.dealt['p1'])).toEqual(['7-espada', '6-espada', '4-copa']);
    expect(getActor(conCarta)).toBe('p0');

    const querido = answerEnvido(callEnvido(conCarta, 'p0', 'E').state, 'p1', 'QUIERO').state;

    // el 7 ya jugado sigue contando: p1 gana con 33
    expect(querido.hand.envido.result?.revealed).toEqual([{ playerId: 'p1', score: 33 }]);
    expect(querido.scores).toEqual([0, 2]);
  });

  it('no hay "envido está primero" si ya se jugó la primera baza', () => {
    const conBaza = playTrick(match2p(0), { p0: '3-basto', p1: '7-espada' }).state;
    const truco = callTruco(playFirstCard(conBaza).state, 'p0').state;

    expect(truco.hand.tricks).toHaveLength(1);
    expect(getLegalActions(truco, 'p1').some((action) => action.type === 'CALL_ENVIDO')).toBe(false);
  });
});

describe('ANSWER_ENVIDO QUIERO (AC 8, AC 9)', () => {
  it('gana el mejor envido desde el mano y se revela hasta el ganador inclusive', () => {
    const querido = answerEnvido(callEnvido(match2p(), 'p1', 'E').state, 'p0', 'QUIERO');

    expect(querido.events).toEqual([
      { type: 'ENVIDO_ANSWERED', playerId: 'p0', answer: 'QUIERO' },
      {
        type: 'ENVIDO_RESOLVED',
        winnerTeam: 1,
        points: 2,
        revealed: [{ playerId: 'p1', score: 33 }],
      },
      { type: 'POINTS', team: 1, points: 2, reason: 'ENVIDO' },
    ]);
    expect(querido.state.hand.envido.status).toBe('resolved');
    expect(querido.state.hand.envido.pending).toBeNull();
    expect(querido.state.hand.envido.result).toEqual({
      winnerTeam: 1,
      points: 2,
      accepted: true,
      revealed: [{ playerId: 'p1', score: 33 }],
    });
    // los puntos se suman en el momento y la mano vuelve a jugarse con el mismo turno
    expect(querido.state.scores).toEqual([0, 2]);
    expect(querido.state.phase).toBe('PLAYING');
    expect(querido.state.hand.turnId).toBe('p1');
    expect(querido.state.hand.tricks).toEqual([]);
  });

  it('el que pierde dice "son buenas": no se revela el puntaje de los que vienen después', () => {
    // manos invertidas: p1 (mano) tiene 25 y p0 33 → gana p0 (el que dice segundo)
    const manos: Record<PlayerId, string[]> = {
      p1: ['3-basto', '2-basto', '12-oro'],
      p0: ['7-espada', '6-espada', '4-copa'],
    };
    const querido = answerEnvido(callEnvido(match2p(1, manos), 'p1', 'E').state, 'p0', 'QUIERO').state;

    expect(querido.hand.envido.result).toEqual({
      winnerTeam: 0,
      points: 2,
      accepted: true,
      // el primero (p1, que perdió) dijo su puntaje; el ganador también se revela
      revealed: [
        { playerId: 'p1', score: 25 },
        { playerId: 'p0', score: 33 },
      ],
    });
    expect(querido.scores).toEqual([2, 0]);
  });

  it('[ENG-12] en empate gana el que dice antes (el más cercano al mano)', () => {
    const manos: Record<PlayerId, string[]> = {
      p1: ['3-basto', '2-basto', '12-oro'], // 25
      p0: ['1-oro', '4-oro', '7-copa'], // 25
    };
    const querido = answerEnvido(callEnvido(match2p(1, manos), 'p1', 'E').state, 'p0', 'QUIERO').state;

    expect(querido.hand.envido.result).toEqual({
      winnerTeam: 1, // p1 (mano) dice antes que p0
      points: 2,
      accepted: true,
      revealed: [{ playerId: 'p1', score: 25 }],
    });
    expect(querido.scores).toEqual([0, 2]);
  });

  it('[ENG-12] el desempate es del jugador más cercano al mano, no del equipo del mano ni del humano', () => {
    // mano p2 → participantes [p2, p3, p0, p1]; empatan p3 (equipo 1) y p0 (equipo 0, el humano)
    const manos: Record<PlayerId, string[]> = {
      p2: ['7-espada', '10-basto', '11-copa'], // 7
      p3: ['4-oro', '1-oro', '6-basto'], // 25
      p0: ['2-copa', '3-copa', '12-basto'], // 25 (empata con p3, pero dice después)
      p1: ['5-espada', '6-copa', '12-oro'], // 6
    };
    const state = createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: 1, deck: deckFor(manos, 2, 4) });
    expect(state.hand.participants).toEqual(['p2', 'p3', 'p0', 'p1']);

    // canta el mano p2 (equipo 0) y responde p3 (el primero del equipo 1 en el orden de la mano)
    const querido = answerEnvido(callEnvido(state, 'p2', 'E').state, 'p3', 'QUIERO').state;

    expect(querido.hand.envido.result).toEqual({
      winnerTeam: 1, // p3 dice antes que p0 con el mismo puntaje (y p0 es el humano)
      points: 2,
      accepted: true,
      revealed: [
        { playerId: 'p2', score: 7 },
        { playerId: 'p3', score: 25 },
      ],
    });
    expect(querido.scores).toEqual([0, 2]);
  });

  it('[ENG-17] cada participante se evalúa con sus propias cartas (en 4 y 6 jugadores)', () => {
    // mano p1 → participantes [p1, p2, p3, p0]; p2 (equipo 0) tiene el mejor envido
    const state = match4p(1);
    expect(state.hand.participants).toEqual(['p1', 'p2', 'p3', 'p0']);

    // responde p0: es el humano y está en el equipo contrario al que cantó
    const querido = answerEnvido(callEnvido(state, 'p1', 'E').state, 'p0', 'QUIERO').state;

    expect(querido.hand.envido.result).toEqual({
      winnerTeam: 0,
      points: 2,
      accepted: true,
      revealed: [
        { playerId: 'p1', score: 7 },
        { playerId: 'p2', score: 25 },
      ],
    });
    expect(querido.scores).toEqual([2, 0]);

    // con el mano en p2 el orden cambia y el ganador sigue siendo el mismo jugador
    const conManoEnP2 = answerEnvido(callEnvido(match4p(2), 'p2', 'E').state, 'p3', 'QUIERO').state;
    expect(conManoEnP2.hand.envido.result).toEqual({
      winnerTeam: 0,
      points: 2,
      accepted: true,
      revealed: [{ playerId: 'p2', score: 25 }],
    });
  });

  it('la cadena "dicha" es la que se paga: E-E-R querido = 7', () => {
    let state = match2p();
    state = callEnvido(state, 'p1', 'E').state;
    state = callEnvido(state, 'p0', 'E').state;
    state = callEnvido(state, 'p1', 'R').state;

    const querido = answerEnvido(state, 'p0', 'QUIERO').state;

    expect(querido.scores).toEqual([0, 7]);
    expect(querido.hand.cantos).toEqual([
      { kind: 'ENVIDO', by: 'p1', team: 1, answer: 'QUIERO' },
      { kind: 'ENVIDO', by: 'p0', team: 0, answer: 'QUIERO' },
      { kind: 'REAL_ENVIDO', by: 'p1', team: 1, answer: 'QUIERO' },
    ]);
  });
});

describe('ANSWER_ENVIDO NO_QUIERO (AC 7) [ENG-04]', () => {
  it('[ENG-04] paga el valor no querido al equipo del último que cantó', () => {
    const noQuerido = answerEnvido(callEnvido(match2p(), 'p1', 'E').state, 'p0', 'NO_QUIERO');

    expect(noQuerido.events).toEqual([
      { type: 'ENVIDO_ANSWERED', playerId: 'p0', answer: 'NO_QUIERO' },
      { type: 'ENVIDO_RESOLVED', winnerTeam: 1, points: 1, revealed: [] },
      { type: 'POINTS', team: 1, points: 1, reason: 'ENVIDO' },
    ]);
    expect(noQuerido.state.hand.envido.result).toEqual({
      winnerTeam: 1,
      points: 1,
      accepted: false,
      revealed: [],
    });
    expect(noQuerido.state.hand.envido.status).toBe('resolved');
    expect(noQuerido.state.scores).toEqual([0, 1]);
    expect(noQuerido.state.phase).toBe('PLAYING');
    expect(noQuerido.state.hand.turnId).toBe('p1'); // no cambia quién juega
    expect(noQuerido.state.hand.cantos).toEqual([{ kind: 'ENVIDO', by: 'p1', team: 1, answer: 'NO_QUIERO' }]);
  });

  it('[ENG-04] E-E no querido vale 2 y no suma la cadena entera', () => {
    let state = match2p();
    state = callEnvido(state, 'p1', 'E').state;
    state = callEnvido(state, 'p0', 'E').state;

    const noQuerido = answerEnvido(state, 'p1', 'NO_QUIERO').state;

    expect(noQuerido.scores).toEqual([2, 0]); // el último que cantó fue p0 (equipo 0)
    expect(noQuerido.hand.envido.result).toMatchObject({ winnerTeam: 0, points: 2, accepted: false });
  });

  it('[ENG-11] falta envido no querida: paga lo que valía la cadena sin el último canto', () => {
    // 0-0: la falta valdría 30, pero no querida la cadena E-E-R-F paga 7
    let state = match2p();
    state = callEnvido(state, 'p1', 'E').state;
    state = callEnvido(state, 'p0', 'E').state;
    state = callEnvido(state, 'p1', 'R').state;
    state = callEnvido(state, 'p0', 'F').state;

    const noQuerido = answerEnvido(state, 'p1', 'NO_QUIERO').state;

    expect(noQuerido.scores).toEqual([7, 0]);
    expect(noQuerido.hand.envido.result).toMatchObject({ winnerTeam: 0, points: 7, accepted: false });
  });
});

describe('fin de partida por envido (AC 9)', () => {
  it('si el envido lleva a 30, la partida termina en el acto y no se juega más', () => {
    const state = withScores(match2p(), [0, 28]);

    const fin = answerEnvido(callEnvido(state, 'p1', 'E').state, 'p0', 'QUIERO').state;

    expect(fin.phase).toBe('MATCH_OVER');
    expect(fin.winnerTeam).toBe(1);
    expect(fin.scores).toEqual([0, 30]); // tope
    expect(fin.hand.tricks).toEqual([]);
    expect(fin.hand.hands['p1']).toHaveLength(3); // no se jugó ninguna carta
    expect(fin.hand.envido.status).toBe('resolved');
    expect(getActor(fin)).toBeNull();
    expect(getLegalActions(fin, 'p1')).toEqual([]);
    expect(applyAction(fin, 'p1', { type: 'PLAY_CARD', cardId: '7-espada' })).toEqual({
      ok: false,
      error: 'MATCH_OVER',
    });
  });

  it('si el envido termina la partida con un truco pendiente, la fase queda en MATCH_OVER', () => {
    // p0 (mano) cantó truco; p1 lo esquiva con una falta envido que llega a 30
    const state = withScores(match2p(0), [0, 28]);
    const truco = callTruco(state, 'p0').state;

    const fin = answerEnvido(callEnvido(truco, 'p1', 'F').state, 'p0', 'QUIERO').state;

    expect(fin.phase).toBe('MATCH_OVER');
    expect(fin.winnerTeam).toBe(1); // p1 (equipo 1) tenía 33 de envido
    expect(fin.scores).toEqual([0, 30]);
    expect(fin.hand.truco.pending).not.toBeNull(); // el truco quedó sin responder: nada más es legal
    expect(getActor(fin)).toBeNull();
    expect(getLegalActions(fin, 'p1')).toEqual([]);
  });

  it('AC 10: al cerrarse la primera baza se cierra la ventana de envido', () => {
    const state = match2p();
    const primera = playTrick(state, { p1: '7-espada', p0: '3-basto' });

    expect(primera.state.hand.tricks).toHaveLength(1);
    expect(primera.state.phase).toBe('PLAYING');
    expect(getActor(primera.state)).toBe('p1'); // abre el que ganó
    expect(getLegalActions(primera.state, 'p1').some((action) => action.type === 'CALL_ENVIDO')).toBe(false);
    expect(applyAction(primera.state, 'p1', { type: 'CALL_ENVIDO', call: 'E' })).toEqual({
      ok: false,
      error: 'ILLEGAL_ACTION',
    });
  });
});
