// Rules engine for Argentine Truco

import { Card, getCardRanking } from './Card.js';
import { Player } from './Player.js';

export interface RoundResult {
  winner: 'player' | 'opponent' | 'tie'; // who won the round (2 out of 3 hands)
  handsWonPlayer: number;
  handsWonOpponent: number;
  details: HandResult[];
}

export interface HandResult {
  handNumber: number;
  playerCard: Card | null;
  opponentCard: Card | null;
  winner: 'player' | 'opponent' | 'tie';
}

/**
 * Determine who wins a single hand (mano) of cards.
 * Returns: 'player', 'opponent', or 'tie'
 */
export function compareHands(
  playerCard: Card | null,
  opponentCard: Card | null,
  isPlayerHand: boolean // if tie, who wins (mano advantage)
): 'player' | 'opponent' | 'tie' {
  if (playerCard === null && opponentCard === null) return 'tie';

  // One player didn't play (folded scenario - shouldn't happen in normal flow)
  if (playerCard === null) return 'opponent';
  if (opponentCard === null) return 'player';

  const playerRank = getCardRanking(playerCard);
  const opponentRank = getCardRanking(opponentCard);

  if (playerRank > opponentRank) return 'player';
  if (opponentRank > playerRank) return 'opponent';

  // Tie - mano wins
  return isPlayerHand ? 'player' : 'opponent';
}

/**
 * Determine who wins a full round (best of 3 hands).
 * If all 3 hands are tied, mano wins.
 */
export function determineRoundWinner(
  playerCards: Card[],
  opponentCards: Card[],
  isPlayerHand: boolean
): 'player' | 'opponent' {
  const maxHands = Math.min(playerCards.length, opponentCards.length, 3);

  let playerWins = 0;
  let opponentWins = 0;
  let ties = 0;

  for (let i = 0; i < maxHands; i++) {
    const result = compareHands(playerCards[i], opponentCards[i], isPlayerHand);
    if (result === 'player') playerWins++;
    else if (result === 'opponent') opponentWins++;
    else ties++;
  }

  // Check if all hands were tied
  const allTied = maxHands === 3 && playerWins === 0 && opponentWins === 0;

  if (playerWins >= 2) return 'player';
  if (opponentWins >= 2) return 'opponent';

  // If tied, mano wins
  if (allTied || (playerWins === opponentWins && playerCards.length === opponentCards.length)) {
    return isPlayerHand ? 'player' : 'opponent';
  }

  // Fallback: whoever has more wins
  return playerWins > opponentWins ? 'player' : 'opponent';
}

/** Points awarded for winning envido */
export function getEnvidoPoints(level: number, loserPoints: number): number {
  switch (level) {
    case 1: // Envido
      return 2;
    case 2: // Envido envido
      return 3;
    case 3: // Real envido
      return 3;
    case 4: // Falta envido (all or nothing)
      return 15 - loserPoints;
    default:
      return 0;
  }
}

/** Points lost when rejecting envido */
export function getEnvidoLosePoints(envidosDeclared: number[]): number {
  let total = 0;

  for (const level of envidosDeclared) {
    if (level === -1) continue; // rejected

    switch (level) {
      case 1: total += 2; break;
      case 2: total += 3; break;
      case 3: total += 3; break;
    }
  }

  // If only one envido was declared (and then rejected), it's 1 point
  const accepted = envidosDeclared.filter(l => l > 0);
  if (accepted.length === 1) return 1;

  return total || 1;
}

/** Points awarded for winning truco at current level */
export function getTrucoWinPoints(level: number): number {
  switch (level) {
    case 0: return 1; // just won the round normally
    case 1: return 2; // Truco
    case 2: return 3; // Retruco
    case 3: return 4; // Vale 4
    default: return 1;
  }
}

/** Points lost when rejecting truco */
export function getTrucoLosePoints(level: number): number {
  // If you reject, opponent gets the points from level-1
  return getTrucoWinPoints(Math.max(0, level - 1));
}

/** Maximum points to win a game */
export const GAME_WIN_POINTS = 15;
