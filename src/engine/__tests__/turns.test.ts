// Tests de src/engine/turns.ts — AC 2: quién responde el canto (lo usan truco,
// envido y flor). Los equipos son intercalados: pares = 0, impares = 1.

import { describe, expect, it } from 'vitest';
import { createMatch } from '../match.js';
import { responderFor, teamOf } from '../turns.js';
import type { MatchState } from '../types.js';

/** Partida con `firstDealerSeat` 0: el mano es p1 y los participantes arrancan ahí. */
function matchOf(playerCount: 2 | 4 | 6): MatchState {
  return createMatch({ rules: { playerCount }, seed: 1, firstDealerSeat: 0 });
}

/** Todos los asientos dejan de ser humanos: fuerza la regla de "el primero después del que cantó". */
function withoutHuman(state: MatchState): MatchState {
  const next = structuredClone(state);
  for (const seat of next.seats) seat.isHuman = false;
  return next;
}

describe('teamOf', () => {
  it('devuelve el equipo del asiento (pares = 0, impares = 1)', () => {
    const state = matchOf(4);
    expect(teamOf(state, 'p0')).toBe(0);
    expect(teamOf(state, 'p1')).toBe(1);
    expect(teamOf(state, 'p2')).toBe(0);
    expect(teamOf(state, 'p3')).toBe(1);
  });

  it('tira si el jugador no está sentado', () => {
    expect(() => teamOf(matchOf(2), 'p9')).toThrow('UNKNOWN_PLAYER: p9');
  });
});

describe('responderFor', () => {
  it('en 2 jugadores responde el otro (que es el humano si él no cantó)', () => {
    const state = matchOf(2);
    expect(state.hand.participants).toEqual(['p1', 'p0']);

    expect(responderFor(state, 'p1')).toBe('p0'); // lo canta una IA → responde el humano
    expect(responderFor(state, 'p0')).toBe('p1');
  });

  it('en 4 jugadores el humano tiene prioridad sobre el orden de los participantes', () => {
    const state = matchOf(4);
    expect(state.hand.participants).toEqual(['p1', 'p2', 'p3', 'p0']);

    expect(responderFor(state, 'p1')).toBe('p0'); // equipo 0 rival: p2 y p0 → p0 (humano)
    expect(responderFor(state, 'p2')).toBe('p3'); // equipo 1 rival: p1 y p3 → p3 (no está el humano)
    expect(responderFor(state, 'p3')).toBe('p0'); // equipo 0 rival: p2 y p0 → p0 (humano)
    expect(responderFor(state, 'p0')).toBe('p1'); // equipo 1 rival: p1 y p3 → el primero después de p0
  });

  it('sin humano en la mesa, en 4 jugadores responde el primero del equipo rival después del que cantó', () => {
    const state = withoutHuman(matchOf(4));

    expect(responderFor(state, 'p1')).toBe('p2');
    expect(responderFor(state, 'p2')).toBe('p3');
    expect(responderFor(state, 'p3')).toBe('p0');
    expect(responderFor(state, 'p0')).toBe('p1');
  });

  it('sin humano en la mesa, en 6 jugadores el orden es circular desde el que cantó', () => {
    const state = withoutHuman(matchOf(6));
    expect(state.hand.participants).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p0']);

    expect(responderFor(state, 'p1')).toBe('p2');
    expect(responderFor(state, 'p3')).toBe('p4');
    expect(responderFor(state, 'p5')).toBe('p0');
    expect(responderFor(state, 'p0')).toBe('p1'); // cierra el círculo
  });

  it('solo mira los `participants` (submano de pica-pica): el humano responde si está en el par', () => {
    const state = matchOf(6);
    state.hand.participants = ['p1', 'p4'];
    expect(responderFor(state, 'p1')).toBe('p4');

    const humanPair = matchOf(6);
    humanPair.hand.participants = ['p0', 'p3'];
    expect(responderFor(humanPair, 'p3')).toBe('p0'); // el humano primero
    expect(responderFor(humanPair, 'p0')).toBe('p3');
  });

  it('tira si el que cantó no está sentado o no hay rivales en la mesa', () => {
    const state = matchOf(4);
    expect(() => responderFor(state, 'p9')).toThrow('UNKNOWN_PLAYER: p9');

    const solo: MatchState = structuredClone(state);
    solo.hand.participants = ['p0'];
    expect(() => responderFor(solo, 'p0')).toThrow('NO_RIVAL: p0');
  });
});
