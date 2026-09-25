// Cantar los tantos (GDD §6.6, decisión de Emmanuel 2026-09-25): orden desde el mano, el equipo
// que va ganando no habla, "me dio" mientras quede un compañero por hablar, "son buenas" el último,
// y en empate gana el que está antes en el orden desde el mano.

import { describe, expect, it } from 'vitest';
import { createMatch } from '../../match.js';
import { getObservation } from '../../observation.js';
import type { EnvidoSaying, MatchState, PlayerId } from '../../types.js';
import { answerEnvido, callEnvido, deckFor } from '../helpers.js';

/** Partida de 4 con mano p0 (orden p0 p1 p2 p3; equipo A = p0 p2, B = p1 p3): p0 canta, p1 quiere. */
function tantos4(hands: Record<PlayerId, string[]>): MatchState {
  const state = createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: 3, deck: deckFor(hands, 0, 4) });
  return answerEnvido(callEnvido(state, 'p0', 'E').state, 'p1', 'QUIERO').state;
}

function said(state: MatchState): string[] {
  return (state.hand.envido.result?.sayings ?? []).map((s: EnvidoSaying) =>
    s.kind === 'SCORE' ? `${s.playerId} ${s.score}` : `${s.playerId} ${s.kind === 'ME_DIO' ? 'me dio' : 'son buenas'}`,
  );
}

describe('cantar los tantos en 4 jugadores', () => {
  it('1. gana el equipo del mano: los rivales dicen "me dio" y el último "son buenas"; el compañero no habla', () => {
    const state = tantos4({
      p0: ['7-oro', '3-oro', '4-copa'], // 30
      p1: ['2-espada', '3-espada', '12-oro'], // 25
      p2: ['4-basto', '3-basto', '10-copa'], // 27
      p3: ['5-copa', '3-copa', '11-espada'], // 28
    });
    expect(said(state)).toEqual(['p0 30', 'p1 me dio', 'p3 son buenas']);
    expect(state.hand.envido.result).toMatchObject({ winnerTeam: 0, winnerId: 'p0', revealed: [{ playerId: 'p0', score: 30 }] });
    expect(state.scores).toEqual([2, 0]);
  });

  it('2. da vuelta el segundo', () => {
    const state = tantos4({
      p0: ['2-espada', '3-espada', '12-oro'], // 25
      p1: ['7-copa', '4-copa', '10-oro'], // 31
      p2: ['5-oro', '4-oro', '11-basto'], // 29
      p3: ['10-espada', '12-espada', '11-copa'], // 20
    });
    expect(said(state)).toEqual(['p0 25', 'p1 31', 'p2 son buenas']);
    expect(state.hand.envido.result?.winnerId).toBe('p1');
  });

  it('3. van y vienen: el compañero que se había salteado habla cuando cambia la delantera', () => {
    const state = tantos4({
      p0: ['2-espada', '3-espada', '12-oro'], // 25
      p1: ['10-copa', '12-copa', '11-oro'], // 20
      p2: ['7-copa', '4-copa', '10-basto'], // 31
      p3: ['5-basto', '3-basto', '11-espada'], // 28
    });
    expect(said(state)).toEqual(['p0 25', 'p1 me dio', 'p3 28', 'p2 31']);
    expect(state.hand.envido.result).toMatchObject({ winnerTeam: 0, winnerId: 'p2' });
  });

  it('4. empate: el que está después en el orden no le gana al que está antes', () => {
    const state = tantos4({
      p0: ['5-copa', '3-copa', '12-oro'], // 28
      p1: ['5-oro', '3-oro', '11-copa'], // 28 (empata, pero está después)
      p2: ['10-espada', '12-espada', '4-basto'], // 20
      p3: ['7-basto', '3-basto', '11-espada'], // 30
    });
    expect(said(state)).toEqual(['p0 28', 'p1 me dio', 'p3 30', 'p2 son buenas']);
    expect(state.hand.envido.result?.winnerId).toBe('p3');
  });

  it('5. empate a favor del que está antes aunque hable después (el salteado)', () => {
    const state = tantos4({
      p0: ['10-oro', '12-oro', '4-copa'], // 20
      p1: ['2-basto', '4-basto', '11-copa'], // 26
      p2: ['5-espada', '4-espada', '12-copa'], // 29
      p3: ['6-copa', '3-copa', '10-basto'], // 29 (empata con p2, que está antes)
    });
    expect(said(state)).toEqual(['p0 20', 'p1 26', 'p2 29', 'p3 son buenas']);
    expect(state.hand.envido.result?.winnerId).toBe('p2');
  });

  it('lo que no se dijo no se revela: "me dio" y "son buenas" solo acotan (para la IA)', () => {
    const state = tantos4({
      p0: ['7-oro', '3-oro', '4-copa'],
      p1: ['2-espada', '3-espada', '12-oro'],
      p2: ['4-basto', '3-basto', '10-copa'],
      p3: ['5-copa', '3-copa', '11-espada'],
    });
    const obs = getObservation(state, 'p1');
    expect(obs.publicScores).toEqual([{ playerId: 'p0', score: 30, kind: 'ENVIDO' }]);
    expect(obs.envidoSayings.find((s) => s.playerId === 'p3')).toEqual({ playerId: 'p3', kind: 'SON_BUENAS', against: 30 });
  });
});

describe('cantar los tantos en 6 y en 2', () => {
  it('6 jugadores: cambia la delantera dos veces y el equipo que pierde se rinde', () => {
    const hands = {
      p0: ['4-basto', '3-basto', '12-oro'], // 27
      p1: ['7-oro', '3-oro', '11-copa'], // 30
      p2: ['7-espada', '6-espada', '10-copa'], // 33
      p3: ['10-espada', '12-espada', '4-copa'], // 20
      p4: ['1-espada', '2-copa', '11-basto'], // 2
      p5: ['5-copa', '12-copa', '6-oro'], // 25
    };
    let state = createMatch({ rules: { playerCount: 6 }, seed: 1, firstDealerSeat: 5, deck: deckFor(hands, 0, 6) });
    state = answerEnvido(callEnvido(state, 'p0', 'E').state, 'p1', 'QUIERO').state;
    expect(said(state)).toEqual(['p0 27', 'p1 30', 'p2 33', 'p3 me dio', 'p5 son buenas']);
    expect(state.hand.envido.result).toMatchObject({ winnerTeam: 0, winnerId: 'p2' });
  });

  it('2 jugadores: el pie dice su número o "son buenas"', () => {
    const base = (p1: string[]): MatchState => {
      const state = createMatch({
        rules: { playerCount: 2 },
        seed: 1,
        firstDealerSeat: 1,
        deck: deckFor({ p0: ['7-oro', '3-oro', '4-copa'], p1 }, 0, 2),
      });
      return answerEnvido(callEnvido(state, 'p0', 'E').state, 'p1', 'QUIERO').state;
    };
    expect(said(base(['2-espada', '3-espada', '12-copa']))).toEqual(['p0 30', 'p1 son buenas']);
    expect(said(base(['7-espada', '6-espada', '12-copa']))).toEqual(['p0 30', 'p1 33']);
  });

  it('envido no querido: no se canta nada', () => {
    let state = createMatch({ rules: { playerCount: 2 }, seed: 3, firstDealerSeat: 1 });
    state = answerEnvido(callEnvido(state, 'p0', 'E').state, 'p1', 'NO_QUIERO').state;
    expect(state.hand.envido.result).toMatchObject({ sayings: [], winnerId: null, revealed: [] });
  });
});
