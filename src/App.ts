// Main entry point for TrucoAI game (2D version)

import { GameEngine } from './core/GameEngine.js';
import { Player } from './core/Player.js';
import { UIManager } from './ui/UIManager.js';
import { AIPlayer } from './ai/AIPlayer.js';
import { DecisionEngine } from './ai/DecisionEngine.js';
import type { Card } from './core/Card.js';
import type { PlayerInfo } from './core/Player.js';

export type GamePhase = 'waiting' | 'dealing' | 'play' | 'end';
export type PlayerInfoExtended = {
  id: string;
  name: string;
  points?: number;
  isHuman: boolean;
  isAI: boolean;
  difficulty?: 'easy' | 'normal' | 'hard';
};

export class App {
  private gameEngine = new GameEngine();
  private uiManager = new UIManager();
  private decisionEngine: DecisionEngine | null = null;
  private difficulty: 'easy' | 'normal' | 'hard' = 'normal';

  // Player management
  private playerIds: string[] = [];
  private playerNames: Record<string, string> = {};
  private playerTeams: Record<string, number> = {};
  private myPlayerId = 'player-0';

  // Game state
  private _isGameRunning = false;
  private _mode: 'solo' | 'multiplayer' = 'solo';
  private _playerCount: 2 | 4 = 2;

  private container: HTMLElement;

  constructor(containerId = 'game-container') {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found`);
    this.container = container;
  }

  init(): void {
    this.uiManager.showMenu();
    this.setupMenuHandlers();
  }

  private _menuHandlerCallCount = 0;

  private setupMenuHandlers(): void {
    // Prevent duplicate event listeners
    const startBtn = document.getElementById('start-btn');
    if (startBtn && startBtn.dataset.listenerAdded) return;
    
    setTimeout(() => {
      const btn = document.getElementById('start-btn');
      if (btn && !btn.dataset.listenerAdded) {
        btn.addEventListener('click', () => {
          this._menuHandlerCallCount++;
          console.log('[App] Menu handler call #' + this._menuHandlerCallCount);
          const modeBtn = document.querySelector('.btn-mode.selected');
          const countBtn = document.querySelector('.btn-count.selected');
          const diffBtn = document.querySelector('.btn-diff.selected');
          console.log('[App] Selected buttons: modeBtn=', modeBtn?.textContent, 'countBtn=', countBtn?.textContent, 'diffBtn=', diffBtn?.textContent);

          const mode = modeBtn?.getAttribute('data-mode') as 'solo' | 'multiplayer' || 'solo';
          const count = parseInt(countBtn?.getAttribute('data-players') || '2');
          const diff = diffBtn?.getAttribute('data-diff') as 'easy' | 'normal' | 'hard' || 'normal';

          console.log('[App] Menu handler: mode=', mode, 'count=', count, 'diff=', diff);
          this.startGame({ mode: mode as 'solo' | 'multiplayer', playerCount: count as 2 | 4, difficulty: diff });
          btn.dataset.listenerAdded = 'true';
        });
      }
    }, 100);
  }

  private _isStarting = false;

  startGame(options: {
    mode?: 'solo' | 'multiplayer';
    playerCount?: 2 | 4;
    difficulty?: 'easy' | 'normal' | 'hard';
  } = {}): void {
    // Prevent duplicate game starts
    if (this._isStarting) {
      console.log('[App] startGame already in progress, ignoring duplicate call');
      return;
    }
    this._isStarting = true;
    console.log('[App] startGame called with options:', JSON.stringify(options));
    this._mode = options.mode || 'solo';
    this._playerCount = options.playerCount || 2;
    console.log('[App] _mode:', this._mode, '_playerCount:', this._playerCount);
    this.difficulty = options.difficulty || 'normal';

    // Show game UI
    this.uiManager.showHUD(this.playerIds, this.playerNames, this._playerCount);
    this.uiManager.setOnCardPlay((cardIndex: number) => this.handlePlayerCardClick(cardIndex));
    this.uiManager.setOnEnvido(() => this.handleEnvidoButton());
    this.uiManager.setOnTruco(() => this.handleTrucoButton());
    this.uiManager.setOnAcceptTruco(() => this.handleAcceptTruco());
    this.uiManager.setOnRejectTruco(() => this.handleRejectTruco());

    if (this._mode === 'multiplayer') {
      console.log('Multiplayer mode selected');
    } else {
      this.startSoloGame();
    }
  }

  private startSoloGame(): void {
    const playerCount = this._playerCount;

    // Create players
    const players: PlayerInfo[] = [];

    if (playerCount === 2) {
      // 2-player: human vs AI
      players.push({ id: 'player-0', name: 'Vos', isHuman: true, isAI: false });
      players.push({ id: 'player-1', name: 'La Roca', isHuman: false, isAI: true, difficulty: this.difficulty });
    } else {
      // 4-player: 2v2
      players.push({ id: 'player-0', name: 'Vos', isHuman: true, isAI: false });
      players.push({ id: 'player-1', name: 'Compañero', isHuman: false, isAI: true, difficulty: 'easy' });
      players.push({ id: 'player-2', name: 'Contrario 1', isHuman: false, isAI: true, difficulty: this.difficulty });
      players.push({ id: 'player-3', name: 'Contrario 2', isHuman: false, isAI: true, difficulty: this.difficulty });
    }

    // Store player info
    this.playerIds = players.map(p => p.id);
    this.playerNames = Object.fromEntries(players.map(p => [p.id, p.name]));
    this.myPlayerId = 'player-0';

    // Initialize game engine
    this.gameEngine.init(players, playerCount);
    this.gameEngine.setHumanPlayers([this.myPlayerId]);

    // Setup decision engine for AI
    this.decisionEngine = new DecisionEngine(this.difficulty);

    // Set up event handlers
    this.setupGameEventHandlers();

    // Start first round
    setTimeout(() => {
      this.gameEngine.startRound();
    }, 500);
  }

  private setupGameEventHandlers(): void {
    this.gameEngine.onEvent = (event) => {
      console.log('Event:', event.type, event.data);

      switch (event.type) {
        case 'round-start':
          this.handleRoundStart(event.data);
          break;
        case 'card-played':
          this.handleCardPlayed(event.data);
          break;
        case 'trick-winner':
          this.handleTrickWinner(event.data);
          break;
        case 'round-winner':
          this.handleRoundWinner(event.data);
          break;
        case 'game-over':
          this.handleGameOver(event.data);
          break;
        case 'truco-challenge':
        case 'retruco-challenge':
        case 'vale4-challenge':
          this.handleTrucoChallenge(event);
          break;
        case 'truco-accepted':
          this.handleTrucoAccepted(event.data);
          break;
        case 'truco-rejected':
          this.handleTrucoRejected(event.data);
          break;
        case 'envido-challenge':
          this.handleEnvidoChallenge(event);
          break;
        case 'envido-result':
          this.handleEnvidoResult(event.data);
          break;
      }
    };
  }

  private handleRoundStart(data: any): void {
    this._isStarting = false;
    this._isGameRunning = true;
    this.uiManager.showTrucoResponse(false);

    // Render the full game state
    this.renderGameState();
  }

  private handleCardPlayed(data: any): void {
    // After a card is played, re-render
    this.renderGameState();
  }

  private handleTrickWinner(data: any): void {
    const winnerName = data.winner ? (this.playerNames[data.winner] || data.winner) : 'Nadie';
    this.uiManager.showMessage(`${winnerName} ganó la jugada!`, 1500);
    this.renderGameState();
  }

  private handleRoundWinner(data: any): void {
    this._isGameRunning = false;
    const team = data.winningTeam ?? data.winner;
    this.uiManager.showMessage(`¡Equipo ${team} gana la mano!`, 2000);
    this.renderGameState();
  }

  private handleGameOver(data: any): void {
    this._isGameRunning = false;
    this.uiManager.showGameOver(data.winningTeam);
    this.renderGameState();
  }

  private handleTrucoChallenge(event: any): void {
    // Show truco response buttons
    this.uiManager.showTrucoResponse(true);
  }

  private handleTrucoAccepted(data: any): void {
    const levelNames = ['', '¡TRUCO!', '¡RETRUCO!', '¡VALE CUATRO!'];
    this.uiManager.showMessage(levelNames[data.level] || '¡Truco!', 2000);
    this.uiManager.showTrucoResponse(false);
    this.renderGameState();
  }

  private handleTrucoRejected(data: any): void {
    const winner = data.winner === 'player' ? 'Vos' : 'La Roca';
    this.uiManager.showMessage(`${winner} ganó el truco! (+${data.points})`, 2000);
    this.uiManager.showTrucoResponse(false);
    this._isGameRunning = false;
    this.renderGameState();
  }

  private handleEnvidoChallenge(event: any): void {
    this.uiManager.showMessage('Calculando envido...', 1500);
    setTimeout(() => {
      this.gameEngine.resolveEnvido();
    }, 1000);
  }

  private handleEnvidoResult(data: any): void {
    const winner = data.winningTeam === 0 ? 'Vos' : 'Equipo 1';
    this.uiManager.showMessage(`¡${winner} ganó el envido! (${data.playerScore} vs ${data.aiScore})`, 2000);
    this.renderGameState();
  }

  /**
   * Render the full game state to the UI
   */
  private renderGameState(): void {
    const round = this.gameEngine.roundState;
    if (!round) return;

    const scores = this.gameEngine.scores;
    const visibleCards = this.gameEngine.getVisibleCards(this.myPlayerId);

    this.uiManager.renderGame(
      round.hands,
      scores,
      round.currentTurn,
      this.playerIds,
      this.playerNames,
      this._playerCount,
      visibleCards,
      round.playedCards,
      this.gameEngine.currentTrucoLevel
    );
  }

  /**
   * Handle player card click
   */
  private handlePlayerCardClick(cardIndex: number): void {
    if (!this._isGameRunning) return;

    const round = this.gameEngine.roundState;
    if (!round || round.currentTurn !== this.myPlayerId) return;

    const card = this.gameEngine.playerPlayCard(this.myPlayerId, cardIndex);
    if (card) {
      this.renderGameState();
    }
  }

  /**
   * Handle truco button click (player challenges)
   */
  private handleTrucoButton(): void {
    if (!this._isGameRunning) return;
    this.gameEngine.challengeTruco();
  }

  /**
   * Handle envido button click
   */
  private handleEnvidoButton(): void {
    if (!this._isGameRunning) return;
    this.gameEngine.challengeEnvido();
  }

  /**
   * Accept a truco challenge
   */
  private handleAcceptTruco(): void {
    this.gameEngine.acceptTruco();
  }

  /**
   * Reject a truco challenge
   */
  private handleRejectTruco(): void {
    this.gameEngine.rejectTruco();
  }
}

// Global entry point
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();

  // Make globally accessible for testing
  (window as any).trucoApp = app;
});
