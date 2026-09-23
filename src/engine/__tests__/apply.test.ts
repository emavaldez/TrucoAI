// Tests de src/engine/legal.ts y src/engine/apply.ts — actor, legalidad, errores, turno y no mutación.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../apply.js';
import { createDeck } from '../cards.js';
import { getActor, getLegalActions, sameAction } from '../legal.js';
import { createMatch } from '../match.js';
import type { Action, MatchState } from '../types.js';
import { deckFor, ids, callTruco } from './helpers.js';

/** Partida de 2 jugadores con mazo fijo: repartidor p0, mano p1 (arranca p1). */
function match2p(): MatchState {
  return createMatch({
    rules: { playerCount: 2 },
    seed: 1,
    firstDealerSeat: 0,
    deck: createDeck().slice(0, 6),
  });
}

function playFirst(actor: string, state: MatchState): MatchState {
  const cardId = state.hand.hands[actor][0].id;
  const result = applyAction(state, actor, { type: 'PLAY_CARD', cardId });
  if (!result.ok) throw new Error(`acción legal rechazada: ${result.error}`);
  return result.state;
}

describe('getActor', () => {
  it('en PLAYING devuelve al que le toca jugar (el mano al empezar)', () => {
    expect(getActor(match2p())).toBe('p1');
    expect(getActor(createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: 0 }))).toBe('p1');
    expect(getActor(createMatch({ rules: { playerCount: 6 }, seed: 1, firstDealerSeat: 5 }))).toBe('p0');
  });

  it('en HAND_OVER y MATCH_OVER no hay actor', () => {
    const state = match2p();
    state.phase = 'HAND_OVER';
    expect(getActor(state)).toBeNull();
    state.phase = 'MATCH_OVER';
    expect(getActor(state)).toBeNull();
  });

  it('[ENG-19] en AWAITING_ENVIDO y AWAITING_FLOR todavía no hay actor (historias 1-4 y 1-8)', () => {
    const state = match2p();
    for (const phase of ['AWAITING_ENVIDO', 'AWAITING_FLOR'] as const) {
      state.phase = phase;
      expect(getActor(state), phase).toBeNull();
      expect(getLegalActions(state, 'p1'), phase).toEqual([]);
      expect(applyAction(state, 'p1', { type: 'PLAY_CARD', cardId: state.hand.hands['p1'][0].id }), phase).toEqual({
        ok: false,
        error: 'NOT_YOUR_TURN',
      });
    }
  });

  it('[ENG-19] en AWAITING_TRUCO decide el respondedor; sin canto pendiente no hay actor (1-3)', () => {
    const state = match2p();
    state.phase = 'AWAITING_TRUCO'; // fase forzada sin `truco.pending`: estado incoherente
    expect(getActor(state)).toBeNull();
    expect(getLegalActions(state, 'p1')).toEqual([]);
    expect(applyAction(state, 'p1', { type: 'PLAY_CARD', cardId: state.hand.hands['p1'][0].id })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });

    // con el canto pendiente el actor es el respondedor (ver truco.test.ts)
    const pendiente = callTruco(match2p(), 'p1').state;
    expect(pendiente.phase).toBe('AWAITING_TRUCO');
    expect(getActor(pendiente)).toBe('p0');
  });
});

describe('getLegalActions', () => {
  it('en PLAYING devuelve el canto de truco y un PLAY_CARD por carta, en ese orden', () => {
    const state = match2p();
    const cartas: Action[] = state.hand.hands['p1'].map((card) => ({ type: 'PLAY_CARD', cardId: card.id }));
    expect(getLegalActions(state, 'p1')).toEqual([{ type: 'CALL_TRUCO' }, ...cartas]);
    expect(getLegalActions(state, 'p1')).toHaveLength(4);
  });

  it('devuelve [] para cualquier otro jugador', () => {
    const state = match2p();
    expect(getLegalActions(state, 'p0')).toEqual([]);
    expect(getLegalActions(state, 'p9')).toEqual([]);
  });

  it('devuelve [] cuando la mano terminó o cambió el turno', () => {
    const state = match2p();
    const after = playFirst('p1', state);
    expect(getActor(after)).toBe('p0');
    expect(getLegalActions(after, 'p1')).toEqual([]);
    expect(getLegalActions(after, 'p0').filter((action) => action.type === 'PLAY_CARD')).toHaveLength(3);

    after.phase = 'HAND_OVER';
    expect(getLegalActions(after, 'p0')).toEqual([]);
  });
});

describe('sameAction', () => {
  it('compara por type y por campos', () => {
    expect(sameAction({ type: 'PLAY_CARD', cardId: '1-espada' }, { type: 'PLAY_CARD', cardId: '1-espada' })).toBe(true);
    expect(sameAction({ type: 'PLAY_CARD', cardId: '1-espada' }, { type: 'PLAY_CARD', cardId: '7-oro' })).toBe(false);
    expect(sameAction({ type: 'PLAY_CARD', cardId: '1-espada' }, { type: 'CALL_TRUCO' })).toBe(false);
    expect(sameAction({ type: 'CALL_TRUCO' }, { type: 'CALL_TRUCO' })).toBe(true);
    expect(sameAction({ type: 'CALL_TRUCO' }, { type: 'MAZO' })).toBe(false);
    expect(sameAction({ type: 'ANSWER_TRUCO', answer: 'QUIERO' }, { type: 'ANSWER_TRUCO', answer: 'QUIERO' })).toBe(true);
    expect(sameAction({ type: 'ANSWER_TRUCO', answer: 'QUIERO' }, { type: 'ANSWER_TRUCO', answer: 'NO_QUIERO' })).toBe(
      false,
    );
  });
});

describe('applyAction — PLAY_CARD', () => {
  it('aplica la carta: la saca de la mano, la pone en la baza, avanza el turno y sube version', () => {
    const state = match2p();
    const played = state.hand.hands['p1'][0];

    const result = applyAction(state, 'p1', { type: 'PLAY_CARD', cardId: played.id });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([{ type: 'CARD_PLAYED', playerId: 'p1', card: played }]);
    expect(result.state).not.toBe(state);
    expect(result.state.version).toBe(1);
    expect(ids(result.state.hand.hands['p1'])).toEqual(ids(state.hand.hands['p1']).slice(1));
    expect(result.state.hand.currentTrick).toEqual({ leaderId: 'p1', plays: [{ playerId: 'p1', card: played }] });
    expect(result.state.hand.turnId).toBe('p0');
    expect(result.state.phase).toBe('PLAYING');
  });

  it('no muta el estado recibido (clona con structuredClone)', () => {
    const state = match2p();
    const snapshot = JSON.parse(JSON.stringify(state));

    const result = applyAction(state, 'p1', { type: 'PLAY_CARD', cardId: state.hand.hands['p1'][0].id });

    expect(result.ok).toBe(true);
    expect(state).toEqual(snapshot);
    expect(state.version).toBe(0);
    expect(state.hand.turnId).toBe('p1');
    expect(ids(state.hand.hands['p1'])).toHaveLength(3);
    expect(state.hand.currentTrick.plays).toEqual([]);
  });

  it('el turno avanza en orden circular entre los participantes (4 jugadores)', () => {
    let state = createMatch({ rules: { playerCount: 4 }, seed: 3, firstDealerSeat: 0, deck: deckFor({}, 1, 4) });
    expect(getActor(state)).toBe('p1');

    state = playFirst('p1', state);
    expect(getActor(state)).toBe('p2');
    expect(getLegalActions(state, 'p1')).toEqual([]);

    state = playFirst('p2', state);
    expect(getActor(state)).toBe('p3');

    state = playFirst('p3', state);
    expect(state.hand.currentTrick.plays.map((play) => play.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(getActor(state)).toBe('p0');
  });

  it('cuando se completa la baza la resuelve el motor: TRICK_WON y nuevo líder [ENG-16]', () => {
    // mazo fijo `createDeck().slice(0, 6)`: p1 1-espada/3-espada/5-espada, p0 2-espada/4-espada/6-espada
    const state = match2p();
    const afterP1 = playFirst('p1', state);
    const p0Card = afterP1.hand.hands['p0'][0];

    const result = applyAction(afterP1, 'p0', { type: 'PLAY_CARD', cardId: p0Card.id });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([
      { type: 'CARD_PLAYED', playerId: 'p0', card: p0Card },
      { type: 'TRICK_WON', trick: 0, winnerTeam: 1, winnerPlayerId: 'p1' },
    ]);
    expect(result.state.hand.tricks).toHaveLength(1);
    expect(result.state.hand.tricks[0]).toMatchObject({ winnerTeam: 1, winnerPlayerId: 'p1', leaderId: 'p1' });
    expect(result.state.hand.currentTrick).toEqual({ leaderId: 'p1', plays: [] });
    expect(result.state.hand.turnId).toBe('p1');
    expect(result.state.phase).toBe('PLAYING');
    // el estado recibido no queda a medio tocar
    expect(afterP1.hand.currentTrick.plays).toHaveLength(1);
    expect(ids(afterP1.hand.hands['p0'])).toHaveLength(3);
  });
});

describe('applyAction — rechazos', () => {
  it('[ENG-10] rechaza a quien no es el actor', () => {
    const state = match2p();
    expect(applyAction(state, 'p0', { type: 'PLAY_CARD', cardId: state.hand.hands['p0'][0].id })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
    expect(applyAction(state, 'p9', { type: 'PLAY_CARD', cardId: state.hand.hands['p1'][0].id })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });

  it('[ENG-10] rechaza una carta que no está en la mano del actor', () => {
    const state = match2p();
    expect(applyAction(state, 'p1', { type: 'PLAY_CARD', cardId: state.hand.hands['p0'][0].id })).toEqual({
      ok: false,
      error: 'ILLEGAL_ACTION',
    });
    expect(applyAction(state, 'p1', { type: 'PLAY_CARD', cardId: '99-no-existe' })).toEqual({
      ok: false,
      error: 'ILLEGAL_ACTION',
    });
  });

  it('[ENG-10] rechaza los cantos que todavía no existen y el mazo: nada fuera de getLegalActions', () => {
    const state = match2p();
    const illegales: Action[] = [
      // `CALL_TRUCO` ya es legal para el actor desde la 1-3 (tiene sus propios tests en truco.test.ts).
      { type: 'ANSWER_TRUCO', answer: 'QUIERO' },
      { type: 'CALL_ENVIDO', call: 'E' },
      { type: 'ANSWER_ENVIDO', answer: 'QUIERO' },
      { type: 'DECLARE_FLOR' },
      { type: 'ANSWER_FLOR', answer: 'QUIERO' },
      { type: 'MAZO' },
    ];
    for (const action of illegales) {
      expect(applyAction(state, 'p1', action), action.type).toEqual({ ok: false, error: 'ILLEGAL_ACTION' });
    }
    expect(state.version).toBe(0);
  });

  it('[ENG-10] en MATCH_OVER ninguna acción se acepta', () => {
    const state = match2p();
    state.phase = 'MATCH_OVER';
    expect(applyAction(state, 'p1', { type: 'PLAY_CARD', cardId: state.hand.hands['p1'][0].id })).toEqual({
      ok: false,
      error: 'MATCH_OVER',
    });
    expect(applyAction(state, 'p0', { type: 'PLAY_CARD', cardId: state.hand.hands['p0'][0].id })).toEqual({
      ok: false,
      error: 'MATCH_OVER',
    });
  });

  it('cuando la mano se cierra por bazas no queda nada legal', () => {
    let state = match2p();
    let actor = getActor(state);
    while (actor !== null) {
      state = playFirst(actor, state);
      actor = getActor(state);
    }

    expect(state.phase).toBe('HAND_OVER');
    expect(getActor(state)).toBeNull();
    expect(getLegalActions(state, 'p1')).toEqual([]);
    expect(applyAction(state, 'p1', { type: 'PLAY_CARD', cardId: '12-copa' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });
});
