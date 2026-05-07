import { GameEngine } from './core/GameEngine.js';
import { UIManager } from './ui/UIManager.js';
import type { GameConfig, PlayerConfig } from './types.js';

export class App {
  private container: HTMLElement;
  private gameEngine: GameEngine;
  private uiManager: UIManager;
  private players: PlayerConfig[] = [];
  private gameRunning: boolean = false;
  private selectedPlayerCount: number = 4;
  private selectedDifficulty: 'easy' | 'normal' | 'hard' = 'normal';

  constructor() {
    const el = document.getElementById('game-container');
    if (!el) throw new Error('Container #game-container not found');
    this.container = el;
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
    const renderHandlers = [
      'round-start', 'card-played', 'trick-resolved',
      'hand-resolved', 'round-over', 'game-over',
      'envido-raised', 'envido-resolved',
      'truco-accepted', 'truco-resolved',
    ];
    for (const event of renderHandlers) {
      this.gameEngine.on(event, () => this.renderGameState());
    }

    // When human calls envido → AI responds after a delay
    this.gameEngine.on('envido-opened', (data: any) => {
      this.renderGameState();
      const humanTeam = this.players[0]?.team ?? 0;
      // If human's team called, AI (opponent team) must respond
      if (data.team === humanTeam) {
        setTimeout(() => {
          const aiDecision = Math.random() < 0.6; // 60% quiere
          this.handleAiEnvidoResponse(aiDecision);
        }, 900);
      }
    });

    // When human calls truco → AI responds after a delay
    this.gameEngine.on('truco-challenged', (data: any) => {
      this.renderGameState();
      const humanTeam = this.players[0]?.team ?? 0;
      // If human's team challenged, AI (opponent team) must respond
      if (data.challengerTeam === humanTeam) {
        setTimeout(() => {
          const aiWants = Math.random() < 0.65; // 65% quiere
          this.handleAiTrucoResponse(aiWants);
        }, 900);
      }
    });

    this.gameEngine.on('ai-turn', (data: any) => this.handleAiTurn(data));
  }

  private renderInitialMenu(): void {
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

    const aiPlayer = this.players.find(p => p.id === data.playerId);
    if (!aiPlayer) return;

    const hand = this.gameEngine.getHands()[data.playerId] || [];
    if (hand.length === 0) return;

    let cardIndex: number;
    const diff = aiPlayer.difficulty || 'normal';

    if (diff === 'easy') {
      cardIndex = Math.floor(Math.random() * hand.length);
    } else {
      const cardRank = (card: any): number => {
        if (card.suit === 'espada' && card.number === 1) return 14;
        if (card.suit === 'basto' && card.number === 1) return 13;
        if (card.suit === 'espada' && card.number === 7) return 12;
        if (card.suit === 'oro' && card.number === 7) return 11;
        if (card.number === 3) return 10;
        if (card.number === 2) return 9;
        if (card.suit === 'oro' && card.number === 1) return 8;
        if (card.suit === 'copa' && card.number === 1) return 7;
        if (card.number === 12) return 6;
        if (card.number === 11) return 5;
        if (card.number === 10) return 4;
        if (card.suit === 'basto' && card.number === 7) return 3;
        if (card.suit === 'copa' && card.number === 7) return 2;
        if (card.number === 6) return 1;
        if (card.number === 5) return 0;
        return -1;
      };

      const sortedIndices = hand
        .map((card: any, index: number) => ({ card, index }))
        .sort((a: any, b: any) => cardRank(b.card) - cardRank(a.card));

      if (diff === 'hard') {
        cardIndex = sortedIndices[0].index;
      } else {
        cardIndex = Math.random() < 0.7
          ? sortedIndices[0].index
          : sortedIndices[Math.floor(Math.random() * sortedIndices.length)].index;
      }
    }

    // AI may decide to call truco before playing (only if not already called, and in first round)
    const trucoState = this.gameEngine.getTrucoState();
    const envState = this.gameEngine.getEnvidoState();
    const currentRound = this.gameEngine.getCurrentRound();

    // AI calls truco sometimes (round 0 or 1, not yet called)
    if (trucoState.level === 0 && envState.phase === 'none' && Math.random() < 0.25) {
      setTimeout(() => {
        this.gameEngine['challengeTruco'](data.playerId);
        // After calling truco, wait for human response — don't play card yet
        // Card will be played after truco resolves via ai-turn event re-emission
      }, 500);
      return;
    }

    // AI calls envido sometimes (only first round, before playing any card, and before truco)
    if (currentRound === 0 && envState.phase === 'none' && trucoState.level === 0 && Math.random() < 0.3) {
      // Check canOpenEnvido equivalent: currentTrick length must be 0
      const currentTrick = this.gameEngine.getCurrentTrick();
      if (currentTrick.length === 0) {
        setTimeout(() => {
          this.gameEngine['openEnvido'](data.playerId);
        }, 500);
        // After calling envido wait for human response — card plays after resolution
        return;
      }
    }

    setTimeout(() => {
      this.gameEngine.playCard(data.playerId, cardIndex);
    }, 700);
  }

  private handleNewRound(): void {
    if (this.players.length === 0) {
      this.startGame(this.selectedPlayerCount, this.selectedDifficulty);
    } else {
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
    // Only allow in round 0 (primera ronda)
    if (this.gameEngine.getCurrentRound() !== 0) return;
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

  // AI auto-responds to Envido when human calls
  private handleAiEnvidoResponse(wants: boolean, raiseLevel?: 'envido' | 'real-envido' | 'falta-envido'): void {
    const humanTeam = this.players[0]?.team;
    const aiPlayers = this.players.filter(p => p.isAI && p.team !== humanTeam);
    if (aiPlayers.length === 0) return;
    const aiPlayer = aiPlayers[0];
    this.gameEngine['respondEnvido'](aiPlayer.id, wants, raiseLevel);
  }

  // AI auto-responds to Truco when human calls
  private handleAiTrucoResponse(accept: boolean, raise: boolean = false): void {
    const humanTeam = this.players[0]?.team;
    const aiPlayers = this.players.filter(p => p.isAI && p.team !== humanTeam);
    if (aiPlayers.length === 0) return;
    const aiPlayer = aiPlayers[0];
    if (raise) {
      this.gameEngine['respondTruco'](aiPlayer.id, true);
    } else {
      this.gameEngine['respondTruco'](aiPlayer.id, accept);
    }
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
    // After acceptance, AI needs to keep playing — re-trigger if it's AI's turn
    setTimeout(() => this.checkAndTriggerAiTurn(), 200);
  }

  private handleTrucoDecline(): void {
    this.gameEngine['respondTruco'](this.players[0].id, false);
  }

  private handleTrucoRaise(): void {
    this.gameEngine['respondTruco'](this.players[0].id, true);
  }

  // Safety: if after responding it's AI's turn and no ai-turn fired, trigger manually
  private checkAndTriggerAiTurn(): void {
    const currentTurnId = this.gameEngine.getCurrentTurnPlayerId();
    const aiPlayer = this.players.find(p => p.id === currentTurnId && p.isAI);
    if (aiPlayer) {
      this.handleAiTurn({ playerId: currentTurnId });
    }
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
