// Main entry point for TrucoAI game

import { GameEngine } from './core/GameEngine.js';
import { Player } from './core/Player.js';
import { UIManager } from './ui/UIManager.js';
import { Scene } from './renderer/Scene.js';
import { AIPlayer } from './ai/AIPlayer.js';
import { DecisionEngine } from './ai/DecisionEngine.js';
import type { Card } from './core/Card.js';

export type GamePhase = 'waiting' | 'dealing' | 'play' | 'end';
export type PlayerInfo = {
  id: string;
  name: string;
  points?: number;
  isHuman: boolean;
  isAI: boolean;
};

/**
 * Main application class - connects game engine, renderer, UI, and AI
 */
export class App {
  private gameEngine = new GameEngine();
  private uiManager = new UIManager();
  private scene: Scene | null = null;
  private decisionEngine: DecisionEngine | null = null;
  private aiPlayer = new AIPlayer('normal');
  
  // Player management
  private humanPlayerId = 'human';
  private players: Map<string, Player> = new Map();
  
  // Game state
  private _isGameRunning = false;
  private _mode: 'solo' | 'multiplayer' = 'solo';
  private _playerCount = 2 as 2;
  private difficulty: 'easy' | 'normal' | 'hard' = 'normal';
  private container: HTMLElement;
  private isAITurn = false;

  constructor(containerId = 'game-container') {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found`);
    this.container = container;
  }

  /**
   * Initialize the game
   */
  init(): void {
    // Show menu initially
    this.uiManager.showMenu();
    this.setupMenuHandlers();
  }

  /**
   * Setup menu button handlers
   */
  private setupMenuHandlers(): void {
    // We need to wait for the DOM to be ready
    setTimeout(() => {
      const startBtn = document.getElementById('start-btn');
      if (startBtn) {
        startBtn.addEventListener('click', () => {
          const modeBtn = document.querySelector('.btn-mode.selected');
          const countBtn = document.querySelector('.btn-count.selected');
          const diffBtn = document.querySelector('.btn-diff.selected');
          
          const mode = modeBtn?.getAttribute('data-mode') as 'solo' | 'multiplayer' || 'solo';
          const count = parseInt(countBtn?.getAttribute('data-players') || '2');
          const diff = diffBtn?.getAttribute('data-diff') as 'easy' | 'normal' | 'hard' || 'normal';
          
          this.startGame({ mode: mode as 'solo' | 'multiplayer', playerCount: count as 2 | 4 | 6, difficulty: diff });
        });
      }
    }, 100);
  }

  /**
   * Start a new game session
   */
  startGame(options: {
    mode?: 'solo' | 'multiplayer';
    playerCount?: 2 | 4 | 6;
    difficulty?: 'easy' | 'normal' | 'hard';
  } = {}): void {
    this._mode = options.mode || 'solo';
    this._playerCount = (options.playerCount as 2) || 2;
    this.difficulty = options.difficulty || 'normal';

    // Create Three.js scene
    this.scene = new Scene(this.container);

    // Wire up card click handler
    this.scene.setCardClickCallback((cardIndex: number) => {
      this.handlePlayerCardClick(cardIndex);
    });

    // Show game UI
    this.uiManager.showHUD();
    this.uiManager.bindHUDButtons(
      () => this.handleEnvidoButton(),
      () => this.handleTrucoButton(),
      () => this.handleMazoButton()
    );

    if (this._mode === 'multiplayer') {
      console.log('Multiplayer mode selected');
    } else {
      this.startSoloGame();
    }
  }

  /**
   * Start a solo game with AI opponents
   */
  private startSoloGame(): void {
    // Create human player
    const humanPlayer = { id: 'human', name: 'Vos', isHuman: true, isAI: false };
    this.addPlayer(humanPlayer);

    // Create AI opponent
    const aiPlayer = { 
      id: 'ai-1', 
      name: 'La Roca', 
      isHuman: false, 
      isAI: true,
      difficulty: this.difficulty
    };
    this.addPlayer(aiPlayer);

    // Initialize game engine
    const playerArray = Array.from(this.players.values());
    this.gameEngine.init(playerArray as any);

    // Setup decision engine
    this.decisionEngine = new DecisionEngine(this.difficulty);
    this.decisionEngine.setGameEngine(this.gameEngine);

    // Set up event handlers
    this.setupGameEventHandlers();

    // Deal first round
    setTimeout(() => {
      this.gameEngine.startRound();
    }, 500);

    console.log('Game started with', playerArray.length, 'players');
  }

  /**
   * Add a player to the game
   */
  private addPlayer(info: PlayerInfo): void {
    const player = new Player(info);
    this.players.set(player.id, player);
  }

  /**
   * Set up game event handlers
   */
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

  /**
   * Handle round start - deal cards to scene
   */
  private handleRoundStart(data: any): void {
    this._isGameRunning = true;
    
    if (this.scene) {
      // Deal player cards face up
      this.scene.dealPlayerHand(data.playerHand);
      
      // Deal AI cards face down
      this.scene.dealAIHand(data.aiHand);
    }
    
    // Update scores
    this.updateScores();
    
    // Show message
    this.uiManager.showMessage('¡Mano nueva!');
  }

  /**
   * Handle card played event - animate cards on scene
   */
  private handleCardPlayed(data: any): void {
    if (!this.scene) return;
    
    if (data.playerId === 'player') {
      this.scene.playPlayerCard(data.card);
    } else {
      this.scene.playAICard(data.card);
    }
  }

  /**
   * Handle trick winner
   */
  private handleTrickWinner(data: any): void {
    const winnerName = data.winner === 'player' ? '¡Ganaste la jugada!' : 'La Roca ganó la jugada';
    this.uiManager.showMessage(winnerName, 1500);
    
    // After trick resolves, check if AI should play next card
    if (this._isGameRunning && !this.isAITurn) {
      this.checkAITurn();
    }
  }

  /**
   * Handle round winner
   */
  private handleRoundWinner(data: any): void {
    this._isGameRunning = false;
    
    const winnerName = data.winner === 'player' ? '¡Ganaste la mano! (+1)' : 'La Roca ganó la mano (+1)';
    this.uiManager.showMessage(winnerName, 2000);
  }

  /**
   * Handle game over
   */
  private handleGameOver(data: any): void {
    this._isGameRunning = false;
    
    const winnerName = data.winner === 'player' ? '¡GANASTE EL JUEGO!' : 'La Roca ganó el juego';
    this.uiManager.showMessage(winnerName, 5000);
    
    setTimeout(() => {
      this.uiManager.showGameOver(data.winner);
    }, 3000);
  }

  /**
   * Handle truco challenge from player
   */
  private handleTrucoChallenge(event: any): void {
    this.uiManager.showMessage('La Roca pensá...', 1500);
    
    // AI decides whether to accept or reject
    setTimeout(() => {
      const aiHand = this.gameEngine.aiHand;
      if (this.decisionEngine) {
        const action = this.decisionEngine.evaluate(aiHand);
        if (action) {
          this.decisionEngine.execute(action);
        }
      }
    }, 1500);
  }

  /**
   * Handle truco accepted
   */
  private handleTrucoAccepted(data: any): void {
    const levelNames = ['', '¡TRUCO!', '¡RETRUCO!', '¡VALE CUATRO!'];
    this.uiManager.showMessage(levelNames[data.level] || '¡Truco!', 2000);
  }

  /**
   * Handle truco rejected
   */
  private handleTrucoRejected(data: any): void {
    const winnerName = data.winner === 'player' ? '¡Ganaste el truco!' : 'La Roca ganó el truco';
    this.uiManager.showMessage(`${winnerName} (+${data.points})`, 2000);
  }

  /**
   * Handle envido challenge
   */
  private handleEnvidoChallenge(event: any): void {
    this.uiManager.showMessage('Calculando envido...', 1500);
    
    setTimeout(() => {
      if (this.decisionEngine) {
        const aiHand = this.gameEngine.aiHand;
        const action = this.decisionEngine.evaluate(aiHand);
        if (action) {
          this.decisionEngine.execute(action);
        }
      }
    }, 1500);
  }

  /**
   * Handle envido result
   */
  private handleEnvidoResult(data: any): void {
    const winnerName = data.winner === 'player' ? '¡Ganaste el envido!' : 'La Roca ganó el envido';
    this.uiManager.showMessage(`${winnerName} (${data.playerScore} vs ${data.aiScore})`, 2000);
  }

  /**
   * Check if it's AI's turn and play a card
   */
  private checkAITurn(): void {
    if (this.isAITurn) return;
    this.isAITurn = true;
    
    const aiHand = this.gameEngine.aiHand;
    if (aiHand.length === 0) {
      this.isAITurn = false;
      return;
    }

    if (!this.decisionEngine) {
      this.isAITurn = false;
      return;
    }

    const action = this.decisionEngine.evaluate(aiHand);
    
    if (action && action.type === 'play-card' && action.cardIndex !== undefined) {
      // Show thinking delay
      setTimeout(() => {
        this.gameEngine.aiPlayCard(action.cardIndex!);
        this.isAITurn = false;
      }, 800);
    } else if (action) {
      // Execute non-card action (truco, envido, etc.)
      this.decisionEngine.execute(action);
      this.isAITurn = false;
    } else {
      this.isAITurn = false;
    }
  }

  /**
   * Update score display
   */
  private updateScores(): void {
    const scores: Record<string, number> = {};
    
    for (const playerId of [...this.players.keys()]) {
      scores[playerId] = this.gameEngine.scores[playerId] || 0;
    }
    
    this.uiManager.updateScores(scores);
  }

  /**
   * Get scores from game engine
   */
  get scores(): Record<string, number> {
    return this.gameEngine.scores;
  }

  /**
   * Handle player card click
   */
  handlePlayerCardClick(cardIndex: number): void {
    if (!this._isGameRunning || this.isAITurn) return;
    
    const card = this.gameEngine.playerPlayCard(cardIndex);
    if (card) {
      // After player plays, check if AI should respond
      if (!this.gameEngine['trucoPending']) {
        setTimeout(() => this.checkAITurn(), 500);
      }
    }
  }

  /**
   * Handle truco button click (player challenges)
   */
  handleTrucoButton(): void {
    if (!this._isGameRunning) return;
    this.gameEngine.challengeTruco();
  }

  /**
   * Handle envido button click (player challenges)
   */
  handleEnvidoButton(): void {
    if (!this._isGameRunning) return;
    this.gameEngine.challengeEnvido();
  }

  /**
   * Handle mazo button click (player passes)
   */
  handleMazoButton(): void {
    if (!this._isGameRunning) return;
    // Player mazo (passes the trick)
    this.uiManager.showMessage('Mazo', 1000);
  }
}

// Global entry point
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
  
  // Make globally accessible for testing
  (window as any).trucoApp = app;
});
