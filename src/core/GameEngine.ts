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

  // Envido state
  private envido: EnvidoState = {
    phase: 'none',
    callerTeam: null,
    level: 'envido',
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
  private getPlayingOrder(): string[] {
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
      // First round of hand: starter is right of dealer
      const order = this.getPlayingOrder();
      const dealerIdx = order.indexOf(this.dealerId);
      const starterIdx = (dealerIdx + 1) % order.length;
      return order[starterIdx];
    }

    // Subsequent round: starter is the player who played the highest card
    // in the previous round (not the trick winner)
    const prevRoundResult = this.roundResults[roundNumber - 1];
    if (prevRoundResult && prevRoundResult.highestCardPlayerId) {
      return prevRoundResult.highestCardPlayerId;
    }

    // Tie in previous round: same starter as this hand
    return this.previousStarterId;
  }

  // ---- Hand management ----

  private startNewHand(): void {
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

    // Set starter before startRound so it can use it
    if (this.firstHandCompleted) {
      // 2da mano: starter = player who played highest card in last round of 1ra mano
      if (lastRoundHighestCardPlayerId) {
        this.starterId = lastRoundHighestCardPlayerId;
      } else {
        this.starterId = this.determineStarterForFirstRound();
      }
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
    // Reset hand state
    this.deck = new Deck();
    this.currentHand = this.firstHandCompleted ? 1 : 0;
    this.roundResults = [];
    this.picapicaResults = [];
    this.picaPicaSubmano = 0;

    // Deal 3 cards to each player
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

    // Determine starter (mano = right of dealer)
    const order = this.getPlayingOrder();
    const dealerIdx = order.indexOf(this.dealerId);
    const starterIdx = (dealerIdx + 1) % order.length;
    this.starterId = order[starterIdx];
    this.previousStarterId = this.starterId;

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
      picaPicaSubmano: 0
    });
  }

  // ---- Envido ----

  private resetEnvido(): void {
    this.envido = {
      phase: 'none',
      callerTeam: null,
      level: 'envido',
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
      case 10: return 10;
      case 11: return 11;
      case 12: return 12;
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
   * Get the "pie" player for a team.
   * The pie is the last player of the team in the round order (counter-clockwise).
   */
  private getPiePlayer(team: number): string | null {
    const order = this.getPlayingOrder();
    // Find all players of this team in order
    const teamPlayers = order.filter(id => {
      const p = this.getPlayerById(id);
      return p && p.team === team;
    });
    // Pie is the last one in counter-clockwise order
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

  private canOpenEnvido(): boolean {
    if (this.currentTrick.length > 0) return false;
    if (this.truco.level > 0) return false;
    return true;
  }

  private canRespondEnvido(): boolean {
    if (this.envido.phase !== 'opening') return false;
    if (this.envido.accepted) return false;
    return true;
  }

  private canRaiseEnvido(): boolean {
    if (this.envido.phase !== 'response') return false;
    return true;
  }

  private openEnvido(playerId: string): void {
    if (!this.canOpenEnvido()) return;
    const player = this.getPlayerById(playerId);
    if (!player) return;

    this.envido.phase = 'opening';
    this.envido.callerTeam = player.team;
    this.envido.level = 'envido';
    this.emit('envido-opened', {
      team: player.team,
      playerId,
      scores: this.getEnvidoPlayerScores()
    });
  }

  private respondEnvido(playerId: string, want: boolean, raiseTo?: 'envido' | 'real-envido' | 'falta-envido'): void {
    if (!this.canRespondEnvido()) return;
    const player = this.getPlayerById(playerId);
    if (!player) return;

    if (player.team === this.envido.callerTeam) {
      // Teammate - can raise
      if (raiseTo) {
        this.envido.level = raiseTo;
        this.envido.phase = 'response';
        this.emit('envido-raised', {
          team: player.team,
          level: raiseTo,
          playerId
        });
      }
      return;
    }

    // Opponent team
    if (!want) {
      // Don't want - caller gets points
      this.resolveEnvido();
      return;
    }

    // Want - opponent can raise
    if (raiseTo) {
      this.envido.level = raiseTo;
      this.envido.phase = 'response';
      this.emit('envido-raised', {
        team: player.team,
        level: raiseTo,
        playerId
      });
    } else {
      // Accept
      this.envido.accepted = true;
      this.resolveEnvido();
    }
  }

  private resolveEnvido(): void {
    this.envido.phase = 'resolution';

    // Calculate envido scores for all players
    const scores = this.getEnvidoPlayerScores();

    // Team scores = sum of their two players' envido scores
    let team0Score = 0;
    let team1Score = 0;
    for (const player of this.players) {
      const s = scores[player.id] || 0;
      if (player.team === 0) team0Score += s;
      else team1Score += s;
    }

    let points = 0;
    switch (this.envido.level) {
      case 'envido': points = 1; break;
      case 'real-envido': points = 2; break;
      case 'falta-envido':
        // Falta Envido = points needed by the other team to reach target
        const otherTeam = this.envido.callerTeam === 0 ? 1 : 0;
        points = this.targetScore - this.scores[otherTeam === 0 ? 'team0' : 'team1'];
        // Cap at 7 for Pica-Pica
        if (this.isPicaPica) points = Math.min(points, 7);
        break;
    }

    const winnerTeam = team0Score >= team1Score ? this.envido.callerTeam : (this.envido.callerTeam === 0 ? 1 : 0);

    // If opponent didn't want, caller gets points automatically
    if (!this.envido.accepted) {
      // Caller's team gets the points
      if (this.envido.callerTeam === 0) this.scores.team0 += points;
      else this.scores.team1 += points;
    } else {
      // Compare scores
      if (team0Score > team1Score) {
        this.scores.team0 += points;
      } else if (team1Score > team0Score) {
        this.scores.team1 += points;
      }
      // Tie in envido = no points
    }

    this.envido.pointsAwarded = points;
    this.envido.team0Scored = this.scores.team0;
    this.envido.team1Scored = this.scores.team1;

    this.emit('envido-resolved', {
      winnerTeam,
      points,
      scores,
      team0Score,
      team1Score,
      team0Scored: this.scores.team0,
      team1Scored: this.scores.team1,
      level: this.envido.level
    });
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

  private respondTruco(playerId: string, want: boolean): void {
    if (this.truco.level === 0) return;
    if (this.truco.accepted) return;

    const player = this.getPlayerById(playerId);
    if (!player) return;

    if (player.team === this.truco.lastChallengerTeam) {
      // Teammate - can raise
      const nextLevel = this.truco.level + 1;
      if (nextLevel <= 3) {
        this.truco.level = nextLevel as 1 | 2 | 3;
        this.truco.lastChallengerTeam = player.team;
        this.emit('truco-raised', {
          level: this.truco.level,
          team: player.team,
          playerId
        });
      }
      return;
    }

    // Opponent team
    if (!want) {
      // Don't want - challenger team gets current level points
      this.resolveTruco();
      return;
    }

    // Want - challenger can raise
    this.truco.accepted = true;
    this.emit('truco-accepted', {
      level: this.truco.level,
      team: this.truco.lastChallengerTeam
    });
  }

  private resolveTruco(): void {
    const pointsMap: { [level: number]: number } = { 1: 1, 2: 2, 3: 3 };
    const points = pointsMap[this.truco.level] || 1;

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
    if (this.currentTrick.length < this.players.length) {
      this.nextTurn();
    } else {
      // Trick complete - resolve
      this.resolveTrick();
    }

    return true;
  }

  private nextTurn(): void {
    const order = this.getPlayingOrder();
    const currentIdx = order.indexOf(this.currentTurnPlayerId);
    // Counter-clockwise: go backwards in position order (position 0 → n-1 → n-2 → ...)
    const nextIdx = (currentIdx - 1 + order.length) % order.length;
    this.currentTurnPlayerId = order[nextIdx];

    // Check if it's AI's turn
    const nextPlayer = this.getPlayerById(this.currentTurnPlayerId);
    if (nextPlayer && nextPlayer.isAI) {
      this.emit('ai-turn', {
        playerId: this.currentTurnPlayerId,
        trickNumber: this.currentTrickNumber + 1,
        roundNumber: this.currentRound,
        handNumber: this.currentHand
      });
    }
  }

  // ---- Trick resolution ----

  private resolveTrick(): void {
    if (this.currentTrick.length < 2) return;

    // Find highest card
    let highestCard = this.currentTrick[0].card;
    let highestCardPlayerId = this.currentTrick[0].playerId;

    for (let i = 1; i < this.currentTrick.length; i++) {
      const rank = getCardRank(this.currentTrick[i].card);
      const highestRank = getCardRank(highestCard);
      if (rank > highestRank) {
        highestCard = this.currentTrick[i].card;
        highestCardPlayerId = this.currentTrick[i].playerId;
      }
    }

    this.trickWinnerId = highestCardPlayerId;
    this.trickWinnerTeam = this.getPlayerTeam(highestCardPlayerId);

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
    this.roundResults.push({
      roundNumber: this.currentTrickNumber,
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
    // Count tricks per team
    let team0Tricks = 0;
    let team1Tricks = 0;
    for (const result of this.roundResults) {
      if (result.teamWinner === 0) team0Tricks++;
      else if (result.teamWinner === 1) team1Tricks++;
    }

    let handWinnerTeam: number = -1;

    if (this.isPicaPica) {
      // Pica-Pica: this was a submano, not a full hand
      this.picapicaResults.push({
        submanoNumber: this.picaPicaSubmano,
        teamWinner: this.trickWinnerTeam,
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
      // Normal hand
      if (team0Tricks > team1Tricks) {
        handWinnerTeam = 0;
      } else if (team1Tricks > team0Tricks) {
        handWinnerTeam = 1;
      } else {
        // All tied (1-1-1 or 0-0-0)
        if (this.currentHand === 0) {
          // First hand tied: second hand winner takes it
          handWinnerTeam = -1; // Will be determined by second hand
        } else {
          // Second hand also tied
          if (this.roundResults.length === 3) {
            // Check third round highest card
            const thirdRound = this.roundResults[2];
            if (thirdRound.highestCardPlayerId) {
              handWinnerTeam = this.getPlayerTeam(thirdRound.highestCardPlayerId);
            } else {
              handWinnerTeam = -1; // Still tied, mano wins
            }
          } else {
            handWinnerTeam = -1;
          }
        }
      }
    }

    // Award points
    let pointsAwarded = 0;
    if (handWinnerTeam !== -1) {
      if (this.isPicaPica) {
        pointsAwarded = 1;
      } else if (this.currentHand === 0) {
        // First hand
        if (this.envido.accepted || this.envido.pointsAwarded > 0) {
          // Envido points already awarded
        }
        if (this.truco.level > 0 && this.truco.accepted) {
          // Truco points already awarded
        }
        if (this.truco.level === 0 && !this.envido.accepted) {
          // No truco, no envido
          pointsAwarded = 1;
        }
      } else {
        // Second hand
        if (this.truco.level === 0 && !this.envido.accepted) {
          pointsAwarded = 1;
        }
      }
    }

    if (handWinnerTeam === 0) this.scores.team0 += pointsAwarded;
    else if (handWinnerTeam === 1) this.scores.team1 += pointsAwarded;

    this.emit('hand-resolved', {
      handNumber: this.currentHand,
      isSecondHand: this.currentHand === 1,
      handWinnerTeam,
      team0Tricks,
      team1Tricks,
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
    // Reset for next submano
    this.currentTrick = [];
    this.currentTrickNumber = 0;
    this.hands = {};
    this.roundResults = [];

    // Deal 3 cards
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

    // Starter for submano: same as the round starter
    this.starterId = this.previousStarterId;
    this.currentTurnPlayerId = this.starterId;

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
      picaPicaSubmano: this.picaPicaSubmano
    });
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
