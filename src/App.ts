// App.ts - Main entry point for TrucoAI game
// Orchestrates GameEngine, UI, Renderer, and GameClient

import { GameEngine } from './core/GameEngine.js';
import { Player, type PlayerInfo } from './core/Player.js';
import { Deck } from './core/Deck.js';
import * as Rules from './core/Rules.js';
import { CardEvaluator } from './ai/CardEvaluator.js';
import { UIManager } from './ui/UIManager.js';
import { Scene } from './renderer/Scene.js';
import { GameClient } from './network/GameClient.js';

// Export types for external use
export type { GamePhase } from './core/GameEngine.js';
export type { PlayerInfo, Difficulty } from './types.js';

/**
 * Main application class that ties together all components
 */
export class App {
  private gameEngine: GameEngine;
  private uiManager: UIManager;
  private scene: Scene | null = null;
  private gameClient: GameClient;
  
  // Player management
  private humanPlayerId: string = 'human';
  private players: Map<string, Player> = new Map();
  
  // Game state
  private isGameRunning: boolean = false;
  private mode: 'solo' | 'multiplayer' = 'solo';
  private playerCount: 2 | 4 | 6 = 2;
  private difficulty: 'easy' | 'normal' | 'hard' = 'normal';

  // DOM elements
  private container: HTMLElement;

  constructor(containerId: string = 'game-container') {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found`);
    
    this.container = container;
    
    // Initialize core systems
    this.gameEngine = new GameEngine();
    this.uiManager = new UIManager();
    this.gameClient = new GameClient();
    
    // Set up UI callbacks
    this.setupUIListeners();
  }

  /**
   * Initialize the game with a container and start rendering
   */
  init(): void {
    // Create Three.js scene
    this.scene = new Scene(this.container);
    
    // Show menu initially
    this.uiManager.showMenu();
  }

  /**
   * Start a new game session
   */
  startGame(options: {
    mode?: 'solo' | 'multiplayer';
    playerCount?: 2 | 4 | 6;
    difficulty?: 'easy' | 'normal' | 'hard';
    roomCode?: string;
  } = {}): void {
    this.mode = options.mode || 'solo';
    this.playerCount = (options.playerCount as 2 | 4 | 6) || 2;
    this.difficulty = options.difficulty || 'normal';

    // Show game UI
    this.uiManager.showHUD();

    if (this.mode === 'multiplayer') {
      this.startMultiplayerGame(options.roomCode);
    } else {
      this.startSoloGame();
    }
  }

  /**
   * Start a solo game with AI opponents
   */
  private startSoloGame(): void {
    // Create human player
    const humanPlayer: PlayerInfo = {
      id: 'human',
      name: 'Vos',
      points: 0,
      isHuman: true,
      isAI: false,
    };
    this.addPlayer(humanPlayer);

    // Create AI opponents based on player count
    const aiNames = ['El Carpincho', 'La Roca', 'Messi', 'El Diego', 'Boris', 'Guido'];
    
    for (let i = 1; i < this.playerCount; i++) {
      const aiPlayer: PlayerInfo = {
        id: `ai-${i}`,
        name: aiNames[i % aiNames.length],
        points: 0,
        isHuman: false,
        isAI: true,
        difficulty: this.difficulty,
      };
      this.addPlayer(aiPlayer);
    }

    // Initialize game engine
    const playerArray = Array.from(this.players.values());
    this.gameEngine.init(playerArray);

    // Set up event handlers
    this.setupGameEventHandlers();

    // Update UI
    this.updateScores();
  }

  /**
   * Start a multiplayer game via Colyseus
   */
  private async startMultiplayerGame(roomCode?: string): Promise<void> {
    try {
      if (roomCode) {
        // Join existing room
        await this.gameClient.joinRoom(roomCode, { name: 'Vos' });
      } else {
        // Create new room
        await this.gameClient.createRoom({
          name: 'Vos',
          playerCount: this.playerCount,
        });
      }

      // Set up multiplayer event handlers
      this.setupMultiplayerEventHandlers();

      // Show waiting screen with room code
      const currentRoom = this.gameClient.getRoom();
      if (currentRoom && currentRoom.id) {
        // For now, show generic room code
        this.uiManager.showWaiting('MULTIPLAYER');
      }
    } catch (error) {
      console.error('Failed to start multiplayer game:', error);
      this.uiManager.showMessage('Error al conectar con servidor');
    }
  }

  /**
   * Add a player to the game
   */
  private addPlayer(info: PlayerInfo): void {
    const player = new Player(info);
    this.players.set(player.id, player);
  }

  /**
   * Set up UI event listeners
   */
  private setupUIListeners(): void {
    // Menu buttons
    (window as any).Menu = {
      selectMode: (mode: 'solo' | 'multiplayer') => {
        // Update UI selection
        document.querySelectorAll('[data-mode]').forEach(btn => {
          btn.classList.remove('selected');
          if ((btn as HTMLElement).dataset.mode === mode) {
            btn.classList.add('selected');
          }
        });
      },
      selectPlayers: (count: 2 | 4 | 6) => {
        // Update UI selection
        document.querySelectorAll('[data-players]').forEach(btn => {
          btn.classList.remove('selected');
          if ((btn as HTMLElement).dataset.players === String(count)) {
            btn.classList.add('selected');
          }
        });
      },
      selectDifficulty: (diff: 'easy' | 'normal' | 'hard') => {
        // Update UI selection
        document.querySelectorAll('[data-diff]').forEach(btn => {
          btn.classList.remove('selected');
          if ((btn as HTMLElement).dataset.diff === diff) {
            btn.classList.add('selected');
          }
        });
      },
    };

    // Action buttons
    this.container.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      if (target.classList.contains('btn-envido')) {
        this.handleEnvidoAction();
      } else if (target.classList.contains('btn-truco') || target.classList.contains('btn-retro')) {
        this.handleTrucoAction();
      } else if (target.classList.contains('btn-vale4')) {
        this.handleVale4Action();
      } else if (target.classList.contains('btn-mazo')) {
        this.handleMazoAction();
      }
    });
  }

  /**
   * Handle envido action (declare or respond)
   */
  private handleEnvidoAction(): void {
    if (!this.isGameRunning) return;
    
    const currentPlayer = this.gameEngine.getCurrentPlayer();
    if (!currentPlayer || !currentPlayer.isHuman) return;

    // For now, simple envido declaration
    const result = this.gameEngine.declareEnvido(currentPlayer.id);
    
    if (result.success) {
      this.uiManager.showMessage(`¡Envido!`, 2000);
    } else {
      this.uiManager.showMessage(result.message || 'No podés cantar envido ahora', 2000);
    }
  }

  /**
   * Handle truco action (declare or respond)
   */
  private handleTrucoAction(): void {
    if (!this.isGameRunning) return;
    
    const currentPlayer = this.gameEngine.getCurrentPlayer();
    if (!currentPlayer || !currentPlayer.isHuman) return;

    // Simple truco declaration
    this.gameEngine.declareTruco(currentPlayer.id);
    
    const level = this.gameEngine.trucoLevel;
    const labels = ['TRUCO', 'RETRUCO', 'VALE 4'];
    this.uiManager.showMessage(`¡${labels[level - 1]}!`, 2000);
  }

  /**
   * Handle vale 4 action
   */
  private handleVale4Action(): void {
    this.handleTrucoAction(); // Vale 4 is truco level 3
  }

  /**
   * Handle mazo action (go to mazo / fold)
   */
  private handleMazoAction(): void {
    if (!this.isGameRunning) return;
    
    const currentPlayer = this.gameEngine.getCurrentPlayer();
    if (!currentPlayer || !currentPlayer.isHuman) return;

    // Fold the current hand
    this.uiManager.showMessage('Fuiste al mazo', 2000);
    
    // In real implementation, this would end the current round
    this.gameEngine.dealRoundWinner(currentPlayer.id);
  }

  /**
   * Set up game event handlers
   */
  private setupGameEventHandlers(): void {
    const onEvent = (event: any) => {
      switch (event.type) {
        case 'round-start':
          this.handleRoundStart(event.data);
          break;
        case 'card-played':
          this.handleCardPlayed(event.data);
          break;
        case 'envido-declared':
          this.handleEnvidoDeclared(event.data);
          break;
        case 'envido-responded':
          this.handleEnvidoResponded(event.data);
          break;
        case 'truco-declared':
          this.handleTrucoDeclared(event.data);
          break;
        case 'round-over':
          this.handleRoundOver(event.data);
          break;
      }
    };

    this.gameEngine.onEvent = onEvent;

    // Card click handler
    const onCardClick = (index: number) => {
      if (!this.isGameRunning) return;
      
      const currentPlayer = this.gameEngine.getCurrentPlayer();
      if (!currentPlayer || !currentPlayer.isHuman) return;

      // Check if it's this player's turn
      if (currentPlayer.id !== this.humanPlayerId) {
        return;
      }

      // Play the card
      const result = this.gameEngine.playCard(currentPlayer.id, index);
      
      if (result.success && this.scene) {
        // Animate card play in 3D
        this.animateCardPlay(currentPlayer.id, index);
      }
    };

    // Store callback for UI
    (window as any).onCardClick = onCardClick;
  }

  /**
   * Handle round start
   */
  private handleRoundStart(data: any): void {
    this.isGameRunning = true;
    
    // Update hand display
    const humanPlayer = this.players.get(this.humanPlayerId);
    if (humanPlayer && this.scene) {
      // Update UI with cards
      const humanCards = humanPlayer.cards.map(c => ({
        number: c.number,
        suit: c.suit,
      }));
      
      this.uiManager.renderCardHand(humanCards, true, (index) => {
        // Card clicked - play it
        if (humanPlayer && humanPlayer.id === this.gameEngine.getCurrentPlayer()?.id) {
          const result = this.gameEngine.playCard(humanPlayer.id, index);
          if (result.success) {
            this.animateCardPlay(humanPlayer.id, index);
          }
        }
      });
    }

    // Update scores
    this.updateScores();
  }

  /**
   * Handle card played event
   */
  private handleCardPlayed(data: any): void {
    // Update UI to show played cards
    const { playerId, card } = data;
    
    if (this.scene) {
      // Place card in 3D scene
      const positions = this.scene.table.getPlayAreaPositions(this.playerCount);
      // Find player index
      const playerArray = Array.from(this.players.values());
      const playerIndex = playerArray.findIndex(p => p.id === playerId);
      
      if (playerIndex !== -1 && card) {
        const card3D = this.scene.getCard();
        card3D.setCard(card);
        // Get position based on player index
        const posIndex = playerIndex % positions.length;
        card3D.setPosition(positions[posIndex].x, positions[posIndex].y);
      }
    }

    // Update played cards count in UI
    this.updatePlayedCardsDisplay();
  }

  /**
   * Handle envido declared event
   */
  private handleEnvidoDeclared(data: any): void {
    const { playerId, level } = data;
    this.uiManager.showMessage(`${playerId}: ¡Envido!`, 2000);
    
    // Enable response buttons for other players
    const currentPlayer = this.gameEngine.getCurrentPlayer();
    if (currentPlayer && !currentPlayer.isHuman) {
      // AI responds automatically
      setTimeout(() => this.handleAIEnvidoResponse(currentPlayer), 1000);
    }
  }

  /**
   * Handle AI envido response
   */
  private handleAIEnvidoResponse(player: Player): void {
    const myScore = player.calculateEnvido();
    // Simple response: accept if score is decent
    const shouldAccept = myScore >= 20;
    
    this.gameEngine.respondEnvido(player.id, shouldAccept);
    
    if (shouldAccept) {
      this.uiManager.showMessage(`${player.name}: Acepto`, 1500);
    } else {
      this.uiManager.showMessage(`${player.name}: Fuiste al mazo`, 1500);
    }
  }

  /**
   * Handle envido responded event
   */
  private handleEnvidoResponded(data: any): void {
    const { playerId, accept } = data;
    
    if (accept) {
      this.uiManager.showMessage(`${playerId}: Acepto`, 1500);
    } else {
      this.uiManager.showMessage(`${playerId}: Fuiste al mazo`, 1500);
    }
    
    // Determine envido winner
    this.determineEnvidoWinner();
  }

  /**
   * Handle truco declared event
   */
  private handleTrucoDeclared(data: any): void {
    const { playerId, level } = data;
    const labels = ['', 'TRUCO', 'RETRUCO', 'VALE 4'];
    this.uiManager.showMessage(`${playerId}: ¡${labels[level]}!`, 2000);
    
    // Check if it's AI's turn to respond
    const currentPlayer = this.gameEngine.getCurrentPlayer();
    if (currentPlayer && !currentPlayer.isHuman) {
      setTimeout(() => this.handleAITrucoResponse(currentPlayer), 1000);
    }
  }

  /**
   * Handle AI truco response
   */
  private handleAITrucoResponse(player: Player): void {
    const strength = player.getTrucoStrength();
    const trucoLevel = this.gameEngine.trucoLevel;
    
    // Simple response logic
    let shouldAccept = false;
    if (this.difficulty === 'easy') {
      shouldAccept = strength >= 20 - trucoLevel * 5;
    } else if (this.difficulty === 'normal') {
      shouldAccept = strength >= 18 - trucoLevel * 4;
    } else {
      shouldAccept = strength >= (15 - trucoLevel * 3);
    }
    
    this.gameEngine.respondTruco(player.id, shouldAccept);
    
    if (shouldAccept) {
      this.uiManager.showMessage(`${player.name}: Acepto`, 1500);
    } else {
      this.uiManager.showMessage(`${player.name}: Fuiste al mazo`, 1500);
    }
  }

  /**
   * Handle round over event
   */
  private handleRoundOver(data: any): void {
    this.isGameRunning = false;
    
    const { winner, score } = data;
    this.uiManager.showMessage(`Ronda ganada por ${winner} (+${score})`, 3000);
    
    // Update scores
    this.updateScores();
    
    // Check if game is over
    const scores = this.gameEngine.scores;
    for (const [playerId, points] of Object.entries(scores)) {
      if (points >= 15) {
        this.uiManager.showGameOver(playerId);
        this.isGameRunning = false;
        return;
      }
    }

    // Start next round after delay
    setTimeout(() => {
      this.gameEngine.startNewRound();
      this.handleRoundStart({ mano: 'human' });
    }, 3000);
  }

  /**
   * Update score display
   */
  private updateScores(): void {
    const scores = this.gameEngine.scores;
    const names: Record<string, string> = {};
    
    for (const [id, player] of this.players) {
      names[id] = player.name;
    }
    
    const teams: Record<string, number> = {};
    for (const [id, player] of this.players) {
      teams[id] = player.isHuman ? 0 : 1; // Simplified team assignment
    }
    
    this.uiManager.updateScores(scores, names, teams);
  }

  /**
   * Update displayed played cards
   */
  private updatePlayedCardsDisplay(): void {
    // Count played cards for each player
    const counts: Record<string, number> = {};
    
    for (const [id, player] of this.players) {
      counts[id] = player.playedCards.length;
    }
    
    // Update UI
  }

  /**
   * Animate card play in 3D scene
   */
  private animateCardPlay(playerId: string, cardIndex: number): void {
    if (!this.scene) return;
    
    const player = this.players.get(playerId);
    if (!player) return;

    // Get card data
    const card = player.cards[cardIndex];
    if (!card) return;

    // Create 3D card
    const card3D = this.scene.getCard();
    card3D.setCard(card);
    
    // Position based on player
    const positions = this.scene.table.getHandPositions(0, this.playerCount);
    
    // Simple positioning for now
    const offset = (cardIndex - player.cards.length / 2) * 0.5;
    card3D.setPosition(offset, -1, 0);
    
    // Play animation
    this.scene.animationManager.animateFlip(card3D, true);
  }

  /**
   * Determine envido winner (simplified)
   */
  private determineEnvidoWinner(): void {
    // In real implementation, compare envido scores
    // For now, just pick random winner for demo
  }

  /**
   * Get current game engine
   */
  getGameEngine(): GameEngine {
    return this.gameEngine;
  }

  /**
   * Get current UI manager
   */
  getUIManager(): UIManager {
    return this.uiManager;
  }

  /**
   * Get current scene
   */
  getScene(): Scene | null {
    return this.scene;
  }

  /**
   * Get game mode
   */
  getMode(): 'solo' | 'multiplayer' {
    return this.mode;
  }

  /**
   * Get player count
   */
  getPlayerCount(): 2 | 4 | 6 {
    return this.playerCount;
  }

  /**
   * Get difficulty
   */
  getDifficulty(): 'easy' | 'normal' | 'hard' {
    return this.difficulty;
  }

  /**
   * Get human player ID
   */
  getHumanPlayerId(): string {
    return this.humanPlayerId;
  }
}
