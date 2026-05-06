// UIManager.ts — Complete UI rendering for TrucoAI

import type {
  CardDef, PlayerConfig, PlayedCard, RoundResult,
  EnvidoState, TrucoState, PicaPicaSubmanoResult
} from '../types.js';

export interface UIManagerCallbacks {
  onCardPlayed: (playerId: string, cardIndex: number) => void;
  onNewRound: () => void;
  onNewGame: () => void;
  onStartGame: (playerCount: number, difficulty: 'easy' | 'normal' | 'hard') => void;
  onEnvidoOpen: () => void;
  onEnvidoWant: () => void;
  onEnvidoNoWant: () => void;
  onEnvidoRaise: (level: 'envido' | 'real-envido' | 'falta-envido') => void;
  onTrucoChallenge: () => void;
  onTrucoAccept: () => void;
  onTrucoDecline: () => void;
  onTrucoRaise: () => void;
}

export class UIManager {
  private container: HTMLElement;
  private callbacks: UIManagerCallbacks;

  constructor(containerId: string, callbacks: UIManagerCallbacks) {
    this.container = document.getElementById(containerId)!;
    this.callbacks = callbacks;
  }

  // ---- Render Game Table ----

  renderGame(params: {
    players: PlayerConfig[];
    hands: { [playerId: string]: CardDef[] };
    currentTrick: PlayedCard[];
    currentTrickNumber: number;
    currentRound: number;
    dealerId: string;
    starterId: string;
    currentTurnPlayerId: string;
    deckRemaining: number;
    scores: { team0: number; team1: number };
    envido: EnvidoState;
    truco: TrucoState;
    roundResults: RoundResult[];
    isPicaPica: boolean;
    picaPicaSubmano: number;
    picapicaResults: PicaPicaSubmanoResult[];
    firstHandCompleted: boolean;
    isSecondHand: boolean;
    handWinnerTeam: number;
    isGameOver: boolean;
    gameOverWinner: number | null;
    gameOverScores: { team0: number; team1: number };
  }): void {
    this.renderMenuOrGame(params);
    this.renderScores(params.scores, params.isPicaPica);
    this.renderRoundInfo(params);
    this.renderPlayedCards(params);
    this.renderDeck(params);
    this.renderEnvidoPanel(params.envido);
    this.renderTrucoPanel(params.truco);
    this.renderRoundOverPanel(params);
    this.renderGameOverPanel(params);
    this.updateControls(params);
  }

  // ---- Menu or Game ----

  private renderMenuOrGame(params: {
    players: PlayerConfig[];
    hands: { [playerId: string]: CardDef[] };
    currentTurnPlayerId: string;
    dealerId: string;
    starterId: string;
  }): void {
    const existingBoard = this.container.querySelector('.game-board');
    const existingMenu = this.container.querySelector('.menu-container');

    if (params.players.length === 0) {
      if (!existingMenu) this.renderMenu();
      return;
    }

    if (!existingBoard) {
      this.renderGameBoard(params.players.length);
    }

    const existingPlayers = this.container.querySelectorAll('.player-area');
    if (existingPlayers.length === 0) {
      this.renderPlayers(params);
    } else {
      this.updatePlayers(params);
    }
  }

  private renderMenu(): void {
    const menu = document.createElement('div');
    menu.className = 'menu-container';
    menu.innerHTML = `
      <h1>🃏 Truco AI</h1>
      <p class="subtitle">Truco Argentino con IA</p>
      <div class="player-count-select">
        <p>Jugadores:</p>
        <div class="count-buttons">
          <button class="btn-count" data-count="2">2 Jugadores</button>
          <button class="btn-count" data-count="4">4 Jugadores</button>
          <button class="btn-count" data-count="6">6 Jugadores</button>
        </div>
      </div>
      <div class="difficulty-select">
        <p>Dificultad:</p>
        <div class="difficulty-buttons">
          <button class="btn-diff" data-diff="easy">Fácil</button>
          <button class="btn-diff selected" data-diff="normal">Normal</button>
          <button class="btn-diff" data-diff="hard">Difícil</button>
        </div>
      </div>
      <button class="btn-start" style="display:none;">JUGAR</button>
    `;

    menu.querySelectorAll('.btn-count').forEach(btn => {
      btn.addEventListener('click', () => {
        menu.querySelectorAll('.btn-count').forEach(b => b.classList.remove('selected'));
        (btn as HTMLElement).classList.add('selected');
        const startBtn = menu.querySelector('.btn-start') as HTMLElement;
        if (startBtn) startBtn.style.display = 'inline-block';
      });
    });

    menu.querySelectorAll('.btn-diff').forEach(btn => {
      btn.addEventListener('click', () => {
        menu.querySelectorAll('.btn-diff').forEach(b => b.classList.remove('selected'));
        (btn as HTMLElement).classList.add('selected');
      });
    });

    const startBtn = menu.querySelector('.btn-start') as HTMLElement;
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        const countEl = menu.querySelector('.btn-count.selected');
        const diffEl = menu.querySelector('.btn-diff.selected');
        const count = countEl ? parseInt((countEl as HTMLElement).dataset.count || '4') : 4;
        const diff = diffEl ? ((diffEl as HTMLElement).dataset.diff || 'normal') : 'normal';
        this.callbacks.onStartGame(count, diff as 'easy' | 'normal' | 'hard');
      });
    }

    this.container.appendChild(menu);
  }

  private renderGameBoard(playerCount: number): void {
    const board = document.createElement('div');
    board.className = 'game-board';
    board.innerHTML = `
      <div class="scoreboard"></div>
      <div class="circle-seating" id="circle-seating" data-count="${playerCount}"></div>
      <div class="table-area">
        <div class="played-cards"></div>
        <div class="message-area"></div>
      </div>
      <div class="deck-display" style="display:none;"></div>
      <div class="controls"></div>
      <div class="response-panel"></div>
    `;
    this.container.appendChild(board);
  }

  // ---- Render Players ----

  private renderPlayers(params: {
    players: PlayerConfig[];
    hands: { [playerId: string]: CardDef[] };
    currentTurnPlayerId: string;
    dealerId: string;
    starterId: string;
  }): void {
    const seating = this.container.querySelector('#circle-seating') as HTMLElement;
    if (!seating) return;

    for (const player of params.players) {
      const hand = params.hands[player.id] || [];
      const playerEl = document.createElement('div');
      playerEl.className = 'player-area';
      playerEl.dataset.playerId = player.id;
      playerEl.dataset.position = String(player.position);

      const isHuman = player.isHuman;
      const labelClass = isHuman ? 'player-name human' : 'player-name';
      const labelName = isHuman ? 'VOS' : player.name;

      playerEl.innerHTML = `
        <div class="${labelClass}">${labelName}</div>
        <div class="player-cards" data-player-id="${player.id}"></div>
      `;

      const badges = document.createElement('div');
      badges.className = 'player-badges';
      badges.style.cssText = 'display:flex;gap:4px;margin-top:2px;flex-wrap:wrap;justify-content:center;';
      if (player.isAI) badges.innerHTML += '<span style="font-size:9px;padding:1px 4px;background:rgba(0,0,0,0.5);color:#aaa;border-radius:3px;">IA</span>';
      badges.innerHTML += `<span style="font-size:9px;padding:1px 4px;background:rgba(0,0,0,0.5);color:#ffd700;border-radius:3px;">Eq ${player.team + 1}</span>`;
      if (player.id === params.dealerId) badges.innerHTML += '<span style="font-size:9px;padding:1px 4px;background:rgba(255,165,0,0.3);color:#ffa500;border-radius:3px;">📦</span>';
      if (player.id === params.starterId) badges.innerHTML += '<span style="font-size:9px;padding:1px 4px;background:rgba(255,215,0,0.3);color:#ffd700;border-radius:3px;">👑</span>';
      playerEl.appendChild(badges);

      const cardsArea = playerEl.querySelector('.player-cards-area') as HTMLElement;
      for (let i = 0; i < hand.length; i++) {
        const cardEl = this.createCardElement(hand[i], isHuman);
        if (isHuman) {
          cardEl.classList.add('clickable');
          cardEl.style.cursor = player.id === params.currentTurnPlayerId ? 'pointer' : 'default';
          cardEl.style.opacity = player.id === params.currentTurnPlayerId ? '1' : '0.6';
          cardEl.addEventListener('click', () => {
            this.callbacks.onCardPlayed(player.id, i);
          });
        } else {
          cardEl.classList.add('card-back');
        }
        cardsArea.appendChild(cardEl);
      }

      seating.appendChild(playerEl);
    }
  }

  private updatePlayers(params: {
    players: PlayerConfig[];
    hands: { [playerId: string]: CardDef[] };
    currentTurnPlayerId: string;
    dealerId: string;
    starterId: string;
  }): void {
    const seating = this.container.querySelector('#circle-seating') as HTMLElement;
    if (!seating) return;

    for (const player of params.players) {
      const hand = params.hands[player.id] || [];
      const playerEl = seating.querySelector(`[data-player-id="${player.id}"]`) as HTMLElement;
      if (!playerEl) continue;

      playerEl.classList.toggle('active-turn', player.id === params.currentTurnPlayerId);

      const cardsArea = playerEl.querySelector('.player-cards') as HTMLElement;
      if (!cardsArea) continue;
      cardsArea.innerHTML = '';

      for (let i = 0; i < hand.length; i++) {
        const cardEl = this.createCardElement(hand[i], player.isHuman);
        if (player.isHuman) {
          cardEl.classList.add('clickable');
          cardEl.style.cursor = player.id === params.currentTurnPlayerId ? 'pointer' : 'default';
          cardEl.style.opacity = player.id === params.currentTurnPlayerId ? '1' : '0.6';
          cardEl.addEventListener('click', () => {
            this.callbacks.onCardPlayed(player.id, i);
          });
        } else {
          cardEl.classList.add('card-back');
        }
        cardsArea.appendChild(cardEl);
      }

      const badges = playerEl.querySelector('div[style*="display:flex"]');
      if (badges) {
        let html = '';
        if (player.isAI) html += '<span style="font-size:9px;padding:1px 4px;background:rgba(0,0,0,0.5);color:#aaa;border-radius:3px;">IA</span>';
        html += `<span style="font-size:9px;padding:1px 4px;background:rgba(0,0,0,0.5);color:#ffd700;border-radius:3px;">Eq ${player.team + 1}</span>`;
        if (player.id === params.dealerId) html += '<span style="font-size:9px;padding:1px 4px;background:rgba(255,165,0,0.3);color:#ffa500;border-radius:3px;">📦</span>';
        if (player.id === params.starterId) html += '<span style="font-size:9px;padding:1px 4px;background:rgba(255,215,0,0.3);color:#ffd700;border-radius:3px;">👑</span>';
        badges.innerHTML = html;
      }
    }
  }

  private createCardElement(card: CardDef, faceUp: boolean = true): HTMLElement {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';

    if (faceUp) {
      const suitEmojis: { [suit: string]: string } = {
        espada: '⚔️', basto: '🪵', oro: '🪙', copa: '🏆'
      };
      const suitNames: { [suit: string]: string } = {
        espada: 'Espada', basto: 'Basto', oro: 'Oro', copa: 'Copa'
      };
      const suitColors: { [suit: string]: string } = {
        espada: '#1a1a2e', basto: '#2d5016', oro: '#b8860b', copa: '#8b0000'
      };

      cardEl.classList.add('card-front');
      cardEl.innerHTML = `
        <div class="card-content">
          <div class="card-top-left">${card.number}</div>
          <div class="card-center-suit" style="color: ${suitColors[card.suit]}">${suitEmojis[card.suit]}</div>
          <div class="card-name">${suitNames[card.suit]}</div>
        </div>
      `;
    }

    return cardEl;
  }

  // ---- Render Played Cards ----

  private renderPlayedCards(params: {
    currentTrick: PlayedCard[];
    roundResults: RoundResult[];
    currentRound: number;
    isPicaPica: boolean;
    picaPicaSubmano: number;
  }): void {
    document.querySelectorAll('.played-card-overlay').forEach(el => el.remove());

    for (const played of params.currentTrick) {
      const playerEl = this.container.querySelector(`.player-area[data-player-id="${played.playerId}"]`);
      if (playerEl) {
        const overlay = document.createElement('div');
        overlay.className = 'played-card-overlay';
        const cardEl = this.createCardElement(played.card, true);
        cardEl.classList.add('small');
        overlay.appendChild(cardEl);

        const nameEl = document.createElement('div');
        nameEl.className = 'played-card-name';
        const suitNames: { [suit: string]: string } = { espada: 'Esp', basto: 'Bas', oro: 'Oro', copa: 'Cop' };
        nameEl.textContent = `${played.card.number} ${suitNames[played.card.suit]}`;
        overlay.appendChild(nameEl);

        playerEl.appendChild(overlay);
      }
    }

    for (const result of params.roundResults) {
      for (const played of result.cards) {
        const playerEl = this.container.querySelector(`.player-area[data-player-id="${played.playerId}"]`);
        if (playerEl) {
          const overlay = document.createElement('div');
          overlay.className = 'played-card-overlay played-card-historical';
          (overlay as HTMLElement).style.opacity = '0.5';
          const cardEl = this.createCardElement(played.card, true);
          cardEl.classList.add('small');
          overlay.appendChild(cardEl);
          playerEl.appendChild(overlay);
        }
      }
    }
  }

  // ---- Render Deck ----

  private renderDeck(params: {
    dealerId: string;
    deckRemaining: number;
    isPicaPica: boolean;
    picaPicaSubmano: number;
  }): void {
    const deckDisplay = this.container.querySelector('.deck-display');
    if (!deckDisplay) return;

    const dealerEl = this.container.querySelector(`.player-area[data-player-id="${params.dealerId}"]`);
    if (!dealerEl) return;

    (deckDisplay as HTMLElement).style.display = 'flex';

    // Position deck to the right of the dealer, vertically centered
    const board = this.container.querySelector('.game-board');
    if (!board) return;

    const dealerRect = dealerEl.getBoundingClientRect();
    const boardRect = board.getBoundingClientRect();

    // Position relative to the board
    const deckX = dealerRect.right - boardRect.left + 15;
    const deckY = dealerRect.top - boardRect.top + dealerRect.height / 2 - 35;

    (deckDisplay as HTMLElement).style.position = 'absolute';
    (deckDisplay as HTMLElement).style.left = `${deckX}px`;
    (deckDisplay as HTMLElement).style.top = `${deckY}px`;

    deckDisplay.innerHTML = `
      <div class="deck-pile">
        ${Array.from({ length: Math.min(params.deckRemaining, 3) }, (_, i) =>
          `<div class="card card-back"></div>`
        ).join('')}
      </div>
      <div class="deck-count">${params.deckRemaining} cartas</div>
      <div class="deck-label">mazo</div>
    `;
  }

  // ---- Render Scores ----

  private renderScores(scores: { team0: number; team1: number }, isPicaPica: boolean = false): void {
    const scoreboard = this.container.querySelector('.scoreboard');
    if (!scoreboard) return;

    scoreboard.innerHTML = `
      <div class="team-score">
        <span class="team-name">Equipo 1</span>
        <span class="team-points">${scores.team0}</span>
      </div>
      <div class="game-info">
        ${isPicaPica ? '<span class="truco-badge">⚡ PICA-PICA</span>' : ''}
      </div>
      <div class="team-score">
        <span class="team-name">Equipo 2</span>
        <span class="team-points">${scores.team1}</span>
      </div>
    `;
  }

  // ---- Render Round Info ----

  private renderRoundInfo(params: {
    currentRound: number;
    currentTrickNumber: number;
    starterId: string;
    isPicaPica: boolean;
    picaPicaSubmano: number;
    isSecondHand: boolean;
    firstHandCompleted: boolean;
  }): void {
    const messageArea = this.container.querySelector('.message-area');
    if (!messageArea) return;

    const handLabel = params.isSecondHand || params.firstHandCompleted ? '2da Mano' : '1ra Mano';
    const roundLabel = params.isPicaPica ? `Submano ${params.picaPicaSubmano + 1}/3` : `Ronda ${params.currentRound + 1}/3`;

    messageArea.textContent = `${handLabel} — ${roundLabel}`;
    (messageArea as HTMLElement).style.opacity = '1';
  }

  // ---- Render Envido Panel ----

  private renderEnvidoPanel(envido: EnvidoState): void {
    const responsePanel = this.container.querySelector('.response-panel');
    if (!responsePanel) return;

    if (envido.phase === 'none') {
      (responsePanel as HTMLElement).style.display = 'none';
      responsePanel.innerHTML = '';
      return;
    }

    (responsePanel as HTMLElement).style.display = 'flex';

    let html = `<div class="response-label">Envido</div>`;

    if (envido.phase === 'opening') {
      html += `<div class="response-label">Equipo ${envido.callerTeam! + 1} cantó Envido</div>`;
      html += `<div class="response-buttons">
        <button class="btn-accept" onclick="window._uiCallbacks?.onEnvidoWant()">Quiero</button>
        <button class="btn-reject" onclick="window._uiCallbacks?.onEnvidoNoWant()">No quiero</button>
      </div>`;
    } else if (envido.phase === 'response') {
      html += `<div class="response-label">Equipo ${envido.callerTeam! + 1} subió a ${envido.level === 'real-envido' ? 'Real Envido' : 'Envido'}</div>`;
      html += `<div class="response-buttons">
        <button class="btn-falta" onclick="window._uiCallbacks?.onEnvidoRaise('real-envido')">Subir a Real Envido</button>
        <button class="btn-accept" onclick="window._uiCallbacks?.onEnvidoWant()">Quiero</button>
        <button class="btn-reject" onclick="window._uiCallbacks?.onEnvidoNoWant()">No quiero</button>
      </div>`;
    } else if (envido.phase === 'resolution') {
      html += `<div class="response-label">Envido resuelto: ${envido.pointsAwarded} pts</div>`;
    }

    responsePanel.innerHTML = html;
  }

  // ---- Render Truco Panel ----

  private renderTrucoPanel(truco: TrucoState): void {
    const responsePanel = this.container.querySelector('.response-panel');
    if (!responsePanel) return;

    if (truco.level === 0) {
      return;
    }

    (responsePanel as HTMLElement).style.display = 'flex';

    const levelNames: { [level: number]: string } = { 1: 'Truco', 2: 'Retruco', 3: 'Vale 4' };
    const levelPoints: { [level: number]: number } = { 1: 1, 2: 2, 3: 3 };

    let html = `<div class="response-label">${levelNames[truco.level]} — ${levelPoints[truco.level]} pts</div>`;

    if (!truco.accepted) {
      html += `<div class="response-label">Equipo ${truco.lastChallengerTeam! + 1} cantó ${levelNames[truco.level]}</div>`;
      html += `<div class="response-buttons">
        <button class="btn-accept" onclick="window._uiCallbacks?.onTrucoAccept()">Quiero</button>
        <button class="btn-reject" onclick="window._uiCallbacks?.onTrucoDecline()">No quiero</button>
        ${truco.level < 3 ? `<button class="btn-falta" onclick="window._uiCallbacks?.onTrucoRaise()">Subir a ${levelNames[truco.level + 1]}</button>` : ''}
      </div>`;
    } else {
      html += `<div class="response-label">${levelNames[truco.level]} aceptado</div>`;
    }

    responsePanel.innerHTML = html;
  }

  // ---- Render Round Over Panel ----

  private renderRoundOverPanel(params: {
    firstHandCompleted: boolean;
    isSecondHand: boolean;
    handWinnerTeam: number;
    scores: { team0: number; team1: number };
    roundResults: RoundResult[];
    isPicaPica: boolean;
    picapicaResults: PicaPicaSubmanoResult[];
    isGameOver: boolean;
    gameOverWinner: number | null;
    gameOverScores: { team0: number; team1: number };
    currentRound: number;
  }): void {
    document.querySelectorAll('.round-over-panel, .game-over-panel').forEach(el => el.remove());

    if (params.isGameOver) {
      this.renderGameOverPanel({
        gameOverWinner: params.gameOverWinner,
        gameOverScores: params.gameOverScores
      });
      return;
    }

    // Show round over only when first hand completed and we're between hands
    if (params.firstHandCompleted && params.isSecondHand && params.currentRound === 0) {
      this.showRoundOverPanel({
        handWinnerTeam: params.handWinnerTeam,
        scores: params.scores,
        roundResults: params.roundResults,
        isPicaPica: params.isPicaPica,
        picapicaResults: params.picapicaResults
      });
    }
  }

  private showRoundOverPanel(params: {
    handWinnerTeam: number;
    scores: { team0: number; team1: number };
    roundResults: RoundResult[];
    isPicaPica: boolean;
    picapicaResults: PicaPicaSubmanoResult[];
  }): void {
    const panel = document.createElement('div');
    panel.className = 'round-over-panel';
    panel.style.display = 'flex';

    let summary = 'Mano completada';
    if (params.handWinnerTeam >= 0) {
      summary = `Equipo ${params.handWinnerTeam + 1} gana la mano`;
    }

    let resultsHtml = '';
    if (params.isPicaPica) {
      for (const sr of params.picapicaResults) {
        resultsHtml += `<div class="round-result-line">Submano ${sr.submanoNumber + 1}: ${sr.teamWinner >= 0 ? `Equipo ${sr.teamWinner + 1}` : 'Empate'}</div>`;
      }
    } else {
      for (const r of params.roundResults) {
        const winnerText = r.teamWinner >= 0 ? `Equipo ${r.teamWinner + 1}` : 'Empate';
        resultsHtml += `<div class="round-result-line">Ronda ${r.roundNumber + 1}: ${winnerText}</div>`;
      }
    }

    panel.innerHTML = `
      <div class="round-over-text">${summary}</div>
      <div class="round-over-scores">
        <span>Equipo 1: ${params.scores.team0}</span>
        <span>Equipo 2: ${params.scores.team1}</span>
      </div>
      <div class="round-over-results">${resultsHtml}</div>
      <button class="btn-new-round" onclick="window._uiCallbacks?.onNewRound()">SIGUIENTE MANO</button>
    `;

    this.container.appendChild(panel);
  }

  private renderGameOverPanel(params: {
    gameOverWinner: number | null;
    gameOverScores: { team0: number; team1: number };
  }): void {
    if (params.gameOverWinner === null) return;
    const panel = document.createElement('div');
    panel.className = 'game-over-panel';
    panel.style.display = 'flex';
    panel.innerHTML = `
      <div class="game-over-text">🏆 ¡Equipo ${params.gameOverWinner + 1} gana el juego!</div>
      <div class="round-over-scores">
        <span>Equipo 1: ${params.gameOverScores.team0}</span>
        <span>Equipo 2: ${params.gameOverScores.team1}</span>
      </div>
      <button class="btn-new-game" onclick="window._uiCallbacks?.onNewGame()">NUEVO JUEGO</button>
    `;
    this.container.appendChild(panel);
  }

  // ---- Update Controls ----

  private updateControls(params: {
    currentTurnPlayerId: string;
    currentRound: number;
    currentTrickNumber: number;
    envido: EnvidoState;
    truco: TrucoState;
    firstHandCompleted: boolean;
    isSecondHand: boolean;
    isGameOver: boolean;
  }): void {
    const controls = this.container.querySelector('.controls');
    if (!controls) return;

    controls.innerHTML = '';

    if (params.isGameOver) return;

    const isHumanTurn = params.currentRound < 3 && params.currentTrickNumber < 3;
    if (!isHumanTurn) return;

    if (params.currentTrickNumber === 0 && params.envido.phase === 'none') {
      const btnEnvido = document.createElement('button');
      btnEnvido.textContent = '🎯 Envido';
      btnEnvido.addEventListener('click', () => this.callbacks.onEnvidoOpen());
      controls.appendChild(btnEnvido);
    }

    const btnTruco = document.createElement('button');
    btnTruco.textContent = params.truco.level === 0 ? '🔥 Truco' : `Subir a ${['', 'Retruco', 'Vale 4'][params.truco.level] || ''}`;
    btnTruco.disabled = params.truco.level >= 3;
    btnTruco.addEventListener('click', () => this.callbacks.onTrucoChallenge());
    controls.appendChild(btnTruco);
  }
}
