// Tests de src/engine/envidoScore.ts — AC 1: puntaje de envido (GDD §6.1).
// Se calcula siempre sobre las 3 cartas REPARTIDAS [ENG-05]: el puntaje de un jugador
// no cambia porque haya jugado cartas.

import { describe, expect, it } from 'vitest';
import { createDeck } from '../cards.js';
import { envidoScore } from '../envidoScore.js';
import { card } from './helpers.js';

/** Puntaje de una mano dada por ids de carta ("7-copa", "6-copa", …). */
function score(...cardIds: string[]): number {
  return envidoScore(cardIds.map(card));
}

describe('envidoScore (AC 1)', () => {
  it('dos del mismo palo: 20 + las dos más altas (7+6 de copa = 33)', () => {
    expect(score('7-copa', '6-copa', '12-espada')).toBe(33);
  });

  it('1+12 de espada: la figura vale 0 → 21', () => {
    expect(score('1-espada', '12-espada', '4-basto')).toBe(21);
  });

  it('10+11 de oro: las dos figuras valen 0 → 20', () => {
    expect(score('10-oro', '11-oro', '3-copa')).toBe(20);
  });

  it('tres del mismo palo: 20 + las DOS MÁS ALTAS (7-6-5 de oro = 33)', () => {
    expect(score('7-oro', '6-oro', '5-oro')).toBe(33);
  });

  it('sin dos del mismo palo: vale la carta más alta (7-5-4 distintos palos = 7)', () => {
    expect(score('7-copa', '5-basto', '4-oro')).toBe(7);
  });

  it('tres figuras de distintos palos: 0', () => {
    expect(score('10-copa', '11-basto', '12-oro')).toBe(0);
  });

  it('los valores van de 0 a 33 en todas las manos posibles', () => {
    const deck = createDeck();
    for (let first = 0; first < deck.length; first++) {
      for (let second = first + 1; second < deck.length; second++) {
        for (let third = second + 1; third < deck.length; third++) {
          const value = envidoScore([deck[first], deck[second], deck[third]]);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(33);
        }
      }
    }
  });

  it('no muta las cartas que recibe', () => {
    const cards = [card('7-copa'), card('6-copa'), card('1-espada')];
    const snapshot = JSON.parse(JSON.stringify(cards));

    expect(envidoScore(cards)).toBe(33);
    expect(cards).toEqual(snapshot);
  });
});
