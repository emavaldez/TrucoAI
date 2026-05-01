// UIManager - 2D card game UI for Truco (2/4/6 players)
// Handles card rendering, truco/envido response UI, and all game state display

import type { Card } from '../core/Card.js';
import type { PlayerCount, RoundState, TrucoState, EnvidoState } from '../core/GameEngine.js';

// ─── Event Callbacks ─────────────────────────────────────

interface GameCallbacks {
  onCardPlay: (cardIndex: number) => void;
  onEnvido: () => void;
  onTruco: () => void;
  onAcceptTruco: () => void;
  onRejectTruco: () => void;
  onAcceptEnvido: () => void;
  onRejectEnvido: () => void;
  onFaltaEnvido: () => void;
  onNewRound: () => void;
}

export class UIManager {
  private container: HTMLElement;
  private callbacks: GameCallbacks = {
    onCardPlay: () => {},
    onEnvido: () => {},
    onTruco: () => {},
    onAcceptTruco: () => {},
    onRejectTruco: () => {},
    onAcceptEnvido: () => {},
    onRejectEnvido: () => {},
    onFaltaEnvido: () => {},
    onNewRound: () => {},
  };

  // Track which AI players need response buttons
  private _aiResponding: Set<string> = new Set();
  private _currentResponsePlayer: string | null = null;

  constructor(containerId = 'game-container') {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container #${containerId} not found`);
    this.container = container;
  }

  // ─── Menu ──────────────────────────────────────────────

  showMenu(): void {
    this.container.innerHTML = `
      <div class="menu-container">
        <h1>TRUCO</h1>
        <p class="subtitle">Truco Argentino contra la IA</p>

        <div class="player-count-select">
          <p>Jugadores:</p>
          <div class="count-buttons">
            <button data-players="2" class="btn-count selected">2 (1v1)</button>
            <button data-players="4" class="btn-count">4 (2v2)</button>
            <button data-players="6" class="btn-count">6 (3v3)</button>
          </div>
        </div>

        <div class="difficulty-select">
          <p>Dificultad:</p>
          <div class="difficulty-buttons">
            <button data-diff="easy" class="btn-diff">Fácil</button>
            <button data-diff="normal" class="btn-diff selected">Normal</button>
            <button data-diff="hard" class="btn-diff">Difícil</button>
          </div>
        </div>

        <button id="start-btn" class="btn-start">¡JUGAR!</button>
      </div>
    `;

    // Setup selection buttons
    this.container.querySelectorAll('.btn-count').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.btn-count').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
    this.container.querySelectorAll('.btn-diff').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.btn-diff').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  // ─── Game HUD ──────────────────────────────────────────

  showHUD(playerIds: string[], playerNames: Record<string, string>, playerCount: PlayerCount): void {
    // Build opponent areas dynamically based on player count
    const myTeam = 0; // Human is always on team 0
    const teammates: string[] = [];
    const opponents: string[] = [];

    for (const pid of playerIds) {
      if (pid !== 'player-0') {
        // Determine team from index
        const idx = playerIds.indexOf(pid);
        if (idx % 2 === 0) teammates.push(pid); // same team as player-0
        else opponents.push(pid);
      }
    }

    // Build teammate card areas
    let teammateAreasHTML = '';
    for (let i = 0; i < teammates.length; i++) {
      teammateAreasHTML += `
        <div class="teammate-area" id="teammate-area-${i}" style="display:none;">
          <div class="teammate-label" id="teammate-label-${i}">Compañero</div>
          <div class="teammate-cards" id="teammate-cards-${i}"></div>
        </div>
      `;
    }

    // Build opponent card areas
    let opponentAreasHTML = '';
    for (let i = 0; i < opponents.length; i++) {
      opponentAreasHTML += `
        <div class="opponent-area" id="opponent-area-${i}" style="display:none;">
          <div class="opponent-label" id="opponent-label-${i}">Contrario</div>
          <div class="opponent-cards" id="opponent-cards-${i}"></div>
        </div>
      `;
    }

    this.container.innerHTML = `
      <div class="game-board">
        <!-- Scoreboard -->
        <div class="scoreboard">
          <div class="team-score team-0">
            <span class="team-name">Equipo 0</span>
            <span class="team-points" id="score-0">0</span>
          </div>
          <div class="game-info" id="game-info"></div>
          <div class="team-score team-1">
            <span class="team-name">Equipo 1</span>
            <span class="team-points" id="score-1">0</span>
          </div>
        </div>

        <!-- Opponent areas (top) -->
        <div class="opponents-container" id="opponents-container">
          ${opponentAreasHTML}
        </div>

        <!-- Teammate areas (between opponents and table) -->
        <div class="teammates-container" id="teammates-container">
          ${teammateAreasHTML}
        </div>

        <!-- Table / played cards area (center) -->
        <div class="table-area" id="table-area">
          <div class="played-cards" id="played-cards">
            <div class="trick-slot" id="trick-0"></div>
            <div class="trick-slot" id="trick-1"></div>
            <div class="trick-slot" id="trick-2"></div>
          </div>
          <div class="message-area" id="message-area"></div>
        </div>

        <!-- Player area (bottom) -->
        <div class="player-area" id="player-area">
          <div class="player-name" id="player-name">Vos</div>
          <div class="player-cards" id="player-cards"></div>
        </div>

        <!-- Controls (bottom) -->
        <div class="controls" id="controls">
          <button class="btn-envido" id="btn-envido">ENVIDO</button>
          <button class="btn-truco" id="btn-truco">TRUCO</button>
        </div>

        <!-- Truco response buttons (hidden by default) -->
        <div class="response-panel" id="response-panel" style="display:none;">
          <div class="response-label" id="response-label"></div>
          <div class="response-buttons">
            <button class="btn-accept" id="btn-accept">¡ACEPTO!</button>
            <button class="btn-reject" id="btn-reject">NO ACEPTO</button>
          </div>
        </div>

        <!-- Envido response buttons (hidden by default) -->
        <div class="response-panel envido-response" id="envido-response-panel" style="display:none;">
          <div class="response-label" id="envido-response-label"></div>
          <div class="response-buttons">
            <button class="btn-accept" id="btn-envido-accept">ACEPTO</button>
            <button class="btn-reject" id="btn-envido-reject">NO ACEPTO</button>
            <button class="btn-falta" id="btn-falta-envido">FALTA ENVIDO</button>
          </div>
        </div>

        <!-- Round over / new round button -->
        <div class="round-over-panel" id="round-over-panel" style="display:none;">
          <div class="round-over-text" id="round-over-text"></div>
          <button class="btn-new-round" id="btn-new-round">SIGUIENTE MANO</button>
        </div>

        <!-- Game over panel -->
        <div class="game-over-panel" id="game-over-panel" style="display:none;">
          <div class="game-over-text" id="game-over-text"></div>
          <button class="btn-new-game" id="btn-new-game">JUGAR DE NUEVO</button>
        </div>
      </div>
    `;

    // Bind button events
    const envidoBtn = document.getElementById('btn-envido');
    const trucoBtn = document.getElementById('btn-truco');
    const acceptBtn = document.getElementById('btn-accept');
    const rejectBtn = document.getElementById('btn-reject');
    const envidoAcceptBtn = document.getElementById('btn-envido-accept');
    const envidoRejectBtn = document.getElementById('btn-envido-reject');
    const faltaEnvidoBtn = document.getElementById('btn-falta-envido');
    const newRoundBtn = document.getElementById('btn-new-round');
    const newGameBtn = document.getElementById('btn-new-game');

    if (envidoBtn) envidoBtn.addEventListener('click', () => this.callbacks.onEnvido());
    if (trucoBtn) trucoBtn.addEventListener('click', () => this.callbacks.onTruco());
    if (acceptBtn) acceptBtn.addEventListener('click', () => this.callbacks.onAcceptTruco());
    if (rejectBtn) rejectBtn.addEventListener('click', () => this.callbacks.onRejectTruco());
    if (envidoAcceptBtn) envidoAcceptBtn.addEventListener('click', () => this.callbacks.onAcceptEnvido());
    if (envidoRejectBtn) envidoRejectBtn.addEventListener('click', () => this.callbacks.onRejectEnvido());
    if (faltaEnvidoBtn) faltaEnvidoBtn.addEventListener('click', () => this.callbacks.onFaltaEnvido());
    if (newRoundBtn) newRoundBtn.addEventListener('click', () => this.callbacks.onNewRound());
    if (newGameBtn) newGameBtn.addEventListener('click', () => this.callbacks.onNewRound());
  }

  // ─── Render Methods ────────────────────────────────────

  renderGame(hands: Record<string, Card[]>, scores: Record<string, number>,
             currentTurn: string, playerIds: string[], playerNames: Record<string, string>,
             playerCount: PlayerCount, visibleCards: Record<string, Card[]>,
             playedCards: Record<number, Record<string, Card | null>>,
             trucoState: TrucoState, envidoState: EnvidoState): void {

    // Hide round-over and game-over panels when playing
    const roundOver = document.getElementById('round-over-panel');
    const gameOver = document.getElementById('game-over-panel');
    if (roundOver) roundOver.style.display = 'none';
    if (gameOver) gameOver.style.display = 'none';

    // Update scores
    const s0 = document.getElementById('score-0');
    const s1 = document.getElementById('score-1');
    if (s0) s0.textContent = String(scores['0'] || 0);
    if (s1) s1.textContent = String(scores['1'] || 0);

    // Update game info (truco level, envido info)
    this.updateGameInfo(trucoState, envidoState);

    // Determine my player ID (first human player)
    const myPlayerId = playerIds[0];

    // Render opponent areas
    this.renderOpponentAreas(hands, playerIds, myPlayerId, visibleCards, playerCount, playerNames);

    // Render teammate areas
    this.renderTeammateAreas(hands, playerIds, myPlayerId, visibleCards, playerCount, playerNames);

    // Render my cards
    this.renderMyCards(hands, myPlayerId, currentTurn);

    // Render played cards
    this.renderPlayedCards(playedCards, playerIds, playerNames);

    // Update name display
    const nameEl = document.getElementById('player-name');
    if (nameEl) nameEl.textContent = playerNames[currentTurn] || currentTurn;
  }

  // ─── Opponent Areas ────────────────────────────────────

  private renderOpponentAreas(hands: Record<string, Card[]>, playerIds: string[],
                               myPlayerId: string, visibleCards: Record<string, Card[]>,
                               playerCount: PlayerCount, playerNames: Record<string, string>): void {
    const myTeam = playerIds.indexOf(myPlayerId) % 2;
    const opponentIds: string[] = [];

    for (const pid of playerIds) {
      if (pid !== myPlayerId && playerIds.indexOf(pid) % 2 !== myTeam) {
        opponentIds.push(pid);
      }
    }

    for (let i = 0; i < opponentIds.length; i++) {
      const pid = opponentIds[i];
      const area = document.getElementById(`opponent-area-${i}`);
      const label = document.getElementById(`opponent-label-${i}`);
      const cardsContainer = document.getElementById(`opponent-cards-${i}`);

      if (!area || !label || !cardsContainer) continue;

      area.style.display = 'flex';
      label.textContent = this.getPlayerDisplayName(pid, playerIds, playerNames);

      const visible = visibleCards[pid] || [];
      const hand = hands[pid] || [];

      let html = '';
      for (let j = 0; j < hand.length; j++) {
        if (j < visible.length) {
          // Visible card
          const c = visible[j];
          html += this.renderCardHTML(c, false, false);
        } else {
          // Face-down card
          html += this.renderCardBackHTML();
        }
      }
      if (hand.length === 0) {
        html += '<div class="card card-empty"></div>';
      }
      cardsContainer.innerHTML = html;
    }
  }

  // ─── Teammate Areas ────────────────────────────────────

  private renderTeammateAreas(hands: Record<string, Card[]>, playerIds: string[],
                               myPlayerId: string, visibleCards: Record<string, Card[]>,
                               playerCount: PlayerCount, playerNames: Record<string, string>): void {
    if (playerCount <= 2) {
      // Hide all teammate areas
      for (let i = 0; i < 5; i++) {
        const area = document.getElementById(`teammate-area-${i}`);
        if (area) area.style.display = 'none';
      }
      return;
    }

    const myTeam = playerIds.indexOf(myPlayerId) % 2;
    const teammateIds: string[] = [];
    for (const pid of playerIds) {
      if (pid !== myPlayerId && playerIds.indexOf(pid) % 2 === myTeam) {
        teammateIds.push(pid);
      }
    }

    for (let i = 0; i < teammateIds.length; i++) {
      const pid = teammateIds[i];
      const area = document.getElementById(`teammate-area-${i}`);
      const label = document.getElementById(`teammate-label-${i}`);
      const cardsContainer = document.getElementById(`teammate-cards-${i}`);

      if (!area || !label || !cardsContainer) continue;

      area.style.display = 'flex';
      label.textContent = this.getPlayerDisplayName(pid, playerIds, playerNames);

      const visible = visibleCards[pid] || [];
      const hand = hands[pid] || [];

      let html = '';
      for (let j = 0; j < hand.length; j++) {
        if (j < visible.length) {
          const c = visible[j];
          html += this.renderCardHTML(c, false, false);
        } else {
          html += this.renderCardBackHTML();
        }
      }
      if (hand.length === 0) {
        html += '<div class="card card-empty"></div>';
      }
      cardsContainer.innerHTML = html;
    }
  }

  // ─── My Cards ──────────────────────────────────────────

  private renderMyCards(hands: Record<string, Card[]>, playerId: string, currentTurn: string): void {
    const container = document.getElementById('player-cards');
    if (!container) return;

    const myCards = hands[playerId] || [];
    const isMyTurn = (currentTurn === playerId);

    let html = '';
    myCards.forEach((card, index) => {
      const clickable = isMyTurn ? ' clickable' : '';
      const dimmed = isMyTurn ? '' : ' dimmed';
      html += `
        <div class="card card-front${clickable}${dimmed}" data-card-index="${index}">
          <div class="card-content">
            <span class="card-top-left">${card.number} ${this.getSuitSymbol(card.suit)}</span>
            <div class="card-center-suit" style="color: ${this.getSuitColor(card.suit)};">${this.getSuitSymbol(card.suit)}</div>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;

    // Bind click handlers
    if (isMyTurn) {
      container.querySelectorAll('.card-front.clickable').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.getAttribute('data-card-index') || '-1');
          if (idx >= 0) this.callbacks.onCardPlay(idx);
        });
      });
    }
  }

  // ─── Played Cards ──────────────────────────────────────

  private renderPlayedCards(playedCards: Record<number, Record<string, Card | null>>,
                             playerIds: string[], playerNames: Record<string, string>): void {
    for (let trickIdx = 0; trickIdx < 3; trickIdx++) {
      const slot = document.getElementById(`trick-${trickIdx}`);
      if (!slot) continue;

      const trick = playedCards[trickIdx];
      if (!trick) {
        slot.innerHTML = '';
        continue;
      }

      let html = '';
      for (const pid of playerIds) {
        const card = trick[pid];
        if (card) {
          html += `
            <div class="played-card">
              <span class="played-card-name">${playerNames[pid] || pid}</span>
              <div class="card card-front small">
                <div class="card-content">
                  <span class="card-top-left">${card.number} ${this.getSuitSymbol(card.suit)}</span>
                  <div class="card-center-suit" style="color: ${this.getSuitColor(card.suit)};">${this.getSuitSymbol(card.suit)}</div>
                </div>
              </div>
            </div>
          `;
        }
      }
      slot.innerHTML = html;
    }
  }

  // ─── Game Info (Truco level, etc.) ─────────────────────

  private updateGameInfo(trucoState: TrucoState, envidoState: EnvidoState): void {
    const info = document.getElementById('game-info');
    if (!info) return;

    let html = '';

    // Truco level
    if (trucoState.level > 0) {
      const names = ['', 'TRUCO', 'RETRUCO', 'VALE 4'];
      const pts = [0, 1, 2, 4][trucoState.level];
      const phaseText = trucoState.phase === 'challenged' ? ' (pendiente)' :
                        trucoState.phase === 'accepted' ? ' ✓' : ' ✗';
      html += `<span class="truco-badge">${names[trucoState.level]} (${pts}pt)${phaseText}</span> `;
    }

    // Envido info
    if (envidoState.phase === 'resolved') {
      const pts = envidoState.team0Score > envidoState.team1Score ? 0 : 1;
      html += `<span class="envido-badge">Envido: ${envidoState.team0Score}-${envidoState.team1Score}</span>`;
    }

    info.innerHTML = html;
  }

  // ─── Truco Response UI ─────────────────────────────────

  showTrucoResponse(show: boolean, message: string = ''): void {
    const responsePanel = document.getElementById('response-panel');
    const controls = document.getElementById('controls');
    const responseLabel = document.getElementById('response-label');
    const envidoPanel = document.getElementById('envido-response-panel');
    const roundOver = document.getElementById('round-over-panel');
    const gameOver = document.getElementById('game-over-panel');

    // Hide all response panels first
    if (responsePanel) responsePanel.style.display = 'none';
    if (envidoPanel) envidoPanel.style.display = 'none';
    if (roundOver) roundOver.style.display = 'none';
    if (gameOver) gameOver.style.display = 'none';

    if (show) {
      if (responsePanel) {
        responsePanel.style.display = 'flex';
        if (responseLabel) responseLabel.textContent = message;
      }
      if (controls) controls.style.display = 'none';
    } else {
      if (controls) controls.style.display = 'flex';
    }
  }

  showEnvidoResponse(show: boolean, message: string = '', hasFalta: boolean = false): void {
    const responsePanel = document.getElementById('response-panel');
    const envidoPanel = document.getElementById('envido-response-panel');
    const controls = document.getElementById('controls');
    const envidoLabel = document.getElementById('envido-response-label');
    const faltaBtn = document.getElementById('btn-falta-envido');

    if (responsePanel) responsePanel.style.display = 'none';
    if (envidoPanel) envidoPanel.style.display = 'none';
    if (controls) controls.style.display = 'flex';

    if (show && envidoPanel) {
      envidoPanel.style.display = 'flex';
      if (envidoLabel) envidoLabel.textContent = message;
      if (faltaBtn) faltaBtn.style.display = hasFalta ? 'inline-block' : 'none';
    }
  }

  // ─── Round Over / Game Over ────────────────────────────

  showRoundOver(text: string): void {
    const panel = document.getElementById('round-over-panel');
    const textEl = document.getElementById('round-over-text');
    const controls = document.getElementById('controls');
    const responsePanel = document.getElementById('response-panel');
    const envidoPanel = document.getElementById('envido-response-panel');

    if (responsePanel) responsePanel.style.display = 'none';
    if (envidoPanel) envidoPanel.style.display = 'none';
    if (controls) controls.style.display = 'none';

    if (panel) panel.style.display = 'flex';
    if (textEl) textEl.textContent = text;
  }

  showGameOver(text: string): void {
    const panel = document.getElementById('game-over-panel');
    const textEl = document.getElementById('game-over-text');
    const controls = document.getElementById('controls');
    const responsePanel = document.getElementById('response-panel');
    const envidoPanel = document.getElementById('envido-response-panel');
    const roundOver = document.getElementById('round-over-panel');

    if (responsePanel) responsePanel.style.display = 'none';
    if (envidoPanel) envidoPanel.style.display = 'none';
    if (controls) controls.style.display = 'none';
    if (roundOver) roundOver.style.display = 'none';

    if (panel) panel.style.display = 'flex';
    if (textEl) textEl.textContent = text;
  }

  // ─── Message ───────────────────────────────────────────

  showMessage(text: string, duration = 2000): void {
    let msgArea = document.getElementById('message-area');
    if (!msgArea) {
      msgArea = document.createElement('div');
      msgArea.id = 'message-area';
      msgArea.className = 'message-area';
      const tableArea = document.getElementById('table-area');
      if (tableArea) tableArea.appendChild(msgArea);
    }
    msgArea.textContent = text;
    msgArea.style.opacity = '1';

    setTimeout(() => {
      if (msgArea) msgArea.style.opacity = '0';
    }, duration);
  }

  // ─── Score Update ──────────────────────────────────────

  updateScores(scores: Record<string, number>): void {
    const s0 = document.getElementById('score-0');
    const s1 = document.getElementById('score-1');
    if (s0) s0.textContent = String(scores['0'] || 0);
    if (s1) s1.textContent = String(scores['1'] || 0);
  }

  // ─── Card Rendering Helpers ────────────────────────────

  private renderCardHTML(card: Card, _small: boolean, _clickable: boolean): string {
    const suitSymbol = this.getSuitSymbol(card.suit);
    const suitColor = this.getSuitColor(card.suit);
    return `
      <div class="card card-front">
        <div class="card-content">
          <span class="card-top-left">${card.number} ${suitSymbol}</span>
          <div class="card-center-suit" style="color: ${suitColor};">${suitSymbol}</div>
        </div>
      </div>
    `;
  }

  private renderCardBackHTML(): string {
    return '<div class="card card-back"></div>';
  }

  private getSuitSymbol(suit: string): string {
    switch (suit) {
      case 'espada': return '⚔';
      case 'basto': return '🌿';
      case 'oro': return '☀';
      case 'copa': return '🏆';
      default: return '?';
    }
  }

  private getSuitColor(suit: string): string {
    switch (suit) {
      case 'espada': return '#2c3e50';
      case 'basto': return '#2d5016';
      case 'oro': return '#b8860b';
      case 'copa': return '#1a3a5c';
      default: return '#333';
    }
  }

  private getPlayerDisplayName(pid: string, playerIds: string[], names: Record<string, string>): string {
    return names[pid] || pid;
  }

  // ─── Event Bindings ────────────────────────────────────

  setCallbacks(cb: Partial<GameCallbacks>): void {
    Object.assign(this.callbacks, cb);
  }
}
