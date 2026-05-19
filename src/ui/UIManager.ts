// UIManager.ts — Truco UI renderer (corrected player positioning + card sizing)

import type {
  CardDef, PlayerConfig, PlayedCard, RoundResult,
  PicaPicaSubmanoResult, EnvidoState, TrucoState
} from '../types.js';

interface UICallbacks {
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

interface RenderParams {
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
  piePlayerId: string;
}

export class UIManager {
  private container: HTMLElement;
  private callbacks: UICallbacks;
  private boardRendered: boolean = false;
  private lastPlayerCount: number = 0;

  constructor(containerId: string, callbacks: UICallbacks) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`#${containerId} not found`);
    this.container = el;
    this.callbacks = callbacks;

    // Expose callbacks for inline onclick handlers
    (window as any)._uiCallbacks = callbacks;
  }

  renderGame(params: RenderParams): void {
    const playerCount = params.players.length;

    if (playerCount === 0) {
      this.boardRendered = false;
      this.lastPlayerCount = 0;
      this.renderMenu();
      return;
    }

    if (!this.boardRendered || this.lastPlayerCount !== playerCount) {
      this.container.innerHTML = '';
      this.renderGameBoard(playerCount);
      this.boardRendered = true;
      this.lastPlayerCount = playerCount;
    }

    this.updateScoreboard(params.scores);
    this.renderPlayers(params);
    this.renderPlayedCards(params);
    this.updateMessage(params);
    this.updateControls(params);
    this.renderRoundOverPanel(params);
  }

  // ---- Scoreboard ----

  private updateScoreboard(scores: { team0: number; team1: number }): void {
    const sb = this.container.querySelector('.scoreboard');
    if (!sb) return;
    sb.innerHTML = `
      <div class="team-score">
        <span class="team-label">EQUIPO 1</span>
        <span class="team-points">${scores.team0}</span>
      </div>
      <div class="team-score">
        <span class="team-label">EQUIPO 2</span>
        <span class="team-points">${scores.team1}</span>
      </div>
    `;
  }

  // ---- Menu ----

  private renderMenu(): void {
    const menu = document.createElement('div');
    menu.className = 'menu-container';
    menu.innerHTML = `
      <h1>🃏 Truco</h1>
      <div class="menu-options">
        <div class="menu-section">
          <label>Jugadores</label>
          <div class="count-buttons">
            <button class="count-btn active" data-count="2">2</button>
            <button class="count-btn" data-count="4">4</button>
            <button class="count-btn" data-count="6">6</button>
          </div>
        </div>
        <div class="menu-section">
          <label>Dificultad</label>
          <div class="diff-buttons">
            <button class="diff-btn" data-diff="easy">Fácil</button>
            <button class="diff-btn active" data-diff="normal">Normal</button>
            <button class="diff-btn" data-diff="hard">Difícil</button>
          </div>
        </div>
        <button class="btn-start">¡Jugar!</button>
      </div>
    `;

    menu.querySelectorAll('.count-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        menu.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        (btn as HTMLElement).dataset.selected = 'true';
      });
    });

    menu.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        menu.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    const startBtn = menu.querySelector('.btn-start');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        const countEl = menu.querySelector('.count-btn.active');
        const diffEl = menu.querySelector('.diff-btn.active');
        const count = countEl ? parseInt((countEl as HTMLElement).dataset.count || '4') : 4;
        const diff = diffEl ? ((diffEl as HTMLElement).dataset.diff || 'normal') : 'normal';
        this.callbacks.onStartGame(count, diff as 'easy' | 'normal' | 'hard');
      });
    }

    this.container.appendChild(menu);
  }

  // ---- Game Board ----

  private renderGameBoard(playerCount: number): void {
    const board = document.createElement('div');
    board.className = 'game-board';
    board.innerHTML = `
      <div class="scoreboard"></div>
      <div class="circle-seating" id="circle-seating" data-count="${playerCount}">
        <div class="opponents-area"></div>
        <div class="middle-area">
          <div class="side-player-area side-left"></div>
          <div class="table-area">
            <div class="played-cards"></div>
            <div class="message-area"></div>
          </div>
          <div class="side-player-area side-right"></div>
        </div>
        <div class="human-area"></div>
      </div>
      <div class="controls"></div>
      <div class="response-panel"></div>
    `;
    this.container.appendChild(board);
  }

  // ---- Render Players ----

  /**
   * Player positioning rules:
   * 2 players: human bottom, opponent top center
   * 4 players: human bottom, opponent top center, teammate left, opponent right
   *   (positions: 0=human bottom, 1=teammate left, 2=opponent top, 3=opponent right)
   * 6 players: human bottom-center + 2 teammates bottom-left/right,
   *   3 opponents top-left/center/right
   *   (positions: 0=human, 1=teammate left, 2=teammate right,
   *               3=opponent top-left, 4=opponent top-center, 5=opponent top-right)
   */
  private renderPlayers(params: {
    players: PlayerConfig[];
    hands: { [playerId: string]: CardDef[] };
    currentTurnPlayerId: string;
    dealerId: string;
    starterId: string;
  }): void {
    const seating = this.container.querySelector('#circle-seating') as HTMLElement;
    if (!seating) return;

    const opponentsArea = seating.querySelector('.opponents-area') as HTMLElement;
    const sideLeft = seating.querySelector('.side-left') as HTMLElement;
    const sideRight = seating.querySelector('.side-right') as HTMLElement;
    const humanArea = seating.querySelector('.human-area') as HTMLElement;

    // Clear existing players
    seating.querySelectorAll('.player-area').forEach(el => el.remove());

    const playerCount = params.players.length;

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
      badges.style.cssText = 'display:flex;gap:4px;margin-top:2px;flex-wrap:wrap;justify-content:center;';
      if (player.isAI) badges.innerHTML += '<span style="font-size:9px;padding:1px 4px;background:rgba(0,0,0,0.5);color:#aaa;border-radius:3px;">IA</span>';
      badges.innerHTML += `<span style="font-size:9px;padding:1px 4px;background:rgba(0,0,0,0.5);color:#ffd700;border-radius:3px;">Eq ${player.team + 1}</span>`;
      if (player.id === params.dealerId) badges.innerHTML += '<span style="font-size:9px;padding:1px 4px;background:rgba(255,165,0,0.3);color:#ffa500;border-radius:3px;">📦</span>';
      if (player.id === params.starterId) badges.innerHTML += '<span style="font-size:9px;padding:1px 4px;background:rgba(255,215,0,0.3);color:#ffd700;border-radius:3px;">👑</span>';
      playerEl.appendChild(badges);

      const cardsArea = playerEl.querySelector('.player-cards') as HTMLElement;
      for (let i = 0; i < hand.length; i++) {
        const cardEl = this.createCardElement(hand[i], isHuman);
        if (isHuman) {
          cardEl.classList.add('clickable');
          cardEl.style.cursor = player.id === params.currentTurnPlayerId ? 'pointer' : 'default';
          cardEl.style.opacity = player.id === params.currentTurnPlayerId ? '1' : '0.75';
          cardEl.addEventListener('click', () => {
              this.callbacks.onCardPlayed(player.id, i);
          });
        } else {
          cardEl.classList.add('card-back');
        }
        cardsArea.appendChild(cardEl);
      }

      playerEl.classList.toggle('active-turn', player.id === params.currentTurnPlayerId);

      // ── PLACEMENT LOGIC ──────────────────────────────────────────────────
      if (playerCount === 2) {
        // 0 = human bottom, 1 = opponent top
        if (isHuman) {
          humanArea.appendChild(playerEl);
        } else {
          opponentsArea.appendChild(playerEl);
        }

      } else if (playerCount === 4) {
        // Positions: 0=human(bottom), 1=teammate(left), 2=opponent(top), 3=opponent(right)
        // Teams: 0→players 0,1 | 1→players 2,3
        // player 0: human, team 0, bottom
        // player 1: AI, team 0, LEFT
        // player 2: AI, team 1, TOP (across from human)
        // player 3: AI, team 1, RIGHT
        const pos = player.position;
        if (pos === 0) {
          humanArea.appendChild(playerEl);
        } else if (pos === 1) {
          sideLeft.appendChild(playerEl);
        } else if (pos === 2) {
          opponentsArea.appendChild(playerEl);
        } else if (pos === 3) {
          sideRight.appendChild(playerEl);
        }

      } else if (playerCount === 6) {
        // Teams: team0=[0,1,2], team1=[3,4,5]
        // Positions:
        //   0 = human (bottom center)
        //   1 = teammate (bottom left) → humanArea
        //   2 = teammate (bottom right) → humanArea
        //   3 = opponent top-left → opponentsArea
        //   4 = opponent top-center → opponentsArea
        //   5 = opponent top-right → opponentsArea
        const pos = player.position;
        if (pos === 0 || pos === 1 || pos === 2) {
          humanArea.appendChild(playerEl);
        } else {
          opponentsArea.appendChild(playerEl);
        }
      }
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
          cardEl.style.opacity = player.id === params.currentTurnPlayerId ? '1' : '0.75';
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

    // Current trick cards — full opacity, clearly visible
    for (const played of params.currentTrick) {
      const playerEl = this.container.querySelector(`.player-area[data-player-id="${played.playerId}"]`);
      if (playerEl) {
        const overlay = document.createElement('div');
        overlay.className = 'played-card-overlay';
        const cardEl = this.createCardElement(played.card, true);
        cardEl.classList.add('played-small');
        overlay.appendChild(cardEl);

        const nameEl = document.createElement('div');
        nameEl.className = 'played-card-name';
        const suitNames: { [suit: string]: string } = { espada: 'Esp', basto: 'Bas', oro: 'Oro', copa: 'Cop' };
        nameEl.textContent = `${played.card.number} ${suitNames[played.card.suit]}`;
        overlay.appendChild(nameEl);

        playerEl.appendChild(overlay);
      }
    }

    // Historical cards (previous rounds) — dimmed but still readable
    for (const result of params.roundResults) {
      for (const played of result.cards) {
        const playerEl = this.container.querySelector(`.player-area[data-player-id="${played.playerId}"]`);
        if (playerEl) {
          const overlay = document.createElement('div');
          overlay.className = 'played-card-overlay played-card-historical';
          const cardEl = this.createCardElement(played.card, true);
          cardEl.classList.add('played-small');
          overlay.appendChild(cardEl);
          playerEl.appendChild(overlay);
        }
      }
    }
  }

  // ---- Update Message ----

  private updateMessage(params: {
    currentRound: number;
    firstHandCompleted: boolean;
    isSecondHand: boolean;
    isPicaPica: boolean;
    picaPicaSubmano: number;
  }): void {
    const messageArea = this.container.querySelector('.message-area');
    if (!messageArea) return;

    const handLabel = params.isSecondHand ? '2da Mano' : '1ra Mano';
    const roundLabel = params.isPicaPica
      ? `Submano ${params.picaPicaSubmano + 1}/3`
      : `Ronda ${params.currentRound + 1}/3`;

    messageArea.textContent = `${handLabel} — ${roundLabel}`;
    (messageArea as HTMLElement).style.opacity = '1';
  }

  // ---- Render Envido Panel ----

  private renderEnvidoPanel(envido: EnvidoState, players: PlayerConfig[]): void {
    const responsePanel = this.container.querySelector('.response-panel');
    if (!responsePanel) return;

    if (envido.phase === 'none') {
      (responsePanel as HTMLElement).style.display = 'none';
      responsePanel.innerHTML = '';
      return;
    }

    (responsePanel as HTMLElement).style.display = 'flex';

    const humanPlayer = players.find(p => p.isHuman);
    const humanTeam = humanPlayer ? humanPlayer.team : -1;
    const opponentCalled = envido.callerTeam !== humanTeam;

    let html = `<div class="response-label">Envido</div>`;

    if (envido.phase === 'opening') {
      html += `<div class="response-label">Equipo ${envido.callerTeam! + 1} cantó Envido</div>`;
      if (opponentCalled) {
        html += `<div class="response-buttons">
          <button class="btn-accept" onclick="window._uiCallbacks?.onEnvidoWant()">Quiero</button>
          <button class="btn-reject" onclick="window._uiCallbacks?.onEnvidoNoWant()">No quiero</button>
        </div>`;
      } else {
        html += `<div class="response-label">Esperando respuesta del equipo contrario...</div>`;
      }
    } else if (envido.phase === 'response') {
      html += `<div class="response-label">Equipo ${envido.callerTeam! + 1} subió a ${envido.level === 'real-envido' ? 'Real Envido' : 'Envido'}</div>`;
      if (opponentCalled) {
        html += `<div class="response-buttons">
          <button class="btn-falta" onclick="window._uiCallbacks?.onEnvidoRaise('real-envido')">Subir a Real Envido</button>
          <button class="btn-accept" onclick="window._uiCallbacks?.onEnvidoWant()">Quiero</button>
          <button class="btn-reject" onclick="window._uiCallbacks?.onEnvidoNoWant()">No quiero</button>
        </div>`;
      } else {
        html += `<div class="response-label">Esperando respuesta del equipo contrario...</div>`;
      }
    } else if (envido.phase === 'resolution') {
      html += `<div class="response-label">Envido resuelto: ${envido.pointsAwarded} pts</div>`;
    }

    responsePanel.innerHTML = html;
  }

  // ---- Render Truco Panel ----

  private renderTrucoPanel(truco: TrucoState, players: PlayerConfig[]): void {
    const responsePanel = this.container.querySelector('.response-panel');
    if (!responsePanel) return;

    if (truco.level === 0) return;

    (responsePanel as HTMLElement).style.display = 'flex';

    const levelNames: { [level: number]: string } = { 1: 'Truco', 2: 'Retruco', 3: 'Vale 4' };
    const levelPoints: { [level: number]: number } = { 1: 1, 2: 2, 3: 3 };

    const humanPlayer = players.find(p => p.isHuman);
    const humanTeam = humanPlayer ? humanPlayer.team : -1;
    const opponentCalled = truco.lastChallengerTeam !== humanTeam;

    let html = `<div class="response-label">${levelNames[truco.level]} — ${levelPoints[truco.level]} pts</div>`;

    if (!truco.accepted) {
      html += `<div class="response-label">Equipo ${truco.lastChallengerTeam! + 1} cantó ${levelNames[truco.level]}</div>`;
      if (opponentCalled) {
        html += `<div class="response-buttons">
          <button class="btn-accept" onclick="window._uiCallbacks?.onTrucoAccept()">Quiero</button>
          <button class="btn-reject" onclick="window._uiCallbacks?.onTrucoDecline()">No quiero</button>
          ${truco.level < 3 ? `<button class="btn-falta" onclick="window._uiCallbacks?.onTrucoRaise()">Subir a ${levelNames[truco.level + 1]}</button>` : ''}
        </div>`;
      } else {
        html += `<div class="response-label">Esperando respuesta del equipo contrario...</div>`;
      }
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

    if (params.firstHandCompleted && params.currentRound >= 3) {
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
    players: PlayerConfig[];
    piePlayerId: string;
    starterId: string;
  }): void {
    const controls = this.container.querySelector('.controls');
    if (!controls) return;

    controls.innerHTML = '';

    if (params.isGameOver) return;

    // Hide controls when showing round-over panel (all 3 tricks done)
    if (params.firstHandCompleted && params.currentRound >= 3) return;

    const humanPlayer = params.players.find(p => p.isHuman);
    if (!humanPlayer) return;

    const isHumanTurn = params.currentTurnPlayerId === humanPlayer.id;

    // Envido: ONLY in round 0, before any card played, before truco
    // Only the "pie" (last player of team in playing order) can sing envido
    // The mano (first player/right of dealer) or the pie can sing envido
    const isHumanMano = humanPlayer && humanPlayer.id === params.starterId;
    const isHumanPie = humanPlayer && humanPlayer.id === params.piePlayerId;
    const canCallEnvido = isHumanTurn
      && (isHumanMano || isHumanPie)
      && params.currentRound === 0
      && params.envido.phase === 'none'
      && params.truco.level === 0;

    if (canCallEnvido) {
      const btnEnvido = document.createElement('button');
      btnEnvido.textContent = '🎯 Envido';
      btnEnvido.addEventListener('click', () => this.callbacks.onEnvidoOpen());
      controls.appendChild(btnEnvido);
    }

    // Truco: can be called if truco not already at max and envido not pending
    const canCallTruco = params.envido.phase === 'none'
      && params.truco.level < 3
      && !params.isGameOver;

    if (canCallTruco) {
      const btnTruco = document.createElement('button');
      const trucoLabels: { [level: number]: string } = {
        0: '🔥 Truco',
        1: '🔥 Retruco',
        2: '🔥 Vale 4',
      };
      btnTruco.textContent = trucoLabels[params.truco.level] || '🔥 Truco';
      btnTruco.addEventListener('click', () => this.callbacks.onTrucoChallenge());
      controls.appendChild(btnTruco);
    }

    // Response panels (envido/truco pending from opponent)
    if (params.envido.phase !== 'none') {
      this.renderEnvidoPanel(params.envido, params.players);
    } else if (params.truco.level > 0 && !params.truco.accepted) {
      this.renderTrucoPanel(params.truco, params.players);
    } else {
      const responsePanel = this.container.querySelector('.response-panel');
      if (responsePanel) {
        (responsePanel as HTMLElement).style.display = 'none';
        responsePanel.innerHTML = '';
      }
    }
  }
}
