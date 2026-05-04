// App.ts — Main application entry point

import { GameEngine } from './core/GameEngine.js';
import { UIManager } from './ui/UIManager.js';
import type { PlayerConfig, GameConfig } from './types.js';

export class App {
  private gameEngine: GameEngine;
  private uiManager: UIManager;
  private gameRunning: boolean = false;
  private players: PlayerConfig[] = [];
  private selectedPlayerCount: number = 4;
  private selectedDifficulty: 'easy' | 'normal' | 'hard' = 'normal';
  private container: HTMLElement;

  constructor() {
    this.container = document.getElementById('game-container')!;
    this.gameEngine = new GameEngine();
    this.uiManager = new UIManager('game-container', {
      onCardPlayed: this.handleCardPlayed.bind(this),
      onNewRound: this.handleNewRound.bind(this),
      onNewGame: this.handleNewGame.bind(this),
      onStartGame: this.handleStartGame.bind(this),
      onEnvidoOpen: this.handleEnvidoOpen.bind(this),
      onEnvidoWant: this.handleEnvidoWant.bind(this),
      onEnvidoNoWant: this.handleEnvidoNoWant.bind(this),
      onEnvidoRaise: this.handleEnvidoRaise.bind(this),
      onTrucoChallenge: this.handleTrucoChallenge.bind(this),
      onTrucoAccept: this.handleTrucoAccept.bind(this),
      onTrucoDecline: this.handleTrucoDecline.bind(this),
      onTrucoRaise: this.handleTrucoRaise.bind(this),
    });

    this.setupEventListeners();
    this.renderInitialMenu();
  }

  private setupEventListeners(): void {
    const handlers = [
      'round-start', 'card-played', 'trick-resolved',
      'hand-resolved', 'round-over', 'game-over',
      'envido-opened', 'envido-raised', 'envido-resolved',
      'truco-challenged', 'truco-accepted', 'truco-resolved',
    ];
    for (const event of handlers) {
      this.gameEngine.on(event, () => this.renderGameState());
    }
    this.gameEngine.on('ai-turn', (data: any) => this.handleAiTurn(data));
  }

  private renderInitialMenu(): void {
    // Clear everything and render menu
    this.container.innerHTML = '';
    this.uiManager.renderGame({
      players: [],
      hands: {},
      currentTrick: [],
      currentTrickNumber: 0,
      currentRound: 0,
      dealerId: '',
      starterId: '',
      currentTurnPlayerId: '',
      deckRemaining: 40,
      scores: { team0: 0, team1: 0 },
      envido: { phase: 'none', callerTeam: null, level: 'envido', accepted: false, pointsAwarded: 0, team0Scored: 0, team1Scored: 0, team0Player0Envido: null, team0Player1Envido: null, team1Player0Envido: null, team1Player1Envido: null, team1Player2Envido: null, team0Player2Envido: null },
      truco: { level: 0, lastChallengerTeam: null, accepted: false, pointsAwarded: 0, team0Scored: 0, team1Scored: 0 },
      roundResults: [],
      isPicaPica: false,
      picaPicaSubmano: 0,
      picapicaResults: [],
      firstHandCompleted: false,
      isSecondHand: false,
      handWinnerTeam: -1,
      isGameOver: false,
      gameOverWinner: null,
      gameOverScores: { team0: 0, team1: 0 },
    });
  }

  // ---- Game Setup ----

  startGame(playerCount: number, difficulty: 'easy' | 'normal' | 'hard'): void {
    this.selectedPlayerCount = playerCount;
    this.selectedDifficulty = difficulty;
    this.gameRunning = true;

    this.players = [];
    for (let i = 0; i < playerCount; i++) {
      const isHuman = (i === 0);
      const team = Math.floor(i / (playerCount / 2));
      this.players.push({
        id: `player-${i}`,
        name: isHuman ? 'Vos' : `Jugador ${i + 1}`,
        isHuman,
        isAI: !isHuman,
        difficulty,
        team,
        position: i,
      });
    }

    const config: GameConfig = { playerCount: playerCount as 2 | 4 | 6, difficulty };
    this.gameEngine.startGame(this.players, config);
    this.renderGameState();
  }

  // ---- Event Handlers ----

  private handleCardPlayed(playerId: string, cardIndex: number): void {
    if (!this.gameRunning) return;
    this.gameEngine.playCard(playerId, cardIndex);
  }

  private handleAiTurn(data: any): void {
    if (!this.gameRunning) return;
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * 3);
      this.gameEngine.playCard(data.playerId, randomIndex);
    }, 800);
  }

  private handleNewRound(): void {
    // This is called from menu to start, or after first hand
    if (this.players.length === 0) {
      this.startGame(this.selectedPlayerCount, this.selectedDifficulty);
    } else {
      // Start second hand
      this.gameEngine['startNewHand']();
      this.renderGameState();
    }
  }

  private handleNewGame(): void {
    this.gameRunning = false;
    this.players = [];
    this.renderInitialMenu();
  }

  private handleStartGame(playerCount: number, difficulty: 'easy' | 'normal' | 'hard'): void {
    this.startGame(playerCount, difficulty);
  }

  // ---- Envido Handlers ----

  private handleEnvidoOpen(): void {
    const piePlayer = this.findPiePlayer(0);
    if (piePlayer) {
      this.gameEngine['openEnvido'](piePlayer);
    }
  }

  private handleEnvidoWant(): void {
    this.gameEngine['respondEnvido'](this.players[0].id, true);
  }

  private handleEnvidoNoWant(): void {
    this.gameEngine['respondEnvido'](this.players[0].id, false);
  }

  private handleEnvidoRaise(level: 'envido' | 'real-envido' | 'falta-envido'): void {
    this.gameEngine['respondEnvido'](this.players[0].id, true, level);
  }

  private findPiePlayer(team: number): string | null {
    const order = [...this.players].sort((a, b) => a.position - b.position);
    const teamPlayers = order.filter(p => p.team === team);
    return teamPlayers.length > 0 ? teamPlayers[teamPlayers.length - 1].id : null;
  }

  // ---- Truco Handlers ----

  private handleTrucoChallenge(): void {
    this.gameEngine['challengeTruco'](this.players[0].id);
  }

  private handleTrucoAccept(): void {
    this.gameEngine['respondTruco'](this.players[0].id, true);
  }

  private handleTrucoDecline(): void {
    this.gameEngine['respondTruco'](this.players[0].id, false);
  }

  private handleTrucoRaise(): void {
    this.gameEngine['respondTruco'](this.players[0].id, true);
  }

  // ---- Render ----

  private renderGameState(): void {
    this.uiManager.renderGame({
      players: this.players,
      hands: this.gameEngine.getHands(),
      currentTrick: this.gameEngine.getCurrentTrick(),
      currentTrickNumber: this.gameEngine.getCurrentTrick().length,
      currentRound: this.gameEngine.getCurrentRound(),
      dealerId: this.gameEngine.getDealerId(),
      starterId: this.gameEngine.getStarterId(),
      currentTurnPlayerId: this.gameEngine.getCurrentTurnPlayerId(),
      deckRemaining: this.gameEngine.getDeckRemaining(),
      scores: this.gameEngine.getScores(),
      envido: this.gameEngine.getEnvidoState(),
      truco: this.gameEngine.getTrucoState(),
      roundResults: this.gameEngine.getRoundResults(),
      isPicaPica: this.gameEngine.getIsPicaPica(),
      picaPicaSubmano: this.gameEngine.getPicaPicaSubmano(),
      picapicaResults: this.gameEngine.getPicapicaResults(),
      firstHandCompleted: this.gameEngine.isFirstHandCompleted(),
      isSecondHand: this.gameEngine.getIsSecondHand(),
      handWinnerTeam: -1,
      isGameOver: false,
      gameOverWinner: null,
      gameOverScores: this.gameEngine.getScores(),
    });
  }
}
