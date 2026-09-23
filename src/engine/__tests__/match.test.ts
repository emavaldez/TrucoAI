// Tests de src/engine/match.ts — createMatch (asientos, reglas, reparto) y startNextHand (rotación).

import { describe, expect, it } from 'vitest';
import { createDeck } from '../cards.js';
import { createMatch, startNextHand } from '../match.js';
import type { MatchState } from '../types.js';
import { deckFor, ids } from './helpers.js';

const P2 = { playerCount: 2 } as const;
const P4 = { playerCount: 4 } as const;
const P6 = { playerCount: 6 } as const;

describe('createMatch — asientos y reglas', () => {
  it('2 jugadores: asientos, equipos, nombres por defecto y defaults del ruleset', () => {
    const state = createMatch({ rules: P2, seed: 1 });
    expect(state.seats).toEqual([
      { id: 'p0', seat: 0, team: 0, name: 'Vos', isHuman: true },
      { id: 'p1', seat: 1, team: 1, name: 'Rival', isHuman: false },
    ]);
    expect(state.rules).toEqual({ playerCount: 2, targetScore: 30, flor: false, picaPica: false });
    expect(state.version).toBe(0);
    expect(state.seed).toBe(1);
    expect(state.scores).toEqual([0, 0]);
    expect(state.phase).toBe('PLAYING');
    expect(state.hand.number).toBe(1);
    expect(state.history).toEqual([]);
    expect(state.winnerTeam).toBeNull();
    expect(state.picaPicaNext).toBe(false);
  });

  it('4 jugadores: equipos intercalados (0,1,0,1) y nombres por defecto', () => {
    const state = createMatch({ rules: P4, seed: 1 });
    expect(state.seats.map((s) => s.team)).toEqual([0, 1, 0, 1]);
    expect(state.seats.map((s) => s.name)).toEqual(['Vos', 'Rival 1', 'Compañero', 'Rival 2']);
    expect(state.seats.map((s) => s.isHuman)).toEqual([true, false, false, false]);
    expect(state.rules.picaPica).toBe(false);
  });

  it('6 jugadores: pica-pica encendido por defecto y nombres por defecto', () => {
    const state = createMatch({ rules: P6, seed: 1 });
    expect(state.seats.map((s) => s.team)).toEqual([0, 1, 0, 1, 0, 1]);
    expect(state.seats.map((s) => s.name)).toEqual([
      'Vos',
      'Rival 1',
      'Compañero 1',
      'Rival 2',
      'Compañero 2',
      'Rival 3',
    ]);
    expect(state.rules).toEqual({ playerCount: 6, targetScore: 30, flor: false, picaPica: true });
  });

  it('respeta las reglas pasadas (flor y pica-pica explícitos)', () => {
    const state = createMatch({ rules: { playerCount: 6, flor: true, picaPica: false, targetScore: 30 }, seed: 2 });
    expect(state.rules).toEqual({ playerCount: 6, targetScore: 30, flor: true, picaPica: false });
  });

  it('usa los nombres pasados y completa con los por defecto', () => {
    const completos = createMatch({ rules: P2, seed: 1, names: ['Ana', 'Beto'] });
    expect(completos.seats.map((s) => s.name)).toEqual(['Ana', 'Beto']);

    const parciales = createMatch({ rules: P4, seed: 1, names: ['Ana'] });
    expect(parciales.seats.map((s) => s.name)).toEqual(['Ana', 'Rival 1', 'Compañero', 'Rival 2']);
  });
});

describe('createMatch — repartidor y mano', () => {
  it('firstDealerSeat fija el repartidor y el mano es el asiento siguiente', () => {
    const state = createMatch({ rules: P4, seed: 1, firstDealerSeat: 2 });
    expect(state.hand.dealerId).toBe('p2');
    expect(state.hand.manoId).toBe('p3');
    expect(state.hand.turnId).toBe('p3');
    expect(state.hand.participants).toEqual(['p3', 'p0', 'p1', 'p2']);
    expect(state.hand.currentTrick).toEqual({ leaderId: 'p3', plays: [] });
  });

  it('el mano da la vuelta por el asiento 0 si el repartidor es el último', () => {
    const state = createMatch({ rules: P4, seed: 1, firstDealerSeat: 3 });
    expect(state.hand.dealerId).toBe('p3');
    expect(state.hand.manoId).toBe('p0');
    expect(state.hand.participants).toEqual(['p0', 'p1', 'p2', 'p3']);
  });

  it('sin firstDealerSeat el repartidor sale del RNG de la semilla', () => {
    const a = createMatch({ rules: P4, seed: 77 });
    const b = createMatch({ rules: P4, seed: 77 });
    expect(a.hand.dealerId).toBe(b.hand.dealerId);
    expect(a.rngState).toBe(b.rngState);
    expect(a.seats.map((s) => s.seat)).toContain(Number(a.hand.dealerId.slice(1)));

    const c = createMatch({ rules: P4, seed: 78 });
    expect(ids(a.hand.dealt['p0'])).not.toEqual(ids(c.hand.dealt['p0']));
  });

  it('el estado inicial de la mano queda limpio', () => {
    const state = createMatch({ rules: P6, seed: 3, firstDealerSeat: 5 });
    expect(state.hand.manoId).toBe('p0');
    expect(state.hand.tricks).toEqual([]);
    expect(state.hand.cantos).toEqual([]);
    expect(state.hand.picaPica).toBeNull();
    expect(state.hand.result).toBeNull();
    expect(state.hand.truco).toEqual({ level: 0, pending: null, quieroTeam: null });
    expect(state.hand.envido).toEqual({
      chain: [],
      pending: null,
      status: 'none',
      resumeTrucoAfter: false,
      result: null,
    });
    expect(state.hand.flor).toEqual({
      declared: [],
      pending: null,
      status: 'none',
      resumePhase: null,
      result: null,
    });
  });
});

describe('createMatch — reparto', () => {
  it('reparte 3 vueltas empezando por el mano con mazo fijo (2p, firstDealerSeat 0 ⇒ mano p1)', () => {
    const deck = createDeck().slice(0, 6);
    const state = createMatch({ rules: P2, seed: 1, firstDealerSeat: 0, deck });

    // deck[0]→p1, deck[1]→p0, deck[2]→p1, deck[3]→p0, deck[4]→p1, deck[5]→p0
    expect(ids(state.hand.hands['p1'])).toEqual([deck[0].id, deck[2].id, deck[4].id]);
    expect(ids(state.hand.hands['p0'])).toEqual([deck[1].id, deck[3].id, deck[5].id]);
    expect(ids(state.hand.dealt['p1'])).toEqual([deck[0].id, deck[2].id, deck[4].id]);
    expect(ids(state.hand.dealt['p0'])).toEqual([deck[1].id, deck[3].id, deck[5].id]);
  });

  it('cada jugador recibe 3 cartas del mazo, sin repetir (6p, mano p2)', () => {
    const deck = deckFor({}, 2, 6);
    const state = createMatch({ rules: P6, seed: 4, firstDealerSeat: 1, deck });

    expect(state.hand.manoId).toBe('p2');
    const all: string[] = [];
    for (const seat of state.seats) {
      expect(state.hand.hands[seat.id], seat.id).toHaveLength(3);
      expect(ids(state.hand.hands[seat.id]), seat.id).toEqual([
        deck[(seat.seat - 2 + 6) % 6].id,
        deck[((seat.seat - 2 + 6) % 6) + 6].id,
        deck[((seat.seat - 2 + 6) % 6) + 12].id,
      ]);
      all.push(...ids(state.hand.hands[seat.id]));
    }
    expect(new Set(all).size).toBe(18);
  });

  it('dealt y hands son copias independientes', () => {
    const deck = createDeck().slice(0, 6);
    const state = createMatch({ rules: P2, seed: 1, firstDealerSeat: 0, deck });
    const { dealt, hands } = state.hand;
    expect(dealt['p0']).not.toBe(hands['p0']);
    expect(dealt['p0'][0]).not.toBe(hands['p0'][0]);
    expect(dealt['p0']).toEqual(hands['p0']);

    hands['p0'].pop();
    expect(dealt['p0']).toHaveLength(3);
    expect(state.hand.hands['p0']).toHaveLength(2);
  });

  it('es determinista: misma semilla ⇒ mismo estado inicial (2, 4 y 6 jugadores)', () => {
    for (const playerCount of [2, 4, 6] as const) {
      const a = createMatch({ rules: { playerCount }, seed: 2026 });
      const b = createMatch({ rules: { playerCount }, seed: 2026 });
      expect(JSON.parse(JSON.stringify(a)), `${playerCount}p`).toEqual(JSON.parse(JSON.stringify(b)));
      expect(a.rngState, `${playerCount}p`).toBe(b.rngState);
    }
  });

  it('el mazo del reparto son cartas del mazo real, sin repetir (4p completo)', () => {
    const state = createMatch({ rules: P4, seed: 8 });
    const dealt = state.seats.flatMap((seat) => ids(state.hand.dealt[seat.id]));
    expect(dealt).toHaveLength(12);
    expect(new Set(dealt).size).toBe(12);
    expect(dealt.every((id) => createDeck().map((c) => c.id).includes(id))).toBe(true);
  });
});

describe('startNextHand', () => {
  it('solo acepta HAND_OVER', () => {
    const state = createMatch({ rules: P2, seed: 1 });
    expect(() => startNextHand(state)).toThrow('NOT_HAND_OVER');

    state.phase = 'MATCH_OVER';
    expect(() => startNextHand(state)).toThrow('NOT_HAND_OVER');

    state.phase = 'AWAITING_TRUCO';
    expect(() => startNextHand(state)).toThrow('NOT_HAND_OVER');
  });

  it('[ENG-06] rota el repartidor y el mano: 4 jugadores, firstDealerSeat 0 ⇒ p1,p2,p3,p0,p1,p2,p3,p0', () => {
    let state: MatchState = createMatch({ rules: P4, seed: 3, firstDealerSeat: 0 });
    const manos = [state.hand.manoId];
    const repartidores = [state.hand.dealerId];

    for (let i = 0; i < 7; i++) {
      state.phase = 'HAND_OVER';
      state = startNextHand(state).state;
      repartidores.push(state.hand.dealerId);
      manos.push(state.hand.manoId);
    }

    expect(manos).toEqual(['p1', 'p2', 'p3', 'p0', 'p1', 'p2', 'p3', 'p0']);
    expect(repartidores).toEqual(['p0', 'p1', 'p2', 'p3', 'p0', 'p1', 'p2', 'p3']);
    expect(state.hand.number).toBe(8);
  });

  it('arranca la mano siguiente en PLAYING con el mazo pasado, y emite HAND_STARTED', () => {
    const state = createMatch({ rules: P2, seed: 9, firstDealerSeat: 0 });
    state.phase = 'HAND_OVER';
    const deck = createDeck().slice(10, 16);

    const { state: next, events } = startNextHand(state, { deck });

    expect(events).toEqual([{ type: 'HAND_STARTED', hand: 2, dealerId: 'p1', manoId: 'p0', picaPica: false }]);
    expect(next.phase).toBe('PLAYING');
    expect(next.hand.number).toBe(2);
    expect(next.hand.dealerId).toBe('p1');
    expect(next.hand.manoId).toBe('p0');
    expect(next.hand.turnId).toBe('p0');
    expect(next.hand.participants).toEqual(['p0', 'p1']);
    expect(ids(next.hand.hands['p0'])).toEqual([deck[0].id, deck[2].id, deck[4].id]);
    expect(ids(next.hand.hands['p1'])).toEqual([deck[1].id, deck[3].id, deck[5].id]);
    expect(next.scores).toEqual([0, 0]);
    expect(next.history).toEqual([]);
  });

  it('sin mazo fijo reparte con el RNG guardado en `rngState`', () => {
    const state = createMatch({ rules: P2, seed: 9, firstDealerSeat: 0 });
    state.phase = 'HAND_OVER';
    const rngBefore = state.rngState;

    const { state: next } = startNextHand(state);

    expect(next.rngState).not.toBe(rngBefore);
    expect(ids(next.hand.hands['p0'])).toHaveLength(3);
    expect(ids(next.hand.hands['p1'])).toHaveLength(3);
    const dealt = [...ids(next.hand.dealt['p0']), ...ids(next.hand.dealt['p1'])];
    expect(new Set(dealt).size).toBe(6);
  });

  it('no muta el estado recibido', () => {
    const state = createMatch({ rules: P4, seed: 9, firstDealerSeat: 0 });
    state.phase = 'HAND_OVER';
    const snapshot = JSON.parse(JSON.stringify(state));

    const { state: next } = startNextHand(state);

    expect(state).toEqual(snapshot);
    expect(state.phase).toBe('HAND_OVER');
    expect(state.hand.number).toBe(1);
    expect(next).not.toBe(state);
  });
});
