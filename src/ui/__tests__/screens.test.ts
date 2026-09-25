import { describe, expect, it } from 'vitest';
import type { Card } from '../../engine/index.js';
import { envidoCards } from '../screens.js';

const c = (number: number, suit: Card['suit']): Card => ({ id: `${number}-${suit}`, number, suit }) as Card;
const ids = (cards: Card[]): string[] => cards.map((card) => `${card.number}-${card.suit}`).sort();

describe('envidoCards: qué cartas se marcan como envido en el resumen de mano', () => {
  it('par del mismo palo: marca esas dos (6 y 3 de espada = 29)', () => {
    expect(ids(envidoCards([c(6, 'espada'), c(3, 'espada'), c(1, 'oro')]))).toEqual(['3-espada', '6-espada']);
  });
  it('tres del mismo palo: marca las dos más altas para el envido', () => {
    expect(ids(envidoCards([c(7, 'copa'), c(12, 'copa'), c(5, 'copa')]))).toEqual(['5-copa', '7-copa']);
  });
  it('par de figuras cuenta (20): marca las dos figuras', () => {
    expect(ids(envidoCards([c(12, 'basto'), c(11, 'basto'), c(7, 'oro')]))).toEqual(['11-basto', '12-basto']);
  });
  it('sin palo repetido: marca la más alta', () => {
    expect(ids(envidoCards([c(4, 'espada'), c(7, 'oro'), c(10, 'copa')]))).toEqual(['7-oro']);
  });
  it('tres figuras de distinto palo (0 de envido): no marca ninguna', () => {
    expect(envidoCards([c(10, 'espada'), c(11, 'oro'), c(12, 'copa')])).toEqual([]);
  });
});
