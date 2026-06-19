// Tests for Truco rules and card comparison logic
import { describe, it, expect } from 'vitest';
import { getCardRank, compareCards, resolverBaza, getCardName, hasFlor } from '../core/Rules.js';
import type { Card } from '../core/Card.js';

/** Helper: team lookup function for standard 4-player game */
function teamLookup(playerId: string): number {
  // Positions 0,2 = team 0; positions 1,3 = team 1
  const pos = parseInt(playerId.replace(/[^0-9]/g, ''), 10);
  return pos % 2 === 0 ? 0 : 1;
}

describe('getCardRank', () => {
  it('debería devolver 13 para 1-espada (la más fuerte)', () => {
    expect(getCardRank({ suit: 'espada', number: 1 })).toBe(13);
  });

  it('debería devolver 12 para 1-basto', () => {
    expect(getCardRank({ suit: 'basto', number: 1 })).toBe(12);
  });

  it('debería devolver 11 para 7-espada', () => {
    expect(getCardRank({ suit: 'espada', number: 7 })).toBe(11);
  });

  it('debería devolver 10 para 7-oro', () => {
    expect(getCardRank({ suit: 'oro', number: 7 })).toBe(10);
  });

  it('debería devolver 0 para 4 (la más débil)', () => {
    expect(getCardRank({ suit: 'espada', number: 4 })).toBe(0);
  });

  it('los números 1-7 deberían tener un rango definido', () => {
    const numbers = [1, 2, 3, 4, 5, 6, 7];
    for (const n of numbers) {
      const rank = getCardRank({ suit: 'espada', number: n });
      expect(rank).toBeGreaterThanOrEqual(0);
      expect(rank).toBeLessThanOrEqual(13);
    }
  });

  it('1-oro y 1-copa deberían tener el mismo rango (7)', () => {
    expect(getCardRank({ suit: 'oro', number: 1 })).toBe(7);
    expect(getCardRank({ suit: 'copa', number: 1 })).toBe(7);
  });
});

describe('compareCards', () => {
  it('1-espada debería ganar a 4', () => {
    expect(compareCards({ suit: 'espada', number: 1 }, { suit: 'espada', number: 4 })).toBe(1);
  });

  it('4 debería perder contra 1-espada', () => {
    expect(compareCards({ suit: 'espada', number: 4 }, { suit: 'espada', number: 1 })).toBe(-1);
  });

  it('cartas iguales deberían empatar', () => {
    const card1: Card = { suit: 'espada', number: 5 };
    const card2: Card = { ...card1 };
    expect(compareCards(card1, card2)).toBe(0);
  });

  it('1-oro debería empatar con 1-copa (mismo rango)', () => {
    expect(compareCards(
      { suit: 'oro', number: 1 },
      { suit: 'copa', number: 1 }
    )).toBe(0);
  });

  it('7-espada debería ganar a 7-oro', () => {
    expect(compareCards(
      { suit: 'espada', number: 7 },
      { suit: 'oro', number: 7 }
    )).toBe(1);
  });

  it('1-basto debería ganar a 1-oro (pero perder contra 1-espada)', () => {
    expect(compareCards(
      { suit: 'basto', number: 1 },
      { suit: 'oro', number: 1 }
    )).toBe(1);
    expect(compareCards(
      { suit: 'espada', number: 1 },
      { suit: 'basto', number: 1 }
    )).toBe(1);
  });
});

describe('resolverBaza', () => {
  it('debería devolver el equipo 0 cuando su carta es la más alta', () => {
    const result = resolverBaza([
      { card: { suit: 'espada', number: 1 }, playerId: 'p0' }, // team 0 — rank 13
      { card: { suit: 'oro', number: 4 }, playerId: 'p1' },  // team 1 — rank 0
    ], teamLookup);
    expect(result.winnerTeam).toBe(0);
    expect(result.winnerPlayerId).toBe('p0');
    expect(result.tied).toBe(false);
  });

  it('debería devolver el equipo 1 cuando su carta es la más alta', () => {
    const result = resolverBaza([
      { card: { suit: 'espada', number: 4 }, playerId: 'p0' }, // team 0 — rank 0
      { card: { suit: 'espada', number: 1 }, playerId: 'p1' }, // team 1 — rank 13
    ], teamLookup);
    expect(result.winnerTeam).toBe(1);
    expect(result.winnerPlayerId).toBe('p1');
    expect(result.tied).toBe(false);
  });

  it('debería manejar empate cuando ambas equipos tienen la misma carta más alta', () => {
    const result = resolverBaza([
      { card: { suit: 'espada', number: 7 }, playerId: 'p0' }, // team 0 — rank 11
      { card: { suit: 'espada', number: 7 }, playerId: 'p1' }, // team 1 — rank 11
    ], teamLookup);
    expect(result.winnerTeam).toBe(-1);
    expect(result.winnerPlayerId).toBe(null);
    expect(result.tied).toBe(true);
  });

  it('debería devolver empate cuando no se proporciona getPlayerTeam y los playerIds no tienen patrones', () => {
    const result = resolverBaza([
      { card: { suit: 'oro', number: 3 }, playerId: 'player0' },
      { card: { suit: 'oro', number: 3 }, playerId: 'player1' },
    ]);
    expect(result.winnerTeam).toBe(-1);
    expect(result.tied).toBe(true);
  });

  it('debería manejar baza vacía', () => {
    const result = resolverBaza([], teamLookup);
    expect(result.winnerTeam).toBe(-1);
    expect(result.winnerPlayerId).toBe(null);
    expect(result.highestCard).toBe(null);
    expect(result.tied).toBe(false);
  });

  it('debería elegir la carta más alta de cada equipo (4 jugadores)', () => {
    const result = resolverBaza([
      { card: { suit: 'espada', number: 3 }, playerId: 'p0' }, // team 0 — rank 9
      { card: { suit: 'oro', number: 4 }, playerId: 'p1' },  // team 1 — rank 0
      { card: { suit: 'basto', number: 2 }, playerId: 'p2' }, // team 0 — rank 8 (lower)
      { card: { suit: 'espada', number: 7 }, playerId: 'p3' }, // team 1 — rank 11 (higher)
    ], teamLookup);
    // Team 0 highest = 9 (3), Team 1 highest = 11 (7 espada) → team 1 wins
    expect(result.winnerTeam).toBe(1);
    expect(result.winnerPlayerId).toBe('p3');
  });

  it('debería manejar correctamente la carta más alta de cada equipo (cada equipo juega su mejor)', () => {
    const result = resolverBaza([
      { card: { suit: 'oro', number: 1 }, playerId: 'p0' },  // team 0 — rank 7
      { card: { suit: 'espada', number: 1 }, playerId: 'p1' }, // team 1 — rank 13
      { card: { suit: 'basto', number: 7 }, playerId: 'p2' }, // team 0 — rank 3 (lower)
      { card: { suit: 'copa', number: 7 }, playerId: 'p3' }, // team 1 — rank 3 (lower)
    ], teamLookup);
    // Team 0 best: 7 (1-oro), Team 1 best: 13 (1-espada) → team 1 wins
    expect(result.winnerTeam).toBe(1);
  });
});

describe('getCardName', () => {
  it('debería formatear correctamente los nombres de las cartas', () => {
    expect(getCardName({ suit: 'espada', number: 1 })).toBe('1 de Espada');
    expect(getCardName({ suit: 'basto', number: 7 })).toBe('7 de Basto');
    expect(getCardName({ suit: 'oro', number: 12 })).toBe('12 de Oro');
  });
});

describe('hasFlor', () => {
  it('tres cartas del mismo palo deberían ser flor', () => {
    const cards: Card[] = [
      { suit: 'espada', number: 1 },
      { suit: 'espada', number: 2 },
      { suit: 'espada', number: 3 },
    ];
    expect(hasFlor(cards)).toBe(true);
  });

  it('menos de 3 cartas no deberían ser flor', () => {
    expect(hasFlor([{ suit: 'espada', number: 1 }, { suit: 'espada', number: 2 }])).toBe(false);
  });

  it('cartas de diferentes palos no deberían ser flor', () => {
    expect(hasFlor([
      { suit: 'espada', number: 1 },
      { suit: 'basto', number: 1 },
      { suit: 'espada', number: 2 },
    ])).toBe(false);
  });
});