// GameEngine.ts — Complete Truco game engine

import { Deck } from './Deck.js';
import { getCardRank, getCardName } from './Rules.js';
import type {
  CardDef, Suit, CardNumber, PlayerCount, Difficulty,
  PlayerConfig, PlayedCard, RoundResult, PicaPicaSubmanoResult,
  GameConfig, EnvidoState, TrucoState, GameEvent
} from '../types.js';

export type GamePhase =
  | 'menu'
  | 'dealing'
  | 'envido-opening'
  | 'envido-response'
  | 'envido-resolving'
  | 'playing-trick'
  | 'trick-resolving'
  | 'round-resolving'
  | 'round-over'
  | 'picapica-submano'
  | 'picapica-resolving'
  | 'game-over';

export class GameEngine {
  private players: PlayerConfig[] = [];
  private deck: Deck = new Deck();
  private scores: { team0: number; team1: number } = { team0: 0, team1: 0 };
  private config: GameConfig = { playerCount: 4, difficulty: 'normal' };
  private targetScore: number = 30;

  // Round state
  private hands: { [playerId: string]: CardDef[] } = {};
  private currentTrick: PlayedCard[] = [];
  private currentTrickNumber: number = 0; // 0, 1, 2
  private currentRound: number = 0; // 0, 1, 2
  private roundResults: RoundResult[] = [];
  private dealerId: string = '';
  private starterId: string = '';
  private currentTurnPlayerId: string = '';
  private trickWinnerId: string = '';
  private trickWinnerTeam: number = -1;

  // Round tracking
  private currentHand: number = 0; // 0 = first hand, 1 = second hand
  private firstHandCompleted: boolean = false;
  private previousStarterId: string = '';
  private roundWinnerTeam: number = -1;
  private firstTrickWinnerTeam: number = -1;

  // Envido state
  private envido: EnvidoState = {
    phase: 'none',
    callerTeam: null,
    level: 'envido',
    accepted: false,
    pointsAwarded: 0,
    totalPoints: 0,
    team0Scored: 0,
    team1Scored: 0,
    team0Player0Envido: null,
    team0Player1Envido: null,
    team1Player0Envido: null,
    team1Player1Envido: null,
    team1Player2Envido: null,
    team0Player2Envido: null,
  };

  // Truco state
  private truco: TrucoState = {
    level: 0,
    lastChallengerTeam: null,
    accepted: false,
    pointsAwarded: 0,
    team0Scored: 0,
    team1Scored: 0,
  };

  // Pica-Pica state
  private isPicaPica: boolean = false;
  private picaPicaSubmano: number = 0; // 0, 1, 2
  private picaPicaHandAlternation: boolean = false; // true = normal hand, false = picapica hand
  private picapicaResults: PicaPicaSubmanoResult[] = [];
  private picaPicaActivePairIds: string[] = [];

  // Event listeners
  private listeners: { [event: string]: Function[] } = {};

  constructor() {}

  // ---- Event System ----

  on(event: string, callback: Function): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event: string, data: any = {}): void {
    const callbacks = this.listeners[event] || [];
    for (const cb of callbacks) {
      cb(data);
    }
  }

  // ---- Game Setup ----

  startGame(players: PlayerConfig[], config: GameConfig): void {
    this.players = players;
    this.config = config;
    this.scores = { team0: 0, team1: 0 };
    this.currentHand = 0;
    this.firstHandCompleted = false;
    this.isPicaPica = this.checkPicaPica();
    this.picaPicaHandAlternation = true; // Start with normal hand
    this.dealerId = players[0].id;
    this.previousStarterId = this.determineStarterForFirstRound();
    this.firstTrickWinnerTeam = -1;
    this.startNewHand();
  }

  private checkPicaPica(): boolean {
    if (this.config.playerCount !== 6) return false;
    return this.scores.team0 >= 5 && this.scores.team0 <= 25 &&
           this.scores.team1 >= 5 && this.scores.team1 <= 25;
  }

  // ---- Player ordering (counter-clockwise) ----

  /**
   * Get players in playing order (counter-clockwise).
   * Position 0 is the dealer. Playing order goes counter-clockwise.
   */
  getPlayingOrder(): string[] {
    // Players are already ordered counter-clockwise by position
    const sorted = [...this.players].sort((a, b) => a.position - b.position);
    return sorted.map(p => p.id);
  }

  private getPlayerById(id: string): PlayerConfig | undefined {
    return this.players.find(p => p.id === id);
  }

  private getPlayerTeam(playerId: string): number {
    const p = this.getPlayerById(playerId);
    return p ? p.team : -1;
  }

  // ---- Starter determination ----

  /**
   * For the first round of the first hand, starter is the player
   * to the RIGHT of the dealer (counter-clockwise).
   */
  private determineStarterForFirstRound(): string {
    const order = this.getPlayingOrder();
    const dealerIdx = order.indexOf(this.dealerId);
    // Counter-clockwise: next player after dealer
    // Counter-clockwise: right of dealer is previous index
    const starterIdx = (dealerIdx + 1) % order.length;
    return order[starterIdx];
  }

  /**
   * Determine starter for a round:
   - If it's the first round of a hand, starter is the mano (right of dealer).
   - If it's a subsequent round, starter is the player who played the highest card
     in the previous round.
   - If tie in first round (no clear highest card), starter is the same as the
     previous round's starter.
   */
  private determineStarterForRound(roundNumber: number): string {
    if (roundNumber === 0) {
      // First round of hand: starter is right of dealer (counter-clockwise)
      const order = this.getPlayingOrder();
      const dealerIdx = order.indexOf(this.dealerId);
      const starterIdx = (dealerIdx + 1) % order.length;
      return order[starterIdx];
    }

    // Subsequent round: starter is the player who played the highest card
    // in the previous round (not the trick winner)
    const prevRoundResult = this.roundResults[roundNumber - 1];
    if (prevRoundResult) {
      // If previous round was tied, same starter as the first round
      if (prevRoundResult.teamWinner === -1) {
        return this.previousStarterId;
      }
      // Otherwise, the player with the highest card starts
      if (prevRoundResult.highestCardPlayerId) {
        return prevRoundResult.highestCardPlayerId;
      }
    }

    // Fallback: same starter as this hand
    return this.previousStarterId;
  }

  // ---- Hand management ----

  private startNewHand(): void {
    // Reset first trick tracker for parda
    this.firstTrickWinnerTeam = -1;

    // Check if we need Pica-Pica
    if (this.isPicaPica) {
      if (this.picaPicaHandAlternation) {
        // Normal hand
        this.startNormalHand();
      } else {
        // Pica-Pica hand
        this.startPicaPicaHand();
      }
    } else {
      this.startNormalHand();
    }
  }

  private startNormalHand(): void {
    // Save the highest card player from the last round before resetting
    let lastRoundHighestCardPlayerId: string = '';
    if (this.roundResults.length > 0) {
      const lastRound = this.roundResults[this.roundResults.length - 1];
      lastRoundHighestCardPlayerId = lastRound.highestCardPlayerId || '';
    }

    // Rotate dealer counter-clockwise
    this.rotateDealer();

    // Reset hand state
    this.deck = new Deck();
    this.currentHand = this.firstHandCompleted ? 1 : 0;
    this.currentRound = 0;
    this.roundResults = [];

    // Set starter for the first round of this hand
    // Always: starter = right of the CURRENT dealer (counter-clockwise)
    this.starterId = this.determineStarterForFirstRound();

    this.startRound();
  }

  private rotateDealer(): void {
    const order = this.getPlayingOrder();
    const dealerIdx = order.indexOf(this.dealerId);
    // Counter-clockwise rotation
    const nextIdx = (dealerIdx + 1) % order.length;
    this.dealerId = order[nextIdx];
  }

  private startRound(): void {
    this.currentTrick = [];
    this.currentTrickNumber = 0;
    this.hands = {};

    // Deal 3 cards to each player
    for (const player of this.players) {
      this.hands[player.id] = [];
    }
    for (let i = 0; i < 3; i++) {
      for (const player of this.players) {
        const card = this.deck.draw();
        if (card) {
          this.hands[player.id].push(card);
        }
      }
    }

    // Determine starter
    // If starterId was pre-set (e.g., 2da mano), use it; otherwise calculate
    if (!this.starterId) {
      this.starterId = this.determineStarterForRound(this.currentRound);
    }
    this.currentTurnPlayerId = this.starterId;
    this.trickWinnerId = '';
    this.trickWinnerTeam = -1;

    // Reset envido and truco for this round
    this.resetEnvido();
    this.resetTruco();

    // If starter is AI, trigger AI turn
    const starterPlayer = this.getPlayerById(this.starterId);
    if (starterPlayer && starterPlayer.isAI) {
      this.emit('ai-turn', {
        playerId: this.starterId,
        trickNumber: 0,
        roundNumber: this.currentRound,
        handNumber: this.currentHand
      });
    }

    this.emit('round-start', {
      roundNumber: this.currentRound,
      handNumber: this.currentHand,
      dealerId: this.dealerId,
      starterId: this.starterId,
      deckRemaining: this.deck.remaining,
      scores: { ...this.scores }
    });
  }

  // ---- Pica-Pica hand ----

  private startPicaPicaHand(): void {
    // Reset hand state — deal once, all 3 submanos share the same cards
    this.deck = new Deck();
    this.currentHand = this.firstHandCompleted ? 1 : 0;
    this.roundResults = [];
    this.picapicaResults = [];
    this.picaPicaSubmano = 0;

    // Deal 3 cards to each player (once for all 3 submanos)
    this.hands = {};
    for (const player of this.players) {
      this.hands[player.id] = [];
    }
    for (let i = 0; i < 3; i++) {
      for (const player of this.players) {
        const card = this.deck.draw();
        if (card) {
          this.hands[player.id].push(card);
        }
      }
    }

    // Start first submano
    this.startPicaPicaSubmano(0);
  }

  private startPicaPicaSubmano(submano: number): void {
    // Set the active pair for this submano
    this.picaPicaActivePairIds = this.getPicaPicaPairForSubmano(submano);

    // Determine starter: first in playing order = lower position number
    this.starterId = this.picaPicaActivePairIds[0];
    this.previousStarterId = this.starterId;
    this.currentTurnPlayerId = this.starterId;
    this.currentRound = 0;
    this.currentTrick = [];
    this.currentTrickNumber = 0;
    this.roundResults = [];

    this.resetEnvido();
    this.resetTruco();

    this.emit('round-start', {
      roundNumber: 0,
      handNumber: this.currentHand,
      dealerId: this.dealerId,
      starterId: this.starterId,
      deckRemaining: this.deck.remaining,
      scores: { ...this.scores },
      isPicaPica: true,
      picaPicaSubmano: submano
    });
  }

  // ---- Envido ----

  private resetEnvido(): void {
    this.envido = {
      phase: 'none',
      callerTeam: null,
      level: 'envido',
      totalPoints: 0,
      accepted: false,
      pointsAwarded: 0,
      team0Scored: 0,
      team1Scored: 0,
      team0Player0Envido: null,
      team0Player1Envido: null,
      team1Player0Envido: null,
      team1Player1Envido: null,
      team1Player2Envido: null,
      team0Player2Envido: null,
    };
  }

  /** Only the DEALER and the PIE (left of dealer) can call envido, on their turn before playing */
  private canCallEnvido(playerId: string): boolean {
    if (this.currentRound !== 0) return false;
    if (this.envido.phase !== 'none') return false;
    if (this.envido.pointsAwarded > 0) return false; // Already resolved this round
    const alreadyPlayed = this.currentTrick.some(p => p.playerId === playerId);
    if (alreadyPlayed) return false;
    if (this.isPicaPica) {
      // In Pica-Pica 1v1, any of the 2 paired players can call envido
      return this.picaPicaActivePairIds.includes(playerId);
    }
    // Only dealer or pie can call
    const order = this.getPlayingOrder();
    const dealerIdx = order.indexOf(this.dealerId);
    const pieIdx = (dealerIdx - 1 + order.length) % order.length;
    const pieId = order[pieIdx];
    return playerId === this.dealerId || playerId === pieId;
  }

  private canRespondEnvido(): boolean {
    return this.envido.phase === 'opening' && !this.envido.accepted;
  }

  private canRaiseEnvido(): boolean {
    return this.envido.phase === 'opening' && !this.envido.accepted;
  }

  /** Calculate Falta Envido value: points the losing team needs to reach target */
  private getFaltaEnvidoValue(): number {
    const lowest = Math.min(this.scores.team0, this.scores.team1);
    return this.targetScore - lowest;
  }

  private openEnvido(playerId: string): void {
    if (!this.canCallEnvido(playerId)) return;
    const player = this.getPlayerById(playerId);
    if (!player) return;

    this.envido.phase = 'opening';
    this.envido.callerTeam = player.team;
    this.envido.level = 'envido';
    this.envido.totalPoints = 2;
    this.emit('envido-opened', {
      team: player.team,
      playerId,
      scores: this.getEnvidoPlayerScores()
    });
  }

  private respondEnvido(playerId: string, want: boolean, raiseTo?: 'envido' | 'envido-envido' | 'real-envido' | 'falta-envido'): void {
    if (!this.canRespondEnvido()) return;
    const player = this.getPlayerById(playerId);
    if (!player) return;

    // Only the opponent team responds. Teammate does nothing (can't raise).
    if (player.team === this.envido.callerTeam) return;

    if (!want) {
      // No quiero — caller gets 1 point
      this.resolveEnvido(1);
      return;
    }

    if (raiseTo) {
      // Accept and raise
      const raiseValues: Record<string, number> = {
        'envido': 2,
        'envido-envido': 2,
        'real-envido': 3,
        'falta-envido': this.getFaltaEnvidoValue(),
      };
      this.envido.level = raiseTo;
      // Accumulate — if the new level has its own value, add it on top
      if (raiseTo === 'falta-envido') {
        this.envido.totalPoints = this.getFaltaEnvidoValue();
      } else {
        this.envido.totalPoints += raiseValues[raiseTo];
      }
      // Flip caller: now the raiser's team is the one waiting for an answer
      this.envido.callerTeam = player.team;
      this.emit('envido-raised', {
        team: player.team,
        level: raiseTo,
        playerId
      });
    } else {
      // Accept at current level
      this.envido.accepted = true;
      this.resolveEnvido(this.envido.totalPoints);
    }
  }

  private resolveEnvido(points: number): void {
    this.envido.phase = 'resolution';

    const scores = this.getEnvidoPlayerScores();

    // Each team's best individual envido (not summed!)
    let team0Best = 0, team1Best = 0;
    const playersToCompare = this.isPicaPica
      ? this.players.filter(p => this.picaPicaActivePairIds.includes(p.id))
      : this.players;
    for (const player of playersToCompare) {
      const s = scores[player.id] || 0;
      if (player.team === 0) team0Best = Math.max(team0Best, s);
      else team1Best = Math.max(team1Best, s);
    }

    let winnerTeam: number;
    if (team0Best > team1Best) {
      winnerTeam = 0;
    } else if (team1Best > team0Best) {
      winnerTeam = 1;
    } else {
      // Tie: el MANO (right of dealer, primer jugador) gana
      const order = this.getPlayingOrder();
      const dealerIdx = order.indexOf(this.dealerId);
      const manoIdx = (dealerIdx + 1) % order.length;
      const manoId = order[manoIdx];
      winnerTeam = this.getPlayerTeam(manoId);
    }

    if (winnerTeam === 0) this.scores.team0 += points;
    else this.scores.team1 += points;

    this.envido.pointsAwarded = points;
    this.envido.team0Scored = this.scores.team0;
    this.envido.team1Scored = this.scores.team1;

    // Reset envido phase so truco button can appear
    this.envido.phase = 'none';

    this.emit('envido-resolved', {
      winnerTeam,
      points,
      scores,
      team0Best,
      team1Best,
      team0Scored: this.scores.team0,
      team1Scored: this.scores.team1,
      level: this.envido.level
    });
  }

  // ---- Envido utility methods ----

  private getEnvidoScore(cards: CardDef[]): number {
    if (cards.length === 0) return 0;
    const suitCounts: { [suit: string]: number } = {};
    for (const card of cards) {
      suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    }
    let maxScore = 0;
    for (const [suit, count] of Object.entries(suitCounts)) {
      if (count >= 2) {
        const suitCards = cards.filter(c => c.suit === suit);
        suitCards.sort((a, b) => this.getEnvidoCardValue(b) - this.getEnvidoCardValue(a));
        maxScore = Math.max(maxScore, 20 + this.getEnvidoCardValue(suitCards[0]) + this.getEnvidoCardValue(suitCards[1]));
      }
    }
    if (maxScore === 0 && cards.length > 0) {
      maxScore = Math.max(...cards.map(c => this.getEnvidoCardValue(c)));
    }
    return maxScore;
  }

  private getEnvidoCardValue(card: CardDef): number {
    switch (card.number) {
      case 1: return 1;
      case 2: return 2;
      case 3: return 3;
      case 4: return 4;
      case 5: return 5;
      case 6: return 6;
      case 7: return 7;
      case 10: return 0;
      case 11: return 0;
      case 12: return 0;
      default: return 0;
    }
  }

  private getEnvidoPlayerScores(): { [playerId: string]: number } {
    const scores: { [playerId: string]: number } = {};
    for (const player of this.players) {
      scores[player.id] = this.getEnvidoScore(this.hands[player.id] || []);
    }
    return scores;
  }

  /**
   * Get the "pie" player for a team (last player in counter-clockwise order).
   */
  private getPiePlayer(team: number): string | null {
    const order = this.getPlayingOrder();
    const teamPlayers = order.filter(id => {
      const p = this.getPlayerById(id);
      return p && p.team === team;
    });
    if (teamPlayers.length === 0) return null;
    return teamPlayers[teamPlayers.length - 1];
  }

  /**
   * Get the "mano" player for a team (first in round order).
   */
  private getManoPlayer(team: number): string | null {
    const order = this.getPlayingOrder();
    const teamPlayers = order.filter(id => {
      const p = this.getPlayerById(id);
      return p && p.team === team;
    });
    if (teamPlayers.length === 0) return null;
    return teamPlayers[0];
  }

  /**
   * Get the number of active players for the current round.
   * In Pica-Pica, only the 2 paired players play per submano.
   */
  private getActivePlayerCount(): number {
    if (this.isPicaPica) return 2;
    return this.players.length;
  }

  /**
   * Get the pair of players for a Pica-Pica submano.
   * Submano 0: positions 0 and 3, Submano 1: positions 1 and 4, Submano 2: positions 2 and 5.
   */
  private getPicaPicaPairForSubmano(submano: number): string[] {
    const order = this.getPlayingOrder();
    return [order[submano], order[submano + 3]];
  }

  // ---- Truco ----

  private resetTruco(): void {
    this.truco = {
      level: 0,
      lastChallengerTeam: null,
      accepted: false,
      pointsAwarded: 0,
      team0Scored: 0,
      team1Scored: 0,
    };
  }

  private canChallengeTruco(): boolean {
    return true; // Can challenge at any time
  }

  private challengeTruco(playerId: string): void {
    if (!this.canChallengeTruco()) return;
    const player = this.getPlayerById(playerId);
    if (!player) return;

    const nextLevel = this.truco.level + 1;
    if (nextLevel > 3) return; // Max vale 4

    this.truco.level = nextLevel as 1 | 2 | 3;
    this.truco.lastChallengerTeam = player.team;
    this.truco.accepted = false;

    this.emit('truco-challenged', {
      level: this.truco.level,
      challengerTeam: player.team,
      playerId
    });
  }

  private respondTruco(playerId: string, want: boolean, raiseTo?: boolean): void {
    if (this.truco.level === 0) return;
    if (this.truco.accepted) return;

    const player = this.getPlayerById(playerId);
    if (!player) return;

    // Teammate does nothing (can't raise).
    if (player.team === this.truco.lastChallengerTeam) {
      return;
    }

    // Opponent team
    if (!want) {
      // Don't want - challenger team gets current level points
      this.resolveTruco();
      return;
    }

    // Want - opponent can accept OR accept and raise
    if (raiseTo && this.truco.level < 3) {
      // Accept and raise to next level
      const nextLevel = (this.truco.level + 1) as 1 | 2 | 3;
      this.truco.level = nextLevel;
      // Flip challenger: now it's the opponent's turn to challenge
      this.truco.lastChallengerTeam = player.team;
      this.truco.accepted = false;
      this.emit('truco-raised', {
        level: nextLevel,
        team: player.team,
        playerId
      });
    } else {
      // Just accept at current level
      this.truco.accepted = true;
      this.emit('truco-accepted', {
        level: this.truco.level,
        team: this.truco.lastChallengerTeam
      });
    }
  }

  private resolveTruco(): void {
    const pointsMap: { [level: number]: number } = { 1: 2, 2: 3, 3: 4 };
    // When rejected, award the PREVIOUS level's points (base hand value)
    const rejectMap: { [level: number]: number } = { 1: 1, 2: 2, 3: 3 };
    const points = this.truco.accepted
      ? (pointsMap[this.truco.level] || 2)
      : (rejectMap[this.truco.level] || 1);

    let winnerTeam: number;
    if (this.truco.lastChallengerTeam !== null && this.truco.accepted) {
      // Challenger's team wanted and accepted - they get the points
      winnerTeam = this.truco.lastChallengerTeam;
    } else if (this.truco.lastChallengerTeam !== null) {
      // Opponent didn't want - challenger gets points
      winnerTeam = this.truco.lastChallengerTeam;
    } else {
      return;
    }

    if (winnerTeam === 0) this.scores.team0 += points;
    else this.scores.team1 += points;

    this.truco.pointsAwarded = points;
    this.truco.team0Scored = this.scores.team0;
    this.truco.team1Scored = this.scores.team1;

    this.emit('truco-resolved', {
      winnerTeam,
      points,
      level: this.truco.level,
      team0Scored: this.scores.team0,
      team1Scored: this.scores.team1
    });
  }

  // ---- Card playing ----

  playCard(playerId: string, cardIndex: number): boolean {
    if (this.currentTurnPlayerId !== playerId) return false;
    if (!this.hands[playerId]) return false;
    if (cardIndex < 0 || cardIndex >= this.hands[playerId].length) return false;

    const card = this.hands[playerId].splice(cardIndex, 1)[0];
    if (!card) return false;

    this.currentTrick.push({ card, playerId });
    this.currentTrickNumber = this.currentTrick.length;

    this.emit('card-played', {
      card,
      playerId,
      trickNumber: this.currentTrickNumber,
      roundNumber: this.currentRound,
      handNumber: this.currentHand,
      deckRemaining: this.deck.remaining,
      scores: { ...this.scores },
      isPicaPica: this.isPicaPica,
      picaPicaSubmano: this.picaPicaSubmano
    });

    // Determine next player
    const activeCount = this.getActivePlayerCount();
    if (this.currentTrick.length < activeCount) {
      this.nextTurn();
    } else {
      // Trick complete - resolve
      this.resolveTrick();
    }

    return true;
  }

  private nextTurn(): void {
    let nextId: string;
    if (this.isPicaPica) {
      // Pica-Pica: cycle between the 2 paired players
      const idx0 = this.picaPicaActivePairIds[0];
      const idx1 = this.picaPicaActivePairIds[1];
      nextId = this.currentTurnPlayerId === idx0 ? idx1 : idx0;
    } else {
      const order = this.getPlayingOrder();
      const currentIdx = order.indexOf(this.currentTurnPlayerId);
      // Counter-clockwise: go forward in position order
      const nextIdx = (currentIdx + 1) % order.length;
      nextId = order[nextIdx];
    }
    this.currentTurnPlayerId = nextId;

    // Check if it's AI's turn
    const nextPlayer = this.getPlayerById(this.currentTurnPlayerId);
    if (nextPlayer && nextPlayer.isAI) {
      this.emit('ai-turn', {
        playerId: this.currentTurnPlayerId,
        trickNumber: this.currentTrickNumber + 1,
        roundNumber: this.currentRound,
        handNumber: this.currentHand
      });
    } else {
      // Human turn: emit event to update UI (envido buttons, etc.)
      this.emit('round-start', {
        roundNumber: this.currentRound,
        handNumber: this.currentHand,
        dealerId: this.dealerId,
        starterId: this.starterId,
        deckRemaining: this.deck.remaining,
        scores: { ...this.scores }
      });
    }
  }

  // ---- Trick resolution ----

  private resolveTrick(): void {
    if (this.currentTrick.length < 2) return;

    // Find highest card PER TEAM
    // Group cards by team
    const teamCards: { [team: number]: { card: CardDef; playerId: string } } = {};
    for (const played of this.currentTrick) {
      const team = this.getPlayerTeam(played.playerId);
      const existing = teamCards[team];
      if (!existing || getCardRank(played.card) > getCardRank(existing.card)) {
        teamCards[team] = { card: played.card, playerId: played.playerId };
      }
    }

    // Compare each team's highest card
    const teams = Object.keys(teamCards).map(Number);
    let highestCard: CardDef;
    let highestCardPlayerId: string;
    if (teams.length < 2) {
      // All players are on the same team (shouldn't happen, but handle)
      this.trickWinnerId = teamCards[teams[0]].playerId;
      this.trickWinnerTeam = teams[0];
      highestCard = teamCards[teams[0]].card;
      highestCardPlayerId = teamCards[teams[0]].playerId;
    } else {
      const team0Highest = getCardRank(teamCards[0].card);
      const team1Highest = getCardRank(teamCards[1].card);
      if (team0Highest > team1Highest) {
        this.trickWinnerId = teamCards[0].playerId;
        this.trickWinnerTeam = 0;
        highestCard = teamCards[0].card;
        highestCardPlayerId = teamCards[0].playerId;
      } else if (team1Highest > team0Highest) {
        this.trickWinnerId = teamCards[1].playerId;
        this.trickWinnerTeam = 1;
        highestCard = teamCards[1].card;
        highestCardPlayerId = teamCards[1].playerId;
      } else {
        // Tie - both teams have same highest card rank
        this.trickWinnerId = '';
        this.trickWinnerTeam = -1;
        highestCard = teamCards[0].card; // Use first team's card for display
        highestCardPlayerId = teamCards[0].playerId;
      }
    }

    this.emit('trick-resolved', {
      trickNumber: this.currentTrickNumber,
      roundNumber: this.currentRound,
      handNumber: this.currentHand,
      winnerId: highestCardPlayerId,
      winnerTeam: this.trickWinnerTeam,
      cards: this.currentTrick,
      highestCard
    });

    // Move to next round
    this.currentRound++;

    // Track first trick winner for parda tie-break
    if (this.currentRound === 1) {
      this.firstTrickWinnerTeam = this.trickWinnerTeam;
    }
    this.roundResults.push({
      roundNumber: this.currentRound,
      teamWinner: this.trickWinnerTeam,
      cards: [...this.currentTrick],
      highestCard,
      highestCardPlayerId
    });

    this.currentTrick = [];

    if (this.currentRound < 3) {
      // Next round
      this.starterId = this.determineStarterForRound(this.currentRound);
      this.currentTurnPlayerId = this.starterId;
      // Trigger AI turn if starter is AI
      const nextStarter = this.getPlayerById(this.starterId);
      if (nextStarter && nextStarter.isAI) {
        this.emit('ai-turn', {
          playerId: this.starterId,
          trickNumber: this.currentTrickNumber + 1,
          roundNumber: this.currentRound,
          handNumber: this.currentHand
        });
      }
      this.emit('round-start', {
        roundNumber: this.currentRound,
        handNumber: this.currentHand,
        dealerId: this.dealerId,
        starterId: this.starterId,
        deckRemaining: this.deck.remaining,
        scores: { ...this.scores }
      });
    } else {
      // All 3 rounds done - resolve hand
      this.resolveHand();
    }
  }

  // ---- Hand resolution ----

  private resolveHand(): void {
    let handWinnerTeam: number = -1;

    // Filter out tied rounds - they don't count
    const validRounds = this.roundResults.filter(r => r.teamWinner !== -1);
    const team0TricksValid = validRounds.filter(r => r.teamWinner === 0).length;
    const team1TricksValid = validRounds.filter(r => r.teamWinner === 1).length;

    if (team0TricksValid > team1TricksValid) {
      handWinnerTeam = 0;
    } else if (team1TricksValid > team0TricksValid) {
      handWinnerTeam = 1;
    } else {
      // Balanced or all tied — first trick winner breaks the tie
      if (this.firstTrickWinnerTeam !== -1) {
        handWinnerTeam = this.firstTrickWinnerTeam;
      } else {
        // All rounds tied (impossible in practice, but handle it)
        handWinnerTeam = this.getPlayerTeam(this.previousStarterId);
      }
    }

    if (this.isPicaPica) {
      // Pica-Pica: this was a submano, not a full hand
      this.picapicaResults.push({
        submanoNumber: this.picaPicaSubmano,
        teamWinner: handWinnerTeam,
        cards: this.roundResults.flatMap(r => r.cards)
      });

      if (this.picaPicaSubmano < 2) {
        // Next submano
        this.picaPicaSubmano++;
        this.startNextPicaPicaSubmano();
        return;
      }

      // All 3 submanos done - determine hand winner
      let picaTeam0Wins = 0;
      let picaTeam1Wins = 0;
      for (const sr of this.picapicaResults) {
        if (sr.teamWinner === 0) picaTeam0Wins++;
        else if (sr.teamWinner === 1) picaTeam1Wins++;
      }
      handWinnerTeam = picaTeam0Wins >= 2 ? 0 : (picaTeam1Wins >= 2 ? 1 : -1);
    } else {
      // Normal hand — handWinnerTeam already determined above
    }

    // Award points
    let pointsAwarded = 0;
    if (handWinnerTeam !== -1) {
      if (this.isPicaPica) {
        // Pica-Pica: base 1 point + truco bonus
        pointsAwarded = this.truco.accepted ? (this.truco.level + 1) : 1;
      } else if (this.truco.accepted) {
        // Truco accepted during play: level 1=2pts, 2=3pts, 3=4pts
        pointsAwarded = this.truco.level + 1;
      } else {
        // No truco or truco rejected (already awarded in resolveTruco) — base 1
        pointsAwarded = 1;
      }
    }

    if (handWinnerTeam === 0) this.scores.team0 += pointsAwarded;
    else if (handWinnerTeam === 1) this.scores.team1 += pointsAwarded;

    this.emit('hand-resolved', {
      handNumber: this.currentHand,
      isSecondHand: this.currentHand === 1,
      handWinnerTeam,
      team0Tricks: team0TricksValid,
      team1Tricks: team1TricksValid,
      pointsAwarded,
      scores: { ...this.scores },
      roundResults: this.roundResults,
      isPicaPica: this.isPicaPica,
      picapicaResults: this.picapicaResults
    });

    // Check game over
    if (this.scores.team0 >= this.targetScore || this.scores.team1 >= this.targetScore) {
      this.emit('game-over', {
        winningTeam: this.scores.team0 >= this.targetScore ? 0 : 1,
        scores: { ...this.scores }
      });
      return;
    }

    // Next hand
    if (!this.firstHandCompleted) {
      this.firstHandCompleted = true;
      this.isPicaPica = this.checkPicaPica();
      this.emit('round-over', {
        isSecondHand: false,
        handWinnerTeam,
        scores: { ...this.scores }
      });
    } else {
      // Next hand (normal or Pica-Pica)
      this.picaPicaHandAlternation = !this.picaPicaHandAlternation;
      this.startNewHand();
    }
  }

  private startNextPicaPicaSubmano(): void {
    this.picaPicaSubmano++;
    // Don't redeal — keep the same cards, just advance to the next pair
    this.startPicaPicaSubmano(this.picaPicaSubmano);
  }

  // ---- Getters for UI ----

  getHands(): { [playerId: string]: CardDef[] } {
    return { ...this.hands };
  }

  getCurrentTurnPlayerId(): string {
    return this.currentTurnPlayerId;
  }

  getCurrentRound(): number {
    return this.currentRound;
  }

  getCurrentTrick(): PlayedCard[] {
    return [...this.currentTrick];
  }

  getDeckRemaining(): number {
    return this.deck.remaining;
  }

  getScores(): { team0: number; team1: number } {
    return { ...this.scores };
  }

  getDealerId(): string {
    return this.dealerId;
  }

  getStarterId(): string {
    return this.starterId;
  }

  getRoundResults(): RoundResult[] {
    return [...this.roundResults];
  }

  getEnvidoState(): EnvidoState {
    return { ...this.envido };
  }

  getTrucoState(): TrucoState {
    return { ...this.truco };
  }

  getIsPicaPica(): boolean {
    return this.isPicaPica;
  }

  getPicaPicaSubmano(): number {
    return this.picaPicaSubmano;
  }

  getPicapicaResults(): PicaPicaSubmanoResult[] {
    return [...this.picapicaResults];
  }

  isFirstHandCompleted(): boolean {
    return this.firstHandCompleted;
  }

  getIsSecondHand(): boolean {
    return this.currentHand === 1;
  }
}