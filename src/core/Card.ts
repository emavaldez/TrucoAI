// Card definition and ranking for Argentine Truco
// Ranking: higher number = stronger card

export type Suit = 'espada' | 'basto' | 'oro' | 'copa';
export type CardNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

export interface Card {
  number: CardNumber;
  suit: Suit;
}

/**
 * Returns the ranking of a card for combat comparison.
 * Higher value = stronger card.
 */
export function getCardRanking(card: Card): number {
  switch (card.number) {
    case 4: return 0;
    case 5: return 1;
    case 6: return 2;
    case 7:
      if (card.suit === 'basto' || card.suit === 'copa') return 3;
      if (card.suit === 'oro') return 10;
      // espada
      return 11;
    case 10: return 4;
    case 11: return 5;
    case 12: return 6;
    case 1:
      if (card.suit === 'oro' || card.suit === 'copa') return 7;
      if (card.suit === 'basto') return 12;
      // espada
      return 13;
    case 2: return 8;
    case 3: return 9;
    default: return -1;
  }
}

export function cardToString(card: Card): string {
  return `${card.number} de ${card.suit}`;
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.number === b.number && a.suit === b.suit;
}

export function createCard(number: CardNumber, suit: Suit): Card {
  return { number, suit };
}
