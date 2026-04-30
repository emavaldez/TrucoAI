// Game Engine - manages the complete game state and flow

import { Card, getCardRanking } from './Card.js';
import { Deck } from './Deck.js';
import { Player, PlayerState } from './Player.js';
import * as Rules from './Rules.js';

export type GamePhase =
  | 'menu'
  | 'dealing'
  | 'playing'       // normal card play
  | 'envido-pending'  // envido declared, waiting for response
  | 'truco-pending'   // truco/retruco/vale4 declared, waiting for response
  | 'round-over'      // round ended, about to deal new cards
  | 'game-over';      // someone reached 15 points

export interface GameEvent {
  type: string;
  data?: any;
}

export class GameEngine {
  deck: Deck = new Deck();
  players: Player[] = [];
  currentPlayerIndex: number = 0;

  phase: GamePhase = 'menu';

  // Current round state
  trucoLevel: Rules.TrucoLevel = 0;
  envidoLevel: number = 0; // 0=none, 1=envido, 2=envido-envido, 3=real, 4=falta
  envidosDeclared: number[] = []; // track all envido declarations in round
  enabledToRetrucar: number = 0; // 0=can't, 1=opponent said truco, 2=player said truco
  finishedEnvido: boolean = false;

  // Scores
  scores: Record<string, number> = {};

  // Teams (for 4/6 player modes)
  teams: Record<string, number> = {}; // playerId -> team (0 or 1)

  // Event callbacks
  onEvent?: (event: GameEvent) => void;

  constructor() { }

  /** Initialize game with players */
  init(players: Player[]): void {
    this.players = players;
    this.scores = {};
    for (const p of players) {
      this.scores[p.id] = 0;
    }

    // Assign teams for multiplayer modes
    if (players.length === 4) {
      this.teams = { [players[0].id]: 0, [players[1].id]: 1, [players[2].id]: 0, [players[3].id]: 1 };
    } else if (players.length === 6) {
      this.teams = { [players[0].id]: 0, [players[1].id]: 1, [players[2].id]: 0, [players[3].id]: 1, [players[4].id]: 0, [players[5].id]: 1 };
    } else {
      // 2 players - each is their own team
      this.teams = { [players[0].id]: 0, [players[1].id]: 1 };
    }

    this.phase = 'dealing';
    this.startNewRound();
  }

  /** Start a new round */
  startNewRound(): void {
    this.deck.buildDeck();
    this.deck.shuffle();

    // Reset each player's round state
    for (const p of this.players) {
      p.resetRound();
    }

    // Reset round-specific state
    this.trucoLevel = 0;
    this.envidoLevel = 0;
    this.envidosDeclared = [];
    this.enabledToRetrucar = 0;
    this.finishedEnvido = false;

    // Deal cards: alternate 2 at a time, then 1
    const dealOrder = this.determineDealOrder();

    // Deal 2 cards to each player, then 1 more
    for (let round = 0; round < 2; round++) {
      for (const pid of dealOrder) {
        const cards = this.deck.deal(1);
        if (cards.length > 0) {
          const player = this.players.find(p => p.id === pid);
          if (player) player.cards.push(cards[0]);
        }
      }
    }
    // Third card
    for (const pid of dealOrder) {
      const cards = this.deck.deal(1);
      if (cards.length > 0) {
        const player = this.players.find(p => p.id === pid);
        if (player) player.cards.push(cards[0]);
      }
    }

    // Determine who is "mano" (first to play) - random
    const manoIndex = Math.floor(Math.random() * this.players.length);
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].isHand = (i === manoIndex);
    }

    this.currentPlayerIndex = manoIndex;
    this.phase = 'playing';

    this.emitEvent({ type: 'round-start', data: { mano: this.players[manoIndex].id } });
  }

  /** Determine the order in which players play their first card */
  private determineDealOrder(): string[] {
    // For simplicity, deal in player array order
    return this.players.map(p => p.id);
  }

  /** Get the current player's turn */
  getCurrentPlayer(): Player | null {
    return this.players[this.currentPlayerIndex] || null;
  }

  /** Get the next player index */
  getNextPlayerIndex(): number {
    return (this.currentPlayerIndex + 1) % this.players.length;
  }

  /** Play a card from the current player's hand */
  playCard(playerId: string, cardIndex: number): { success: boolean; card?: Card } {
    if (this.phase !== 'playing' && this.phase !== 'envido-pending') {
      return { success: false };
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player || !player.hasCards()) return { success: false };

    const card = player.playCard(cardIndex);
    if (!card) return { success: false };

    this.emitEvent({ type: 'card-played', data: { playerId, card, index: cardIndex } });

    // Check if round is complete (all players played same number of cards)
    const allPlayedSame = this.players.every(p => p.playedCards.length === player.playedCards.length);

    if (allPlayedSame && player.playedCards.length >= 1) {
      // Check if all hands are played (3 each) or if someone folded
      const maxPlayed = Math.max(...this.players.map(p => p.playedCards.length));

      if (maxPlayed >= 3 || this.players.every(p => !p.hasCards())) {
        // Round is over - determine winner
        this.endRound();
      } else {
        // Move to next player
        this.currentPlayerIndex = this.getNextPlayerIndex();
      }
    } else {
      // Move to next player who still has cards
      this.currentPlayerIndex = this.getNextPlayerIndex();
    }

    return { success: true, card };
  }

  /** Declare envido */
  declareEnvido(playerId: string): { success: boolean; message?: string } {
    if (this.finishedEnvido) return { success: false, message: 'Envido ya finalizado' };

    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, message: 'Jugador no encontrado' };

    const envidoScore = player.calculateEnvido();
    this.envidosDeclared.push(1); // Envido level 1

    this.emitEvent({ type: 'envido-declared', data: { playerId, level: 1, score: envidoScore } });

    // Find next player who hasn't responded
    this.phase = 'envido-pending';

    return { success: true };
  }

  /** Respond to envido declaration */
  respondEnvido(playerId: string, accept: boolean): void {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;

    const myEnvido = player.calculateEnvido();
    const declarerId = this.envidosDeclared[this.envidosDeclared.length - 2] ?
      this.players.find(p => p.id === playerId)?.id : null;

    // For simplicity: compare envido scores
    let winnerId: string | null = null;

    // Find the player who declared envido
    const declarerIndex = this.envidosDeclared.length > 1 ?
      this.players.findIndex(p => p.id === playerId) : -1;

    // Simple approach: compare all players' envido scores
    let bestScore = 0;
    let bestPlayerId = '';

    for (const p of this.players) {
      const score = p.calculateEnvido();
      if (score > bestScore) {
        bestScore = score;
        bestPlayerId = p.id;
      }
    }

    if (accept) {
      // Compare envidos
      const myScore = player.calculateEnvido();

      // Find who declared (the one before current in the array)
      const declarer = this.players.find(p => p.id !== playerId);
      if (declarer) {
        const declarerScore = declarer.calculateEnvido();

        if (myScore > declarerScore) {
          winnerId = playerId;
        } else if (declarerScore > myScore) {
          winnerId = declarer.id;
        } else {
          // Tie - mano wins
          winnerId = this.players.find(p => p.isHand)?.id || playerId;
        }
      }

      if (winnerId) {
        const points = Rules.getEnvidoPoints(this.envidosDeclared[this.envidosDeclared.length - 1], this.scores[winnerId] || 0);
        this.scores[winnerId] = (this.scores[winnerId] || 0) + points;
        this.emitEvent({ type: 'envido-result', data: { winnerId, points, myScore, declarerScore } });
      }
    } else {
      // Reject - opponent gets points
      const declarer = this.players.find(p => p.id !== playerId);
      if (declarer) {
        const points = Rules.getEnvidoLosePoints(this.envidosDeclared);
        this.scores[declarer.id] = (this.scores[declarer.id] || 0) + points;
        this.emitEvent({ type: 'envido-result', data: { winnerId: declarer.id, points } });
      }
    }

    this.finishedEnvido = true;
    this.phase = 'playing';
  }

  /** Declare truco/retruco/vale4 */
  declareTruco(playerId: string): { success: boolean; message?: string } {
    if (this.finishedEnvido && this.envidosDeclared.length === 0) {
      // Envido hasn't been played yet - can still declare truco
    }

    const player = this.players.find(p => p.id === playerId);
    if (!player) return { success: false, message: 'Jugador no encontrado' };

    // Check if last card played was a 4 (can't say truco)
    const allPlayers = this.players;
    for (const p of allPlayers) {
      if (p.playedCards.length > 0) {
        const lastCard = p.playedCards[p.playedCards.length - 1];
        if (lastCard.number === 4) {
          return { success: false, message: 'No se puede cantar truco después de un 4' };
        }
      }
    }

    if (this.trucoLevel >= 3) return { success: false, message: 'Ya llegó a Vale 4' };

    this.trucoLevel++;
    this.enabledToRetrucar = 2; // opponent can now respond

    const levelNames: Record<number, string> = { 1: 'Truco', 2: 'Retruco', 3: 'Vale 4' };

    this.emitEvent({ type: 'truco-declared', data: { playerId, level: this.trucoLevel, name: levelNames[this.trucoLevel] } });

    this.phase = 'truco-pending';
    return { success: true };
  }

  /** Respond to truco declaration */
  respondTruco(playerId: string, accept: boolean): void {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;

    if (accept) {
      // Check if can retruco/vale4
      this.emitEvent({ type: 'truco-accepted', data: { level: this.trucoLevel } });
      this.phase = 'playing';
    } else {
      // Reject - opponent gets truco points
      const declarerId = this.players.find(p => p.id !== playerId)?.id;
      if (declarerId) {
        const points = Rules.getTrucoLosePoints(this.trucoLevel);
        this.scores[declarerId] = (this.scores[declarerId] || 0) + points;
        this.emitEvent({ type: 'truco-rejected', data: { winnerId: declarerId, points } });
      }

      // Round ends immediately
      this.phase = 'round-over';
    }
  }

  /** Player folds (ir al mazo) */
  fold(playerId: string): void {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return;

    // Opponent team gets points for current round
    const playerTeam = this.teams[playerId];
    let opponentPoints = 0;

    // Points for not finishing the round
    if (!this.finishedEnvido && this.players.every(p => p.playedCards.length === 0)) {
      opponentPoints += 1; // Lost envido by default
    }

    opponentPoints += Rules.getTrucoWinPoints(this.trucoLevel);

    // Add to opposing team
    for (const p of this.players) {
      if (this.teams[p.id] !== playerTeam && p.id !== playerId) {
        this.scores[p.id] = (this.scores[p.id] || 0) + opponentPoints;
      }
    }

    this.emitEvent({ type: 'folded', data: { playerId, pointsLost: opponentPoints } });
    this.phase = 'round-over';
  }

  /** End the current round and determine winner */
  private endRound(): void {
    // Determine who won the round
    const handPlayers = this.players.filter(p => p.isHand);
    const piePlayers = this.players.filter(p => !p.isHand);

    let roundWinnerTeam: number | null = null;
    let totalPoints = 0;

    if (this.players.length === 2) {
      // Simple 1v1
      const playerCards = this.players[0].playedCards;
      const opponentCards = this.players[1].playedCards;

      if (playerCards.length > 0 && opponentCards.length > 0) {
        const winner = Rules.determineRoundWinner(
          playerCards, opponentCards, this.players[0].isHand
        );

        if (winner === 'player') {
          roundWinnerTeam = this.teams[this.players[0].id];
          totalPoints = Rules.getTrucoWinPoints(this.trucoLevel);
        } else {
          roundWinnerTeam = this.teams[this.players[1].id];
          totalPoints = Rules.getTrucoWinPoints(this.trucoLevel);
        }

        this.scores[this.players.find(p => this.teams[p.id] === roundWinnerTeam!)!.id] += totalPoints;
      }
    } else {
      // Team play (4 or 6 players)
      let team0Wins = 0, team1Wins = 0;

      for (let i = 0; i < Math.min(
        ...this.players.map(p => p.playedCards.length), 3
      ); i++) {
        // Compare each position
        const handCards = this.players.filter(p => p.isHand).map(p => p.playedCards[i]);
        const pieCards = this.players.filter(p => !p.isHand).map(p => p.playedCards[i]);

        for (const hc of handCards) {
          for (const pc of pieCards) {
            const result = Rules.compareHands(hc, pc, handCards[0] ? this.players.find(p => p.playedCards[i] === hc)?.isHand || false : true);
            if (result === 'player') team0Wins++;
            else if (result === 'opponent') team1Wins++;
          }
        }
      }

      if (team0Wins > team1Wins) {
        roundWinnerTeam = 0;
      } else if (team1Wins > team0Wins) {
        roundWinnerTeam = 1;
      } else {
        // Tie - mano team wins
        roundWinnerTeam = this.players.find(p => p.isHand) ? 0 : 1;
      }

      totalPoints = Rules.getTrucoWinPoints(this.trucoLevel);
      const teamLeader = this.players.find(p => this.teams[p.id] === roundWinnerTeam);
      if (teamLeader) {
        this.scores[teamLeader.id] += totalPoints;
      }
    }

    this.emitEvent({ type: 'round-over', data: { winnerTeam: roundWinnerTeam, points: totalPoints } });

    // Check for game over
    for (const p of this.players) {
      if ((this.scores[p.id] || 0) >= Rules.GAME_WIN_POINTS) {
        this.phase = 'game-over';
        const teamId = this.teams[p.id];
        const teamMembers = this.players.filter(pl => this.teams[pl.id] === teamId);
        const names = teamMembers.map(m => m.name).join(' & ');
        this.emitEvent({ type: 'game-over', data: { winner: names, teamId } });
        return;
      }
    }

    // Start new round
    this.phase = 'dealing';
    setTimeout(() => {
      if (this.phase !== 'game-over') {
        this.startNewRound();
      }
    }, 1500);
  }

  /** Get team total score */
  getTeamScore(teamId: number): number {
    let total = 0;
    for (const p of this.players) {
      if (this.teams[p.id] === teamId) {
        total += this.scores[p.id] || 0;
      }
    }
    return total;
  }

  /** Get all team scores */
  getAllScores(): Record<string, number> {
    return { ...this.scores };
  }

  /** Emit game event */
  private emitEvent(event: GameEvent): void {
    if (this.onEvent) this.onEvent(event);
  }

  /** Get game state snapshot for serialization */
  getState(): any {
    return {
      phase: this.phase,
      trucoLevel: this.trucoLevel,
      envidoLevel: this.envidosDeclared.length > 0 ? Math.max(...this.envidosDeclared) : 0,
      scores: this.scores,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        points: this.scores[p.id] || 0,
        isHand: p.isHand,
        cardsCount: p.cards.length,
        playedCardsCount: p.playedCards.length,
      })),
    };
  }
}
