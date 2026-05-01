// GameEngine - Core game logic for Argentine Truco (2/4/6 players)
// Supports: 1v1, 2v2 (4 players), 3v3 (6 players)
// Truco levels: Truco (1pt) → Retruco (2pts) → Vale 4 (4pts)
// Envido levels: Envido (2pts) → Real Envido (3pts) → Falta Envido (6pts)
// Winning score: 30

import type { Card } from './Card.js';
import { Deck } from './Deck.js';
import { getCardRank } from './Rules.js';
import type { PlayerInfo } from './Player.js';

// ─── Types ───────────────────────────────────────────────

export type PlayerCount = 2 | 4 | 6;
export type TrucoPhase = 'none' | 'challenged' | 'accepted' | 'rejected';
export type EnvidoPhase = 'none' | 'challenged' | 'resolved';
export type GamePhase = 'menu' | 'round-start' | 'playing' | 'envido-pending'
  | 'envido-pending-response' | 'truco-pending' | 'round-over' | 'game-over';

export interface RoundState {
  hands: Record<string, Card[]>;
  playedCards: Record<number, Record<string, Card | null>>; // trick index → player → card
  trickWinners: string[]; // player IDs who won each trick
  currentTrick: number; // 0, 1, 2
  currentTurn: string; // player ID whose turn it is
  trickScore: number[]; // points per trick: team0 - team1
  playerIds: string[];
}

export interface GameEvent {
  type: string;
  data: Record<string, any>;
}

export interface TrucoState {
  level: number; // 0=none, 1=truco, 2=retruco, 3=vale4
  phase: TrucoPhase;
  challengedBy: string | null; // who challenged
  roundPoints: number; // points at stake this round (1, 2, or 4)
}

export interface EnvidoState {
  phase: EnvidoPhase;
  team0Score: number; // best envido score for team 0
  team1Score: number; // best envido score for team 1
  challengedBy: string | null;
  envidoType: string; // 'envido', 'real_envido', 'falta_envido'
}

// ─── Envido calculation ──────────────────────────────────

export function calculateEnvidoForHand(cards: Card[]): { score: number; suit: string; cards: Card[] } {
  if (cards.length === 0) return { score: 0, suit: '', cards: [] };

  const suitGroups: Record<string, Card[]> = {};
  for (const card of cards) {
    if (!suitGroups[card.suit]) suitGroups[card.suit] = [];
    suitGroups[card.suit].push(card);
  }

  let bestScore = 0;
  let bestSuit = '';
  let bestCards: Card[] = [];

  for (const [suit, suitCards] of Object.entries(suitGroups)) {
    if (suitCards.length >= 2) {
      // Sort by number descending, take top 2
      const sorted = [...suitCards].sort((a, b) => b.number - a.number);
      const score = 20 + sorted[0].number + sorted[1].number;
      if (score > bestScore) {
        bestScore = score;
        bestSuit = suit;
        bestCards = sorted.slice(0, 2);
      }
    }
  }

  if (bestScore === 0) {
    // No pair of same suit — take highest card number
    const topCard = [...cards].sort((a, b) => b.number - a.number)[0];
    if (topCard) {
      bestScore = topCard.number;
      bestSuit = topCard.suit;
      bestCards = [topCard];
    }
  }

  return { score: bestScore, suit: bestSuit, cards: bestCards };
}

export function getEnvidoType(score: number): string {
  if (score >= 30) return 'falta_envido';
  if (score >= 28) return 'real_envido';
  return 'envido';
}

export function getEnvidoPoints(envidoType: string): number {
  switch (envidoType) {
    case 'falta_envido': return 6;
    case 'real_envido': return 3;
    default: return 2;
  }
}

// ─── GameEngine ──────────────────────────────────────────

export class GameEngine {
  private _playerCount: PlayerCount = 2;
  private _players: PlayerInfo[] = [];
  private _scores: Record<number, number> = { 0: 0, 1: 0 };
  private _roundState: RoundState | null = null;
  private _phase: GamePhase = 'menu';
  private _deck = new Deck();

  // Truco state
  private _truco: TrucoState = {
    level: 0, phase: 'none', challengedBy: null, roundPoints: 0
  };

  // Envido state
  private _envido: EnvidoState = {
    phase: 'none', team0Score: 0, team1Score: 0, challengedBy: null, envidoType: 'envido'
  };

  // Human players (who can click to play)
  private _humanPlayers: string[] = [];

  // Events
  public onEvent: ((event: GameEvent) => void) | null = null;

  // ─── Properties ────────────────────────────────────────

  get playerCount(): PlayerCount { return this._playerCount; }
  get players(): PlayerInfo[] { return this._players; }
  get scores(): Record<number, number> { return { ...this._scores }; }
  get roundState(): RoundState | null { return this._roundState; }
  get phase(): GamePhase { return this._phase; }
  get phaseValue(): GamePhase { return this._phase; }
  get currentTrucoLevel(): number { return this._truco.level; }
  get trucoState(): TrucoState { return { ...this._truco }; }
  get envidoState(): EnvidoState { return { ...this._envido }; }
  get humanPlayers(): string[] { return [...this._humanPlayers]; }

  // ─── Initialization ────────────────────────────────────

  init(players: PlayerInfo[], playerCount: PlayerCount): void {
    this._players = players;
    this._playerCount = playerCount;
    this._scores = { 0: 0, 1: 0 };

    // Determine teams: even-indexed players = team 0, odd-indexed = team 1
    // player-0 → team 0, player-1 → team 0 (teammate), player-2 → team 1, etc.
    for (let i = 0; i < players.length; i++) {
      players[i].team = i % 2;
    }
  }

  setHumanPlayers(ids: string[]): void {
    this._humanPlayers = ids;
  }

  // ─── Start Round ───────────────────────────────────────

  startRound(): void {
    // Reset round state
    this._truco = { level: 0, phase: 'none', challengedBy: null, roundPoints: 0 };
    this._envido = { phase: 'none', team0Score: 0, team1Score: 0, challengedBy: null, envidoType: 'envido' };
    this._phase = 'round-start';

    // Reset trick state
    this._roundState = {
      hands: {},
      playedCards: {},
      trickWinners: [],
      currentTrick: 0,
      currentTurn: '',
      trickScore: [],
      playerIds: this._players.map(p => p.id)
    };

    // Deal cards: 3 cards per player in 2/4-player, 6 cards in 6-player
    this._deck = new Deck();
    const cardsPerPlayer = this._playerCount >= 6 ? 6 : 3;
    for (const player of this._players) {
      this._roundState!.hands[player.id] = [];
      for (let i = 0; i < cardsPerPlayer; i++) {
        const card = this._deck.draw();
        if (card) {
          this._roundState!.hands[player.id].push(card);
        }
      }
    }

    // First trick: player 0 goes first (mano)
    this._roundState!.currentTurn = this._players[0].id;

    this._phase = 'playing';
    this.emit('round-start', {
      playerCount: this._playerCount,
      hands: this._roundState!.hands,
      currentTurn: this._roundState!.currentTurn
    });
  }

  // ─── Card Playing ──────────────────────────────────────

  playerPlayCard(playerId: string, cardIndex: number): Card | null {
    if (this._phase !== 'playing') return null;
    if (this._roundState!.currentTurn !== playerId) return null;

    const player = this._players.find(p => p.id === playerId);
    if (!player) return null;

    const hand = this._roundState!.hands[playerId] || [];
    if (cardIndex < 0 || cardIndex >= hand.length) return null;

    const card = hand[cardIndex];

    // Remove from round state hand
    this._roundState!.hands[playerId] = hand.filter(
      (c, i) => i !== cardIndex
    );

    // Place card in current trick
    const trickIdx = this._roundState!.currentTrick;
    if (!this._roundState!.playedCards[trickIdx]) {
      this._roundState!.playedCards[trickIdx] = {};
    }
    this._roundState!.playedCards[trickIdx][playerId] = card;

    // Advance turn BEFORE emitting so listeners see the updated state
    const allPlayed = this._players.every(p =>
      this._roundState!.playedCards[trickIdx]?.[p.id] !== undefined
    );
    if (!allPlayed) {
      this.advanceTurn();
    }

    this.emit('card-played', { playerId, card, trick: trickIdx });

    if (allPlayed) {
      // Resolve trick — wait for AI to respond if it's the next player's turn
      const nextPlayer = this._roundState!.currentTurn;
      const isAI = this._players.find(p => p.id === nextPlayer)?.isAI ?? false;
      const waitTime = isAI ? 1500 : 500; // Give AI time to respond
      setTimeout(() => this.resolveTrick(), waitTime);
    }

    return card;
  }

  // ─── Trick Resolution ──────────────────────────────────

  private resolveTrick(): void {
    if (!this._roundState) return;
    const trickIdx = this._roundState.currentTrick;
    const trick = this._roundState.playedCards[trickIdx];
    if (!trick) return;

    // Find the winning card per team
    // In 2-player: highest card wins
    // In 4/6-player: each team's best card vs other team's best card
    const team0Cards: Card[] = [];
    const team1Cards: Card[] = [];

    for (const [pid, card] of Object.entries(trick)) {
      if (!card) continue;
      const player = this._players.find(p => p.id === pid);
      if (!player) continue;
      if (player.team === 0) team0Cards.push(card);
      else team1Cards.push(card);
    }

    // Find best card per team
    const team0Best = team0Cards.reduce((best, c) =>
      getCardRank(c) > getCardRank(best) ? c : best, team0Cards[0]);
    const team1Best = team1Cards.reduce((best, c) =>
      getCardRank(c) > getCardRank(best) ? c : best, team1Cards[0]);

    let winningTeam: number;
    if (this._playerCount === 2) {
      // 2-player: direct comparison
      const r0 = getCardRank(team0Best);
      const r1 = getCardRank(team1Best);
      winningTeam = r0 >= r1 ? 0 : 1;
    } else {
      // 4/6-player: team best vs team best
      const r0 = getCardRank(team0Best);
      const r1 = getCardRank(team1Best);
      winningTeam = r0 >= r1 ? 0 : 1;
    }

    // Award point to winning team
    this._roundState!.trickScore.push(winningTeam);
    this._roundState!.trickWinners.push(this._players.find(p => p.team === winningTeam)!.id);

    const winnerName = this._players.find(p => p.id === this._roundState!.trickWinners[0])?.name || 'Team ' + winningTeam;
    this.emit('trick-winner', {
      winningTeam,
      winner: this._roundState!.trickWinners[0],
      trick: trickIdx,
      winnerName
    });

    // Check if round is over (3 tricks played)
    if (this._roundState!.trickScore.length >= 3) {
      setTimeout(() => this.resolveRound(), 800);
    } else {
      // Next trick
      this._roundState!.currentTrick++;
      // Winner of previous trick goes first
      this._roundState!.currentTurn = this._roundState!.trickWinners[0];
      this._phase = 'playing';
      this.emit('round-start-trick', {
        trick: this._roundState!.currentTrick,
        currentTurn: this._roundState!.currentTurn
      });
    }
  }

  // ─── Round Resolution ──────────────────────────────────

  private resolveRound(): void {
    if (!this._roundState) return;

    // Count tricks won per team
    let team0Tricks = this._roundState.trickScore.filter(t => t === 0).length;
    let team1Tricks = this._roundState.trickScore.filter(t => t === 1).length;

    let winningTeam: number;
    if (team0Tricks > team1Tricks) winningTeam = 0;
    else if (team1Tricks > team0Tricks) winningTeam = 1;
    else {
      // Tie: no one wins the round (empate)
      this.emit('round-winner', { winningTeam: -1, team0Tricks, team1Tricks });
      this._phase = 'round-over';
      return;
    }

    // Award points
    const points = this._truco.roundPoints || 1;
    this._scores[winningTeam] = (this._scores[winningTeam] || 0) + points;

    this.emit('round-winner', {
      winningTeam,
      team0Tricks,
      team1Tricks,
      points,
      scores: { ...this._scores }
    });

    // Check for game over (30 points)
    if (this._scores[winningTeam] >= 30) {
      this._phase = 'game-over';
      this.emit('game-over', { winningTeam, scores: { ...this._scores } });
      return;
    }

    // Round over — wait for player to click "SIGUIENTE MANO"
    this._phase = 'round-over';
    this.emit('round-over', { winningTeam, team0Tricks, team1Tricks, points });
  }

  // ─── Truco Dynamics ────────────────────────────────────

  challengeTruco(challengerId: string): void {
    if (this._phase !== 'playing') return;
    if (this._truco.level >= 3) return; // Already at vale 4

    // Determine challenge level
    let newLevel: number;
    switch (this._truco.level) {
      case 0: newLevel = 1; break; // Truco
      case 1: newLevel = 2; break; // Retruco
      case 2: newLevel = 3; break; // Vale 4
      default: return;
    }

    this._truco.level = newLevel;
    this._truco.challengedBy = challengerId;
    this._truco.roundPoints = [0, 1, 2, 4][newLevel];
    this._truco.phase = 'challenged';

    const levelNames = ['', '¡TRUCO!', '¡RETRUCO!', '¡VALE 4!'];
    this.emit('truco-challenge', {
      level: newLevel,
      name: levelNames[newLevel],
      points: this._truco.roundPoints,
      challengedBy: challengerId
    });
  }

  acceptTruco(): void {
    if (this._truco.phase !== 'challenged') return;

    this._truco.phase = 'accepted';
    const levelNames = ['', '¡TRUCO!', '¡RETRUCO!', '¡VALE 4!'];
    this.emit('truco-accepted', {
      level: this._truco.level,
      name: levelNames[this._truco.level],
      points: this._truco.roundPoints
    });
  }

  rejectTruco(): void {
    if (this._truco.phase !== 'challenged') return;

    this._truco.phase = 'rejected';
    // Opposing team wins immediately
    const challengerTeam = this._players.find(p => p.id === this._truco.challengedBy)?.team;
    const opponentTeam = challengerTeam === 0 ? 1 : 0;
    const points = this._truco.roundPoints || 1;

    this._scores[opponentTeam] = (this._scores[opponentTeam] || 0) + points;

    this.emit('truco-rejected', {
      winner: opponentTeam,
      points,
      scores: { ...this._scores }
    });

    // Check game over
    if (this._scores[opponentTeam] >= 30) {
      this._phase = 'game-over';
      this.emit('game-over', { winningTeam: opponentTeam, scores: { ...this._scores } });
    } else {
      this._phase = 'round-over';
      setTimeout(() => this.startRound(), 2000);
    }
  }

  // AI challenges truco (re-truco or vale 4)
  aiChallengeTruco(playerId: string): void {
    this.challengeTruco(playerId);
  }

  // AI challenges envido
  aiChallengeEnvido(playerId: string): void {
    this.challengeEnvido(playerId);
  }

  // ─── Envido Dynamics ───────────────────────────────────

  challengeEnvido(challengerId: string): void {
    if (this._phase !== 'playing') return;

    // Calculate envido for both teams
    const team0Cards: Card[] = [];
    const team1Cards: Card[] = [];

    for (const player of this._players) {
      const cards = this._roundState?.hands[player.id] || [];
      if (player.team === 0) team0Cards.push(...cards);
      else team1Cards.push(...cards);
    }

    const t0Envido = calculateEnvidoForHand(team0Cards);
    const t1Envido = calculateEnvidoForHand(team1Cards);

    this._envido.team0Score = t0Envido.score;
    this._envido.team1Score = t1Envido.score;

    // Determine envido type based on the winning score
    const winningScore = Math.max(t0Envido.score, t1Envido.score);
    this._envido.envidoType = getEnvidoType(winningScore);
    this._envido.challengedBy = challengerId;
    this._envido.phase = 'challenged';

    this.emit('envido-challenge', {
      team0Score: t0Envido.score,
      team1Score: t1Envido.score,
      envidoType: this._envido.envidoType,
      challengedBy: challengerId
    });
  }

  resolveEnvido(): void {
    if (this._envido.phase !== 'challenged') return;

    this._envido.phase = 'resolved';
    const points = getEnvidoPoints(this._envido.envidoType);
    const winner = this._envido.team0Score >= this._envido.team1Score ? 0 : 1;

    this._scores[winner] = (this._scores[winner] || 0) + points;

    this.emit('envido-result', {
      winningTeam: winner,
      team0Score: this._envido.team0Score,
      team1Score: this._envido.team1Score,
      envidoType: this._envido.envidoType,
      points,
      scores: { ...this._scores }
    });
  }

  // ─── Turn Management ───────────────────────────────────

  private advanceTurn(): void {
    if (!this._roundState) return;

    const playerIds = this._roundState.playerIds;
    const currentIdx = playerIds.indexOf(this._roundState.currentTurn);
    const nextIdx = (currentIdx + 1) % playerIds.length;
    this._roundState.currentTurn = playerIds[nextIdx];
  }

  private getNextAIPlayer(): string {
    // Find next AI player who hasn't played this trick yet
    if (!this._roundState) return '';
    const trickIdx = this._roundState.currentTrick;
    for (const player of this._players) {
      if (player.isAI && !this._roundState.playedCards[trickIdx]?.[player.id]) {
        return player.id;
      }
    }
    return '';
  }

  // ─── Visible Cards ─────────────────────────────────────

  getVisibleCards(humanPlayerId: string): Record<string, Card[]> {
    const visible: Record<string, Card[]> = {};
    const humanTeam = this._players.find(p => p.id === humanPlayerId)?.team ?? 0;

    for (const player of this._players) {
      if (player.isHuman) {
        // Human players see their own cards
        visible[player.id] = this._roundState?.hands[player.id] || [];
      } else if (player.isAI && player.team === humanTeam) {
        // AI teammates: show cards face-up (in 4/6 player mode)
        if (this._playerCount > 2) {
          visible[player.id] = this._roundState?.hands[player.id] || [];
        } else {
          // In 2-player mode, opponent is AI — show face-down
          visible[player.id] = [];
        }
      } else if (player.isAI && player.team !== humanTeam) {
        // Opponent AI: show face-down
        visible[player.id] = [];
      }
    }

    return visible;
  }

  // ─── Event Emitter ─────────────────────────────────────

  private emit(type: string, data: Record<string, any>): void {
    if (this.onEvent) {
      this.onEvent({ type, data });
    }
  }
}
