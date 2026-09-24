// Tests de la observación pública — historia 1-6 (AC 1, AC 2) [AI-09].
// Se verifica el contrato de `architecture.md` §4: campos correctos, `unseenCards`
// calculado solo con info pública, `publicScores` limitado a lo revelado y que la
// observación es un objeto nuevo (mutarla no toca el estado).

import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createDeck,
  createMatch,
  getActor,
  getLegalActions,
  getObservation,
  startNextHand,
} from '../index.js';
import type { MatchState, PlayerId } from '../types.js';
import { createRng } from '../rng.js';
import { deckFor, ids, playFirstCard, randomLegalAction } from './helpers.js';

/** Reparto fijo para 2 jugadores: manos conocidas carta por carta. */
function match2p(): MatchState {
  const deck = deckFor(
    { p0: ['1-espada', '2-basto', '3-oro'], p1: ['12-copa', '11-espada', '10-basto'] },
    0,
    2,
  );
  return createMatch({ rules: { playerCount: 2 }, seed: 1, deck });
}

describe('getObservation (AC 1)', () => {
  it('devuelve todos los campos del contrato', () => {
    const state = match2p();
    const obs = getObservation(state, 'p0');
    expect(Object.keys(obs).sort()).toEqual(
      [
        'currentTrick',
        'dealerId',
        'envidoChain',
        'envidoStatus',
        'florDeclared',
        'isMano',
        'isPie',
        'legalActions',
        'manoId',
        'myDealt',
        'myHand',
        'picaPica',
        'phase',
        'publicScores',
        'rules',
        'scores',
        'seats',
        'selfId',
        'selfTeam',
        'truco',
        'tricks',
        'unseenCards',
      ].sort(),
    );
  });

  it('myHand y myDealt son las cartas del propio jugador', () => {
    const state = match2p();
    const obs = getObservation(state, 'p0');
    expect(ids(obs.myDealt)).toEqual(['1-espada', '2-basto', '3-oro']);
    expect(ids(obs.myHand)).toEqual(['1-espada', '2-basto', '3-oro']);
    const rival = getObservation(state, 'p1');
    expect(ids(rival.myDealt)).toEqual(['12-copa', '11-espada', '10-basto']);
  });

  it('[AI-09] la observación de p0 no menciona las cartas de p1 (salvo unseenCards)', () => {
    const state = match2p();
    const obs = getObservation(state, 'p0');
    const serial = JSON.stringify({ ...obs, unseenCards: undefined });
    for (const card of state.hand.hands['p1']) {
      expect(serial).not.toContain(`"${card.id}"`);
    }
  });

  it('isMano es el primero de participants; isPie el último de su equipo', () => {
    const state = match2p();
    expect(getObservation(state, 'p0').isMano).toBe(true); // mano (asiento 1 desde el dealer 0)
    expect(getObservation(state, 'p1').isMano).toBe(false);
    // 2 jugadores: cada uno es el único de su equipo, ambos son pie.
    expect(getObservation(state, 'p0').isPie).toBe(true);
    expect(getObservation(state, 'p1').isPie).toBe(true);
  });

  it('isPie en 4 jugadores: el segundo del equipo en participants', () => {
    const state = createMatch({ rules: { playerCount: 4 }, seed: 7, firstDealerSeat: 0 });
    // participants arranca en el mano (asiento 1): [p1, p2, p3, p0]; equipos: p0/p2 = 0, p1/p3 = 1.
    expect(state.hand.participants).toEqual(['p1', 'p2', 'p3', 'p0']);
    expect(getObservation(state, 'p1').isMano).toBe(true);
    expect(getObservation(state, 'p3').isPie).toBe(true); // último equipo 1 en participants
    expect(getObservation(state, 'p1').isPie).toBe(false);
    expect(getObservation(state, 'p0').isPie).toBe(true); // último equipo 0
    expect(getObservation(state, 'p2').isPie).toBe(false);
  });

  it('unseenCards = createDeck() − myDealt − jugadas de otros, en orden del mazo', () => {
    const state = match2p();
    const obs = getObservation(state, 'p0');
    const expected = createDeck().filter(
      (c) => !['1-espada', '2-basto', '3-oro'].includes(c.id),
    );
    expect(ids(obs.unseenCards)).toEqual(ids(expected));
    expect(obs.unseenCards.length).toBe(37);
  });

  it('unseenCards descuenta las cartas jugadas por otros', () => {
    let state = match2p();
    // p0 arranca y juega: la baza sigue, p1 todavía tiene sus 3 en mano.
    state = playFirstCard(state).state;
    const obsP1 = getObservation(state, 'p1');
    // A p1 le descuentan las 3 suyas + la jugada por p0.
    expect(obsP1.unseenCards.length).toBe(40 - 3 - 1);
    expect(ids(obsP1.unseenCards)).not.toContain('1-espada'); // la jugó p0
    // A p0 no le cambia su propia carta jugada (ya estaba por myDealt).
    const obsP0 = getObservation(state, 'p0');
    expect(obsP0.unseenCards.length).toBe(37);
  });

  it('legalActions coincide con getLegalActions', () => {
    const state = match2p();
    const obs = getObservation(state, 'p0');
    expect(obs.legalActions).toEqual(getLegalActions(state, 'p0'));
  });

  it('mutar la observación no afecta al state (objeto nuevo)', () => {
    const state = match2p();
    const obs = getObservation(state, 'p0');
    obs.myHand.push({ id: '7-copa', number: 7, suit: 'copa' });
    obs.scores[0] = 999;
    obs.truco.level = 3;
    obs.currentTrick.plays.push({ playerId: 'p0', card: { id: '7-basto', number: 7, suit: 'basto' } });
    expect(state.hand.hands['p0'].length).toBe(3);
    expect(state.scores[0]).toBe(0);
    expect(state.hand.truco.level).toBe(0);
    expect(state.hand.currentTrick.plays.length).toBe(0);
  });

  it('copia los campos del estado: dealerId, manoId, phase, rules, seats', () => {
    const state = match2p();
    const obs = getObservation(state, 'p0');
    expect(obs.dealerId).toBe(state.hand.dealerId);
    expect(obs.manoId).toBe(state.hand.manoId);
    expect(obs.phase).toBe(state.phase);
    expect(obs.rules).toEqual(state.rules);
    expect(obs.seats).toEqual(state.seats);
    expect(obs.selfId).toBe('p0');
    expect(obs.selfTeam).toBe(0);
  });

  it('lanza UNKNOWN_PLAYER con un jugador que no existe', () => {
    const state = match2p();
    expect(() => getObservation(state, 'p9')).toThrow('UNKNOWN_PLAYER');
  });
});

describe('publicScores [AI-09]', () => {
  /** Busca un estado con envido querido resuelto (intenta hasta 50 partidas con semilla). */
  function withResolvedEnvido(): { state: MatchState; actor: PlayerId } | null {
    for (let seed = 1; seed <= 50; seed++) {
      let state = createMatch({ rules: { playerCount: 2 }, seed });
      const actor = 'p0' as PlayerId;
      const legal = getLegalActions(state, actor);
      if (!legal.some((a) => a.type === 'CALL_ENVIDO')) continue;
      const called = applyAction(state, actor, { type: 'CALL_ENVIDO', call: 'E' });
      if (!called.ok) continue;
      state = called.state;
      const answered = applyAction(state, 'p1', { type: 'ANSWER_ENVIDO', answer: 'QUIERO' });
      if (!answered.ok) continue;
      return { state: answered.state, actor };
    }
    return null;
  }

  it('después de un envido querido, publicScores trae lo revelado con kind ENVIDO', () => {
    const found = withResolvedEnvido();
    expect(found).not.toBeNull();
    const { state } = found as { state: MatchState; actor: PlayerId };
    const revealed = state.hand.envido.result?.revealed ?? [];
    expect(revealed.length).toBeGreaterThan(0);
    for (const playerId of ['p0', 'p1'] as PlayerId[]) {
      const obs = getObservation(state, playerId);
      expect(obs.publicScores).toEqual(revealed.map((entry) => ({ ...entry, kind: 'ENVIDO' })));
      // Ningún jugador no revelado aparece con puntaje.
      for (const entry of obs.publicScores) {
        expect(revealed.some((r) => r.playerId === entry.playerId)).toBe(true);
      }
    }
  });

  it('sin envido resuelto, publicScores está vacío', () => {
    const state = match2p();
    expect(getObservation(state, 'p0').publicScores).toEqual([]);
    expect(getObservation(state, 'p1').publicScores).toEqual([]);
  });

  it('envido NO querido: nadie reveló nada, publicScores vacío y el estado sigue siendo público', () => {
    let state = createMatch({ rules: { playerCount: 2 }, seed: 1 });
    const legal = getLegalActions(state, 'p0');
    if (!legal.some((a) => a.type === 'CALL_ENVIDO')) throw new Error('setup: sin envido legal');
    const opened = applyAction(state, 'p0', { type: 'CALL_ENVIDO', call: 'E' });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    state = opened.state;
    const answered = applyAction(state, 'p1', { type: 'ANSWER_ENVIDO', answer: 'NO_QUIERO' });
    expect(answered.ok).toBe(true);
    if (!answered.ok) return;
    for (const playerId of ['p0', 'p1']) {
      expect(getObservation(answered.state, playerId as PlayerId).publicScores).toEqual([]);
    }
  });
});

describe('invariante 9 sobre estados reales de simulación (AC 2, 300 estados)', () => {
  /** Recorta una observación sin `unseenCards` (es el único campo con info del mazo). */
  function serialPublic(obs: ReturnType<typeof getObservation>): string {
    return JSON.stringify({ ...obs, unseenCards: undefined });
  }

  /** Calcula `unseenCards` esperado: mazo − mis repartidas − jugadas de otros. */
  function expectedUnseen(state: MatchState, playerId: PlayerId): string[] {
    const excluded = new Set(state.hand.dealt[playerId].map((c) => c.id));
    for (const trick of state.hand.tricks) {
      for (const play of trick.plays) if (play.playerId !== playerId) excluded.add(play.card.id);
    }
    for (const play of state.hand.currentTrick.plays) {
      if (play.playerId !== playerId) excluded.add(play.card.id);
    }
    return createDeck().filter((c) => !excluded.has(c.id)).map((c) => c.id);
  }

  it('[AI-09] en 300 estados de simulaciones 2p/4p/6p no hay cartas ni tantos ocultos', () => {
    const rng = createRng(20260924);
    const modes: Array<2 | 4 | 6> = [2, 4, 6];
    const states: MatchState[] = [];

    outer: for (let round = 0; states.length < 300; round++) {
      const playerCount = modes[round % 3];
      let state = createMatch({ rules: { playerCount, picaPica: false }, seed: 1000 + round });
      for (let step = 0; step < 60 && state.phase !== 'MATCH_OVER'; step++) {
        if (state.phase === 'HAND_OVER') {
          state = startNextHand(state).state;
          continue;
        }
        const currentActor = getActor(state);
        if (currentActor === null || getLegalActions(state, currentActor).length === 0) break;
        const chosen = randomLegalAction(state, rng);
        const result = applyAction(state, chosen.playerId, chosen.action);
        if (!result.ok) break;
        state = result.state;
        states.push(state);
        if (states.length >= 300) break outer;
      }
    }

    expect(states.length).toBeGreaterThanOrEqual(300);
    let checkedPlayers = 0;
    for (const state of states) {
      for (const seat of state.seats) {
        const playerId: PlayerId = seat.id;
        const obs = getObservation(state, playerId);
        const serial = serialPublic(obs);

        // a) ninguna carta en mano de OTRO jugador aparece en la parte pública.
        for (const other of state.seats) {
          if (other.id === playerId) continue;
          for (const card of state.hand.hands[other.id]) {
            expect(serial).not.toContain(`"${card.id}"`);
          }
        }
        // b) unseenCards es exactamente el conjunto calculado con info pública.
        expect(ids(obs.unseenCards)).toEqual(expectedUnseen(state, playerId));
        // c) ningún puntaje de envido fuera de `revealed`.
        const revealed = state.hand.envido.result?.revealed ?? [];
        for (const entry of obs.publicScores) {
          expect(revealed.some((r) => r.playerId === entry.playerId)).toBe(true);
        }
        checkedPlayers += 1;
      }
    }
    expect(checkedPlayers).toBeGreaterThanOrEqual(300);
  });
});
