// Tests de los helpers de test (los usan todas las historias siguientes).

import { describe, expect, it } from 'vitest';
import { createMatch } from '../match.js';
import { card, deckFor, ids, seatOf } from './helpers.js';

describe('card', () => {
  it('arma la carta a partir de su id', () => {
    expect(card('1-espada')).toEqual({ id: '1-espada', number: 1, suit: 'espada' });
    expect(card('7-oro')).toEqual({ id: '7-oro', number: 7, suit: 'oro' });
    expect(card('12-copa')).toEqual({ id: '12-copa', number: 12, suit: 'copa' });
  });
});

describe('ids / seatOf', () => {
  it('ids devuelve los ids en orden', () => {
    expect(ids([card('3-basto'), card('1-basto')])).toEqual(['3-basto', '1-basto']);
  });

  it('seatOf parsea el número de asiento del playerId', () => {
    expect(seatOf('p0')).toBe(0);
    expect(seatOf('p5')).toBe(5);
  });
});

describe('deckFor', () => {
  it('coloca cada carta pedida en el lugar que le toca (2p, mano p1)', () => {
    const deck = deckFor({ p1: ['1-espada', '2-espada', '3-espada'], p0: ['4-espada', '5-espada', '6-espada'] }, 1, 2);
    expect(ids(deck)).toEqual(['1-espada', '4-espada', '2-espada', '5-espada', '3-espada', '6-espada']);
  });

  it('con el mazo armado, cada jugador recibe exactamente las cartas pedidas (4p, mano p1)', () => {
    const requested = {
      p0: ['1-espada', '2-espada', '3-espada'],
      p1: ['4-espada', '5-espada', '6-espada'],
      p2: ['7-espada', '10-espada', '11-espada'],
      p3: ['12-espada', '1-basto', '2-basto'],
    };
    const deck = deckFor(requested, 1, 4);
    expect(deck).toHaveLength(12);

    const state = createMatch({ rules: { playerCount: 4 }, seed: 5, firstDealerSeat: 0, deck });
    expect(state.hand.manoId).toBe('p1');
    for (const [playerId, hand] of Object.entries(requested)) {
      expect(ids(state.hand.hands[playerId]), playerId).toEqual(hand);
      expect(ids(state.hand.dealt[playerId]), playerId).toEqual(hand);
    }
    expect(new Set(ids(deck)).size).toBe(12);
  });

  it('completa los lugares no pedidos con cartas reales sin repetir', () => {
    const deck = deckFor({ p0: ['1-espada', '2-espada', '3-espada'] }, 0, 4);
    expect(deck).toHaveLength(12);
    expect(new Set(ids(deck)).size).toBe(12);
    // p0 es el mano: sus cartas caen en k = 0, 4 y 8
    expect([deck[0].id, deck[4].id, deck[8].id]).toEqual(['1-espada', '2-espada', '3-espada']);

    const state = createMatch({ rules: { playerCount: 4 }, seed: 5, firstDealerSeat: 3, deck });
    expect(state.hand.manoId).toBe('p0');
    expect(ids(state.hand.hands['p0'])).toEqual(['1-espada', '2-espada', '3-espada']);
    expect(ids(state.hand.hands['p1'])).toHaveLength(3);
  });
});
