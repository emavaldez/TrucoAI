// UIManager - 2D card game UI for Truco

import type { Card } from '../core/Card.js';

interface CardDisplay {
  card: Card;
  index: number;
  playerId: string;
}

export class UIManager {
  private container: HTMLElement;
  private onCardPlay?: (cardIndex: number) => void;
  private onEnvido?: () => void;
  private onTruco?: () => void;
  private onAcceptTruco?: () => void;
  private onRejectTruco?: () => void;
  private currentPlayerId?: string;

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
        <p class="subtitle">Un desafío de cartas contra una IA estratégica.</p>

        <div class="mode-select">
          <p>Seleccioná el modo de juego:</p>
          <div class="mode-buttons">
            <button data-mode="solo" class="btn-mode selected">Solo (vs IA)</button>
            <button data-mode="multiplayer" class="btn-mode">Multijugador (Online)</button>
          </div>
        </div>

        <div class="player-count-select">
          <p>Cantidad de jugadores:</p>
          <div class="count-buttons">
            <button data-players="2" class="btn-count selected">2</button>
            <button data-players="4" class="btn-count">4</button>
          </div>
        </div>

        <div class="difficulty-select">
          <p>Dificultad de la IA:</p>
          <div class="difficulty-buttons">
            <button data-diff="easy" class="btn-diff">Fácil</button>
            <button data-diff="normal" class="btn-diff selected">Normal</button>
            <button data-diff="hard" class="btn-diff">Difícil</button>
          </div>
        </div>

        <button id="start-btn" class="btn-start">¡JUGAR!</button>
      </div>
    `;

    // Setup button selection
    this.container.querySelectorAll('.btn-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
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

  showHUD(playerIds: string[], playerNames: Record<string, string>, playerCount: 2 | 4): void {
    this.container.innerHTML = `
      <div class="game-board">
        <!-- Scoreboard -->
        <div class="scoreboard">
          <div class="team-score team-0">
            <span class="team-name">Equipo 0</span>
            <span class="team-points" id="score-0">0</span>
          </div>
          <div class="truce-level" id="truce-level"></div>
          <div class="team-score team-1">
            <span class="team-name">Equipo 1</span>
            <span class="team-points" id="score-1">0</span>
          </div>
        </div>

        <!-- Opponent area (top) -->
        <div class="opponent-area" id="opponent-area">
          <div class="opponent-cards" id="opponent-cards"></div>
        </div>

        <!-- Teammate area (for 4-player) -->
        <div class="teammate-area" id="teammate-area">
          <div class="teammate-cards" id="teammate-cards"></div>
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
        <div class="truco-response" id="truco-response" style="display:none;">
          <button class="btn-accept" id="btn-accept">¡ACEPTO!</button>
          <button class="btn-reject" id="btn-reject">NO ACEPTO</button>
        </div>
      </div>
    `;

    // Bind button events
    const envidoBtn = document.getElementById('btn-envido');
    const trucoBtn = document.getElementById('btn-truco');
    if (envidoBtn) envidoBtn.addEventListener('click', () => this.onEnvido?.());
    if (trucoBtn) trucoBtn.addEventListener('click', () => this.onTruco?.());

    const acceptBtn = document.getElementById('btn-accept');
    const rejectBtn = document.getElementById('btn-reject');
    if (acceptBtn) acceptBtn.addEventListener('click', () => this.onAcceptTruco?.());
    if (rejectBtn) rejectBtn.addEventListener('click', () => this.onRejectTruco?.());
  }

  // ─── Render Methods ────────────────────────────────────

  /**
   * Render all player hands and table state
   */
  renderGame(hands: Record<string, Card[]>, scores: Record<string, number>,
             currentTurn: string, playerIds: string[], playerNames: Record<string, string>,
             playerCount: 2 | 4, visibleCards: Record<string, Card[]>,
             playedCards: Record<number, Record<string, Card | null>>,
             trucoLevel: number): void {

    // Update scores
    document.getElementById('score-0')!.textContent = String(scores['0'] || 0);
    document.getElementById('score-1')!.textContent = String(scores['1'] || 0);

    // Update truco level display
    const truceEl = document.getElementById('truce-level');
    if (truceEl) {
      if (trucoLevel === 0) {
        truceEl.textContent = '';
      } else if (trucoLevel === 1) {
        truceEl.textContent = 'TRUCO';
      } else if (trucoLevel === 2) {
        truceEl.textContent = 'RETRUCO';
      } else if (trucoLevel === 3) {
        truceEl.textContent = 'VALE 4';
      }
    }

    // Determine which player is "me" (first human player)
    const myPlayerId = playerIds[0]; // For solo mode, player 0 is human
    const myTeam = -1; // Will be set by App

    // Render opponent cards (face-down)
    this.renderOpponentCards(hands, playerIds, myPlayerId, playerCount);

    // Render teammate cards (for 4-player mode, face-up for teammate)
    this.renderTeammateCards(hands, playerIds, myPlayerId, playerCount);

    // Render my cards (face-up, clickable)
    this.renderMyCards(hands, myPlayerId, currentTurn);

    // Render played cards on the table
    this.renderPlayedCards(playedCards, playerIds, playerNames, playerCount);

    // Highlight current turn
    this.highlightTurn(currentTurn, playerNames, playerCount);
  }

  private renderOpponentCards(hands: Record<string, Card[]>, playerIds: string[],
                               myPlayerId: string, playerCount: 2 | 4): void {
    const container = document.getElementById('opponent-area');
    const cardsContainer = document.getElementById('opponent-cards');
    if (!container || !cardsContainer) return;

    // Determine my team (0 or 1)
    const myTeam = playerIds.indexOf(myPlayerId) % 2;

    let opponentIds: string[] = [];
    for (const pid of playerIds) {
      if (pid !== myPlayerId && playerIds.indexOf(pid) % 2 !== myTeam) {
        opponentIds.push(pid);
      }
    }

    if (playerCount === 4) {
      // 4-player: show opponent team at top
      container.style.display = 'flex';
    } else {
      // 2-player: show opponent at top
      container.style.display = 'flex';
    }

    let html = '';
    for (const pid of opponentIds) {
      const count = (hands[pid] || []).length;
      for (let i = 0; i < count; i++) {
        html += `<div class="card card-back"></div>`;
      }
      if (count === 0) {
        html += `<div class="card card-back card-empty"></div>`;
      }
    }
    cardsContainer.innerHTML = html;
  }

  private renderTeammateCards(hands: Record<string, Card[]>, playerIds: string[],
                               myPlayerId: string, playerCount: 2 | 4): void {
    const container = document.getElementById('teammate-area');
    const cardsContainer = document.getElementById('teammate-cards');
    if (!container || !cardsContainer) return;

    if (playerCount === 2) {
      container.style.display = 'none';
      return;
    }

    // Find teammate (same team, not me)
    const myTeam = (playerIds.indexOf(myPlayerId) % 2);
    const teammateId = playerIds.find(pid => pid !== myPlayerId && playerIds.indexOf(pid) % 2 === myTeam);
    console.log('[UI] renderTeammateCards: myPlayerId=', myPlayerId, 'myTeam=', myTeam, 'teammateId=', teammateId, 'hands keys=', Object.keys(hands));
    if (!teammateId) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';
    const teammateCards = hands[teammateId] || [];
    const count = teammateCards.length;
    console.log('[UI] teammate cards count:', count, 'cards:', teammateCards);

    let html = `<div class="teammate-label">Compañero</div>`;
    for (let i = 0; i < count; i++) {
      const c = teammateCards[i];
      const suitSymbol = this.getSuitSymbol(c.suit);
      const suitColor = this.getSuitColor(c.suit);
      const cardName = this.getCardName(c);
      html += `
        <div class="card card-front">
          <div class="card-content">
            <span class="card-top-left">${c.number} ${suitSymbol}</span>
            <div class="card-center-suit" style="color: ${suitColor};">${suitSymbol}</div>
            <span class="card-name">${cardName}</span>
          </div>
        </div>
      `;
    }
    if (count === 0) {
      html += `<div class="card card-back card-empty"></div>`;
    }
    cardsContainer.innerHTML = html;
  }

  private renderMyCards(hands: Record<string, Card[]>, playerId: string, currentTurn: string): void {
    const container = document.getElementById('player-cards');
    if (!container) return;

    const myCards = hands[playerId] || [];
    const isMyTurn = (currentTurn === playerId);

    let html = '';
    myCards.forEach((card, index) => {
      const suitSymbol = this.getSuitSymbol(card.suit);
      const suitColor = this.getSuitColor(card.suit);
      const cardName = this.getCardName(card);
      const clickable = isMyTurn ? ' clickable' : '';
      const dimmed = isMyTurn ? '' : ' dimmed';

      html += `
        <div class="card card-front${clickable}${dimmed}" data-card-index="${index}" data-player-id="${playerId}">
          <div class="card-content">
            <span class="card-top-left">${card.number} ${suitSymbol}</span>
            <div class="card-center-suit" style="color: ${suitColor};">${suitSymbol}</div>
            <span class="card-name">${cardName}</span>
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
          if (idx >= 0) {
            this.onCardPlay?.(idx);
          }
        });
      });
    }
  }

  private renderPlayedCards(playedCards: Record<number, Record<string, Card | null>>,
                             playerIds: string[], playerNames: Record<string, string>,
                             playerCount: 2 | 4): void {
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
          const suitSymbol = this.getSuitSymbol(card.suit);
          const suitColor = this.getSuitColor(card.suit);
          const name = playerNames[pid] || pid;
          html += `
            <div class="played-card" title="${name}: ${card.number} de ${card.suit}">
              <span class="played-card-name">${name}</span>
              <div class="card card-front small">
                <div class="card-content">
                  <span class="card-top-left">${card.number} ${suitSymbol}</span>
                  <div class="card-center-suit" style="color: ${suitColor}; font-size: 24px;">${suitSymbol}</div>
                </div>
              </div>
            </div>
          `;
        }
      }
      slot.innerHTML = html;
    }
  }

  private highlightTurn(currentTurn: string, playerNames: Record<string, string>, playerCount: 2 | 4): void {
    const nameEl = document.getElementById('player-name');
    if (nameEl) {
      nameEl.textContent = playerNames[currentTurn] || currentTurn;
    }

    // Show/hide controls based on whose turn it is
    const controls = document.getElementById('controls');
    if (controls) {
      // For now, always show controls (App will enable/disable)
      controls.style.display = 'flex';
    }
  }

  // ─── Truco Response ────────────────────────────────────

  showTrucoResponse(show: boolean): void {
    const response = document.getElementById('truco-response');
    const controls = document.getElementById('controls');
    if (response) response.style.display = show ? 'flex' : 'none';
    if (controls) controls.style.display = show ? 'none' : 'flex';
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

  // ─── Card Helpers ──────────────────────────────────────

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

  private getCardName(card: Card): string {
    const suitNames: Record<string, string> = {
      espada: 'Espada',
      basto: 'Basto',
      oro: 'Oro',
      copa: 'Copa',
    };
    return `${card.number} de ${suitNames[card.suit] || card.suit}`;
  }

  // ─── Event Bindings ────────────────────────────────────

  setOnCardPlay(fn: (cardIndex: number) => void): void {
    this.onCardPlay = fn;
  }

  setOnEnvido(fn: () => void): void {
    this.onEnvido = fn;
  }

  setOnTruco(fn: () => void): void {
    this.onTruco = fn;
  }

  setOnAcceptTruco(fn: () => void): void {
    this.onAcceptTruco = fn;
  }

  setOnRejectTruco(fn: () => void): void {
    this.onRejectTruco = fn;
  }

  // ─── Game Over ─────────────────────────────────────────

  showGameOver(winningTeam: number): void {
    const msg = `¡Equipo ${winningTeam} gana el juego!`;
    this.showMessage(msg, 5000);
  }
}
