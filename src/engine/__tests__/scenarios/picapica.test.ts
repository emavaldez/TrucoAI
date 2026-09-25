// Escenarios de pica-pica (historia 1-7, GDD §10) con mazo fijo.
// Mano 1: la cierra un mazo. Mano 2 (reparte p5, es mano p0) con marcador 10-10 → pica-pica.
// Pares: [p0,p3], [p1,p4], [p2,p5].

import { describe, expect, it } from 'vitest';
import { applyAction } from '../../apply.js';
import { getActor, getLegalActions } from '../../legal.js';
import { createMatch, startNextHand } from '../../match.js';
import { getObservation } from '../../observation.js';
import type { GameEvent, MatchState } from '../../types.js';
import {
  answerEnvido,
  answerTruco,
  callEnvido,
  callTruco,
  deckFor,
  goToMazo,
  ids,
  playTricks,
  withScores,
} from '../helpers.js';

const HANDS = {
  p0: ['1-espada', '1-basto', '7-espada'],
  p3: ['4-copa', '5-copa', '4-oro'],
  p1: ['3-espada', '3-basto', '3-oro'],
  p4: ['2-espada', '2-basto', '2-oro'],
  p2: ['7-oro', '12-copa', '11-copa'],
  p5: ['1-copa', '6-oro', '5-oro'],
};

/** Termina la mano 1 con un mazo, fija el marcador y arranca la mano 2 (pica-pica si corresponde). */
function picaPicaHand(scores: [number, number] = [10, 10]): { state: MatchState; events: GameEvent[] } {
  let state = createMatch({ rules: { playerCount: 6 }, seed: 3, firstDealerSeat: 4 });
  const mano = getActor(state);
  expect(mano).toBe('p5');
  state = goToMazo(state, 'p5').state;
  expect(state.phase).toBe('HAND_OVER');
  state = withScores(state, scores);
  return startNextHand(state, { deck: deckFor(HANDS, 0, 6) });
}

/** Juega las submanos 0 y 1 sin cantos: p0 gana la 0 (equipo 0), p1 gana la 1 (equipo 1). */
function playSubmanos01(state: MatchState): MatchState {
  let current = playTricks(state, { p0: '1-espada', p3: '4-copa' }, { p0: '1-basto', p3: '5-copa' }).state;
  current = playTricks(current, { p1: '3-espada', p4: '2-espada' }, { p1: '3-basto', p4: '2-basto' }).state;
  return current;
}

describe('pica-pica — activación y estructura (AC 1, 2)', () => {
  it('con 10-10 la mano es de pica-pica, con pares desde el mano y submano 0 en juego', () => {
    const { state, events } = picaPicaHand();
    expect(events[0]).toEqual({ type: 'HAND_STARTED', hand: 2, dealerId: 'p5', manoId: 'p0', picaPica: true });
    expect(events[1]).toEqual({ type: 'SUBMANO_STARTED', submano: 0, pair: ['p0', 'p3'] });
    expect(state.hand.picaPica?.pairs).toEqual([
      ['p0', 'p3'],
      ['p1', 'p4'],
      ['p2', 'p5'],
    ]);
    expect(state.hand.participants).toEqual(['p0', 'p3']);
    expect(getActor(state)).toBe('p0');
    // Se reparte a los 6 como siempre.
    for (const seat of state.seats) expect(state.hand.hands[seat.id]).toHaveLength(3);
  });

  it('con 0-0 (primera mano) nunca hay pica-pica', () => {
    const state = createMatch({ rules: { playerCount: 6 }, seed: 1 });
    expect(state.hand.picaPica).toBeNull();
    expect(state.picaPicaNext).toBe(true);
  });

  it('con la opción apagada o en 4 jugadores no hay pica-pica aunque el marcador esté en rango', () => {
    let off = createMatch({ rules: { playerCount: 6, picaPica: false }, seed: 3, firstDealerSeat: 4 });
    off = withScores(goToMazo(off, 'p5').state, [10, 10]);
    expect(startNextHand(off).state.hand.picaPica).toBeNull();

    let four = createMatch({ rules: { playerCount: 4 }, seed: 3, firstDealerSeat: 2 });
    four = withScores(goToMazo(four, getActor(four) as string).state, [10, 10]);
    expect(startNextHand(four).state.hand.picaPica).toBeNull();
  });
});

describe('pica-pica — submanos (AC 3, 4)', () => {
  it('tres submanos completas: los puntos de cada una se suman en el momento al equipo correcto', () => {
    let { state } = picaPicaHand();

    let played = playTricks(state, { p0: '1-espada', p3: '4-copa' }, { p0: '1-basto', p3: '5-copa' });
    state = played.state;
    expect(state.scores).toEqual([11, 10]);
    expect(played.events).toContainEqual({ type: 'SUBMANO_STARTED', submano: 1, pair: ['p1', 'p4'] });
    expect(state.phase).toBe('PLAYING');
    expect(getActor(state)).toBe('p1'); // IA vs IA: hay actor sin depender de la UI [UI-02]

    played = playTricks(state, { p1: '3-espada', p4: '2-espada' }, { p1: '3-basto', p4: '2-basto' });
    state = played.state;
    expect(state.scores).toEqual([11, 11]);
    expect(getActor(state)).toBe('p2');

    played = playTricks(state, { p2: '7-oro', p5: '1-copa' }, { p2: '12-copa', p5: '6-oro' });
    state = played.state;
    expect(state.scores).toEqual([12, 11]);
    expect(state.phase).toBe('HAND_OVER');
    expect(played.events).toContainEqual({ type: 'HAND_OVER', winnerTeam: 0, points: 3, reason: 'PICA_PICA' });

    const record = state.history[state.history.length - 1];
    expect(record.picaPica).toBe(true);
    expect(record.reason).toBe('PICA_PICA');
    expect(record.tricks).toHaveLength(6);
    expect(record.scoresAfter).toEqual([12, 11]);
    expect(state.hand.picaPica?.results.map((r) => [r.pair, r.winnerTeam, r.points])).toEqual([
      [['p0', 'p3'], 0, 1],
      [['p1', 'p4'], 1, 1],
      [['p2', 'p5'], 0, 1],
    ]);
  });

  it('un truco querido en la submano 0 paga 2 en esa submano [ENG-14]', () => {
    let { state } = picaPicaHand();
    state = callTruco(state, 'p0').state;
    expect(getActor(state)).toBe('p3'); // responde el rival del par, no otro
    state = answerTruco(state, 'p3', 'QUIERO').state;
    state = playTricks(state, { p0: '1-espada', p3: '4-copa' }, { p0: '1-basto', p3: '5-copa' }).state;
    expect(state.scores).toEqual([12, 10]);
    // La submano siguiente arranca sin truco.
    expect(state.hand.truco).toEqual({ level: 0, pending: null, quieroTeam: null });
  });

  it('un "no quiero" en la submano 1 no termina la mano: la submano 2 se juega', () => {
    let { state } = picaPicaHand();
    state = playTricks(state, { p0: '1-espada', p3: '4-copa' }, { p0: '1-basto', p3: '5-copa' }).state;
    state = callTruco(state, 'p1').state;
    const answered = answerTruco(state, 'p4', 'NO_QUIERO');
    state = answered.state;
    expect(state.scores).toEqual([11, 11]);
    expect(state.phase).toBe('PLAYING');
    expect(answered.events).toContainEqual({ type: 'SUBMANO_STARTED', submano: 2, pair: ['p2', 'p5'] });
    expect(getActor(state)).toBe('p2');
  });

  it('irse al mazo en la submano 0 termina solo esa submano', () => {
    let { state } = picaPicaHand();
    state = goToMazo(state, 'p0').state;
    expect(state.scores).toEqual([10, 11]);
    expect(state.hand.picaPica?.submano).toBe(1);
    expect(getActor(state)).toBe('p1');
  });

  it('la falta envido en una submano vale 7', () => {
    let { state } = picaPicaHand([20, 12]);
    state = callEnvido(state, 'p0', 'F').state;
    state = answerEnvido(state, 'p3', 'QUIERO').state;
    // p0: 28 (1 y 7 de espada) · p3: 29 (4 y 5 de copa) → gana el equipo 1.
    expect(state.scores).toEqual([20, 19]);
  });

  it('el envido de la submano se dice solo entre los dos del par', () => {
    let { state } = playSubmanos01Wrap();
    state = callEnvido(state, 'p2', 'E').state;
    const resolved = answerEnvido(state, 'p5', 'QUIERO');
    const envidoEvent = resolved.events.find((e) => e.type === 'ENVIDO_RESOLVED');
    expect(envidoEvent).toBeDefined();
    if (envidoEvent?.type !== 'ENVIDO_RESOLVED') return;
    for (const entry of envidoEvent.revealed) expect(['p2', 'p5']).toContain(entry.playerId);
  });

  function playSubmanos01Wrap(): { state: MatchState } {
    return { state: playSubmanos01(picaPicaHand().state) };
  }

  it('el humano solo actúa en su submano: en las otras no tiene acciones', () => {
    let { state } = picaPicaHand();
    state = playTricks(state, { p0: '1-espada', p3: '4-copa' }, { p0: '1-basto', p3: '5-copa' }).state;
    expect(getLegalActions(state, 'p0')).toEqual([]);
    const obs = getObservation(state, 'p0');
    // Las cartas jugadas en la submano 0 ya no están entre las no vistas.
    expect(ids(obs.unseenCards)).not.toContain('4-copa');
    expect(ids(obs.unseenCards)).not.toContain('5-copa');
  });

  it('una baza sin terminar (no quiero) cuenta como cartas vistas', () => {
    let { state } = picaPicaHand();
    let result = applyAction(state, 'p0', { type: 'PLAY_CARD', cardId: '7-espada' });
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    state = callTruco(state, 'p3').state;
    state = answerTruco(state, 'p0', 'NO_QUIERO').state;
    expect(state.hand.picaPica?.results[0].openPlays.map((p) => p.card.id)).toEqual(['7-espada']);
    expect(ids(getObservation(state, 'p1').unseenCards)).not.toContain('7-espada');
    result = applyAction(state, 'p1', { type: 'PLAY_CARD', cardId: '3-oro' });
    expect(result.ok).toBe(true);
  });
});

describe('pica-pica — ganador de la mano', () => {
  it('cuenta también el envido: gana la mano el equipo que más sumó en total', () => {
    let { state } = picaPicaHand([10, 10]);
    // Submano 0: falta envido querido (vale 7) que gana el equipo 1 (p3 tiene 29), y la submano la gana p0.
    state = callEnvido(state, 'p0', 'F').state;
    state = answerEnvido(state, 'p3', 'QUIERO').state;
    state = playTricks(state, { p0: '1-espada', p3: '4-copa' }, { p0: '1-basto', p3: '5-copa' }).state;
    state = playTricks(state, { p1: '3-espada', p4: '2-espada' }, { p1: '3-basto', p4: '2-basto' }).state;
    const last = playTricks(state, { p2: '7-oro', p5: '1-copa' }, { p2: '12-copa', p5: '6-oro' });
    // Submanos: equipo 0 ganó 2 (1+1), equipo 1 ganó 1 (1) + 7 de envido = 8 → la mano es del equipo 1.
    expect(last.state.scores).toEqual([12, 18]);
    expect(last.events).toContainEqual({ type: 'HAND_OVER', winnerTeam: 1, points: 10, reason: 'PICA_PICA' });
  });
});

describe('pica-pica — fin de partida y alternancia (AC 1, 5)', () => {
  it('si un equipo llega a 30 en una submano, la partida termina en el acto', () => {
    let { state } = picaPicaHand();
    state = withScores(state, [29, 10]);
    const played = playTricks(state, { p0: '1-espada', p3: '4-copa' }, { p0: '1-basto', p3: '5-copa' });
    state = played.state;
    expect(state.phase).toBe('MATCH_OVER');
    expect(state.winnerTeam).toBe(0);
    expect(state.scores).toEqual([30, 10]);
    expect(played.events.filter((e) => e.type === 'SUBMANO_STARTED')).toHaveLength(0);
    expect(state.history[state.history.length - 1].reason).toBe('MATCH_ENDED');
  });

  it('alterna pica-pica y redonda mientras el marcador siga en rango; fuera de rango vuelve a redonda', () => {
    let { state } = picaPicaHand();
    expect(state.hand.picaPica).not.toBeNull();
    state = playSubmanos01(state);
    state = playTricks(state, { p2: '7-oro', p5: '1-copa' }, { p2: '12-copa', p5: '6-oro' }).state;
    expect(state.phase).toBe('HAND_OVER');

    // Mano 3: redonda (alternancia). Reparte p0.
    let next = startNextHand(state);
    expect(next.state.hand.dealerId).toBe('p0');
    expect(next.state.hand.picaPica).toBeNull();
    expect(next.events[0]).toMatchObject({ type: 'HAND_STARTED', picaPica: false });
    state = goToMazo(next.state, getActor(next.state) as string).state;
    const afterRedonda = state;

    // Mano 4: vuelve el pica-pica. Reparte p1 (el repartidor rota igual).
    next = startNextHand(state);
    expect(next.state.hand.dealerId).toBe('p1');
    expect(next.state.hand.picaPica).not.toBeNull();
    expect(next.state.hand.picaPica?.pairs[0]).toEqual(['p2', 'p5']);

    // Fuera de rango (26 puntos): redonda, y la próxima elegible vuelve a ser pica-pica.
    const out = withScores(afterRedonda, [26, 12]);
    const redonda = startNextHand(out);
    expect(redonda.state.hand.picaPica).toBeNull();
    expect(redonda.state.picaPicaNext).toBe(true);
  });
});
