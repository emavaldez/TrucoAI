// Tests de src/engine/scoring.ts — puntaje, tope, fin de partida y cierre de mano.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../apply.js';
import { getActor, getLegalActions } from '../legal.js';
import { createMatch, startNextHand } from '../match.js';
import { addPoints, endHand } from '../scoring.js';
import type { GameEvent, MatchState, PlayerId } from '../types.js';
import { deckFor, engineSources, playTrick, withScores } from './helpers.js';

const MANOS = { p1: ['1-espada', '7-espada', '4-copa'], p0: ['3-basto', '5-copa', '12-oro'] };

/** Partida de 2 jugadores con mazo fijo: repartidor p0 → mano p1 (equipo 1). */
function match2p(hands: Record<PlayerId, string[]> = MANOS): MatchState {
  return createMatch({ rules: { playerCount: 2 }, seed: 1, firstDealerSeat: 0, deck: deckFor(hands, 1, 2) });
}

describe('addPoints', () => {
  it('suma los puntos al equipo y emite POINTS con su motivo', () => {
    const state = match2p();
    const events: GameEvent[] = [];

    addPoints(state, events, 1, 2, 'MANO');

    expect(state.scores).toEqual([0, 2]);
    expect(events).toEqual([{ type: 'POINTS', team: 1, points: 2, reason: 'MANO' }]);
    expect(state.phase).toBe('PLAYING');
    expect(state.winnerTeam).toBeNull();
  });

  it('al llegar al objetivo recorta el marcador al tope y termina la partida [ENG-01]', () => {
    const state = withScores(match2p(), [28, 0]);
    const events: GameEvent[] = [];

    addPoints(state, events, 0, 5, 'TRUCO');

    expect(state.scores).toEqual([30, 0]); // tope, no 33
    expect(state.phase).toBe('MATCH_OVER');
    expect(state.winnerTeam).toBe(0);
    expect(events).toEqual([
      { type: 'POINTS', team: 0, points: 5, reason: 'TRUCO' },
      { type: 'MATCH_OVER', winnerTeam: 0, scores: [30, 0] },
    ]);
    expect(getActor(state)).toBeNull();
    expect(getLegalActions(state, 'p1')).toEqual([]);
  });

  it('justo en el objetivo también termina la partida', () => {
    const state = withScores(match2p(), [0, 29]);

    addPoints(state, [], 1, 1, 'MANO');

    expect(state.scores).toEqual([0, 30]);
    expect(state.phase).toBe('MATCH_OVER');
    expect(state.winnerTeam).toBe(1);
  });

  it('en MATCH_OVER ninguna acción posterior es legal y no se puede repartir otra mano', () => {
    const state = withScores(match2p(), [0, 29]);
    addPoints(state, [], 1, 1, 'MANO');

    expect(applyAction(state, 'p1', { type: 'PLAY_CARD', cardId: state.hand.hands['p1'][0].id })).toEqual({
      ok: false,
      error: 'MATCH_OVER',
    });
    expect(() => startNextHand(state)).toThrow('NOT_HAND_OVER');
  });

  it('el equipo que no llega al objetivo no cambia la fase', () => {
    const state = withScores(match2p(), [28, 0]);

    addPoints(state, [], 0, 1, 'MANO');

    expect(state.scores).toEqual([29, 0]);
    expect(state.phase).toBe('PLAYING');
    expect(state.winnerTeam).toBeNull();
  });
});

describe('endHand', () => {
  it('cierra la mano: puntos, hand.result, HandRecord y HAND_OVER', () => {
    const state = match2p();
    const events: GameEvent[] = [];

    endHand(state, events, { winnerTeam: 1, reason: 'BAZAS' });

    expect(state.phase).toBe('HAND_OVER');
    expect(state.scores).toEqual([0, 1]); // sin truco la mano vale 1
    expect(state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'BAZAS' });
    expect(state.history).toEqual([
      {
        number: 1,
        dealerId: 'p0',
        manoId: 'p1',
        picaPica: false,
        tricks: [],
        cantos: [],
        winnerTeam: 1,
        points: 1,
        reason: 'BAZAS',
        scoresAfter: [0, 1],
      },
    ]);
    expect(events).toEqual([
      { type: 'POINTS', team: 1, points: 1, reason: 'MANO' },
      { type: 'HAND_OVER', winnerTeam: 1, points: 1, reason: 'BAZAS' },
    ]);
    expect(getActor(state)).toBeNull();
    expect(getLegalActions(state, 'p1')).toEqual([]);
  });

  it('el HandRecord guarda las bazas jugadas y el repartidor de esa mano', () => {
    const state = match2p();
    const primera = playTrick(state, { p1: '1-espada', p0: '3-basto' });
    const segunda = playTrick(primera.state, { p1: '7-espada', p0: '5-copa' });

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
    expect(segunda.state.history[0].tricks).toEqual(segunda.state.hand.tricks);
    expect(segunda.state.history[0].cantos).toEqual([]);
  });

  it('acepta puntos explícitos (truco no querido, mazo) y los mapea a su motivo de POINTS', () => {
    const noQuiero = match2p();
    const eventosNoQuiero: GameEvent[] = [];
    endHand(noQuiero, eventosNoQuiero, { winnerTeam: 0, reason: 'NO_QUIERO', points: 1 });
    expect(eventosNoQuiero).toEqual([
      { type: 'POINTS', team: 0, points: 1, reason: 'NO_QUIERO' },
      { type: 'HAND_OVER', winnerTeam: 0, points: 1, reason: 'NO_QUIERO' },
    ]);
    expect(noQuiero.hand.result).toEqual({ winnerTeam: 0, points: 1, reason: 'NO_QUIERO' });
    expect(noQuiero.history[0]).toMatchObject({ points: 1, reason: 'NO_QUIERO', scoresAfter: [1, 0] });

    const mazo = match2p();
    const eventosMazo: GameEvent[] = [];
    endHand(mazo, eventosMazo, { winnerTeam: 1, reason: 'MAZO', points: 2 });
    expect(eventosMazo[0]).toEqual({ type: 'POINTS', team: 1, points: 2, reason: 'MAZO' });
    expect(mazo.history[0]).toMatchObject({ points: 2, reason: 'MAZO' });
  });

  it('si la mano termina la partida la fase queda en MATCH_OVER y hay un solo aviso', () => {
    const state = withScores(match2p(), [0, 29]);
    const events: GameEvent[] = [];

    endHand(state, events, { winnerTeam: 1, reason: 'BAZAS' });

    expect(state.scores).toEqual([0, 30]);
    expect(state.phase).toBe('MATCH_OVER');
    expect(state.winnerTeam).toBe(1);
    expect(state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'BAZAS' });
    expect(state.history[0].scoresAfter).toEqual([0, 30]);
    expect(events.map((event) => event.type)).toEqual(['POINTS', 'MATCH_OVER']);
    expect(getActor(state)).toBeNull();
    expect(() => startNextHand(state)).toThrow('NOT_HAND_OVER');
  });

  it('deja la mano lista para startNextHand (sin forzar la fase)', () => {
    const state = match2p();
    endHand(state, [], { winnerTeam: 1, reason: 'BAZAS' });

    const next = startNextHand(state);

    expect(next.state.hand.number).toBe(2);
    expect(next.state.phase).toBe('PLAYING');
    expect(next.state.hand.manoId).toBe('p0');
  });
});

describe('un solo camino de puntaje y cierre', () => {
  it('[ENG-01] solo scoring.ts escribe `scores` y solo él cierra la mano', () => {
    const fuentes = engineSources();

    const escribenScores = fuentes
      .filter(({ source }) => /\.scores\s*\[[^\]]*\]\s*(\+|-)?=/.test(source))
      .map(({ file }) => file);
    expect(escribenScores).toEqual(['scoring.ts']);

    const cierranMano = fuentes.filter(({ source }) => /phase\s*=\s*'HAND_OVER'/.test(source)).map(({ file }) => file);
    expect(cierranMano).toEqual(['scoring.ts']);
  });
});
