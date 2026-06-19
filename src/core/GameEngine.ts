// GameEngine.ts — Complete Truco game engine

import { Deck } from './Deck.js';
import { getCardRank, getCardName } from './Rules.js';
import type {
  CardDef, Suit, CardNumber, PlayerCount, Difficulty,
  PlayerConfig, PlayedCard, RoundResult, PicaPicaSubmanoResult,
  GameConfig, EnvidoState, TrucoState, GameEvent,
  HandRecord, PartidaHistory, Baza, Mano, CantoRecord, FullGameState
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

  // Partida (match) history
  private partidaHistory: PartidaHistory = {
    initialDealerId: '',
    hands: [],
    finalScores: { team0: 0, team1: 0 },
    winningTeam: -1,
    totalHands: 0,
    startedAt: Date.now(),
    endedAt: null,
  };
  private startedAt: number = Date.now();

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
  private gameOver: boolean = false;
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
    envidoWinner: null,
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
  private trucoWaitingForResponse: boolean = false;

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
    this.picaPicaHandAlternation = true;

    // Record match start
    this.startedAt = Date.now();
    this.partidaHistory = {
      initialDealerId: '',
      hands: [],
      finalScores: { team0: 0, team1: 0 },
      winningTeam: -1,
      totalHands: 0,
      startedAt: Date.now(),
      endedAt: null,
    };

    // Pick random initial dealer — the first "mano" (dealer) is random
    const randomIdx = Math.floor(Math.random() * players.length);
    this.dealerId = players[randomIdx].id;
    this.partidaHistory.initialDealerId = this.dealerId;

    // Store initial scores snapshot
    this.partidaHistory.finalScores = { team0: 0, team1: 0 };

    this.previousStarterId = this.determineStarterForFirstRound();
    this.firstTrickWinnerTeam = -1;
    this.startNewHand(true);
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

  // ---- Card dealing (repartir cartas) ----

  /**
   * Deal 3 cards to each player from a fresh deck.
   * Sets up the `hands` state and emits a 'dealing' event.
   * No duplicates — each card is drawn via Deck.draw() which pops unique cards.
   */
  private repartirCartas(): void {
    // Create a fresh, shuffled deck
    this.deck = new Deck();

    // Initialize hands for all players
    this.hands = {};
    for (const player of this.players) {
      this.hands[player.id] = [];
    }

    // Deal 3 cards to each player (counter-clockwise round-robin)
    for (let i = 0; i < 3; i++) {
      for (const player of this.players) {
        const card = this.deck.draw();
        if (card) {
          this.hands[player.id].push(card);
        }
      }
    }

    this.emit('dealing', {
      deckRemaining: this.deck.remaining,
      playerCount: this.players.length,
      cardsPerPlayer: 3
    });
  }

  // ---- Hand management ----

  private startNewHand(skipRotation: boolean = false): void {
    // Reset first trick tracker for parda
    this.firstTrickWinnerTeam = -1;

    // Check if we need Pica-Pica
    if (this.isPicaPica) {
      if (this.picaPicaHandAlternation) {
        // Normal hand
        this.startNormalHand(skipRotation);
      } else {
        // Pica-Pica hand
        this.startPicaPicaHand();
      }
    } else {
      this.startNormalHand(skipRotation);
    }
  }

  private startNormalHand(skipRotation: boolean = false): void {
    // Save the highest card player from the last round before resetting
    let lastRoundHighestCardPlayerId: string = '';
    if (this.roundResults.length > 0) {
      const lastRound = this.roundResults[this.roundResults.length - 1];
      lastRoundHighestCardPlayerId = lastRound.highestCardPlayerId || '';
    }

    // Rotate dealer counter-clockwise (skip on very first hand)
    if (!skipRotation) {
      this.rotateDealer();
    }

    // Reset hand state
    this.currentHand = this.firstHandCompleted ? 1 : 0;
    this.currentRound = 0;
    this.roundResults = [];

    // Set starter for the first round of this hand
    // Hand 1: starter = right of the CURRENT dealer (counter-clockwise)
    // Hand 2+: starter = winner of the last trick of the previous hand
    if (this.firstHandCompleted && lastRoundHighestCardPlayerId) {
      this.starterId = lastRoundHighestCardPlayerId;
    } else {
      this.starterId = this.determineStarterForFirstRound();
    }

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

    // Deal 3 cards to each player (no duplicates)
    this.repartirCartas();

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
    this.currentHand = this.firstHandCompleted ? 1 : 0;
    this.roundResults = [];
    this.picapicaResults = [];
    this.picaPicaSubmano = 0;

    // Deal 3 cards to each player (once for all 3 submanos)
    this.repartirCartas();

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
      envidoWinner: null,
      team0Player0Envido: null,
      team0Player1Envido: null,
      team1Player0Envido: null,
      team1Player1Envido: null,
      team1Player2Envido: null,
      team0Player2Envido: null,
    };
  }

  /** Any player can call envido on their turn, before playing their first card in round 0 */
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
    // Any player who hasn't played a card yet can call
    return true;
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

  private respondEnvido(playerId: string, want: boolean | 'son-buenas', raiseTo?: 'envido' | 'envido-envido' | 'real-envido' | 'falta-envido'): void {
    if (!this.canRespondEnvido()) return;
    const player = this.getPlayerById(playerId);
    if (!player) return;

    // Only the opponent team responds. Teammate does nothing (can't raise).
    if (player.team === this.envido.callerTeam) return;

    if (want === 'son-buenas') {
      // "Son buenas" — responder concedes without showing values.
      // Caller wins envido points immediately.
      this.envido.phase = 'resolution';
      this.envido.pointsAwarded = this.envido.totalPoints;
      const callerTeam = this.envido.callerTeam!;
      this.agregarPuntos(callerTeam, this.envido.totalPoints);
      this.envido.team0Scored = this.scores.team0;
      this.envido.team1Scored = this.scores.team1;
      this.envido.phase = 'none';
      this.emit('envido-resolved', {
        winnerTeam: callerTeam,
        points: this.envido.totalPoints,
        scores: this.getEnvidoPlayerScores(),
        team0Best: 0,
        team1Best: 0,
        sonBuenas: true,
        team0Scored: this.scores.team0,
        team1Scored: this.scores.team1,
        level: this.envido.level
      });
      return;
    }

    if (!want) {
      // No quiero — caller gets 1 point (no score comparison)
      this.envido.phase = 'resolution';
      this.envido.pointsAwarded = 1;
      const callerTeam = this.envido.callerTeam!;
      this.agregarPuntos(callerTeam, 1);
      this.envido.team0Scored = this.scores.team0;
      this.envido.team1Scored = this.scores.team1;
      this.envido.phase = 'none';
      this.emit('envido-resolved', {
        winnerTeam: callerTeam,
        points: 1,
        scores: this.getEnvidoPlayerScores(),
        team0Best: 0,
        team1Best: 0,
        team0Scored: this.scores.team0,
        team1Scored: this.scores.team1,
        level: this.envido.level
      });
      return;
    }

    if (raiseTo) {
      // Accept and raise — set the new level's value (don't accumulate)
      const raiseValues: Record<string, number> = {
        'envido': 2,
        'envido-envido': 2,
        'real-envido': 3,
        'falta-envido': this.getFaltaEnvidoValue(),
      };
      this.envido.level = raiseTo;
      if (raiseTo === 'falta-envido') {
        this.envido.totalPoints = this.getFaltaEnvidoValue();
      } else {
        this.envido.totalPoints = raiseValues[raiseTo] || this.envido.totalPoints;
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

    // Store individual envido scores for display
    const orderedPlayers = this.getPlayingOrder();
    for (let i = 0; i < orderedPlayers.length; i++) {
      const pid = orderedPlayers[i];
      const p = this.getPlayerById(pid);
      if (!p) continue;
      const val = scores[pid] || 0;
      if (p.team === 0) {
        if (i % 2 === 0) {
          this.envido.team0Player0Envido = val;
        } else {
          this.envido.team0Player1Envido = val;
        }
      } else {
        if (i % 2 === 0) {
          this.envido.team1Player0Envido = val;
        } else {
          this.envido.team1Player1Envido = val;
        }
      }
    }

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

    // Use agregarPuntos to cap at targetScore and detect game-over mid-hand
    this.agregarPuntos(winnerTeam, points);

    this.envido.pointsAwarded = points;
    this.envido.envidoWinner = winnerTeam;
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

  // ---- Scoring helpers (Épica 7) ----

  /**
   * agregarPuntos: Add points to a team, capping at targetScore (30).
   * Emits 'puntosMarcados' with the points awarded and new scores.
   * Emits 'partidaFinalizada' (alias for 'game-over') if a winner is determined.
   * Returns the actual number of points awarded (capped).
   */
  public agregarPuntos(team: number, points: number): number {
    if (this.gameOver) return 0;
    if (team !== 0 && team !== 1) return 0;
    if (points <= 0) return 0;

    const key = team === 0 ? 'team0' : 'team1';
    const before = this.scores[key];
    const after = Math.min(before + points, this.targetScore);
    const awarded = after - before;
    this.scores[key] = after;

    this.emit('puntosMarcados', {
      team,
      points: awarded,
      previousScore: before,
      newScore: after,
      scores: { ...this.scores },
    });

    // Check if this caused a game-over
    if (after >= this.targetScore) {
      this.gameOver = true;
      this.partidaHistory.winningTeam = team;
      this.partidaHistory.endedAt = Date.now();
      this.partidaHistory.finalScores = { ...this.scores };
      this.emit('partidaFinalizada', {
        winningTeam: team,
        scores: { ...this.scores },
        partidaHistory: this.getPartidaHistory(),
      });
      this.emit('game-over', {
        winningTeam: team,
        scores: { ...this.scores },
        partidaHistory: this.getPartidaHistory(),
      });
    }

    return awarded;
  }

  /**
   * Build the list of CantoRecord for the current hand, combining envido
   * state and truco state into a single list of shouts.
   */
  private buildCantosForHand(): CantoRecord[] {
    const cantos: CantoRecord[] = [];

    // Envido cantos
    if (this.envido.pointsAwarded > 0) {
      let envType: CantoRecord['type'] = 'envido';
      if (this.envido.level === 'envido-envido') envType = 'envido-envido';
      else if (this.envido.level === 'real-envido') envType = 'real-envido';
      else if (this.envido.level === 'falta-envido') envType = 'falta-envido';
      cantos.push({
        type: envType,
        callerTeam: this.envido.callerTeam ?? -1,
        accepted: this.envido.accepted,
        points: this.envido.pointsAwarded,
        winnerTeam: this.getEnvidoWinnerTeam(),
      });
    }

    // Truco cantos
    if (this.truco.level > 0) {
      let trucoType: CantoRecord['type'] = 'truco';
      if (this.truco.level === 2) trucoType = 'retruco';
      else if (this.truco.level === 3) trucoType = 'vale4';
      const trucoWinner = this.truco.accepted
        ? (this.truco.lastChallengerTeam ?? -1)
        : (this.truco.lastChallengerTeam ?? -1);
      cantos.push({
        type: trucoType,
        callerTeam: this.truco.lastChallengerTeam ?? -1,
        accepted: this.truco.accepted,
        points: this.truco.pointsAwarded,
        winnerTeam: trucoWinner,
      });
    }

    return cantos;
  }

  /**
   * Determine which team won the envido based on the current envido state.
   * Returns -1 if envido wasn't called or resolved yet.
   */
  private getEnvidoWinnerTeam(): number {
    if (this.envido.pointsAwarded <= 0) return -1;
    // If envidoWinner was explicitly set during resolution, use it
    if (this.envido.envidoWinner !== null) return this.envido.envidoWinner;
    // Fallback: callerTeam got the points (when rejected or 'son buenas')
    if (this.envido.callerTeam !== null) return this.envido.callerTeam;
    return -1;
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
    this.trucoWaitingForResponse = false;
  }

  /**
   * Can only challenge truco BEFORE all cards of the hand have been played.
   * Specifically: before round 3 (baza 3) is complete. During round 0,1,2 it's allowed.
   * Also: the team that already challenged cannot re-challenge (only the opponent team replies).
   * No turn check — any player whose team hasn't already challenged can do so.
   */
  private canChallengeTruco(): boolean {
    if (this.trucoWaitingForResponse) return false;
    if (this.truco.accepted) return false;
    if (this.truco.level >= 3) return false;
    // Can only sing truco while the hand is still being played (rounds 0,1,2)
    // After round 3 starts (currentRound >= 3), all cards have been played
    if (this.currentRound >= 3) return false;
    // US-040: Envido takes priority — cannot call truco while envido is pending
    if (this.envido.phase !== 'none' && !this.envido.accepted) return false;
    return true;
  }

  /** Check if the hand has already been decided based on Truco rules */
  private isHandAlreadyDecided(): boolean {
    /*****************************************************************
     * Truco rule — 7 cases for hand resolution (best of 3 tricks):
     *
     *  1. Gana b1+b2               → gana sin jugar b3 ✅
     *  2. Parda b1, gana b2        → gana quien ganó b2 ✅
     *  3. Gana b1, parda b2        → gana quien ganó b1 ✅
     *  4. Parda b1+b2              → gana el MANO        ✅
     *  5. Parda b1, gana b2, b3    → gana b3             ✅ (normal flow)
     *  6. Parda b1+b2+b3           → gana el MANO        ✅ (normal flow)
     *  7. Gana b1, pierde b2, b3   → gana b1+b3          ✅ (normal flow)
     *
     * After 2 tricks played: only need trick 3 if team 0 won 1 AND team 1 won 1.
     * All other outcomes after 2 tricks are conclusive.
     *****************************************************************/
    const team0Wins = this.roundResults.filter(r => r.teamWinner === 0).length;
    const team1Wins = this.roundResults.filter(r => r.teamWinner === 1).length;
    const roundsPlayed = this.roundResults.length;

    // Case 1: one team has 2 non-tied wins
    if (team0Wins >= 2 || team1Wins >= 2) return true;

    // Case 4: all tied after 2 rounds → MANO wins (no need for round 3)
    if (roundsPlayed >= 2 && team0Wins === 0 && team1Wins === 0) return true;

    // Cases 2 & 3: after 2 rounds, one team has 1 win and the other 0.
    // The leader wins regardless of round 3 outcome (Truco normative rule:
    // ties in round 3 are still a win for the leader, and even if the
    // trailing team wins round 3, the first-trick winner breaks the tie).
    if (roundsPlayed >= 2 && team0Wins !== team1Wins) return true;

    // After 3 rounds (all played), hand is always decided
    return roundsPlayed >= 3;
  }

  private challengeTruco(playerId: string): void {
    if (!this.canChallengeTruco()) return;
    const player = this.getPlayerById(playerId);
    if (!player) return;

    // Only opponents of the last challenger can call truco (or anyone if no prior challenge)
    if (this.truco.lastChallengerTeam !== null && player.team === this.truco.lastChallengerTeam) {
      return;
    }

    const nextLevel = this.truco.level + 1;
    if (nextLevel > 3) return; // Max vale 4

    this.truco.level = nextLevel as 1 | 2 | 3;
    this.truco.lastChallengerTeam = player.team;
    this.truco.accepted = false;
    this.trucoWaitingForResponse = true;

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

    this.trucoWaitingForResponse = false;

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

    // If truco was rejected (not accepted), the hand ends here.
    // Record it in partida history before emitting.
    if (!this.truco.accepted) {
      const envidoCalled = this.envido.phase !== 'none' || this.envido.pointsAwarded > 0;
      const envidoWinner = this.getEnvidoWinnerTeam();
      const envidoPoints = this.envido.pointsAwarded;
      const cantos = this.buildCantosForHand();
      this.partidaHistory.hands.push({
        handNumber: this.currentHand,
        dealerId: this.dealerId,
        starterId: this.starterId,
        roundResults: [...this.roundResults],
        handWinnerTeam: winnerTeam,
        pointsAwarded: points,
        team0Score: this.scores.team0,
        team1Score: this.scores.team1,
        envidoCalled,
        envidoWinner: envidoWinner >= 0 ? envidoWinner : null,
        envidoPoints,
        trucoCalled: true,
        trucoWinner: winnerTeam,
        trucoPoints: points,
        cantos,
        isPicaPica: this.isPicaPica,
        picaPicaSubmano: this.isPicaPica ? this.picaPicaSubmano : undefined,
      });
      this.partidaHistory.totalHands = this.partidaHistory.hands.length;

      // Check game over for truco-rejected scenario
      if (this.scores.team0 >= this.targetScore || this.scores.team1 >= this.targetScore) {
        this.partidaHistory.winningTeam = winnerTeam;
        this.partidaHistory.endedAt = Date.now();
        this.partidaHistory.finalScores = { ...this.scores };
      }
    }

    this.emit('truco-resolved', {
      winnerTeam,
      points,
      level: this.truco.level,
      team0Scored: this.scores.team0,
      team1Scored: this.scores.team1,
      isGameOver: this.scores.team0 >= this.targetScore || this.scores.team1 >= this.targetScore,
      partidaHistory: this.getPartidaHistory(),
    });
  }

  // ---- Card playing ----

  /**
   * Player goes to the mazo (folds/forfeits the hand).
   * The ENTIRE TEAM forfeits (not just the individual).
   *
   * Flow:
   * 1. If envido is pending (called but not resolved), resolve it FIRST
   *    - The envido caller team gets envido points
   * 2. Award truco/hand points to the opponent team
   *    - If truco accepted: opponent gets truco value (2/3/4)
   *    - If truco called but not accepted: opponent gets rejection value (1/2)
   *    - If no truco: opponent gets 1pt (base hand value)
   * 3. Record hand in partida history
   * 4. Emit event, start new hand if not game over
   */
  public irseAlMazo(playerId: string): void {
    const player = this.getPlayerById(playerId);
    if (!player) return;
    const foldingTeam = player.team;
    const opponentTeam = foldingTeam === 0 ? 1 : 0;
    let envidoPointsAwarded = 0;
    let trucoPoints = 0;

    // Step 1: Resolve pending envido FIRST
    if (this.envido.phase === 'opening' && !this.envido.accepted) {
      // The envido caller gets the envido points
      const callerTeam = this.envido.callerTeam!;
      envidoPointsAwarded = this.envido.totalPoints > 0 ? this.envido.totalPoints : 2;
      if (callerTeam === 0) this.scores.team0 += envidoPointsAwarded;
      else this.scores.team1 += envidoPointsAwarded;
      this.envido.pointsAwarded = envidoPointsAwarded;
      this.envido.team0Scored = this.scores.team0;
      this.envido.team1Scored = this.scores.team1;
      this.envido.phase = 'none';
      this.emit('envido-resolved', {
        winnerTeam: callerTeam,
        points: envidoPointsAwarded,
        scores: this.getEnvidoPlayerScores(),
        team0Best: 0,
        team1Best: 0,
        sonBuenas: true,
        team0Scored: this.scores.team0,
        team1Scored: this.scores.team1,
        level: this.envido.level,
        resolvedByIrseAlMazo: true
      });
    }

    // Step 2: Award truco/hand points to opponent
    if (this.truco.accepted) {
      // Truco was accepted — opponent gets the full truco value
      const trucoValues: Record<number, number> = { 1: 2, 2: 3, 3: 4 };
      trucoPoints = trucoValues[this.truco.level] || 2;
    } else if (this.truco.level > 0) {
      // Truco was called but not yet accepted — opponent gets rejection value
      const rejectValues: Record<number, number> = { 1: 1, 2: 2, 3: 3 };
      trucoPoints = rejectValues[this.truco.level] || 1;
    } else {
      // No truco — base hand value
      trucoPoints = 1;
    }

    if (opponentTeam === 0) this.scores.team0 += trucoPoints;
    else this.scores.team1 += trucoPoints;

    this.truco.pointsAwarded = trucoPoints;
    this.truco.team0Scored = this.scores.team0;
    this.truco.team1Scored = this.scores.team1;

    // Record hand in partida history
    const envidoCalled = this.envido.phase !== 'none' || this.envido.pointsAwarded > 0;
    const envidoWinner = this.getEnvidoWinnerTeam();
    const envidoPoints = this.envido.pointsAwarded;
    const trucoCalled = this.truco.level > 0;
    const trucoWinner = opponentTeam;
    const cantos = this.buildCantosForHand();
    this.partidaHistory.hands.push({
      handNumber: this.currentHand,
      dealerId: this.dealerId,
      starterId: this.starterId,
      roundResults: [...this.roundResults],
      handWinnerTeam: opponentTeam,
      pointsAwarded: trucoPoints,
      team0Score: this.scores.team0,
      team1Score: this.scores.team1,
      envidoCalled,
      envidoWinner: envidoWinner >= 0 ? envidoWinner : null,
      envidoPoints,
      trucoCalled,
      trucoWinner,
      trucoPoints,
      cantos,
      isPicaPica: this.isPicaPica,
      picaPicaSubmano: this.isPicaPica ? this.picaPicaSubmano : undefined,
    });
    this.partidaHistory.totalHands = this.partidaHistory.hands.length;

    // Emit irse-al-mazo event
    this.emit('irse-al-mazo', {
      playerId,
      foldingTeam,
      opponentTeam,
      envidoPointsAwarded,
      trucoPoints,
      scores: { ...this.scores },
      isGameOver: this.scores.team0 >= this.targetScore || this.scores.team1 >= this.targetScore,
      partidaHistory: this.getPartidaHistory(),
    });

    // Check game over
    if (this.scores.team0 >= this.targetScore || this.scores.team1 >= this.targetScore) {
      const winningTeam = this.scores.team0 >= this.targetScore ? 0 : 1;
      this.partidaHistory.winningTeam = winningTeam;
      this.partidaHistory.endedAt = Date.now();
      this.partidaHistory.finalScores = { ...this.scores };

      this.emit('game-over', {
        winningTeam,
        scores: { ...this.scores },
        partidaHistory: this.getPartidaHistory(),
      });
      return;
    }

    // Start new hand
    this.isPicaPica = this.checkPicaPica();
    this.picaPicaHandAlternation = !this.picaPicaHandAlternation;
    this.startNewHand();
  }

  playCard(playerId: string, cardIndex: number): { ok: boolean; error?: string } {
    const validation = this.validateAction(playerId, 'playCard', { cardIndex });
    if (!validation.ok) return validation;

    const card = this.hands[playerId].splice(cardIndex, 1)[0];
    if (!card) return { ok: false, error: 'No se pudo jugar la carta indicada' };

    this.currentTrick.push({ card, playerId });
    this.currentTrickNumber = this.currentRound;

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

    return { ok: true };
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

    // Check if the hand is already decided (early termination)
    const handOverEarly = this.isHandAlreadyDecided();

    if (handOverEarly) {
      // Hand is decided — resolve
      this.resolveHand();
    } else {
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

    // Record this hand in partida history
    const envidoCalled = this.envido.phase !== 'none' || this.envido.pointsAwarded > 0;
    const envidoWinner = this.getEnvidoWinnerTeam();
    const envidoPoints = this.envido.pointsAwarded;
    const trucoCalled = this.truco.level > 0;
    const trucoWinner = handWinnerTeam;
    const trucoPoints = pointsAwarded;
    const cantos = this.buildCantosForHand();
    this.partidaHistory.hands.push({
      handNumber: this.currentHand,
      dealerId: this.dealerId,
      starterId: this.starterId,
      roundResults: [...this.roundResults],
      handWinnerTeam,
      pointsAwarded,
      team0Score: this.scores.team0,
      team1Score: this.scores.team1,
      envidoCalled,
      envidoWinner: envidoWinner >= 0 ? envidoWinner : null,
      envidoPoints,
      trucoCalled,
      trucoWinner,
      trucoPoints,
      cantos,
      isPicaPica: this.isPicaPica,
      picaPicaSubmano: this.isPicaPica ? this.picaPicaSubmano : undefined,
    });
    this.partidaHistory.totalHands = this.partidaHistory.hands.length;

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
      picapicaResults: this.picapicaResults,
      partidaHistory: this.getPartidaHistory(),
    });

    // Check game over
    if (this.scores.team0 >= this.targetScore || this.scores.team1 >= this.targetScore) {
      const winningTeam = this.scores.team0 >= this.targetScore ? 0 : 1;
      this.partidaHistory.winningTeam = winningTeam;
      this.partidaHistory.endedAt = Date.now();
      this.partidaHistory.finalScores = { ...this.scores };

      this.emit('game-over', {
        winningTeam,
        scores: { ...this.scores },
        partidaHistory: this.getPartidaHistory(),
      });
      return;
    }

    // Next hand
    this.isPicaPica = this.checkPicaPica();
    if (!this.firstHandCompleted) {
      this.firstHandCompleted = true;
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

  /**
   * Build the formal Baza (trick) model from the current internal state.
   * Each baza corresponds to a resolved round in roundResults.
   * Returns null if the baza index doesn't exist.
   */
  getBaza(bazaIndex: number): Baza | null {
    if (bazaIndex < 0 || bazaIndex >= this.roundResults.length) return null;
    const round = this.roundResults[bazaIndex];
    const starterId = round.highestCardPlayerId || this.starterId;
    const highestCard = round.highestCard || (round.cards.length > 0 ? round.cards[0].card : null);
    return {
      bazaNumber: bazaIndex,
      starterPlayerId: starterId,
      cards: [...round.cards],
      winnerId: round.highestCardPlayerId || '',
      winnerTeam: round.teamWinner,
      winningCard: highestCard || { suit: 'espada', number: 1 as CardNumber, valorEnvido: 0, valorTruco: 0, nombreDisplay: '', estado: 'en_mano' as const },
      highestCardRank: highestCard ? getCardRank(highestCard) : 0,
    };
  }

  /**
   * Get all completed bazas (tricks) as formal Baza objects.
   * Each Baza captures the full sequence of cards played in that trick.
   */
  getBazas(): Baza[] {
    return this.roundResults.map((round, i) => {
      const starterId = round.highestCardPlayerId || this.starterId;
      const highestCard = round.highestCard || (round.cards.length > 0 ? round.cards[0].card : null);
      return {
        bazaNumber: i,
        starterPlayerId: starterId,
        cards: [...round.cards],
        winnerId: round.highestCardPlayerId || '',
        winnerTeam: round.teamWinner,
        winningCard: highestCard || { suit: 'espada', number: 1 as CardNumber, valorEnvido: 0, valorTruco: 0, nombreDisplay: '', estado: 'en_mano' as const },
        highestCardRank: highestCard ? getCardRank(highestCard) : 0,
      };
    });
  }

  /**
   * Build the formal Mano (hand) model from the current game state.
   * A Mano has up to 3 bazas (tricks), each with its own set of played cards.
   * Returns null if no rounds have been resolved yet.
   */
  getMano(): Mano | null {
    if (this.roundResults.length === 0) return null;
    const bazas = this.getBazas();

    // Determine hand winner using same logic as resolveHand()
    const validRounds = this.roundResults.filter(r => r.teamWinner !== -1);
    const team0TricksValid = validRounds.filter(r => r.teamWinner === 0).length;
    const team1TricksValid = validRounds.filter(r => r.teamWinner === 1).length;
    let handWinnerTeam: number = -1;
    if (team0TricksValid > team1TricksValid) {
      handWinnerTeam = 0;
    } else if (team1TricksValid > team0TricksValid) {
      handWinnerTeam = 1;
    } else {
      // Balanced or all tied — first trick winner breaks the tie
      handWinnerTeam = this.firstTrickWinnerTeam !== -1
        ? this.firstTrickWinnerTeam
        : this.getPlayerTeam(this.previousStarterId);
    }

    return {
      handNumber: this.currentHand,
      dealerId: this.dealerId,
      starterId: this.starterId,
      bazas,
      handWinnerTeam,
      pointsAwarded: 0,
      team0Score: this.scores.team0,
      team1Score: this.scores.team1,
      envidoCalled: this.envido.phase !== 'none' || this.envido.pointsAwarded > 0,
      trucoCalled: this.truco.level > 0,
      isPicaPica: this.isPicaPica,
      picaPicaSubmano: this.isPicaPica ? this.picaPicaSubmano : undefined,
      isSecondHand: this.currentHand === 1,
    };
  }

  /**
   * Get the formal PartidaHistory, enriched with Baza and Mano types.
   */
  getPartidaHistory(): PartidaHistory {
    return {
      ...this.partidaHistory,
      hands: [...this.partidaHistory.hands.map(h => ({ ...h, roundResults: [...h.roundResults] }))],
    };
  }

  /**
   * Derive the current GamePhase from the engine's internal state.
   */
  private getPhase(): GamePhase {
    if (this.gameOver) return 'game-over';
    if (this.envido.phase === 'opening') return 'envido-opening';
    if (this.envido.phase === 'response') return 'envido-response';
    if (this.envido.phase === 'resolution') return 'envido-resolving';
    if (this.isPicaPica && this.picaPicaSubmano >= 0 && this.picaPicaSubmano <= 2) {
      if (this.roundResults.length >= 3) return 'picapica-resolving';
      return 'picapica-submano';
    }
    if (this.currentRound >= 3 || this.isHandAlreadyDecided()) return 'round-resolving';
    if (this.currentTrick.length > 0 && this.currentTrick.length < this.getActivePlayerCount()) return 'playing-trick';
    if (this.currentTrick.length >= this.getActivePlayerCount()) return 'trick-resolving';
    return 'playing-trick';
  }

  /**
   * US-039: Centralized action validation with descriptive error messages.
   * Validates that an action is legal in the current game state.
   * Returns { ok: false, error: '...' } if invalid, { ok: true } if valid.
   */
  private validateAction(
    playerId: string,
    action: 'playCard' | 'challengeTruco' | 'respondTruco' | 'openEnvido' | 'respondEnvido' | 'irseAlMazo',
    params?: { cardIndex?: number; level?: string; want?: boolean }
  ): { ok: boolean; error?: string } {
    if (this.gameOver) return { ok: false, error: 'La partida ya terminó' };

    const player = this.getPlayerById(playerId);
    if (!player) return { ok: false, error: 'Jugador no encontrado' };

    switch (action) {
      case 'playCard': {
        if (this.currentTurnPlayerId !== playerId) return { ok: false, error: 'No es tu turno' };
        if (!this.hands[playerId] || this.hands[playerId].length === 0) return { ok: false, error: 'No tienes cartas en la mano' };
        const idx = params?.cardIndex;
        if (idx === undefined || idx < 0 || idx >= (this.hands[playerId]?.length || 0)) return { ok: false, error: 'Índice de carta inválido' };
        return { ok: true };
      }
      case 'challengeTruco': {
        if (this.envido.phase !== 'none' && !this.envido.accepted) return { ok: false, error: 'No puedes cantar truco mientras hay un envido pendiente' };
        if (this.trucoWaitingForResponse) return { ok: false, error: 'Ya hay un truco pendiente de respuesta' };
        if (this.truco.accepted) return { ok: false, error: 'El truco ya fue aceptado' };
        if (this.truco.level >= 3) return { ok: false, error: 'Ya se llegó al máximo nivel de truco (Vale Cuatro)' };
        if (this.truco.lastChallengerTeam !== null && player.team === this.truco.lastChallengerTeam) return { ok: false, error: 'Tu equipo ya cantó truco, espera la respuesta' };
        return { ok: true };
      }
      case 'respondTruco': {
        if (this.truco.level === 0) return { ok: false, error: 'No hay truco que responder' };
        if (this.truco.accepted) return { ok: false, error: 'El truco ya fue respondido' };
        if (player.team === this.truco.lastChallengerTeam) return { ok: false, error: 'Tu equipo cantó truco — el rival debe responder' };
        return { ok: true };
      }
      case 'openEnvido': {
        if (this.currentRound !== 0) return { ok: false, error: 'Solo se puede cantar envido en la primera baza' };
        if (this.envido.phase !== 'none') return { ok: false, error: 'Ya hay un envido en curso' };
        if (this.envido.pointsAwarded > 0) return { ok: false, error: 'El envido ya fue resuelto en esta mano' };
        if (this.isPicaPica && !this.picaPicaActivePairIds.includes(playerId)) return { ok: false, error: 'En Pica-Pica, solo la pareja activa puede cantar envido' };
        return { ok: true };
      }
      case 'respondEnvido': {
        if (this.envido.phase !== 'opening') return { ok: false, error: 'No hay envido que responder' };
        if (this.envido.accepted) return { ok: false, error: 'El envido ya fue resuelto' };
        if (player.team === this.envido.callerTeam) return { ok: false, error: 'Tu equipo cantó envido — espera la respuesta del rival' };
        return { ok: true };
      }
      case 'irseAlMazo': {
        // irse al mazo is always technically possible, but envido must be resolved first
        if (this.envido.phase === 'opening' && !this.envido.accepted) return { ok: false, error: 'Debes resolver el envido pendiente antes de irte al mazo' };
        return { ok: true };
      }
    }
    return { ok: true };
  }

  /**
   * US-039: Get all current validation errors for a player as a string array.
   * Useful for the UI to show all blocked actions at once.
   */
  getBlockedActions(playerId: string): string[] {
    const blocked: string[] = [];
    const actions: Array<'playCard' | 'challengeTruco' | 'respondTruco' | 'openEnvido' | 'respondEnvido' | 'irseAlMazo'> = [
      'playCard', 'challengeTruco', 'respondTruco', 'openEnvido', 'respondEnvido', 'irseAlMazo'
    ];
    for (const action of actions) {
      const result = this.validateAction(playerId, action);
      if (!result.ok) blocked.push(`${action}: ${result.error}`);
    }
    return blocked;
  }

  /**
   * Get the complete serializable game state (US-13 / T-033).
   * Includes all fields needed to fully reconstruct the game.
   */
  getState(): FullGameState {
    return {
      players: [...this.players],
      scores: { ...this.scores },
      targetScore: this.targetScore,
      currentHand: this.currentHand,
      currentRound: this.currentRound,
      currentTrickNumber: this.currentTrickNumber,
      dealerId: this.dealerId,
      starterId: this.starterId,
      currentTurnPlayerId: this.currentTurnPlayerId,
      hands: Object.fromEntries(
        Object.entries(this.hands).map(([k, v]) => [k, [...v]])
      ),
      currentTrick: [...this.currentTrick],
      roundResults: this.roundResults.map(r => ({ ...r, cards: [...r.cards] })),
      envido: { ...this.envido },
      truco: { ...this.truco },
      isPicaPica: this.isPicaPica,
      picaPicaSubmano: this.picaPicaSubmano,
      picapicaResults: this.picapicaResults.map(r => ({ ...r, cards: [...r.cards] })),
      firstHandCompleted: this.firstHandCompleted,
      gameOver: this.gameOver,
      partidaHistory: this.getPartidaHistory(),
      phase: this.getPhase(),
    };
  }
}