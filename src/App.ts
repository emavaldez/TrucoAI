import { GameEngine } from './core/GameEngine.js';
import { UIManager } from './ui/UIManager.js';
import { getCardRank } from './core/Rules.js';
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
      onEnvidoOpenType: this.handleEnvidoOpenType.bind(this),
      onEnvidoWant: this.handleEnvidoWant.bind(this),
      onEnvidoSonBuenas: this.handleEnvidoSonBuenas.bind(this),
      onEnvidoNoWant: this.handleEnvidoNoWant.bind(this),
      onEnvidoRaise: this.handleEnvidoRaise.bind(this),
      onTrucoChallenge: this.handleTrucoChallenge.bind(this),
      onTrucoAccept: this.handleTrucoAccept.bind(this),
      onTrucoDecline: this.handleTrucoDecline.bind(this),
      onTrucoRaise: this.handleTrucoRaise.bind(this),
      onContinueAfterNotification: this.handleContinueAfterNotification.bind(this),
      onIrseAlMazo: this.handleIrseAlMazo.bind(this),
    });

    this.setupEventListeners();
    this.renderInitialMenu();
  }

  private setupEventListeners(): void {
    const renderHandlers = [
      'round-start', 'card-played',
      'hand-resolved', 'round-over', 'game-over',
      'envido-raised', 'envido-resolved',
      'truco-accepted', 'truco-resolved',
      'irse-al-mazo',
    ];
    for (const event of renderHandlers) {
      this.gameEngine.on(event, () => this.renderGameState());
    }

    // When a trick is resolved, pause for the human to see the result
    this.gameEngine.on('trick-resolved', (data: any) => {
      this.renderGameState();
      const scores = this.gameEngine.getScores();
      if (scores.team0 >= 30 || scores.team1 >= 30) return;
      this._waitingForContinue = true;
      const winnerTeam = data.winnerTeam;
      const winnerLabel = winnerTeam >= 0 ? `Equipo ${winnerTeam + 1}` : 'Parda (empate)';
      this.uiManager.showNotification(
        `✅ Mano ${data.trickNumber + 1} — Ganó ${winnerLabel}`,
        '',
        'info'
      ).then(() => {
        this._waitingForContinue = false;
        if (this._pendingAiTurn) {
          const pending = this._pendingAiTurn;
          this._pendingAiTurn = null;
          this.handleAiTurn(pending);
        } else {
          this.renderGameState();
        }
      });
    });

    // When envido is opened, AI responds (only if human's team called)
    this.gameEngine.on('envido-opened', (data: any) => {
      this.renderGameState();
      const humanTeam = this.players[0]?.team ?? 0;
      if (data.team === humanTeam) {
        setTimeout(() => {
          const aiDecision = Math.random() < 0.6;
          this.handleAiEnvidoResponse(aiDecision);
        }, 900);
      }
    });

    // When envido is raised, AI responds when HUMAN raised (AI team is respondent)
    this.gameEngine.on('envido-raised', (data: any) => {
      this.renderGameState();
      const humanTeam = this.players[0]?.team ?? 0;
      // data.team is the raiser's team — if human raised, AI must respond
      if (data.team === humanTeam) {
        setTimeout(() => {
          const aiWants = Math.random() < 0.6;
          if (data.level !== 'falta-envido' && Math.random() < 0.25) {
            const next = data.level === 'envido' ? 'real-envido' as const : 'falta-envido' as const;
            this.handleAiEnvidoResponse(true, next);
          } else {
            this.handleAiEnvidoResponse(aiWants);
          }
        }, 1200);
      }
    });

    // After envido resolves, show result notification with individual scores
    this.gameEngine.on('envido-resolved', (data: any) => {
      this.renderGameState();
      if (data && data.sonBuenas) {
        const wTeam = data.winnerTeam;
        const title = wTeam === 0 ? 'Equipo 1 gana el Envido' : 'Equipo 2 gana el Envido';
        this.uiManager.showNotification(title, 'El rival dijo "Son buenas". Envido para tu equipo.', 'success');
        return;
      }
      if (data && data.team0Best !== undefined) {
        const wTeam = data.winnerTeam;
        const title = wTeam === 0 ? 'Equipo 1 gana el Envido' : 'Equipo 2 gana el Envido';
        const winnerPoints = wTeam === 0 ? data.team0Best : data.team1Best;
        const msg = `Equipo ${wTeam + 1} gana con ${winnerPoints} pts — se lleva ${data.points} pts`;
        this.uiManager.showNotification(title, msg, 'info');
      } else {
        setTimeout(() => this.resumeCurrentTurn(), 300);
      }
    });

    // When truco is challenged, AI responds if human challenged
    this.gameEngine.on('truco-challenged', (data: any) => {
      this.renderGameState();
      const humanTeam = this.players[0]?.team ?? 0;
      if (data.challengerTeam === humanTeam) {
        setTimeout(() => {
          const aiWants = Math.random() < 0.65;
          this.handleAiTrucoResponse(aiWants);
        }, 900);
      }
    });

    // After truco resolves (rejected), end the hand and start a new one
    this.gameEngine.on('truco-resolved', (data: any) => {
      if (data.isGameOver) {
        this.renderGameState();
        return;
      }
      setTimeout(() => this.handleTrucoRejected(), 500);
    });

    // After truco accepted, resume the turn
    this.gameEngine.on('truco-accepted', () => {
      setTimeout(() => this.resumeCurrentTurn(), 300);
    });

    // When truco is raised, the OTHER team must respond
    this.gameEngine.on('truco-raised', (data: any) => {
      this.renderGameState();
      const humanTeam = this.players[0]?.team ?? 0;
      // If the HUMAN raised (data.team === humanTeam), AI (original caller) must respond
      if (data.team === humanTeam) {
        setTimeout(() => {
          const aiWants = Math.random() < 0.65;
          const aiRaises = Math.random() < 0.3 && data.level < 3;
          if (aiRaises) {
            this.handleAiTrucoResponse(true, true);
          } else {
            this.handleAiTrucoResponse(aiWants);
          }
        }, 1200);
      }
      // If AI raised (data.team !== humanTeam), human sees response panel via renderGameState
    });

    this.gameEngine.on('ai-turn', (data: any) => {
      // If waiting for "Continuar" click, defer the AI turn
      if (this._waitingForContinue) {
        this._pendingAiTurn = data;
        return;
      }
      this.handleAiTurn(data);
    });
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
      envido: { phase: 'none', callerTeam: null, level: 'envido', accepted: false, totalPoints: 0, pointsAwarded: 0, team0Scored: 0, team1Scored: 0, envidoWinner: null, team0Player0Envido: null, team0Player1Envido: null, team1Player0Envido: null, team1Player1Envido: null, team1Player2Envido: null, team0Player2Envido: null },
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
      piePlayerId: '',
      partidaHistory: {
        initialDealerId: '',
        hands: [],
        finalScores: { team0: 0, team1: 0 },
        winningTeam: -1,
        totalHands: 0,
        startedAt: Date.now(),
        endedAt: null,
      },
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
      const team = i % 2; // Alternating: 0,1,0,1,...
      let name: string;
      if (isHuman) {
        name = 'Vos';
      } else if (playerCount === 2) {
        name = `Jugador ${i + 1}`;
      } else if (playerCount === 4) {
        const labels = ['Contrario 1', 'Compañero', 'Contrario 2'];
        name = labels[i - 1] || `Jugador ${i + 1}`;
      } else {
        const labels = ['Contrario 1', 'Compañero 1', 'Contrario 2', 'Compañero 2', 'Contrario 3'];
        name = labels[i - 1] || `Jugador ${i + 1}`;
      }
      this.players.push({
        id: `player-${i}`,
        name,
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

    const diff = aiPlayer.difficulty || 'normal';
    const currentTrick = this.gameEngine.getCurrentTrick();

    // Check if opponent already played an unbeatable card
    // If an opponent card beats ALL of our remaining cards, play the weakest
    let playWeakest = false;
    if (currentTrick.length > 0) {
      // Opponent has played — check each opponent card vs our best card
      const myBestRank = Math.max(...hand.map((c: any) => getCardRank(c)));
      for (const played of currentTrick) {
        const playedPlayer = this.players.find(p => p.id === played.playerId);
        if (playedPlayer && playedPlayer.team !== aiPlayer.team) {
          // Opponent card — does it beat our best?
          if (getCardRank(played.card) > myBestRank) {
            playWeakest = true;
            break;
          }
        }
      }
    }

    let cardIndex: number;
    if (diff === 'easy') {
      cardIndex = Math.floor(Math.random() * hand.length);
    } else if (playWeakest) {
      // Can't win this trick — play the WEAKEST card
      const sortedWeak = hand
        .map((card: any, idx: number) => ({ card, idx }))
        .sort((a: any, b: any) => getCardRank(a.card) - getCardRank(b.card));
      cardIndex = sortedWeak[0].idx;
    } else {
      // Try to win — play the STRONGEST card
      const sorted = hand
        .map((card: any, idx: number) => ({ card, idx }))
        .sort((a: any, b: any) => getCardRank(b.card) - getCardRank(a.card));
      cardIndex = diff === 'hard'
        ? sorted[0].idx
        : Math.random() < 0.7 ? sorted[0].idx : sorted[Math.floor(Math.random() * sorted.length)].idx;
    }

    this.executeAiAction(data.playerId, cardIndex);
  }

  private executeAiAction(playerId: string, cardIndex: number): void {
    const trucoState = this.gameEngine.getTrucoState();
    const envState = this.gameEngine.getEnvidoState();
    const currentRound = this.gameEngine.getCurrentRound();

    // AI calls truco sometimes
    if (trucoState.level === 0 && envState.phase === 'none' && Math.random() < 0.25) {
      this.gameEngine['challengeTruco'](playerId);
      return;
    }

    // AI calls envido if it's the dealer or pie
    if (currentRound === 0 && envState.phase === 'none' && Math.random() < 0.3) {
      const currentTrick = this.gameEngine.getCurrentTrick();
      if (currentTrick.length === 0 && this.isAIDealerOrPie(playerId)) {
        setTimeout(() => { this.gameEngine['openEnvido'](playerId); }, 500);
        return;
      }
    }

    setTimeout(() => { this.gameEngine.playCard(playerId, cardIndex); }, 700);
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
    if (this.gameEngine.getCurrentRound() !== 0) return;
    const humanPlayer = this.players[0];
    if (!humanPlayer) return;
    // Any player can call envido directly (no dealer/pie restriction)
    this.gameEngine['openEnvido'](humanPlayer.id);
  }

  private handleEnvidoWant(): void {
    this.gameEngine['respondEnvido'](this.players[0].id, true);
  }

  private handleEnvidoSonBuenas(): void {
    this.gameEngine['respondEnvido'](this.players[0].id, 'son-buenas');
  }

  private handleEnvidoOpenType(level: 'envido' | 'real-envido' | 'falta-envido'): void {
    if (this.gameEngine.getCurrentRound() !== 0) return;
    const humanPlayer = this.players[0];
    if (!humanPlayer) return;
    const dealerId = this.gameEngine.getDealerId();
    const pieId = this.getPiePlayerId();
    if (humanPlayer.id !== dealerId && humanPlayer.id !== pieId) return;
    this.gameEngine['openEnvido'](humanPlayer.id);
    const eng = this.gameEngine as any;
    if (level === 'real-envido') {
      eng.envido.level = 'real-envido';
      eng.envido.totalPoints = 3;
    } else if (level === 'falta-envido') {
      eng.envido.level = 'falta-envido';
      eng.envido.totalPoints = eng.getFaltaEnvidoValue?.() || 0;
    }
  }

  private handleEnvidoNoWant(): void {
    this.gameEngine['respondEnvido'](this.players[0].id, false);
  }

  private handleEnvidoRaise(level: 'envido' | 'real-envido' | 'falta-envido'): void {
    this.gameEngine['respondEnvido'](this.players[0].id, true, level);
  }

  private handleAiEnvidoResponse(wants: boolean, raiseLevel?: 'envido' | 'real-envido' | 'falta-envido'): void {
    const humanTeam = this.players[0]?.team;
    const aiPlayers = this.players.filter(p => p.isAI && p.team !== humanTeam);
    if (aiPlayers.length === 0) return;
    const opponentPie = this.findPiePlayer(humanTeam === 0 ? 1 : 0);
    const responder = opponentPie ? this.players.find(p => p.id === opponentPie) : aiPlayers[0];
    if (!responder) return;
    // Store the pending action and show notification
    const wantsText = wants ? 'QUIERE' : 'NO QUIERE';
    // Save the action to execute after user clicks OK
    this._pendingEnvidoAction = () => {
      this.gameEngine['respondEnvido'](responder.id, wants, raiseLevel);
      this._pendingEnvidoAction = null;
      this.renderGameState();
    };
    this.renderGameState();
    this.uiManager.showNotification(
      wants ? 'Envido aceptado' : 'Envido rechazado',
      `El equipo contrario ${wantsText} envido.`,
      wants ? 'info' : 'success'
    );
  }

  private handleAiTrucoResponse(accept: boolean, raise: boolean = false): void {
    const humanTeam = this.players[0]?.team;
    const aiPlayers = this.players.filter(p => p.isAI && p.team !== humanTeam);
    if (aiPlayers.length === 0) return;
    const aiPlayer = aiPlayers[0];
    if (raise) {
      this.gameEngine['respondTruco'](aiPlayer.id, true, true);
      return;
    }
    // Store pending action, show notification first
    this._pendingTrucoAction = () => {
      this.gameEngine['respondTruco'](aiPlayer.id, accept);
      this._pendingTrucoAction = null;
      this.renderGameState();
    };
    this.renderGameState();
    if (accept) {
      this.uiManager.showNotification('Truco aceptado',
        'El equipo contrario QUIERE Truco. Se juega con apuesta más alta.', 'warning');
    } else {
      this.uiManager.showNotification('Truco rechazado',
        'El equipo contrario NO QUIERE Truco. Puntos para tu equipo.', 'success');
    }
  }

  private findPiePlayer(team: number): string | null {
    const order = this.gameEngine.getPlayingOrder();
    const teamPlayers = order.filter((id: string) => {
      const p = this.players.find(pl => pl.id === id);
      return p && p.team === team;
    });
    return teamPlayers.length > 0 ? teamPlayers[teamPlayers.length - 1] : null;
  }

  private isAIDealerOrPie(playerId: string): boolean {
    const player = this.players.find(p => p.id === playerId);
    if (!player || !player.isAI) return false;
    const dealerId = this.gameEngine.getDealerId();
    const pie = this.getPiePlayerId();
    return playerId === dealerId || pie === playerId;
  }

  // Pending actions that wait for notification OK click
  private _pendingEnvidoAction: (() => void) | null = null;
  private _pendingTrucoAction: (() => void) | null = null;
  private _waitingForContinue: boolean = false;
  private _pendingAiTurn: any = null;

  // Temporary builder state (not persisted)
  private _tempEnvidoLevel: string | null = null;

  /**
   * Called after player clicks OK on a notification overlay.
   * Executes the pending action and resumes the turn.
   */
  private handleContinueAfterNotification(): void {
    if (this._pendingEnvidoAction) {
      this._pendingEnvidoAction();
    }
    if (this._pendingTrucoAction) {
      this._pendingTrucoAction();
    }
    this.resumeCurrentTurn();
  }

  /**
   * Get the pie player (left of dealer, last in playing order).
   */
  private getPiePlayerId(): string {
    const order = this.gameEngine.getPlayingOrder();
    const dealerIdx = order.indexOf(this.gameEngine.getDealerId());
    const pieIdx = (dealerIdx - 1 + order.length) % order.length;
    return order[pieIdx];
  }

  private getHumanPiePlayerId(): string {
    // The pie for envido is LEFT of the dealer (clockwise previous), regardless of team
    return this.getPiePlayerId();
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
    this.gameEngine['respondTruco'](this.players[0].id, true, true);
  }

  // ---- Irse al Mazo Handler ----

  private handleIrseAlMazo(): void {
    if (!this.gameRunning) return;
    this.gameEngine['irseAlMazo'](this.players[0].id);
  }

  /**
   * Resume the current turn after envido/truco resolution.
   * If it's an AI's turn, trigger AI. If human, update UI.
   */
  private resumeCurrentTurn(): void {
    if (!this.gameRunning) return;
    const currentTurnId = this.gameEngine.getCurrentTurnPlayerId();
    if (!currentTurnId) return;
    const player = this.players.find(p => p.id === currentTurnId);
    if (player && player.isAI) {
      const hand = this.gameEngine.getHands()[currentTurnId] || [];
      if (hand.length > 0) {
        this.handleAiTurn({ playerId: currentTurnId });
      }
    } else {
      this.renderGameState();
    }
  }

  /**
   * When truco is rejected, start a new hand.
   */
  private handleTrucoRejected(): void {
    if (!this.gameRunning) return;
    const scores = this.gameEngine.getScores();
    if (scores.team0 >= 30 || scores.team1 >= 30) {
      this.renderGameState();
      return;
    }
    this.gameEngine['startNewHand']();
    this.renderGameState();
  }

  // ---- Render ----

  private renderGameState(): void {
    const scores = this.gameEngine.getScores();
    const state = this.gameEngine.getState();
    const isGameOver = state.gameOver;
    const gameOverWinner = isGameOver ? (state.partidaHistory.winningTeam >= 0 ? state.partidaHistory.winningTeam : (scores.team0 >= 30 ? 0 : 1)) : null;
    const isHandOver = state.phase === 'round-resolving' || state.phase === 'round-over' || state.phase === 'game-over';
    const roundResults = this.gameEngine.getRoundResults();

    // Determine hand winner from round results
    let handWinnerTeam = -1;
    if (isHandOver) {
      const t0 = roundResults.filter(r => r.teamWinner === 0).length;
      const t1 = roundResults.filter(r => r.teamWinner === 1).length;
      if (t0 > t1) handWinnerTeam = 0;
      else if (t1 > t0) handWinnerTeam = 1;
      // If tied, first trick winner (or mano) wins
      else if (roundResults.length > 0) {
        const firstNonTie = roundResults.find(r => r.teamWinner !== -1);
        handWinnerTeam = firstNonTie ? firstNonTie.teamWinner : 0;
      }
    }

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
      scores,
      envido: this.gameEngine.getEnvidoState(),
      truco: this.gameEngine.getTrucoState(),
      roundResults,
      isPicaPica: this.gameEngine.getIsPicaPica(),
      picaPicaSubmano: this.gameEngine.getPicaPicaSubmano(),
      picapicaResults: this.gameEngine.getPicapicaResults(),
      firstHandCompleted: this.gameEngine.isFirstHandCompleted(),
      isSecondHand: this.gameEngine.getIsSecondHand(),
      handWinnerTeam,
      isGameOver,
      gameOverWinner,
      gameOverScores: scores,
      piePlayerId: this.getHumanPiePlayerId(),
      partidaHistory: this.gameEngine.getPartidaHistory(),
    });
  }
}