// Helpers compartidos por los tests del motor.
// `deckFor` arma un mazo fijo para que cada jugador reciba exactamente las cartas pedidas.

import { createDeck } from '../cards.js';
import type { Card, CardNumber, PlayerId, Suit } from '../types.js';

/** Arma una carta a partir de su id ("1-espada", "7-oro", "12-copa"). */
export function card(id: string): Card {
  const [number, suit] = id.split('-');
  return { id, number: Number(number) as CardNumber, suit: suit as Suit };
}

/** Ids de una lista de cartas (para comparar con `toEqual`). */
export function ids(cards: readonly Card[]): string[] {
  return cards.map((c) => c.id);
}

/** Asiento de un `playerId` ("p3" → 3). */
export function seatOf(playerId: PlayerId): number {
  return Number(playerId.slice(1));
}

/**
 * Mazo fijo para un reparto: la carta `k` del mazo va al asiento `(manoSeat + k) % n`,
 * así que la vuelta `round` del asiento `s` sale de `k = (s - manoSeat) mod n + round * n`.
 * Los lugares no pedidos se completan con cartas de un mazo real (sin repetir).
 */
export function deckFor(handsByPlayer: Record<PlayerId, string[]>, manoSeat: number, n: number): Card[] {
  const slots: (Card | undefined)[] = new Array(3 * n).fill(undefined);

  for (const playerId of Object.keys(handsByPlayer)) {
    const seat = seatOf(playerId);
    const requested = handsByPlayer[playerId];
    for (let round = 0; round < 3; round++) {
      const k = ((((seat - manoSeat) % n) + n) % n) + round * n;
      slots[k] = card(requested[round]);
    }
  }

  const used = new Set(slots.filter((slot): slot is Card => slot !== undefined).map((c) => c.id));
  const filler = createDeck().filter((c) => !used.has(c.id));
  let nextFiller = 0;

  return slots.map((slot) => {
    if (slot === undefined) {
      const c = filler[nextFiller];
      nextFiller += 1;
      return c;
    }
    return slot;
  });
}
