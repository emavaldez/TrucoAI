// "Jugá tranquilo" = jugá chica, guardá la grande (Emmanuel 2026-10-20), y el resto de las indicaciones.

import { describe, expect, it } from 'vitest';
import { createMatch, getActor, getObservation, applyAction } from '../../engine/index.js';
import type { MatchState, PlayerId } from '../../engine/index.js';
import { deckFor } from '../../engine/__tests__/helpers.js';
import { cardForInstruction } from '../followInstruction.js';

// 4 jugadores, repartidor en el asiento 3: mano p0 (equipo 0), después p1 (equipo 1), p2 (equipo 0), p3 (equipo 1).
const HANDS = {
  p0: ['2-oro', '1-basto', '4-copa'], // un 2, el ancho de basto y un 4
  p1: ['5-espada', '10-basto', '3-oro'],
  p2: ['7-copa', '12-oro', '11-basto'],
  p3: ['4-oro', '5-copa', '6-oro'],
};

function match(): MatchState {
  return createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: 3, deck: deckFor(HANDS, 0, 4) });
}

function play(state: MatchState, cardId: string): MatchState {
  const result = applyAction(state, getActor(state) as PlayerId, { type: 'PLAY_CARD', cardId });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('jugá tranquilo', () => {
  it('al abrir, juega la mejor de las chicas y se guarda la grande', () => {
    const obs = getObservation(match(), 'p0');
    expect(cardForInstruction(obs, ['TRANQUILO'])?.id).toBe('2-oro');
  });

  it('contestando, gana barato sin la grande; si no puede, la más baja', () => {
    // p0 abre con el 4; p1 tira el 10; ahora p2 (compañero de p0) con 7-copa, 12-oro, 11-basto: gana barato con el 11
    // (el 7 de copa no le gana al 10) y se guarda el 12.
    let state = play(play(match(), '4-copa'), '10-basto');
    expect(getActor(state)).toBe('p2');
    expect(cardForInstruction(getObservation(state, 'p2'), ['TRANQUILO'])?.id).toBe('11-basto');
    // Si el rival tiró el 3, no le gana ni con la mejor: la más baja.
    state = play(play(match(), '4-copa'), '3-oro');
    expect(cardForInstruction(getObservation(state, 'p2'), ['TRANQUILO'])?.id).toBe('7-copa');
  });

  it('si la baza ya la tiene el equipo, la más baja; con una sola carta, esa', () => {
    // p0 abre con el ancho de basto; p1 tira el 5: p2 ya la tiene.
    const state = play(play(match(), '1-basto'), '5-espada');
    expect(cardForInstruction(getObservation(state, 'p2'), ['TRANQUILO'])?.id).toBe('7-copa');
  });

  it('sin indicación de cartas, decide la política', () => {
    expect(cardForInstruction(getObservation(match(), 'p0'), [])).toBeNull();
    expect(cardForInstruction(getObservation(match(), 'p0'), ['CANTA_TRUCO'])).toBeNull();
  });

  it('«¡matá!» cuando el compañero ya la tiene: la más baja (no se pisa al compañero)', () => {
    const state = play(play(match(), '1-basto'), '5-espada');
    expect(cardForInstruction(getObservation(state, 'p2'), ['MATA'])?.id).toBe('7-copa');
  });
});
