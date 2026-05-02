// GameEngine - Core game logic for Argentine Truco (2/4/6 players)
// Circular seating, counter-clockwise order, alternating teams
// Truco levels: Truco (1pt) → Retruco (2pts) → Vale 4 (4pts)
// Envido levels: Envido (2pts) → Real Envido (3pts) → Falta Envido (6pts)
// Winning score: 30
// 
// Rules:
// - Players sit in a circle, teams alternate (A,B,A,B,A,B)
// - Play goes counter-clockwise
// - Second mano starts with player who had highest card in first mano
// - Only the last player of each team in playing order can sing envido
// - If there are 2 manos, winner of the second mano wins the truco

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
  playerIds: string[]; // playing order (counter-clockwise)
  starterId: string; // who started this mano
  dealerId: string; // who dealt this mano
  manoNumber: number; // 1 or 2
  firstHandHighestCard: { playerId: string; rank: number } | null; // highest card from mano 1
  firstHandStarter: string | null; // who started mano 1
  secondHandWinner: string | null; // winner of mano 2 (determines truco winner)
  deckRemaining: number; // remaining cards in deck
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

  // Track if first hand was completed (for mano 2 flow)
  private _firstHandCompleted = false;

  // Track previous dealer for rotation
  private _previousDealerId = 'player-0';

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

  /**
   * Initialize the game with players.
   * Teams alternate: player-0 → team 0, player-1 → team 1, player-2 → team 0, etc.
   * The playerIds array defines the playing order (counter-clockwise around the circle).
   */
  init(players: PlayerInfo[], playerCount: PlayerCount): void {
    this._players = players;
    this._playerCount = playerCount;
    this._scores = { 0: 0, 1: 0 };

    // Assign teams: alternating (A,B,A,B) for 4p, (A,B,A,B,A,B) for 6p
    for (let i = 0; i < players.length; i++) {
      players[i].team = i % 2;
    }
    // For 6-player: swap teams for odd-indexed players (1,3,5) to get proper 3v3
    // In 6p circular seating: positions alternate V,O,T,O,T,O
    // So positions 1,3,5 are opponents (team 1), positions 2,4 are teammates (team 0)
    if (this._playerCount === 6) {
      for (let i = 1; i < players.length; i += 2) {
        players[i].team = 1;
      }
      for (let i = 2; i < players.length; i += 2) {
        players[i].team = 0;
      }
    }
    this._firstHandCompleted = false; // Reset for new game
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

    // Determine the mano number based on whether first hand was completed
    const isSecondHand = this._firstHandCompleted;

    // Create initial round state (with placeholder values)
    this._roundState = {
      hands: {},
      playedCards: {},
      trickWinners: [],
      currentTrick: 0,
      currentTurn: '',
      trickScore: [],
      playerIds: this._players.map(p => p.id), // playing order (counter-clockwise)
      starterId: '',
      dealerId: '',
      manoNumber: isSecondHand ? 2 : 1,
      firstHandHighestCard: null,
      firstHandStarter: null,
      secondHandWinner: null,
      deckRemaining: 40
    };

    // Determine who deals this mano (rotates counter-clockwise each mano)
    const dealerId = this.determineDealer();
    this._roundState.dealerId = dealerId;

    // Determine who starts this mano
    const starterId = this.determineStarter();
    this._roundState.starterId = starterId;
    this._roundState.currentTurn = starterId;

    // Deal cards (dealer deals to next player counter-clockwise)
    this._deck = new Deck();
    // Initialize hands arrays
    for (const player of this._players) {
      this._roundState!.hands[player.id] = [];
    }
    const cardsPerPlayer = 3;
    for (let i = 0; i < cardsPerPlayer; i++) {
      for (const player of this._players) {
        const card = this._deck.draw();
        if (card) {
          this._roundState!.hands[player.id].push(card);
        }
      }
    }
    this._roundState!.deckRemaining = this._deck.remaining;

    this._phase = 'playing';
    this.emit('round-start', {
      playerCount: this._playerCount,
      hands: this._roundState!.hands,
      currentTurn: this._roundState!.currentTurn,
      starterId: starterId,
      dealerId: dealerId,
      manoNumber: this._roundState!.manoNumber,
      deckRemaining: this._deck.remaining
    });
  }

  /**
   * Determine who starts this mano.
   * - Mano 1: player-0 always starts.
   * - Mano 2+: the player who had the highest card in the previous mano starts.
   * - If there's a tie, the previous starter starts again.
   */
  private determineStarter(): string {
    if (!this._roundState) return this._players[0].id;

    if (this._roundState.manoNumber === 1) {
      // First mano: player-0 starts
      return this._players[0].id;
    }

    // Check if we have a recorded highest card from mano 1
    if (this._roundState.firstHandHighestCard) {
      return this._roundState.firstHandHighestCard.playerId;
    }

    // Fallback: previous starter (tie case)
    return this._roundState.starterId;
  }

  /**
   * Determine who deals this mano (rotates counter-clockwise each mano).
   * The dealer rotates in the same direction as play (counter-clockwise).
   */
  private determineDealer(): string {
    if (!this._roundState) return this._players[0].id;

    // If this is the first mano, player-0 deals
    if (!this._firstHandCompleted) {
      return this._players[0].id;
    }

    // Rotate counter-clockwise from previous dealer
    const playerIds = this._roundState.playerIds;
    const currentDealerIdx = playerIds.indexOf(this._previousDealerId);
    // Counter-clockwise: go backward (subtract 1)
    const nextDealerIdx = (currentDealerIdx - 1 + playerIds.length) % playerIds.length;
    return playerIds[nextDealerIdx];
  }

  /**
   * After mano 1 completes, record the highest card played in the last trick.
   * This determines who starts mano 2.
   * In case of tie (same rank), the player from the winning team who played first in order starts.
   */
  private recordFirstHandHighestCard(): void {
    if (!this._roundState) return;
    if (this._roundState.manoNumber !== 1) return;

    // Find the highest card played across ALL tricks in this mano
    let highestRank = -1;
    let highestPlayer = this._players[0].id;

    for (let trickIdx = 0; trickIdx < 3; trickIdx++) {
      const trick = this._roundState.playedCards[trickIdx];
      if (!trick) continue;

      for (const playerId of this._roundState.playerIds) {
        const card = trick[playerId];
        if (!card) continue;
        const rank = getCardRank(card);
        if (rank > highestRank) {
          highestRank = rank;
          highestPlayer = playerId;
        } else if (rank === highestRank) {
          // Tie: prefer the earlier player in playing order (counter-clockwise)
          const currentIdx = this._roundState.playerIds.indexOf(highestPlayer);
          const newIdx = this._roundState.playerIds.indexOf(playerId);
          if (newIdx < currentIdx) {
            highestPlayer = playerId;
          }
        }
      }
    }

    this._roundState.firstHandHighestCard = { playerId: highestPlayer, rank: highestRank };
    this._roundState.firstHandStarter = this._roundState.starterId;
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
      const waitTime = isAI ? 1500 : 500;
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
    const r0 = getCardRank(team0Best);
    const r1 = getCardRank(team1Best);
    winningTeam = r0 >= r1 ? 0 : 1;

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
      // Next trick: winner of previous trick goes first
      this._roundState!.currentTrick++;
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

    // Handle mano 2 logic
    if (this._roundState.manoNumber === 2) {
      // Winner of mano 2 wins the entire truco
      this._roundState.secondHandWinner = this._players.find(p => p.team === winningTeam)!.id;
      
      // Award points (truco points)
      const points = this._truco.roundPoints || 1;
      this._scores[winningTeam] = (this._scores[winningTeam] || 0) + points;

      this.emit('round-winner', {
        winningTeam,
        team0Tricks,
        team1Tricks,
        points,
        scores: { ...this._scores },
        isSecondHand: true,
        secondHandWinner: this._roundState.secondHandWinner
      });

      // Check for game over (30 points)
      if (this._scores[winningTeam] >= 30) {
        this._phase = 'game-over';
        this.emit('game-over', { winningTeam, scores: { ...this._scores } });
        return;
      }

      this._phase = 'round-over';
      this.emit('round-over', { winningTeam, team0Tricks, team1Tricks, points, isSecondHand: true });
      return;
    }

    // Mano 1 logic
    // Record highest card for mano 2 starter determination
    this.recordFirstHandHighestCard();

    // Award points for mano 1
    const points = this._truco.roundPoints || 1;
    this._scores[winningTeam] = (this._scores[winningTeam] || 0) + points;

    this.emit('round-winner', {
      winningTeam,
      team0Tricks,
      team1Tricks,
      points,
      scores: { ...this._scores },
      isSecondHand: false
    });

    // Check for game over (30 points)
    if (this._scores[winningTeam] >= 30) {
      this._phase = 'game-over';
      this.emit('game-over', { winningTeam, scores: { ...this._scores } });
      return;
    }

    // After mano 1, start mano 2 automatically
    // But first emit round-over so UI can show it
    this._phase = 'round-over';
    this._firstHandCompleted = true; // Mark for next startRound to use mano 2
    this._previousDealerId = this._roundState!.dealerId; // Save dealer for rotation
    this.emit('round-over', { winningTeam, team0Tricks, team1Tricks, points, isSecondHand: false });
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

  /**
   * Check if a player is allowed to sing envido.
   * Only the last player of each team in the playing order can sing envido.
   */
  canChallengeEnvido(playerId: string): boolean {
    if (!this._roundState) return false;
    if (this._envido.phase !== 'none') return false; // Already has an envido in play

    const player = this._players.find(p => p.id === playerId);
    if (!player) return false;

    const playerIdx = this._roundState.playerIds.indexOf(playerId);
    const team = player.team;

    // Find the last player of this team in the playing order
    let lastTeamPlayer = '';
    for (const pid of this._roundState.playerIds) {
      const p = this._players.find(pl => pl.id === pid);
      if (p && p.team === team) {
        lastTeamPlayer = pid;
      }
    }

    return playerId === lastTeamPlayer;
  }

  challengeEnvido(challengerId: string): void {
    if (this._phase !== 'playing') return;

    // Check if player is allowed to sing envido
    if (!this.canChallengeEnvido(challengerId)) return;

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

  // ─── Turn Management (counter-clockwise) ───────────────

  /**
   * Advance turn counter-clockwise.
   * In counter-clockwise order, we go BACKWARD in the playerIds array.
   */
  private advanceTurn(): void {
    if (!this._roundState) return;

    const playerIds = this._roundState.playerIds;
    const currentIdx = playerIds.indexOf(this._roundState.currentTurn);
    // Counter-clockwise: go backward (subtract 1)
    const nextIdx = (currentIdx - 1 + playerIds.length) % playerIds.length;
    this._roundState.currentTurn = playerIds[nextIdx];
  }

  private getNextAIPlayer(): string {
    // Find next AI player who hasn't played this trick yet (counter-clockwise)
    if (!this._roundState) return '';
    const trickIdx = this._roundState.currentTrick;
    const playerIds = this._roundState.playerIds;
    const currentIdx = playerIds.indexOf(this._roundState.currentTurn);

    // Search counter-clockwise
    for (let i = 1; i < playerIds.length; i++) {
      const idx = (currentIdx - i + playerIds.length) % playerIds.length;
      const pid = playerIds[idx];
      const player = this._players.find(p => p.id === pid);
      if (player?.isAI && !this._roundState.playedCards[trickIdx]?.[pid]) {
        return pid;
      }
    }
    return '';
  }

  // ─── Visible Cards ─────────────────────────────────────

  /**
   * Get visible cards for a human player.
   * Player ONLY sees their own cards. No opponent or teammate cards visible.
   */
  getVisibleCards(humanPlayerId: string): Record<string, Card[]> {
    const visible: Record<string, Card[]> = {};
    const humanPlayer = this._players.find(p => p.id === humanPlayerId);
    if (!humanPlayer) return visible;

    for (const player of this._players) {
      if (player.id === humanPlayerId) {
        // Human player sees their own cards
        visible[player.id] = this._roundState?.hands[player.id] || [];
      } else if (player.team === humanPlayer.team && this._playerCount > 2) {
        // In multiplayer modes (4/6), teammates' cards are also visible
        visible[player.id] = this._roundState?.hands[player.id] || [];
      } else {
        // Opponents: show face-down (empty array = card backs)
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
