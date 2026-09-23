// Escenarios completos de mano — AC 8: mazo fijo, 2 y 4 jugadores.
// Todo se juega con `applyAction`/`startNextHand`: las manos se cierran por bazas,
// sin forzar fases a mano.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../../apply.js';
import { getActor, getLegalActions } from '../../legal.js';
import { createMatch, startNextHand } from '../../match.js';
import type { MatchState, PlayerId } from '../../types.js';
import { deckFor, playTrick, playTricks, withScores } from '../helpers.js';

/** Partida de 2 jugadores con mazo fijo. Con repartidor p0 el mano es p1 (equipo 1). */
function match2p(hands: Record<PlayerId, string[]>, firstDealerSeat = 0): MatchState {
  return createMatch({
    rules: { playerCount: 2 },
    seed: 1,
    firstDealerSeat,
    deck: deckFor(hands, (firstDealerSeat + 1) % 2, 2),
  });
}

/** Partida de 4 jugadores con mazo fijo: repartidor p0 → mano p1. Equipos: p1/p3 = 1, p2/p0 = 0. */
function match4p(hands: Record<PlayerId, string[]>): MatchState {
  return createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: 0, deck: deckFor(hands, 1, 4) });
}

describe('manos de 2 jugadores', () => {
  it('mano ganada 2-0: se decide en la 2ª y vale 1 punto', () => {
    const state = match2p({ p1: ['1-espada', '7-espada', '4-copa'], p0: ['3-basto', '5-copa', '12-oro'] });

    const primera = playTrick(state, { p1: '1-espada', p0: '3-basto' });
    expect(primera.state.hand.tricks[0]).toMatchObject({ winnerTeam: 1, winnerPlayerId: 'p1', leaderId: 'p1' });
    expect(primera.state.phase).toBe('PLAYING');
    expect(getActor(primera.state)).toBe('p1'); // abre el ganador

    const segunda = playTrick(primera.state, { p1: '7-espada', p0: '5-copa' });

    expect(segunda.state.phase).toBe('HAND_OVER');
    expect(segunda.state.hand.tricks).toHaveLength(2);
    expect(segunda.state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'BAZAS' });
    expect(segunda.state.scores).toEqual([0, 1]);
    expect(segunda.state.history[0]).toMatchObject({
      number: 1,
      dealerId: 'p0',
      manoId: 'p1',
      picaPica: false,
      winnerTeam: 1,
      points: 1,
      reason: 'BAZAS',
      scoresAfter: [0, 1],
    });
    expect(segunda.state.history[0].tricks).toHaveLength(2);
    expect(segunda.state.history[0].cantos).toEqual([]);
    expect(getActor(segunda.state)).toBeNull();
    expect(getLegalActions(segunda.state, 'p1')).toEqual([]);
  });

  it('mano 1-1: la define la 3ª baza', () => {
    const state = match2p({ p1: ['1-espada', '4-copa', '7-espada'], p0: ['3-basto', '2-oro', '5-copa'] });

    const primera = playTrick(state, { p1: '1-espada', p0: '3-basto' }); // X, equipo 1
    const segunda = playTrick(primera.state, { p1: '4-copa', p0: '2-oro' }); // Y, equipo 0
    expect(segunda.state.hand.tricks.map((trick) => trick.winnerTeam)).toEqual([1, 0]);
    expect(segunda.state.phase).toBe('PLAYING');
    expect(getActor(segunda.state)).toBe('p0'); // abre el ganador de la 2ª

    const tercera = playTrick(segunda.state, { p0: '5-copa', p1: '7-espada' }); // X

    expect(tercera.state.hand.tricks.map((trick) => trick.winnerTeam)).toEqual([1, 0, 1]);
    expect(tercera.state.phase).toBe('HAND_OVER');
    expect(tercera.state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'BAZAS' });
    expect(tercera.state.history[0].tricks).toHaveLength(3);
  });

  it('parda en la 1ª: la define la 2ª y la abre el mismo líder [ENG-07]', () => {
    const state = match2p({ p1: ['3-basto', '1-espada', '4-copa'], p0: ['3-oro', '12-oro', '5-copa'] });

    const primera = playTrick(state, { p1: '3-basto', p0: '3-oro' });
    expect(primera.state.hand.tricks[0]).toMatchObject({ winnerTeam: 'PARDA', winnerPlayerId: null, leaderId: 'p1' });
    expect(primera.state.hand.currentTrick).toEqual({ leaderId: 'p1', plays: [] });
    expect(primera.state.hand.turnId).toBe('p1');
    expect(getActor(primera.state)).toBe('p1');

    const segunda = playTrick(primera.state, { p1: '1-espada', p0: '12-oro' });

    expect(segunda.state.phase).toBe('HAND_OVER');
    expect(segunda.state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'BAZAS' }); // X P → X
  });

  it('X-P: la mano termina en la 2ª baza', () => {
    const state = match2p({ p1: ['1-espada', '3-basto', '4-copa'], p0: ['12-oro', '3-oro', '5-copa'] });

    const primera = playTrick(state, { p1: '1-espada', p0: '12-oro' }); // X
    const segunda = playTrick(primera.state, { p1: '3-basto', p0: '3-oro' }); // P

    expect(segunda.state.hand.tricks.map((trick) => trick.winnerTeam)).toEqual([1, 'PARDA']);
    expect(segunda.state.phase).toBe('HAND_OVER');
    expect(segunda.state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'BAZAS' });
    expect(segunda.state.hand.hands['p1']).toHaveLength(1); // queda una carta sin jugar
    expect(segunda.state.hand.hands['p0']).toHaveLength(1);
  });

  it('P-P-P: gana el equipo del mano, de cualquier lado que esté', () => {
    const manos = { p1: ['3-basto', '3-copa', '2-basto'], p0: ['3-espada', '3-oro', '2-espada'] };

    const manoP1 = playTricks(
      match2p(manos),
      { p1: '3-basto', p0: '3-espada' },
      { p1: '3-copa', p0: '3-oro' },
      { p1: '2-basto', p0: '2-espada' },
    );
    expect(manoP1.state.hand.tricks.map((trick) => trick.winnerTeam)).toEqual(['PARDA', 'PARDA', 'PARDA']);
    expect(manoP1.state.hand.manoId).toBe('p1');
    expect(manoP1.state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'BAZAS' });

    const manoP0 = playTricks(
      match2p(manos, 1),
      { p0: '3-espada', p1: '3-basto' },
      { p0: '3-oro', p1: '3-copa' },
      { p0: '2-espada', p1: '2-basto' },
    );
    expect(manoP0.state.hand.tricks.map((trick) => trick.winnerTeam)).toEqual(['PARDA', 'PARDA', 'PARDA']);
    expect(manoP0.state.hand.manoId).toBe('p0');
    expect(manoP0.state.hand.result).toEqual({ winnerTeam: 0, points: 1, reason: 'BAZAS' });
  });
});

describe('manos de 4 jugadores', () => {
  it('dos cartas de igual rango del mismo equipo no es parda: gana ese equipo', () => {
    const state = match4p({
      p1: ['4-copa', '7-espada', '1-basto'],
      p2: ['3-espada', '4-oro', '5-oro'],
      p3: ['5-copa', '6-oro', '11-oro'],
      p0: ['3-copa', '12-oro', '2-copa'],
    });

    const primera = playTrick(state, { p1: '4-copa', p2: '3-espada', p3: '5-copa', p0: '3-copa' });

    expect(primera.state.hand.tricks[0]).toMatchObject({ winnerTeam: 0, winnerPlayerId: 'p2', leaderId: 'p1' });
    expect(primera.state.hand.turnId).toBe('p2'); // abre el primero del equipo ganador
    expect(getActor(primera.state)).toBe('p2');
  });

  it('el mismo rango máximo repartido entre equipos es parda y la abre el mismo líder [ENG-07]', () => {
    const state = match4p({
      p1: ['3-basto', '7-espada', '4-copa'],
      p2: ['3-oro', '12-oro', '5-oro'],
      p3: ['4-espada', '6-oro', '11-oro'],
      p0: ['2-espada', '2-oro', '5-copa'],
    });

    const primera = playTrick(state, { p1: '3-basto', p2: '3-oro', p3: '4-espada', p0: '2-espada' });

    expect(primera.state.hand.tricks[0]).toMatchObject({ winnerTeam: 'PARDA', winnerPlayerId: null, leaderId: 'p1' });
    expect(primera.state.hand.currentTrick).toEqual({ leaderId: 'p1', plays: [] });
    expect(primera.state.hand.turnId).toBe('p1');
    expect(getActor(primera.state)).toBe('p1');
  });

  it('mano de 4 que se decide en la 3ª baza (1-0-1 para el equipo 1)', () => {
    const state = match4p({
      p1: ['1-espada', '4-oro', '7-espada'],
      p2: ['4-copa', '1-basto', '6-copa'],
      p3: ['5-copa', '12-oro', '5-oro'],
      p0: ['2-copa', '6-oro', '7-copa'],
    });

    const primera = playTrick(state, { p1: '1-espada', p2: '4-copa', p3: '5-copa', p0: '2-copa' });
    expect(primera.state.hand.tricks[0]).toMatchObject({ winnerTeam: 1, winnerPlayerId: 'p1' });

    const segunda = playTrick(primera.state, { p1: '4-oro', p2: '1-basto', p3: '12-oro', p0: '6-oro' });
    expect(segunda.state.hand.tricks[1]).toMatchObject({ winnerTeam: 0, winnerPlayerId: 'p2' });
    expect(segunda.state.phase).toBe('PLAYING');

    const tercera = playTrick(segunda.state, { p2: '6-copa', p3: '5-oro', p0: '7-copa', p1: '7-espada' });

    expect(tercera.state.hand.tricks.map((trick) => trick.winnerTeam)).toEqual([1, 0, 1]);
    expect(tercera.state.phase).toBe('HAND_OVER');
    expect(tercera.state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'BAZAS' });
    expect(tercera.state.scores).toEqual([0, 1]);
    expect(tercera.state.history[0].tricks).toHaveLength(3);
  });
});

describe('encadenar manos', () => {
  const MANOS: Record<PlayerId, string[]> = { p1: ['1-espada', '7-espada', '4-copa'], p0: ['3-basto', '5-copa', '12-oro'] };
  const MANO_SEAT = (dealerSeat: number): number => (dealerSeat + 1) % 2;

  it('3 manos con startNextHand: rota el mano/repartidor y el marcador sube 1 por mano', () => {
    let state = createMatch({
      rules: { playerCount: 2 },
      seed: 1,
      firstDealerSeat: 0,
      deck: deckFor(MANOS, MANO_SEAT(0), 2),
    });
    const manos: PlayerId[] = [state.hand.manoId];
    const repartidores: PlayerId[] = [state.hand.dealerId];

    const mano1 = playTricks(state, { p1: '1-espada', p0: '3-basto' }, { p1: '7-espada', p0: '5-copa' });
    expect(mano1.state.phase).toBe('HAND_OVER');
    expect(mano1.state.scores).toEqual([0, 1]);

    const reparto2 = startNextHand(mano1.state, { deck: deckFor(MANOS, MANO_SEAT(1), 2) });
    state = reparto2.state;
    manos.push(state.hand.manoId);
    repartidores.push(state.hand.dealerId);
    expect(state.phase).toBe('PLAYING');
    expect(state.hand.number).toBe(2);
    expect(state.scores).toEqual([0, 1]); // repartir no toca el marcador
    expect(reparto2.events).toEqual([{ type: 'HAND_STARTED', hand: 2, dealerId: 'p1', manoId: 'p0', picaPica: false }]);

    const mano2 = playTricks(state, { p0: '3-basto', p1: '1-espada' }, { p1: '7-espada', p0: '5-copa' });
    expect(mano2.state.hand.manoId).toBe('p0');
    expect(mano2.state.scores).toEqual([0, 2]);

    const reparto3 = startNextHand(mano2.state, { deck: deckFor(MANOS, MANO_SEAT(0), 2) });
    state = reparto3.state;
    manos.push(state.hand.manoId);
    repartidores.push(state.hand.dealerId);

    const mano3 = playTricks(state, { p1: '1-espada', p0: '3-basto' }, { p1: '7-espada', p0: '5-copa' });

    expect(manos).toEqual(['p1', 'p0', 'p1']);
    expect(repartidores).toEqual(['p0', 'p1', 'p0']);
    expect(mano3.state.scores).toEqual([0, 3]);
    expect(mano3.state.history.map((record) => record.number)).toEqual([1, 2, 3]);
    expect(mano3.state.history.map((record) => record.scoresAfter)).toEqual([
      [0, 1],
      [0, 2],
      [0, 3],
    ]);
    expect(mano3.state.history.map((record) => record.manoId)).toEqual(['p1', 'p0', 'p1']);
    expect(mano3.state.history.every((record) => record.reason === 'BAZAS' && record.points === 1)).toBe(true);
  });

  it('la partida también termina por bazas: tope en el marcador, MATCH_OVER y nada más', () => {
    // `withScores` es solo para tests: el motor siempre arranca 0-0.
    const state = withScores(match2p(MANOS), [0, 29]);

    const mano = playTricks(state, { p1: '1-espada', p0: '3-basto' }, { p1: '7-espada', p0: '5-copa' });

    expect(mano.state.scores).toEqual([0, 30]);
    expect(mano.state.phase).toBe('MATCH_OVER');
    expect(mano.state.winnerTeam).toBe(1);
    expect(mano.state.history[0].scoresAfter).toEqual([0, 30]);
    expect(mano.events.filter((event) => event.type === 'MATCH_OVER')).toEqual([
      { type: 'MATCH_OVER', winnerTeam: 1, scores: [0, 30] },
    ]);
    expect(mano.events.some((event) => event.type === 'HAND_OVER')).toBe(false);
    expect(getActor(mano.state)).toBeNull();
    expect(getLegalActions(mano.state, 'p1')).toEqual([]);
    expect(applyAction(mano.state, 'p1', { type: 'PLAY_CARD', cardId: mano.state.hand.hands['p1'][0].id })).toEqual({
      ok: false,
      error: 'MATCH_OVER',
    });
    expect(() => startNextHand(mano.state)).toThrow('NOT_HAND_OVER');
  });
});
