// UIManager - 2D card game UI for Truco (2/4/6 players)
// Circular seating layout, counter-clockwise order
// Player only sees their own cards

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
    // Build player areas for circular seating
    // Player 0 (human) is always at the bottom center
    // Other players are arranged around the circle counter-clockwise

    let playerAreasHTML = '';
    for (let i = 0; i < playerIds.length; i++) {
      const pid = playerIds[i];
      const isHuman = (pid === playerIds[0]);
      const labelClass = isHuman ? 'player-label' : 'opponent-label';
      playerAreasHTML += `
        <div class="circle-player" id="circle-player-${i}" data-player-id="${pid}" data-is-human="${isHuman}">
          <div class="${labelClass}" id="player-label-${i}">${playerNames[pid] || pid}</div>
          <div class="player-cards-area" id="player-cards-area-${i}"></div>
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

        <!-- Circular player seating -->
        <div class="circle-seating" id="circle-seating" data-count="${playerCount}">
          ${playerAreasHTML}
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
             trucoState: TrucoState, envidoState: EnvidoState,
             myPlayerId: string, canEnvido: boolean): void {

    // Hide round-over and game-over panels when playing
    const roundOver = document.getElementById('round-over-panel');
    const gameOver = document.getElementById('game-over-panel');
    const controls = document.getElementById('controls');
    if (roundOver) roundOver.style.display = 'none';
    if (gameOver) gameOver.style.display = 'none';
    if (controls) controls.style.display = 'flex';

    // Update scores
    const s0 = document.getElementById('score-0');
    const s1 = document.getElementById('score-1');
    if (s0) s0.textContent = String(scores['0'] || 0);
    if (s1) s1.textContent = String(scores['1'] || 0);

    // Update game info (truco level, envido info)
    this.updateGameInfo(trucoState, envidoState);

    // Render all player areas (circular seating)
    this.renderCirclePlayers(hands, playerIds, myPlayerId, visibleCards, playerCount, playerNames, currentTurn);

    // Render played cards
    this.renderPlayedCards(playedCards, playerIds, playerNames);

    // Enable/disable envido button based on position
    const envidoBtn = document.getElementById('btn-envido') as HTMLButtonElement | null;
    if (envidoBtn) {
      envidoBtn.disabled = !canEnvido;
      envidoBtn.style.opacity = canEnvido ? '1' : '0.4';
    }
  }

  // ─── Circular Player Rendering ─────────────────────────

  private renderCirclePlayers(hands: Record<string, Card[]>, playerIds: string[],
                               myPlayerId: string, visibleCards: Record<string, Card[]>,
                               playerCount: PlayerCount, playerNames: Record<string, string>,
                               currentTurn: string): void {
    for (let i = 0; i < playerIds.length; i++) {
      const pid = playerIds[i];
      const area = document.getElementById(`circle-player-${i}`);
      const label = document.getElementById(`player-label-${i}`);
      const cardsContainer = document.getElementById(`player-cards-area-${i}`);

      if (!area || !label || !cardsContainer) continue;

      label.textContent = playerNames[pid] || pid;

      // Highlight current turn
      area.classList.toggle('active-turn', pid === currentTurn);

      const visible = visibleCards[pid] || [];
      const hand = hands[pid] || [];

      let html = '';
      for (let j = 0; j < hand.length; j++) {
        if (j < visible.length) {
          // Visible card
          const c = visible[j];
          const isClickable = (pid === myPlayerId && currentTurn === pid);
          html += this.renderCardHTML(c, false, isClickable, j);
        } else {
          // Face-down card
          html += this.renderCardBackHTML();
        }
      }
      if (hand.length === 0) {
        html += '<div class="card card-empty"></div>';
      }
      cardsContainer.innerHTML = html;

      // Bind click handlers for my cards only
      if (pid === myPlayerId) {
        const isMyTurn = (currentTurn === pid);
        cardsContainer.querySelectorAll('.card-front.clickable').forEach(el => {
          el.addEventListener('click', () => {
            const idx = parseInt(el.getAttribute('data-card-index') || '-1');
            if (idx >= 0) this.callbacks.onCardPlay(idx);
          });
        });
      }
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

  private renderCardHTML(card: Card, _small: boolean, clickable: boolean, cardIndex?: number): string {
    const suitSymbol = this.getSuitSymbol(card.suit);
    const suitColor = this.getSuitColor(card.suit);
    const clickableClass = clickable ? ' clickable' : '';
    const indexAttr = cardIndex !== undefined ? ` data-card-index="${cardIndex}"` : '';
    return `
      <div class="card card-front${clickableClass}"${indexAttr}>
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

  // ─── Event Bindings ────────────────────────────────────

  setCallbacks(cb: Partial<GameCallbacks>): void {
    Object.assign(this.callbacks, cb);
  }
}
