// GameEngine - Core game logic for Truco

import { Deck } from './Deck.js';
import { Player } from './Player.js';
import { getCardRank, compareCards } from './Rules.js';
import type { Card } from './Card.js';

export type GamePhase = 'menu' | 'dealing' | 'playing' | 'envido-pending'
  | 'truco-pending' | 'retruco-pending' | 'vale4-pending'
  | 'round-over' | 'game-over';

export interface RoundState {
  playerHand: Card[];
  aiHand: Card[];
  playedCards: { player: Card | null; ai: Card | null }[];
  currentTrick: number; // 0, 1, 2
  trickWinner: string | null; // 'player', 'ai', or null
  handsWon: { player: number; ai: number };
}

export interface GameEvent {
  type: 'round-start' | 'card-played' | 'trick-winner' | 'round-winner' | 'game-over'
    | 'envido-challenge' | 'truco-challenge' | 'retruco-challenge' | 'vale4-challenge'
    | 'truco-accepted' | 'truco-rejected' | 'envido-result';
  data?: any;
}

const WINNING_SCORE = 30;

export class GameEngine {
  private _scores: Record<string, number> = { player: 0, ai: 0 };
  private deck = new Deck();
  private phase: GamePhase = 'menu';
  private round: RoundState | null = null;
  private _currentTrucoLevel: number = 0; // 0=none, 1=truco, 2=retruco, 3=vale4
  private trucoChallenger: string | null = null;
  private trucoPending: boolean = false;
  private envidoPending: boolean = false;
  private envidoChallenger: string | null = null;
  private envidoScores: { player: number; ai: number } | null = null;
  private lastPlayedCardIndex: number = -1;
  private _playerHand: Card[] = [];
  private _aiHand: Card[] = [];
  private onEventCallback: ((event: GameEvent) => void) | null = null;
  private playerWonLastTrick: boolean = false; // mano advantage

  get phaseValue(): GamePhase { return this.phase; }
  get currentTrucoLevel(): number { return this._currentTrucoLevel; }
  set currentTrucoLevel(val: number) { this._currentTrucoLevel = val; }
  get roundState(): RoundState | null { return this.round; }
  get playerHand(): Card[] { return this._playerHand; }
  set playerHand(val: Card[]) { this._playerHand = val; }
  get aiHand(): Card[] { return this._aiHand; }
  set aiHand(val: Card[]) { this._aiHand = val; }
  get scores(): Record<string, number> { return this._scores; }
  set scores(val: Record<string, number>) { this._scores = val; }
  set onEvent(fn: ((event: GameEvent) => void) | null) { this.onEventCallback = fn; }

  emit(event: GameEvent): void {
    if (this.onEventCallback) {
      this.onEventCallback(event);
    }
  }

  init(_players: any[]): void {
    this.scores = { player: 0, ai: 0 };
    this.currentTrucoLevel = 0;
    this.trucoChallenger = null;
    this.trucoPending = false;
    this.envidoPending = false;
    this.phase = 'menu';
  }

  startRound(): void {
    // Reshuffle if deck is low
    if (this.deck.remaining < 6) {
      this.deck.reset();
    }

    this.playerHand = [];
    this.aiHand = [];

    // Deal 3 cards each
    for (let i = 0; i < 3; i++) {
      this.playerHand.push(this.deck.draw()!);
      this.aiHand.push(this.deck.draw()!);
    }

    this.round = {
      playerHand: [...this.playerHand],
      aiHand: [...this.aiHand],
      playedCards: [],
      currentTrick: 0,
      trickWinner: null,
      handsWon: { player: 0, ai: 0 },
    };

    this.currentTrucoLevel = 0;
    this.trucoChallenger = null;
    this.trucoPending = false;
    this.envidoPending = false;
    this.envidoScores = null;
    this.lastPlayedCardIndex = -1;
    this.phase = 'dealing';

    this.emit({ type: 'round-start', data: {
      playerHand: this.playerHand,
      aiHand: this.aiHand,
      scores: { ...this.scores },
    }});

    this.phase = 'playing';
  }

  /**
   * Player plays a card by index in their hand
   */
  playerPlayCard(cardIndex: number): Card | null {
    if (this.phase !== 'playing' || this.trucoPending) return null;
    if (cardIndex < 0 || cardIndex >= this.playerHand.length) return null;

    const card = this.playerHand.splice(cardIndex, 1)[0];
    if (!card) return null;

    this.lastPlayedCardIndex = cardIndex;

    // Check if player already played a card this trick
    const currentTrick = this.round!.playedCards[this.round!.currentTrick];
    if (currentTrick && currentTrick.player) {
      // Player tried to play twice — not allowed
      this.playerHand.splice(cardIndex, 0, card);
      return null;
    }

    currentTrick.player = card;

    this.emit({ type: 'card-played', data: {
      card, playerId: 'player', trick: this.round!.currentTrick,
    }});

    // Check if AI also played — resolve trick
    if (currentTrick.ai) {
      this.resolveTrick();
    }

    return card;
  }

  /**
   * AI plays a card (called by AIPlayer)
   */
  aiPlayCard(cardIndex: number): Card | null {
    if (this.phase !== 'playing' || this.trucoPending) return null;
    if (cardIndex < 0 || cardIndex >= this.aiHand.length) return null;

    const card = this.aiHand.splice(cardIndex, 1)[0];
    if (!card) return null;

    const currentTrick = this.round!.playedCards[this.round!.currentTrick];
    if (currentTrick && currentTrick.ai) {
      this.aiHand.splice(cardIndex, 0, card);
      return null;
    }

    currentTrick.ai = card;

    this.emit({ type: 'card-played', data: {
      card, playerId: 'ai', trick: this.round!.currentTrick,
    }});

    // Check if player also played — resolve trick
    if (currentTrick.player) {
      this.resolveTrick();
    }

    return card;
  }

  /**
   * Resolve a completed trick
   */
  private resolveTrick(): void {
    const trick = this.round!.playedCards[this.round!.currentTrick];
    if (!trick.player || !trick.ai) return;

    const result = compareCards(trick.player, trick.ai);

    let trickWinner: string;
    if (result === 1) {
      trickWinner = 'player';
      this.round!.handsWon.player++;
    } else if (result === -1) {
      trickWinner = 'ai';
      this.round!.handsWon.ai++;
    } else {
      // Equal rank — player wins ties
      trickWinner = 'player';
      this.round!.handsWon.player++;
    }

    this.round!.trickWinner = trickWinner;
    this.playerWonLastTrick = (trickWinner === 'player');

    this.emit({ type: 'trick-winner', data: {
      trick: this.round!.currentTrick,
      winner: trickWinner,
      playerCard: trick.player,
      aiCard: trick.ai,
    }});

    // Check if round is over (3 tricks played)
    if (this.round!.currentTrick >= 2) {
      this.endRound();
      return;
    }

    // Advance to next trick
    this.round!.currentTrick++;
    this.round!.playedCards.push({ player: null, ai: null });
  }

  /**
   * Handle truco challenge from player
   */
  challengeTruco(): void {
    if (this.phase !== 'playing' || this.trucoPending) return;

    switch (this.currentTrucoLevel) {
      case 0:
        this.currentTrucoLevel = 1;
        this.trucoChallenger = 'player';
        this.trucoPending = true;
        this.emit({ type: 'truco-challenge', data: { level: 1 } });
        break;
      case 1:
        this.currentTrucoLevel = 2;
        this.trucoChallenger = 'player';
        this.trucoPending = true;
        this.emit({ type: 'retruco-challenge', data: { level: 2 } });
        break;
      case 2:
        this.currentTrucoLevel = 3;
        this.trucoChallenger = 'player';
        this.trucoPending = true;
        this.emit({ type: 'vale4-challenge', data: { level: 3 } });
        break;
      // At vale4, can't challenge more
    }
  }

  /**
   * AI challenges truco
   */
  aiChallengeTruco(): void {
    if (this.phase !== 'playing' || this.trucoPending) return;

    switch (this.currentTrucoLevel) {
      case 0:
        this.currentTrucoLevel = 1;
        this.trucoChallenger = 'ai';
        this.trucoPending = true;
        this.emit({ type: 'truco-challenge', data: { level: 1 } });
        break;
      case 1:
        this.currentTrucoLevel = 2;
        this.trucoChallenger = 'ai';
        this.trucoPending = true;
        this.emit({ type: 'retruco-challenge', data: { level: 2 } });
        break;
      case 2:
        this.currentTrucoLevel = 3;
        this.trucoChallenger = 'ai';
        this.trucoPending = true;
        this.emit({ type: 'vale4-challenge', data: { level: 3 } });
        break;
    }
  }

  /**
   * Player accepts a truco challenge
   */
  acceptTruco(): void {
    if (!this.trucoPending) return;
    this.trucoPending = false;
    this.trucoChallenger = null;
    this.emit({ type: 'truco-accepted', data: { level: this.currentTrucoLevel } });
  }

  /**
   * Player rejects a truco challenge
   */
  rejectTruco(): void {
    if (!this.trucoPending) return;

    // Challenger wins the round
    const winner = this.trucoChallenger || 'ai';
    const points = this.getTrucoPoints();

    if (winner === 'player') {
      this.scores.player += points;
    } else {
      this.scores.ai += points;
    }

    this.trucoPending = false;
    this.trucoChallenger = null;

    this.emit({ type: 'truco-rejected', data: {
      winner, points, scores: { ...this.scores },
    }});

    this.checkGameOver();
  }

  /**
   * Get the point value for the current truco level
   */
  private getTrucoPoints(): number {
    switch (this.currentTrucoLevel) {
      case 1: return 1;
      case 2: return 2;
      case 3: return 4;
      default: return 1;
    }
  }

  /**
   * Player challenges envido
   */
  challengeEnvido(): void {
    if (this.phase !== 'playing' || this.envidoPending) return;
    this.envidoPending = true;
    this.envidoChallenger = 'player';
    this.emit({ type: 'envido-challenge', data: { challenger: 'player' } });
  }

  /**
   * AI challenges envido
   */
  aiChallengeEnvido(): void {
    if (this.phase !== 'playing' || this.envidoPending) return;
    this.envidoPending = true;
    this.envidoChallenger = 'ai';
    this.emit({ type: 'envido-challenge', data: { challenger: 'ai' } });
  }

  /**
   * Resolve envido
   */
  resolveEnvido(): void {
    if (!this.envidoPending) return;

    const playerScore = this.calculateEnvidoForHand(this.playerHand);
    const aiScore = this.calculateEnvidoForHand(this.aiHand);

    this.envidoScores = { player: playerScore, ai: aiScore };

    let winner: string;
    if (playerScore >= aiScore) {
      winner = 'player';
      this.scores.player += 1;
    } else {
      winner = 'ai';
      this.scores.ai += 1;
    }

    this.envidoPending = false;
    this.envidoChallenger = null;

    this.emit({ type: 'envido-result', data: {
      winner, playerScore, aiScore, scores: { ...this.scores },
    }});
  }

  /**
   * Calculate envido for a specific hand (not stored Player object)
   */
  private calculateEnvidoForHand(cards: Card[]): number {
    if (cards.length === 0) return 0;

    const suitCounts: Record<string, number> = {};
    for (const card of cards) {
      suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    }

    let maxScore = 0;
    for (const [suit, count] of Object.entries(suitCounts)) {
      if (count >= 2) {
        const suitCards = cards.filter(c => c.suit === suit);
        // Sort by number descending (highest number = best envido value)
        suitCards.sort((a, b) => b.number - a.number);
        const score = 20 + suitCards[0].number + suitCards[1].number;
        maxScore = Math.max(maxScore, score);
      }
    }

    if (maxScore === 0 && cards.length > 0) {
      maxScore = Math.max(...cards.map(c => c.number));
    }

    return maxScore;
  }

  /**
   * End the current round and award points
   */
  private endRound(): void {
    const hands = this.round!.handsWon;
    let roundWinner: string;
    let points: number;

    if (hands.player >= 2) {
      roundWinner = 'player';
      points = 1;
    } else if (hands.ai >= 2) {
      roundWinner = 'ai';
      points = 1;
    } else {
      // 1-1 tie — player (mano) wins
      roundWinner = 'player';
      points = 1;
    }

    this.scores[roundWinner] += points;

    this.emit({ type: 'round-winner', data: {
      winner: roundWinner, points, scores: { ...this.scores },
      handsWon: hands,
    }});

    this.phase = 'round-over';
    this.checkGameOver();
  }

  /**
   * Check if any player has reached the winning score
   */
  private checkGameOver(): void {
    if (this.scores.player >= WINNING_SCORE || this.scores.ai >= WINNING_SCORE) {
      const winner = this.scores.player >= WINNING_SCORE ? 'player' : 'ai';
      this.phase = 'game-over';
      this.emit({ type: 'game-over', data: { winner, scores: { ...this.scores } }});
    } else {
      // Start next round after a delay
      setTimeout(() => {
        if (this.phase === 'round-over') {
          this.startRound();
        }
      }, 2000);
    }
  }

  /**
   * Get remaining deck count
   */
  get deckRemaining(): number {
    return this.deck.remaining;
  }
}
