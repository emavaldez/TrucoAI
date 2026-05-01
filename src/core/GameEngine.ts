// GameEngine - Core game logic for Truco (supports 2 and 4 players)

import { Deck } from './Deck.js';
import type { Card } from './Card.js';
import type { PlayerInfo } from './Player.js';
import { getCardRank, compareCards } from './Rules.js';

export type GamePhase = 'menu' | 'dealing' | 'playing' | 'envido-pending'
  | 'truco-pending' | 'retruco-pending' | 'vale4-pending'
  | 'round-over' | 'game-over';

export interface RoundState {
  hands: Record<string, Card[]>;
  playedCards: Record<number, Record<string, Card | null>>; // trickIndex -> playerId -> card
  currentTrick: number;
  trickWinners: string[]; // who won each trick
  handsWon: Record<string, number>; // teamId -> tricks won
  currentTurn: string; // playerId whose turn it is
}

export interface GameEvent {
  type: 'round-start' | 'card-played' | 'trick-winner' | 'round-winner' | 'game-over'
    | 'envido-challenge' | 'truco-challenge' | 'retruco-challenge' | 'vale4-challenge'
    | 'truco-accepted' | 'truco-rejected' | 'envido-result';
  data?: any;
}

const WINNING_SCORE = 30;

export class GameEngine {
  private _scores: Record<string, number> = { '0': 0, '1': 0 };
  private deck = new Deck();
  private phase: GamePhase = 'menu';
  private round: RoundState | null = null;
  private _currentTrucoLevel: number = 0;
  private trucoChallenger: string | null = null;
  private trucoPending: boolean = false;
  private envidoPending: boolean = false;
  private envidoChallenger: string | null = null;
  private onEventCallback: ((event: GameEvent) => void) | null = null;
  private _playerCount: 2 | 4 = 2;
  private playerTeams: Record<string, number> = {}; // playerId -> teamId
  private teamNames: Record<number, string> = { 0: '0', 1: '1' };
  private playerNames: Record<string, string> = {};

  get phaseValue(): GamePhase { return this.phase; }
  get currentTrucoLevel(): number { return this._currentTrucoLevel; }
  set currentTrucoLevel(val: number) { this._currentTrucoLevel = val; }
  get scores(): Record<string, number> { return this._scores; }
  set scores(val: Record<string, number>) { this._scores = val; }
  set onEvent(fn: ((event: GameEvent) => void) | null) { this.onEventCallback = fn; }
  get roundState(): RoundState | null { return this.round; }
  get playerCount(): 2 | 4 { return this._playerCount; }

  emit(event: GameEvent): void {
    if (this.onEventCallback) {
      this.onEventCallback(event);
    }
  }

  init(players: PlayerInfo[], playerCount: 2 | 4 = 2): void {
    this._playerCount = playerCount;
    this._scores = { '0': 0, '1': 0 };
    this._currentTrucoLevel = 0;
    this.trucoChallenger = null;
    this.trucoPending = false;
    this.envidoPending = false;
    this.phase = 'menu';

    // Assign teams: for 2 players, team 0 = player, team 1 = AI
    // For 4 players: indices 0,1 = team 0; indices 2,3 = team 1
    this.playerTeams = {};
    this.playerNames = {};
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      this.playerTeams[p.id] = i % 2; // 2 players: p0=team0, p1=team1; 4 players: p0,p2=team0, p1,p3=team1
      this.playerNames[p.id] = p.name;
    }
    // For 4 players: alternate assignment (mano, pie, contra, contra-manos)
    if (playerCount === 4) {
      this.playerTeams[players[0].id] = 0; // mano -> team 0
      this.playerTeams[players[1].id] = 1; // pie -> team 1
      this.playerTeams[players[2].id] = 0; // contra -> team 0
      this.playerTeams[players[3].id] = 1; // contra-manos -> team 1
    }
  }

  startRound(): void {
    if (this.deck.remaining < 12) {
      this.deck.reset();
    }

    const numPlayers = this._playerCount;
    const hands: Record<string, Card[]> = {};
    const playerIds = Object.keys(this.playerTeams);

    // Deal 3 cards to each player
    for (let i = 0; i < 3; i++) {
      for (const pid of playerIds) {
        const card = this.deck.draw();
        if (card) {
          if (!hands[pid]) hands[pid] = [];
          hands[pid].push(card);
        }
      }
    }

    // Determine who goes first (mano) - first player in the list
    const manoId = playerIds[0];

    this.round = {
      hands,
      playedCards: {},
      currentTrick: 0,
      trickWinners: [],
      handsWon: { '0': 0, '1': 0 },
      currentTurn: manoId,
    };

    this._currentTrucoLevel = 0;
    this.trucoChallenger = null;
    this.trucoPending = false;
    this.envidoPending = false;
    this.phase = 'dealing';

    this.emit({ type: 'round-start', data: {
      hands,
      scores: { ...this._scores },
      currentTurn: manoId,
    }});

    this.phase = 'playing';

    // If it's AI's turn, trigger AI play
    if (!this.isHumanTurn()) {
      setTimeout(() => this.aiPlay(), 800);
    }
  }

  /**
   * Check if it's a human player's turn
   */
  isHumanTurn(): boolean {
    if (!this.round) return false;
    const playerId = this.round.currentTurn;
    // Check if this player is human
    // We need to check against the players list
    // For now, use a simple check: if the player has an isHuman flag
    // This is set via the App class
    return this.humanPlayers.has(playerId);
  }

  private humanPlayers = new Set<string>();

  setHumanPlayer(id: string): void {
    this.humanPlayers.add(id);
  }

  setHumanPlayers(ids: string[]): void {
    this.humanPlayers = new Set(ids);
  }

  /**
   * Player plays a card by index in their hand
   */
  playerPlayCard(playerId: string, cardIndex: number): Card | null {
    if (this.phase !== 'playing' || this.trucoPending) return null;
    if (!this.round) return null;
    if (this.round.currentTurn !== playerId) return null;
    if (!this.round.hands[playerId]) return null;
    if (cardIndex < 0 || cardIndex >= this.round.hands[playerId].length) return null;

    const card = this.round.hands[playerId].splice(cardIndex, 1)[0];
    if (!card) return null;

    const trick = this.round.playedCards[this.round.currentTrick];
    if (!trick) {
      this.round.playedCards[this.round.currentTrick] = {};
    }
    if (this.round.playedCards[this.round.currentTrick][playerId]) {
      // Already played this trick
      this.round.hands[playerId].splice(cardIndex, 0, card);
      return null;
    }

    this.round.playedCards[this.round.currentTrick][playerId] = card;

    this.emit({ type: 'card-played', data: {
      card, playerId, trick: this.round.currentTrick,
    }});

    // Check if all players have played this trick
    const playerIds = Object.keys(this.playerTeams);
    const allPlayed = playerIds.every(pid => this.round!.playedCards[this.round!.currentTrick][pid] !== undefined);

    if (allPlayed) {
      this.resolveTrick();
    } else {
      // Advance turn to next player
      this.advanceTurn();
    }

    return card;
  }

  /**
   * AI plays a card
   */
  aiPlay(): void {
    if (!this.round || this.phase !== 'playing' || this.trucoPending) return;
    if (!this.isHumanTurn()) return;

    const playerId = this.round.currentTurn;
    const hand = this.round.hands[playerId];
    if (!hand || hand.length === 0) return;

    // Simple AI: play highest ranking card
    let bestIndex = 0;
    let bestRank = -Infinity;
    for (let i = 0; i < hand.length; i++) {
      const rank = getCardRank(hand[i]);
      if (rank > bestRank) {
        bestRank = rank;
        bestIndex = i;
      }
    }

    this.playerPlayCard(playerId, bestIndex);
  }

  /**
   * Advance turn to next player
   */
  private advanceTurn(): void {
    if (!this.round) return;
    const playerIds = Object.keys(this.playerTeams);
    const currentIdx = playerIds.indexOf(this.round.currentTurn);
    const nextIdx = (currentIdx + 1) % playerIds.length;
    this.round.currentTurn = playerIds[nextIdx];

    // If it's AI's turn, trigger AI play
    if (!this.humanPlayers.has(this.round.currentTurn)) {
      setTimeout(() => this.aiPlay(), 800);
    }
  }

  /**
   * Resolve a completed trick
   */
  private resolveTrick(): void {
    if (!this.round) return;

    const trick = this.round.playedCards[this.round.currentTrick];
    const playerIds = Object.keys(this.playerTeams);

    // Find the first played card to determine the suit/leading card
    let leadingCard: Card | null = null;
    let leadingPlayer: string | null = null;
    for (const pid of playerIds) {
      if (trick[pid]) {
        leadingCard = trick[pid];
        leadingPlayer = pid;
        break;
      }
    }

    if (!leadingCard || !leadingPlayer) return;

    // Compare all played cards against the leading card
    let winner = leadingPlayer;
    let winnerRank = getCardRank(leadingCard);

    for (const pid of playerIds) {
      const played = trick[pid];
      if (played && pid !== winner) {
        const rank = getCardRank(played);
        if (rank > winnerRank) {
          winner = pid;
          winnerRank = rank;
        }
      }
    }

    this.round.trickWinners.push(winner);

    // Determine which team won
    const winningTeam = this.playerTeams[winner];
    this.round.handsWon[String(winningTeam)] = (this.round.handsWon[String(winningTeam)] || 0) + 1;

    this.emit({ type: 'trick-winner', data: {
      trick: this.round.currentTrick,
      winner,
      winningTeam,
      playerCards: Object.fromEntries(playerIds.map(pid => [pid, trick[pid]])),
    }});

    // Check if round is over (3 tricks played)
    if (this.round.trickWinners.length >= 3) {
      this.endRound();
      return;
    }

    // Winner of this trick leads the next trick
    this.round.currentTrick++;
    this.round.currentTurn = winner;

    // If it's AI's turn, trigger AI play
    if (!this.humanPlayers.has(this.round.currentTurn)) {
      setTimeout(() => this.aiPlay(), 800);
    }
  }

  /**
   * End the current round and award points
   */
  private endRound(): void {
    if (!this.round) return;

    const handsWon = this.round.handsWon;
    let winningTeam: number;

    if (handsWon['0'] >= 2) {
      winningTeam = 0;
    } else if (handsWon['1'] >= 2) {
      winningTeam = 1;
    } else {
      // 1-1 tie — mano's team wins
      winningTeam = 0;
    }

    this._scores[String(winningTeam)] += 1;

    this.emit({ type: 'round-winner', data: {
      winningTeam,
      handsWon,
      scores: { ...this._scores },
    }});

    this.phase = 'round-over';
    this.checkGameOver();
  }

  /**
   * Check if any team has reached the winning score
   */
  private checkGameOver(): void {
    if (this._scores['0'] >= WINNING_SCORE || this._scores['1'] >= WINNING_SCORE) {
      const winningTeam = this._scores['0'] >= WINNING_SCORE ? 0 : 1;
      this.phase = 'game-over';
      this.emit({ type: 'game-over', data: { winningTeam, scores: { ...this._scores } }});
    } else {
      // Start next round after a delay
      setTimeout(() => {
        if (this.phase === 'round-over') {
          this.startRound();
        }
      }, 2500);
    }
  }

  /**
   * Player challenges truco
   */
  challengeTruco(): void {
    if (this.phase !== 'playing' || this.trucoPending) return;

    switch (this._currentTrucoLevel) {
      case 0:
        this._currentTrucoLevel = 1;
        this.trucoChallenger = 'player';
        this.trucoPending = true;
        this.emit({ type: 'truco-challenge', data: { level: 1 } });
        break;
      case 1:
        this._currentTrucoLevel = 2;
        this.trucoChallenger = 'player';
        this.trucoPending = true;
        this.emit({ type: 'retruco-challenge', data: { level: 2 } });
        break;
      case 2:
        this._currentTrucoLevel = 3;
        this.trucoChallenger = 'player';
        this.trucoPending = true;
        this.emit({ type: 'vale4-challenge', data: { level: 3 } });
        break;
    }
  }

  /**
   * AI challenges truco
   */
  aiChallengeTruco(): void {
    if (this.phase !== 'playing' || this.trucoPending) return;

    switch (this._currentTrucoLevel) {
      case 0:
        this._currentTrucoLevel = 1;
        this.trucoChallenger = 'ai';
        this.trucoPending = true;
        this.emit({ type: 'truco-challenge', data: { level: 1 } });
        break;
      case 1:
        this._currentTrucoLevel = 2;
        this.trucoChallenger = 'ai';
        this.trucoPending = true;
        this.emit({ type: 'retruco-challenge', data: { level: 2 } });
        break;
      case 2:
        this._currentTrucoLevel = 3;
        this.trucoChallenger = 'ai';
        this.trucoPending = true;
        this.emit({ type: 'vale4-challenge', data: { level: 3 } });
        break;
    }
  }

  /**
   * Accept a truco challenge
   */
  acceptTruco(): void {
    if (!this.trucoPending) return;
    this.trucoPending = false;
    this.trucoChallenger = null;
    this.emit({ type: 'truco-accepted', data: { level: this._currentTrucoLevel } });
  }

  /**
   * Reject a truco challenge
   */
  rejectTruco(): void {
    if (!this.trucoPending) return;

    const winner = this.trucoChallenger || 'ai';
    const points = this.getTrucoPoints();

    if (winner === 'player') {
      this._scores['0'] += points;
    } else {
      this._scores['1'] += points;
    }

    this.trucoPending = false;
    this.trucoChallenger = null;

    this.emit({ type: 'truco-rejected', data: {
      winner, points, scores: { ...this._scores },
    }});

    this.checkGameOver();
  }

  private getTrucoPoints(): number {
    switch (this._currentTrucoLevel) {
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
   * Resolve envido
   */
  resolveEnvido(): void {
    if (!this.envidoPending || !this.round) return;

    const playerIds = Object.keys(this.playerTeams);
    const team0Cards = playerIds.filter(pid => this.playerTeams[pid] === 0).flatMap(pid => this.round!.hands[pid] || []);
    const team1Cards = playerIds.filter(pid => this.playerTeams[pid] === 1).flatMap(pid => this.round!.hands[pid] || []);

    const playerScore = this.calculateEnvidoForHand(team0Cards);
    const aiScore = this.calculateEnvidoForHand(team1Cards);

    let winner: number;
    if (playerScore >= aiScore) {
      winner = 0;
      this._scores['0'] += 1;
    } else {
      winner = 1;
      this._scores['1'] += 1;
    }

    this.envidoPending = false;
    this.envidoChallenger = null;

    this.emit({ type: 'envido-result', data: {
      winningTeam: winner, playerScore, aiScore, scores: { ...this._scores },
    }});
  }

  /**
   * Calculate envido for a hand
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
   * Get the team for a player
   */
  getPlayerTeam(playerId: string): number {
    return this.playerTeams[playerId] ?? 0;
  }

  /**
   * Get remaining deck count
   */
  get deckRemaining(): number {
    return this.deck.remaining;
  }

  /**
   * Get all player IDs
   */
  getPlayerIds(): string[] {
    return Object.keys(this.playerTeams);
  }

  /**
   * Get cards visible to a player (their own hand + played cards on table)
   */
  getVisibleCards(playerId: string): Record<string, Card[]> {
    if (!this.round) return {};
    const team = this.playerTeams[playerId];
    const visible: Record<string, Card[]> = {};

    for (const pid of Object.keys(this.playerTeams)) {
      // In 2-player mode, you can only see your own cards
      // In 4-player mode, you can see your own cards and your teammate's cards
      if (this.playerCount === 4 && this.playerTeams[pid] === team) {
        visible[pid] = [...(this.round.hands[pid] || [])];
      } else if (this.playerCount === 2) {
        // 2-player: only see your own cards
        if (pid === playerId) {
          visible[pid] = [...(this.round.hands[pid] || [])];
        }
      }
    }

    return visible;
  }

  /**
   * Get AI opponent card count (for face-down display)
   */
  getOpponentCardCount(playerId: string): number {
    if (!this.round) return 0;
    const team = this.playerTeams[playerId];
    let count = 0;
    for (const pid of Object.keys(this.playerTeams)) {
      if (this.playerTeams[pid] !== team && pid !== playerId) {
        count += (this.round.hands[pid] || []).length;
      }
    }
    return count;
  }
}
