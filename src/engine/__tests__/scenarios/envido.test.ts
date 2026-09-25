// Escenarios de envido (AC 11): mazo fijo, 2 y 4 jugadores, todo jugado con acciones reales.
// Cada fila de la tabla de puntos (AC 5) se juega de punta a punta y se verifica el marcador:
// los tantos del envido se cobran en el momento, no al cerrar la mano.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../../apply.js';
import { getActor, getLegalActions } from '../../legal.js';
import { createMatch } from '../../match.js';
import type { EnvidoCall, MatchState, PlayerId, TeamId } from '../../types.js';
import { answerEnvido, answerTruco, callEnvido, callTruco, deckFor, playTrick, seatOf, untilTurnOf, withScores } from '../helpers.js';

/** Manos fijas de 2 jugadores: p1 (mano, equipo 1) tiene 33 de envido y gana las dos primeras bazas. */
const MANOS: Record<PlayerId, string[]> = {
  p1: ['7-espada', '6-espada', '4-copa'],
  // p0 tiene 25 de envido (4+5 de oro) y pierde las dos bazas con sus cartas más bajas
  p0: ['4-oro', '5-oro', '4-copa'],
};

/** Partida de 2 jugadores con mazo fijo y el mano en `manoSeat` (repartidor = manoSeat + 1). */
function match2p(manoSeat = 1): MatchState {
  return createMatch({
    rules: { playerCount: 2 },
    seed: 1,
    firstDealerSeat: (manoSeat + 1) % 2,
    deck: deckFor(MANOS, manoSeat, 2),
  });
}

/** Equipo del jugador en estas partidas de 2: se asigna por asiento. */
const teamOfPlayer = (playerId: PlayerId): TeamId => (seatOf(playerId) % 2) as TeamId;

/** Marcador esperado después de que `team` cobre `points`. */
function marcador(team: TeamId, points: number): [number, number] {
  return team === 0 ? [points, 0] : [0, points];
}

describe('tabla de puntos de punta a punta (AC 5, AC 11)', () => {
  /** Falta envido a 0-0: el que va ganando (0) está en las malas y el ganador llega a 30. */
  const FALTA = 30;
  /** El primero en "decir" es el mano p1; los cantos de la cadena se alternan p1, p0, p1, p0… */
  const ORDEN: PlayerId[] = ['p1', 'p0'];

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

  /** Último de la cadena: el que cantó el último canto. */
  const lastCaller = (chain: readonly EnvidoCall[]): PlayerId => ORDEN[(chain.length - 1) % 2];

  /** El que tiene que contestar el último canto. */
  const answerer = (chain: readonly EnvidoCall[]): PlayerId => ORDEN[chain.length % 2];

  /** Canta la cadena completa con acciones reales, en el orden de turno del motor. */
  function cantarCadena(state: MatchState, chain: readonly EnvidoCall[]): MatchState {
    let current = state;
    chain.forEach((call, index) => {
      const who = ORDEN[index % 2];
      expect(getActor(current), `le toca cantar a ${who}`).toBe(who);
      const result = applyAction(current, who, { type: 'CALL_ENVIDO', call });
      expect(result.ok, `${who} no pudo cantar ${call}`).toBe(true);
      if (!result.ok) throw new Error(result.error);
      current = result.state;
      expect(current.phase).toBe('AWAITING_ENVIDO');
      expect(current.hand.envido.pending, `pendiente tras ${call}`).toEqual({
        responderId: answerer(chain.slice(0, index + 1)),
      });
    });
    return current;
  }

  for (const row of TABLA) {
    const nombre = row.chain.join('-');
    const querido = row.querido === 'FALTA' ? FALTA : row.querido;

    it(`${nombre} querido → ${querido} para el equipo 1 (el mejor envido de p1)`, () => {
      const conCadena = cantarCadena(match2p(), row.chain);
      // a 0-0 la falta envido vale 30: el que la gana llega al objetivo y la partida se termina
      const cierraLaPartida = querido >= 30;

      const { state, events } = answerEnvido(conCadena, answerer(row.chain), 'QUIERO');

      expect(events.slice(0, 3)).toMatchObject([
        { type: 'ENVIDO_ANSWERED', playerId: answerer(row.chain), answer: 'QUIERO' },
        {
          type: 'ENVIDO_RESOLVED',
          winnerTeam: 1,
          points: querido,
          revealed: [{ playerId: 'p1', score: 33 }],
        },
        { type: 'POINTS', team: 1, points: querido, reason: 'ENVIDO' },
      ]);
      expect(state.scores).toEqual(marcador(1, querido));
      expect(state.hand.envido.chain.map((canto) => canto.call)).toEqual(row.chain);
      // el canto querido queda con su respuesta y el pendiente se limpia
      expect(state.hand.cantos.filter((canto) => canto.kind !== 'TRUCO').every((canto) => canto.answer !== undefined)).toBe(true);
      expect(state.hand.envido).toMatchObject({
        status: 'resolved',
        pending: null,
        result: { winnerTeam: 1, points: querido, accepted: true },
      });

      if (cierraLaPartida) {
        expect(events.at(-1)).toEqual({ type: 'MATCH_OVER', winnerTeam: 1, scores: [0, 30] });
        expect(state.phase).toBe('MATCH_OVER');
        expect(getActor(state)).toBeNull();
        expect(getLegalActions(state, 'p1')).toEqual([]);
        return;
      }

      // la mano sigue jugándose en el mismo turno y sin bazas jugadas
      expect(state.phase).toBe('PLAYING');
      expect(state.hand.turnId).toBe('p1');
      expect(state.hand.tricks).toEqual([]);
      expect(getLegalActions(state, 'p1')).toEqual([
        { type: 'CALL_TRUCO' },
        // el mazo de la 1-5 (AC 1)
        { type: 'MAZO' },
        ...state.hand.hands['p1'].map((card) => ({ type: 'PLAY_CARD' as const, cardId: card.id })),
      ]);
    });

    it(`${nombre} no querido → ${row.noQuerido} para el equipo del último que cantó`, () => {
      const conCadena = cantarCadena(match2p(), row.chain);
      const ultimo = lastCaller(row.chain);
      const team = teamOfPlayer(ultimo);

      const { state, events } = answerEnvido(conCadena, answerer(row.chain), 'NO_QUIERO');

      expect(events).toMatchObject([
        { type: 'ENVIDO_ANSWERED', playerId: answerer(row.chain), answer: 'NO_QUIERO' },
        { type: 'ENVIDO_RESOLVED', winnerTeam: team, points: row.noQuerido, revealed: [] },
        { type: 'POINTS', team, points: row.noQuerido, reason: 'ENVIDO' },
      ]);
      expect(state.scores).toEqual(marcador(team, row.noQuerido));
      expect(state.hand.envido.result).toMatchObject({
        winnerTeam: team,
        points: row.noQuerido,
        accepted: false,
        revealed: [],
      });
      expect(state.phase).toBe('PLAYING');
      expect(state.hand.turnId).toBe('p1');
    });
  }

  it('los puntos del envido quedan en el marcador y la mano los suma aparte', () => {
    // E querido: 2 para el equipo 1 antes de jugar ninguna carta
    const conEnvido = answerEnvido(callEnvido(match2p(), 'p1', 'E').state, 'p0', 'QUIERO').state;
    expect(conEnvido.scores).toEqual([0, 2]);

    // p1 gana la primera y la segunda baza con su 7 y su 6 de espada
    const primera = playTrick(conEnvido, { p1: '7-espada', p0: '4-oro' });
    expect(primera.state.scores).toEqual([0, 2]);

    const segunda = playTrick(primera.state, { p1: '6-espada', p0: '5-oro' });

    expect(segunda.state.phase).toBe('HAND_OVER');
    expect(segunda.state.scores).toEqual([0, 3]); // 2 de envido + 1 de la mano
    expect(segunda.state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'BAZAS' });
    expect(segunda.events.at(-1)).toEqual({ type: 'HAND_OVER', winnerTeam: 1, points: 1, reason: 'BAZAS' });
    // el envido no se volvió a pagar al cerrar la mano
    expect(segunda.events.filter((event) => event.type === 'POINTS').map((event) => event.reason)).toEqual(['MANO']);
  });
});

describe('empate de envido en 4 jugadores (AC 11) [ENG-12]', () => {
  const MANOS_4P: Record<PlayerId, string[]> = {
    p0: ['7-copa', '10-basto', '11-oro'], // 7 (mano, equipo 0)
    p1: ['4-espada', '1-espada', '6-copa'], // 25 (equipo 1)
    p2: ['2-oro', '3-oro', '12-basto'], // 25 (equipo 0)
    p3: ['6-basto', '5-oro', '11-copa'], // 6 (equipo 1)
  };

  it('[ENG-12] con el mano p0 gana el equipo 1: p1 dice antes que p2 con el mismo puntaje', () => {
    // firstDealerSeat 3 → mano p0
    const state = createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: 3, deck: deckFor(MANOS_4P, 0, 4) });
    expect(state.hand.participants).toEqual(['p0', 'p1', 'p2', 'p3']);

    // Canta el pie del equipo 0 (p2) y responde el pie del equipo 1 (p3).
    const conCadena = callEnvido(untilTurnOf(state, 'p2'), 'p2', 'E').state;
    expect(getActor(conCadena)).toBe('p3');

    const { state: fin, events } = answerEnvido(conCadena, 'p3', 'QUIERO');

    // p1 (equipo 1, 25) dice antes que p2 (equipo 0, 25): gana el equipo 1
    expect(events[1]).toMatchObject({
      type: 'ENVIDO_RESOLVED',
      winnerTeam: 1,
      points: 2,
      revealed: [
        { playerId: 'p0', score: 7 },
        { playerId: 'p1', score: 25 },
      ],
    });
    expect(fin.scores).toEqual([0, 2]);
    expect(fin.hand.envido.result?.winnerTeam).toBe(1);
    // el que empata y dice después no se revela
    expect(fin.hand.envido.result?.revealed.map((saying) => saying.playerId)).toEqual(['p0', 'p1']);
  });
});

describe('"el envido está primero" de punta a punta (AC 3, AC 11) [UI-05]', () => {
  it('[UI-05] p0 canta truco, p1 canta envido, p0 quiere, se resuelve y p1 sigue debiendo el truco', () => {
    // mano p0 para que el truco lo cante el primero en jugar
    const state = match2p(0);

    const conTruco = callTruco(state, 'p0');
    expect(conTruco.state.phase).toBe('AWAITING_TRUCO');

    // p1 no responde el truco: canta envido (o real o falta)
    expect(getLegalActions(conTruco.state, 'p1').filter((action) => action.type === 'CALL_ENVIDO')).toEqual([
      { type: 'CALL_ENVIDO', call: 'E' },
      { type: 'CALL_ENVIDO', call: 'R' },
      { type: 'CALL_ENVIDO', call: 'F' },
    ]);

    const conEnvido = callEnvido(conTruco.state, 'p1', 'E');
    expect(conEnvido.state.phase).toBe('AWAITING_ENVIDO');
    expect(conEnvido.state.hand.envido.resumeTrucoAfter).toBe(true);

    // p0 (el que cantó el truco) responde el envido: gana p1 con 33
    const resuelto = answerEnvido(conEnvido.state, 'p0', 'QUIERO');

    expect(resuelto.state.scores).toEqual([0, 2]); // los tantos del envido, ya cobrados
    expect(resuelto.state.phase).toBe('AWAITING_TRUCO'); // vuelve al truco pendiente
    expect(resuelto.state.hand.truco.pending).toEqual({ level: 1, callerId: 'p0', callerTeam: 0, responderId: 'p1' });
    expect(getActor(resuelto.state)).toBe('p1');

    // y p1 sigue teniendo que contestar el truco: ahora sí lo quiere
    const trucoQuerido = answerTruco(resuelto.state, 'p1', 'QUIERO');

    expect(trucoQuerido.state.phase).toBe('PLAYING');
    expect(trucoQuerido.state.hand.truco).toMatchObject({ level: 1, quieroTeam: 1, pending: null });
    expect(trucoQuerido.state.scores).toEqual([0, 2]);
    // el historial de la mano guarda los dos cantos con sus respuestas
    expect(trucoQuerido.state.hand.cantos).toEqual([
      { kind: 'TRUCO', by: 'p0', team: 0, answer: 'QUIERO' },
      { kind: 'ENVIDO', by: 'p1', team: 1, answer: 'QUIERO' },
    ]);

    // la mano arranca de cero en bazas y sigue el turno del mano
    expect(trucoQuerido.state.hand.tricks).toEqual([]);
    expect(getActor(trucoQuerido.state)).toBe('p0');
  });

  it('la falta envido delante de un truco también vuelve al truco (y vale la falta)', () => {
    const state = withScores(match2p(0), [10, 20]); // el que va ganando es el equipo 1 → falta 10
    const conTruco = callTruco(state, 'p0').state;

    const resuelto = answerEnvido(callEnvido(conTruco, 'p1', 'F').state, 'p0', 'QUIERO').state;

    expect(resuelto.scores).toEqual([10, 30]); // 20 + 10 = 30: la partida se termina con el envido
    expect(resuelto.phase).toBe('MATCH_OVER');
    expect(resuelto.winnerTeam).toBe(1);
    expect(resuelto.hand.envido.result).toMatchObject({ winnerTeam: 1, points: 10, accepted: true });
    // el truco quedó sin responder y no hay más acciones legales
    expect(resuelto.hand.truco.pending).not.toBeNull();
    expect(getActor(resuelto)).toBeNull();
  });
});

describe('cierre de la ventana y fin de partida (AC 10, AC 11)', () => {
  it('[ENG-13] después de un truco querido no hay envido y la mano paga el truco', () => {
    const querido = answerTruco(callTruco(match2p(), 'p1').state, 'p0', 'QUIERO').state;

    expect(getLegalActions(querido, 'p1').some((action) => action.type === 'CALL_ENVIDO')).toBe(false);
    expect(applyAction(querido, 'p1', { type: 'CALL_ENVIDO', call: 'E' })).toEqual({ ok: false, error: 'ILLEGAL_ACTION' });
    expect(querido.hand.envido.status).toBe('none');
    expect(querido.hand.envido.chain).toEqual([]);

    // p1 gana las dos primeras bazas: la mano vale lo del truco querido (2)
    const primera = playTrick(querido, { p1: '7-espada', p0: '4-oro' });
    const segunda = playTrick(primera.state, { p1: '6-espada', p0: '5-oro' });

    expect(segunda.state.scores).toEqual([0, 2]);
    expect(segunda.state.hand.result).toEqual({ winnerTeam: 1, points: 2, reason: 'BAZAS' });
  });

  it('AC 10: cerrada la primera baza, el envido ya no se puede cantar', () => {
    const primera = playTrick(match2p(), { p1: '7-espada', p0: '4-oro' });

    expect(primera.state.hand.tricks).toHaveLength(1);
    expect(getActor(primera.state)).toBe('p1'); // abre el que ganó la baza
    expect(getLegalActions(primera.state, 'p1').some((action) => action.type === 'CALL_ENVIDO')).toBe(false);
    expect(applyAction(primera.state, 'p1', { type: 'CALL_ENVIDO', call: 'F' })).toEqual({
      ok: false,
      error: 'ILLEGAL_ACTION',
    });
    // y no queda ningún canto de envido en el historial
    expect(primera.state.hand.envido.status).toBe('none');
  });

  it('AC 9: el envido que lleva a 30 termina la partida en el acto', () => {
    const state = withScores(match2p(), [0, 28]);
    const conCadena = callEnvido(state, 'p1', 'E').state;

    const { state: fin, events } = answerEnvido(conCadena, 'p0', 'QUIERO');

    expect(fin.scores).toEqual([0, 30]);
    expect(fin.phase).toBe('MATCH_OVER');
    expect(fin.winnerTeam).toBe(1);
    expect(events.at(-1)).toEqual({ type: 'MATCH_OVER', winnerTeam: 1, scores: [0, 30] });

    // el resto de la mano no se juega: nadie tiene cartas jugadas y no hay más acciones
    expect(fin.hand.tricks).toEqual([]);
    expect(fin.hand.hands['p1']).toHaveLength(3);
    expect(getActor(fin)).toBeNull();
    expect(getLegalActions(fin, 'p1')).toEqual([]);
    expect(applyAction(fin, 'p1', { type: 'PLAY_CARD', cardId: '7-espada' })).toEqual({
      ok: false,
      error: 'MATCH_OVER',
    });
    // la mano no se cierra como mano jugada (no hay `HAND_OVER` ni `hand.result`), pero la
    // 1-5 [UI-16] la deja igual en el historial: `MATCH_ENDED`, 0 puntos y sus cantos (AC 5)
    expect(fin.hand.result).toBeNull();
    expect(fin.history).toEqual([
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
