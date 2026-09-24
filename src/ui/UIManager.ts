// UIManager.ts — Truco UI renderer ("mesa v2" — historia 0-4)

import type {
  CardDef, PlayerConfig, PlayedCard, RoundResult,
  PicaPicaSubmanoResult, EnvidoState, TrucoState,
  HandRecord, PartidaHistory
} from '../types.js';
import { resolverBaza } from '../core/Rules.js';
import { renderCard, cardAriaLabel, type CardState } from './cardView.js';
import { renderSeat } from './seatView.js';
import { renderScore } from './scoreView.js';
import { renderTopBar, renderTrickIndicator, renderFeed, renderBubble } from './boardView.js';
import { seatPosition, tableEllipse, type Viewport } from './layout.js';
import { escapeHtml } from './escape.js';
import type { Card } from '../core/Card.js';

interface UICallbacks {
  onCardPlayed: (playerId: string, cardIndex: number) => void;
  onNewRound: () => void;
  onNewGame: () => void;
  onStartGame: (playerCount: number, difficulty: 'easy' | 'normal' | 'hard') => void;
  onEnvidoOpen: () => void;
  onEnvidoOpenType: (level: 'envido' | 'real-envido' | 'falta-envido') => void;
  onEnvidoWant: () => void;
  onEnvidoSonBuenas: () => void;
  onEnvidoNoWant: () => void;
  onEnvidoRaise: (level: 'envido' | 'real-envido' | 'falta-envido') => void;
  onTrucoChallenge: () => void;
  onTrucoAccept: () => void;
  onTrucoDecline: () => void;
  onTrucoRaise: () => void;
  onContinueAfterNotification: () => void;
  onIrseAlMazo: () => void;
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
  partidaHistory: PartidaHistory;
}

/** Breakpoint de celular (AC 10). */
const MOBILE_QUERY = '(max-width: 700px), (max-height: 560px)';

export class UIManager {
  private container: HTMLElement;
  private callbacks: UICallbacks;
  private boardRendered: boolean = false;
  private lastPlayerCount: number = 0;
  private feedLines: string[] = [];
  private lastHandKey = '';
  private isMobile: boolean;
  private onResize: (() => void) | null = null;
  private lastParams: RenderParams | null = null;
  private pendingNotification: ((value: void) => void) | null = null;
  private bubbleTimers: number[] = [];

  constructor(containerId: string, callbacks: UICallbacks) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`#${containerId} not found`);
    this.container = el;
    this.callbacks = callbacks;
    this.container.setAttribute('data-testid', 'app-root');
    this.isMobile = window.matchMedia(MOBILE_QUERY).matches;

    // Expose callbacks for inline onclick handlers
    (window as unknown as { _uiCallbacks: UICallbacks })._uiCallbacks = callbacks;

    const mq = window.matchMedia(MOBILE_QUERY);
    mq.addEventListener('change', (e) => {
      if (this.isMobile === e.matches) return;
      this.isMobile = e.matches;
      this.rerenderBoard();
    });
    this.onResize = () => this.rerenderBoard();
    window.addEventListener('resize', this.debounce(this.onResize, 200));
  }

  /** Reconstruye la mesa (cambió el viewport o el breakpoint). */
  private rerenderBoard(): void {
    if (this.lastParams && this.lastParams.players.length > 0) {
      this.boardRendered = false;
      this.renderGame(this.lastParams);
    }
  }

  private debounce(fn: () => void, ms: number): () => void {
    let t = 0;
    return () => {
      window.clearTimeout(t);
      t = window.setTimeout(fn, ms);
    };
  }

  /** `data-busy` en la raíz (contrato test-strategy §5). Lo usa App.ts. */
  setBusy(busy: boolean): void {
    this.container.setAttribute('data-busy', busy ? 'true' : 'false');
  }

  renderGame(params: RenderParams): void {
    const playerCount = params.players.length;
    this.lastParams = params;

    if (playerCount === 0) {
      this.boardRendered = false;
      this.lastPlayerCount = 0;
      this.container.setAttribute('data-phase', 'menu');
      this.renderMenu();
      return;
    }

    this.container.setAttribute(
      'data-phase',
      params.isGameOver ? 'game-over'
        : params.firstHandCompleted && params.handWinnerTeam >= 0 ? 'hand-over'
        : 'playing',
    );

    // Feed "En esta mano": se reinicia cuando cambia la mano.
    const handKey = `${params.partidaHistory.hands.length}:${params.isPicaPica ? 'pp' : ''}${params.picaPicaSubmano}`;
    if (handKey !== this.lastHandKey) {
      this.lastHandKey = handKey;
      this.feedLines = [];
    }

    if (!this.boardRendered || this.lastPlayerCount !== playerCount) {
      this.container.innerHTML = '';
      this.renderGameBoard(playerCount);
      this.boardRendered = true;
      this.lastPlayerCount = playerCount;
    }

    this.updateScoreboard(params);
    this.renderPlayers(params);
    this.updateControls(params);
    this.renderRoundOverPanel(params);
    this.updateFeed();
  }

  // ---- Scoreboard + barra superior ----

  private cantoText(params: RenderParams): string | null {
    const { truco, envido } = params;
    const levelNames: Record<number, string> = { 1: 'Truco', 2: 'Retruco', 3: 'Vale cuatro' };
    const levelPoints: Record<number, number> = { 1: 2, 2: 3, 3: 4 };
    if (truco.level > 0 && truco.accepted) {
      return `${levelNames[truco.level]} querido · vale ${levelPoints[truco.level]}`;
    }
    if (truco.level > 0) {
      return `${levelNames[truco.level]} cantado`;
    }
    if (envido.phase !== 'none' && envido.phase !== 'resolution') {
      const names: Record<string, string> = {
        envido: 'Envido', 'envido-envido': 'Envido envido',
        'real-envido': 'Real envido', 'falta-envido': 'Falta envido',
      };
      return `${names[envido.level] ?? 'Envido'} cantado`;
    }
    return null;
  }

  private updateScoreboard(params: RenderParams): void {
    const sb = this.container.querySelector('.scoreboard-slot');
    if (!sb) return;
    sb.innerHTML = renderScore({
      nos: params.scores.team0,
      ellos: params.scores.team1,
      compact: this.isMobile,
    });

    const top = this.container.querySelector('.top-bar-slot');
    if (top) {
      top.innerHTML = renderTopBar({
        handNumber: params.partidaHistory.hands.length + 1,
        cantoText: this.cantoText(params),
        deckRemaining: params.deckRemaining,
      });
    }

    const center = this.container.querySelector('.table-center');
    if (center) {
      const wonByTeam: (number | null)[] = [0, 1, 2].map((i) => {
        const r = params.roundResults[i];
        return r ? r.teamWinner : null;
      });
      let pairLabel: string | undefined;
      if (params.isPicaPica) {
        const pair = params.picapicaResults
          .find((p) => p.submanoNumber === params.picaPicaSubmano);
        if (pair && pair.cards.length > 0) {
          const names = [...new Set(pair.cards.map((c) =>
            params.players.find((p) => p.id === c.playerId)?.name ?? ''))].slice(0, 2);
          pairLabel = names.join(' contra ');
        }
      }
      center.innerHTML = renderTrickIndicator({
        wonByTeam,
        isPicaPica: params.isPicaPica,
        picaPicaSubmano: params.picaPicaSubmano + 1,
        picaPicaPairLabel: pairLabel,
      });
    }
  }

  // ---- Menu ----

  private renderMenu(): void {
    const menu = document.createElement('div');
    menu.className = 'menu-container';
    menu.setAttribute('data-testid', 'menu');
    menu.innerHTML = `
      <div class="menu-card">
        <h1 class="menu-title">Truco</h1>
        <p class="menu-sub">Argentino · Envido · Truco · Pica-Pica</p>
        <div class="menu-section">
          <span class="menu-label">Jugadores</span>
          <div class="count-buttons">
            <button class="count-btn active" data-count="2" data-testid="player-count-2" aria-pressed="true">2</button>
            <button class="count-btn" data-count="4" data-testid="player-count-4" aria-pressed="false">4</button>
            <button class="count-btn" data-count="6" data-testid="player-count-6" aria-pressed="false">6</button>
          </div>
        </div>
        <div class="menu-section">
          <span class="menu-label">Dificultad</span>
          <div class="diff-buttons">
            <button class="diff-btn" data-diff="easy" data-testid="difficulty-easy" aria-pressed="false">Fácil</button>
            <button class="diff-btn active" data-diff="normal" data-testid="difficulty-normal" aria-pressed="true">Normal</button>
            <button class="diff-btn" data-diff="hard" data-testid="difficulty-hard" aria-pressed="false">Difícil</button>
          </div>
        </div>
        <button class="btn-start" data-testid="start-game">Jugar</button>
      </div>
    `;

    const pressGroup = (selector: string) => {
      menu.querySelectorAll(selector).forEach((btn) => {
        btn.addEventListener('click', () => {
          menu.querySelectorAll(selector).forEach((b) => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
          });
          btn.classList.add('active');
          btn.setAttribute('aria-pressed', 'true');
        });
      });
    };
    pressGroup('.count-btn');
    pressGroup('.diff-btn');

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

  // ---- Notification Overlay ----

  /**
   * Show a large notification overlay that blocks game interaction.
   * Player must click "OK" to continue. Returns a Promise that resolves
   * when the player clicks OK.
   */
  showNotification(title: string, message: string, type: 'info' | 'success' | 'warning' = 'info'): Promise<void> {
    return new Promise((resolve) => {
      this.pendingNotification = resolve;

      const overlay = document.createElement('div');
      overlay.className = 'notification-overlay';

      const box = document.createElement('div');
      box.className = `paper-panel notification-panel notif--${type}`;
      box.setAttribute('role', 'alertdialog');
      box.setAttribute('aria-label', title);
      box.setAttribute('data-testid', 'toast');
      box.setAttribute('data-kind', type);
      box.innerHTML = `
        <div class="notification-title">${escapeHtml(title)}</div>
        <div class="notification-message">${escapeHtml(message)}</div>
        <button class="btn-notif-ok">OK</button>
      `;

      box.querySelector<HTMLButtonElement>('.btn-notif-ok')!.addEventListener('click', () => {
        overlay.remove();
        this.pendingNotification = null;
        this.callbacks.onContinueAfterNotification();
        resolve();
      });

      overlay.appendChild(box);
      document.body.appendChild(overlay);
      box.querySelector<HTMLButtonElement>('.btn-notif-ok')?.focus();
    });
  }

  // ---- Game Board ----

  private renderGameBoard(playerCount: number): void {
    const board = document.createElement('div');
    board.className = 'game-board';
    board.setAttribute('data-count', String(playerCount));
    board.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="felt-room">
        <div class="table-area" data-testid="table">
          <div class="table-rail"></div>
          <div class="table-felt">
            <div class="table-center"></div>
          </div>
        </div>
        <div class="seats-layer"></div>
        <div class="feed-slot"></div>
      </div>
      <div class="scoreboard-slot"></div>
      <div class="controls" data-testid="actions"></div>
      <div class="response-panel"></div>
    `;
    this.container.appendChild(board);
    this.layoutTable(board, playerCount);
  }

  /** Dimensiona la mesa y posiciona la elipse según el viewport actual. */
  private layoutTable(board: HTMLElement, playerCount: number): void {
    const vp: Viewport = { width: window.innerWidth, height: window.innerHeight };
    const mobile = this.isMobile;
    const { w: seatW, h: seatH } = this.seatBox();
    const ellipse = tableEllipse(vp, { seatWidth: seatW, seatHeight: seatH });
    board.style.setProperty('--ell-cx', `${ellipse.cx}px`);
    board.style.setProperty('--ell-cy', `${ellipse.cy}px`);
    board.style.setProperty('--ell-rx', `${ellipse.rx}px`);
    board.style.setProperty('--ell-ry', `${ellipse.ry}px`);
    const railInset = mobile ? 10 : 18;
    board.style.setProperty('--rail-inset', `${railInset}px`);
    const room = board.querySelector('.felt-room');
    if (room) {
      (room as HTMLElement).dataset.count = String(playerCount);
    }
  }

  // ---- Render Players (asientos v2 por fórmula de layout) ----

  /** Pares de submano de pica-pica (legacy: order[i] vs order[i+3], i = submano). */
  private picaPicaPairIds(params: RenderParams): string[] {
    const order = params.players.slice().sort((a, b) => a.position - b.position).map((p) => p.id);
    if (order.length !== 6) return order;
    const i = params.picaPicaSubmano;
    return [order[i], order[i + 3]];
  }

  /** ¿El asiento está afuera de la submano que se juega? (AC 3: atenuado). */
  private seatDimmed(params: RenderParams, playerId: string): boolean {
    if (!params.isPicaPica) return false;
    if (params.handWinnerTeam >= 0) return false; // la mano ya terminó: nadie atenuado
    return !this.picaPicaPairIds(params).includes(playerId);
  }

  private humanPlayer(params: RenderParams): PlayerConfig | undefined {
    return params.players.find((p) => p.isHuman);
  }

  /** Estado de una carta propia: playable si es el turno y no hay canto pendiente. */
  private handCardState(params: RenderParams, responseOpen: boolean): CardState {
    const human = this.humanPlayer(params);
    if (!human || params.currentTurnPlayerId !== human.id) return 'normal';
    if (responseOpen || (params.firstHandCompleted && params.handWinnerTeam >= 0) || params.isGameOver) {
      return 'disabled';
    }
    return 'playable';
  }

  /** Id de carta para `hand-card-{cardId}` (número + palo, único en la mano). */
  private cardId(card: CardDef): string {
    return `${card.number}-${card.suit}`;
  }

  /** Caja del asiento según breakpoint (Seat.dc.html: 200×72, compacto 118×54). */
  private seatBox(): { w: number; h: number } {
    return this.isMobile ? { w: 118, h: 54 } : { w: 200, h: 72 };
  }

  private renderPlayers(params: RenderParams): void {
    const board = this.container.querySelector('.game-board');
    const seatsLayer = this.container.querySelector('.seats-layer');
    if (!board || !seatsLayer) return;

    const vp: Viewport = { width: window.innerWidth, height: window.innerHeight };
    const { w: seatW, h: seatH } = this.seatBox();

    // Baza actual para saber quién ya jugó (sus dorsos bajan).
    const playedIds = new Set(params.currentTrick.map((c) => c.playerId));
    const human = this.humanPlayer(params);
    const responseOpen = this.responsePanelOpen(params);
    const handState = this.handCardState(params, responseOpen);
    const trickWinner = this.currentTrickWinner(params);

    seatsLayer.innerHTML = '';
    for (const player of params.players) {
      const hand = params.hands[player.id] || [];
      const isHuman = player.isHuman;
      const slot = seatPosition(player.position, params.players.length, vp, { seatWidth: seatW, seatHeight: seatH });

      const wrap = document.createElement('div');
      wrap.className = 'seat-slot' + (player.isHuman ? ' human-area' : '');
      wrap.dataset.playerId = player.id;
      wrap.dataset.position = String(player.position);
      wrap.dataset.seatAnchor = slot.y > vp.height / 2 ? 'bottom' : 'top';
      wrap.style.left = `${slot.x}px`;
      wrap.style.top = `${slot.y}px`;
      wrap.style.width = `${seatW}px`;

      const cardsLeft = isHuman ? 0 : Math.max(0, hand.length - (playedIds.has(player.id) ? 1 : 0));
      wrap.innerHTML = renderSeat({
        label: isHuman ? 'Vos' : player.name,
        team: player.team,
        cards: isHuman ? hand.length : cardsLeft,
        mano: player.id === params.starterId,
        dealer: player.id === params.dealerId,
        active: player.id === params.currentTurnPlayerId,
        dim: this.seatDimmed(params, player.id),
        compact: this.isMobile,
        you: isHuman,
        playerId: player.id,
      });

      // El driver legacy espera `.player-area.active-turn` con `.player-name`.
      const seatEl = wrap.querySelector('.seat') as HTMLElement;
      seatEl.classList.add('player-area');
      seatEl.classList.toggle('active-turn', player.id === params.currentTurnPlayerId);
      const nameEl = seatEl.querySelector('.seat-label');
      if (nameEl) nameEl.classList.add('player-name');

      if (isHuman) {
        const handEl = document.createElement('div');
        handEl.className = 'hand-row';
        handEl.setAttribute('data-testid', 'hand');
        hand.forEach((card, i) => {
          const html = renderCard(card, {
            size: this.isMobile ? 'lg' : 'xl',
            state: handState,
            label: handState === 'playable' ? cardAriaLabel(card) : undefined,
          });
          handEl.insertAdjacentHTML('beforeend', html);
          const cardEl = handEl.lastElementChild as HTMLElement;
          cardEl.classList.add('clickable');
          cardEl.setAttribute('data-testid', `hand-card-${this.cardId(card)}`);
          cardEl.setAttribute('data-card-index', String(i));
          if (handState === 'playable') {
            cardEl.addEventListener('click', () => this.callbacks.onCardPlayed(player.id, i));
          } else if (cardEl.tagName === 'BUTTON') {
            (cardEl as HTMLButtonElement).disabled = true;
          }
        });
        if (responseOpen && hand.length > 0) {
          handEl.insertAdjacentHTML('beforeend',
            '<div class="hand-lock-note">Tus cartas se liberan cuando respondas</div>');
        }
        wrap.appendChild(handEl);

        if (handState === 'disabled' && responseOpen) {
          seatEl.classList.add('hand-disabled');
        }
      }

      // Cartas jugadas de la baza actual: frente al asiento, hacia el centro.
      const playedMine = params.currentTrick.find((c) => c.playerId === player.id);
      if (playedMine) {
        const holder = document.createElement('div');
        holder.className = 'seat-played';
        holder.insertAdjacentHTML('beforeend', renderCard(playedMine.card, {
          size: this.isMobile ? 'sm' : 'md',
          state: trickWinner?.playerId === player.id ? 'winner' : 'normal',
        }));
        const pc = holder.firstElementChild as HTMLElement | null;
        if (pc) {
          pc.classList.add('played-card');
          pc.setAttribute('data-testid', `played-card-${player.id}-${params.currentTrickNumber}`);
        }
        wrap.appendChild(holder);
      }

      seatsLayer.appendChild(wrap);
    }

    // Bazas ganadas históricas de la mano: en miniatura sobre el centro del paño.
    this.renderHistoryRounds(params);
  }

  /** Carta más alta de la baza actual (usa el ranking del core, sin duplicarlo). */
  private currentTrickWinner(params: RenderParams): PlayedCard | null {
    if (params.currentTrick.length === 0) return null;
    const resolved = resolverBaza(
      params.currentTrick as unknown as Array<{ card: Card; playerId: string }>,
      (pid) => params.players.find((p) => p.id === pid)?.team ?? -1,
    );
    if (resolved.tied || !resolved.winnerPlayerId || !resolved.highestCard) return null;
    return params.currentTrick.find((c) => c.playerId === resolved.winnerPlayerId) ?? null;
  }

  /** Cartas de bazas ya resueltas en esta mano, en `xs`, pegadas al centro. */
  private renderHistoryRounds(params: RenderParams): void {
    const seatsLayer = this.container.querySelector('.seats-layer');
    if (!seatsLayer) return;
    seatsLayer.querySelectorAll('.history-round').forEach((el) => el.remove());
    for (const result of params.roundResults) {
      for (const played of result.cards) {
        const player = params.players.find((p) => p.id === played.playerId);
        if (!player) continue;
        const vp: Viewport = { width: window.innerWidth, height: window.innerHeight };
        const box = this.seatBox();
        const slot = seatPosition(player.position, params.players.length, vp,
          { seatWidth: box.w, seatHeight: box.h });
        const holder = document.createElement('div');
        holder.className = 'history-round';
        holder.style.left = `${slot.x + box.w / 2}px`;
        holder.style.top = `${slot.y}px`;
        holder.insertAdjacentHTML('beforeend', renderCard(played.card, {
          size: 'xs',
          state: result.highestCardPlayerId === played.playerId && result.teamWinner !== -1 ? 'winner' : 'normal',
          tag: 'Ganó',
        }));
        const hist = holder.firstElementChild as HTMLElement | null;
        if (hist) {
          hist.classList.add('played-card', 'played-card--history');
          hist.setAttribute('data-testid', `played-card-${played.playerId}-r${result.roundNumber}`);
        }
        seatsLayer.appendChild(holder);
      }
    }
  }

  // ---- Panel de respuesta: apertura / feed / globos ----

  /** True si hay un panel de respuesta abierto (canto pendiente del rival). */
  private responsePanelOpen(params: RenderParams): boolean {
    const humanTeam = this.humanPlayer(params)?.team ?? -1;
    if (params.envido.phase === 'opening' || params.envido.phase === 'response') {
      return params.envido.callerTeam !== humanTeam;
    }
    if (params.truco.level > 0 && !params.truco.accepted) {
      return params.truco.lastChallengerTeam !== humanTeam;
    }
    return false;
  }

  private updateFeed(): void {
    const slot = this.container.querySelector('.feed-slot');
    if (!slot || this.isMobile) {
      if (slot) slot.innerHTML = '';
      return;
    }
    slot.innerHTML = renderFeed(this.feedLines);
  }

  /** Agrega una línea al feed "En esta mano" (últimas 3 visibles, AC 8). */
  pushFeedLine(line: string): void {
    this.feedLines.push(line);
    if (this.feedLines.length > 12) this.feedLines = this.feedLines.slice(-12);
    this.updateFeed();
  }

  /** Globo de canto junto al asiento del jugador, 2,5 s (AC 8). */
  showBubble(playerId: string, text: string): void {
    const seat = this.container.querySelector<HTMLElement>(`.seat-slot[data-player-id="${CSS.escape(playerId)}"]`);
    if (!seat) return;
    seat.insertAdjacentHTML('beforeend', renderBubble(text));
    const bubble = seat.querySelector('.bubble-v2');
    if (!bubble) return;
    const t = window.setTimeout(() => bubble.remove(), 2500);
    this.bubbleTimers.push(t);
  }

  // ---- Render Envido Panel ----

  /** Abre el panel de respuesta como diálogo de papel con foco (AC 7). */
  private openResponsePanel(html: string, kind: 'truco' | 'envido'): void {
    const responsePanel = this.container.querySelector<HTMLElement>('.response-panel');
    if (!responsePanel) return;
    const wasHidden = responsePanel.style.display !== 'flex';
    responsePanel.style.display = 'flex';
    responsePanel.setAttribute('role', 'dialog');
    responsePanel.setAttribute('aria-modal', 'false');
    responsePanel.setAttribute('data-kind', kind);
    responsePanel.setAttribute('data-testid', 'response-panel');
    responsePanel.innerHTML = html;
    if (wasHidden) {
      responsePanel.querySelector<HTMLElement>('button')?.focus();
    }
  }

  private closeResponsePanel(): void {
    const responsePanel = this.container.querySelector<HTMLElement>('.response-panel');
    if (!responsePanel) return;
    responsePanel.style.display = 'none';
    responsePanel.innerHTML = '';
    responsePanel.removeAttribute('role');
    responsePanel.removeAttribute('data-kind');
  }

  private nameOfTeam(team: number | null, players: PlayerConfig[]): string {
    if (team === null) return '';
    const humanTeam = players.find((p) => p.isHuman)?.team;
    if (team === humanTeam) return 'Tu equipo';
    const rival = players.find((p) => p.team === team && !p.isHuman);
    return rival ? rival.name : 'El rival';
  }

  private renderEnvidoPanel(envido: EnvidoState, players: PlayerConfig[]): void {
    if (envido.phase === 'none') {
      this.closeResponsePanel();
      return;
    }

    const humanTeam = players.find(p => p.isHuman)?.team ?? -1;
    const opponentCalled = envido.callerTeam !== humanTeam;
    const caller = this.nameOfTeam(envido.callerTeam, players);

    let html = `<div class="response-head"><span class="response-kicker">Envido</span></div>`;

    if (envido.phase === 'opening') {
      html += `<div class="response-label">${escapeHtml(caller)} cantó Envido</div>`;
      if (opponentCalled) {
        html += `<div class="response-buttons">
          <button class="btn-accept" data-testid="response-quiero" onclick="window._uiCallbacks?.onEnvidoWant()">Quiero<em>aceptar el envido</em></button>
          <button class="btn-son-buenas" data-testid="response-envido-son-buenas" onclick="window._uiCallbacks?.onEnvidoSonBuenas()">Son buenas<em>empatar y seguir</em></button>
          <button class="btn-reject" data-testid="response-no-quiero" onclick="window._uiCallbacks?.onEnvidoNoWant()">No quiero<em>Otros ganan 1</em></button>
        </div>`;
      } else {
        html += `<div class="response-label response-waiting">Esperando respuesta del rival…</div>`;
      }
    } else if (envido.phase === 'response') {
      html += `<div class="response-label">${escapeHtml(caller)} subió a ${envido.level === 'real-envido' ? 'Real Envido' : 'Envido'}</div>`;
      if (opponentCalled) {
        html += `<div class="response-buttons">
          <button class="btn-falta" data-testid="response-raise-envido-R" onclick="window._uiCallbacks?.onEnvidoRaise('real-envido')">Subir a Real<em>+</em></button>
          <button class="btn-accept" data-testid="response-quiero" onclick="window._uiCallbacks?.onEnvidoWant()">Quiero<em>aceptar el canto</em></button>
          <button class="btn-son-buenas" data-testid="response-envido-son-buenas" onclick="window._uiCallbacks?.onEnvidoSonBuenas()">Son buenas<em>empatar y seguir</em></button>
          <button class="btn-reject" data-testid="response-no-quiero" onclick="window._uiCallbacks?.onEnvidoNoWant()">No quiero<em>Otros ganan 1</em></button>
        </div>`;
      } else {
        html += `<div class="response-label response-waiting">Esperando respuesta del rival…</div>`;
      }
    } else if (envido.phase === 'resolution') {
      html += `<div class="response-label">Envido resuelto: ${envido.pointsAwarded} pts</div>`;
    }

    this.openResponsePanel(html, 'envido');
  }

  // ---- Render Truco Panel ----

  private renderTrucoPanel(truco: TrucoState, players: PlayerConfig[]): void {
    if (truco.level === 0) return;

    const levelNames: { [level: number]: string } = { 1: 'Truco', 2: 'Retruco', 3: 'Vale cuatro' };
    const levelPoints: { [level: number]: number } = { 1: 2, 2: 3, 3: 4 };

    const humanTeam = players.find(p => p.isHuman)?.team ?? -1;
    const opponentCalled = truco.lastChallengerTeam !== humanTeam;
    const caller = this.nameOfTeam(truco.lastChallengerTeam, players);

    let html = `<div class="response-head"><span class="response-kicker">${levelNames[truco.level]} · vale ${levelPoints[truco.level]}</span></div>`;

    if (!truco.accepted) {
      html += `<div class="response-label">${escapeHtml(caller)} cantó ${levelNames[truco.level]}</div>`;
      if (opponentCalled) {
        html += `<div class="response-buttons">
          <button class="btn-accept" data-testid="response-quiero" onclick="window._uiCallbacks?.onTrucoAccept()">Quiero<em>jugar por ${levelPoints[truco.level]}</em></button>
          <button class="btn-reject" data-testid="response-no-quiero" onclick="window._uiCallbacks?.onTrucoDecline()">No quiero<em>Otros ganan ${levelPoints[truco.level] - 1}</em></button>
          ${truco.level < 3 ? `<button class="btn-falta" data-testid="response-raise-truco" onclick="window._uiCallbacks?.onTrucoRaise()">Subir a ${levelNames[truco.level + 1]}<em>+</em></button>` : ''}
        </div>`;
      } else {
        html += `<div class="response-label response-waiting">Esperando respuesta del rival…</div>`;
      }
    } else {
      html += `<div class="response-label">${levelNames[truco.level]} aceptado</div>`;
    }

    this.openResponsePanel(html, 'truco');
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
    partidaHistory: PartidaHistory;
    players: PlayerConfig[];
  }): void {
    document.querySelectorAll('.round-over-panel, .game-over-panel').forEach(el => el.remove());

    if (params.isGameOver) {
      this.renderGameOverPanel({
        gameOverWinner: params.gameOverWinner,
        gameOverScores: params.gameOverScores,
        partidaHistory: params.partidaHistory,
        players: params.players
      });
      return;
    }

    // Show round-over panel if hand is resolved (regardless of currentRound)
    if (params.firstHandCompleted && params.handWinnerTeam >= 0) {
      this.showRoundOverPanel({
        handWinnerTeam: params.handWinnerTeam,
        scores: params.scores,
        roundResults: params.roundResults,
        isPicaPica: params.isPicaPica,
        picapicaResults: params.picapicaResults,
        players: params.players
      });
    }
  }

  private showRoundOverPanel(params: {
    handWinnerTeam: number;
    scores: { team0: number; team1: number };
    roundResults: RoundResult[];
    isPicaPica: boolean;
    picapicaResults: PicaPicaSubmanoResult[];
    players: PlayerConfig[];
  }): void {
    const panel = document.createElement('div');
    panel.className = 'round-over-panel paper-panel';
    panel.style.display = 'flex';
    panel.setAttribute('data-testid', 'hand-summary');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Resumen de la mano');

    const won = params.handWinnerTeam === (params.players.find((p) => p.isHuman)?.team ?? 0);
    const summary = params.handWinnerTeam >= 0
      ? (won ? 'Ganaste esta mano' : 'Ganó el rival')
      : 'Mano completada';

    const rounds = params.roundResults.map((r) => {
      const label = r.teamWinner === -1 ? 'Parda' : r.teamWinner === 0 ? 'Nosotros' : 'Ellos';
      return `<span class="round-chip round-chip--t${r.teamWinner}">${label}</span>`;
    }).join('');

    panel.innerHTML = `
      <div class="paper-kicker">Resumen de mano</div>
      <div class="round-over-text">${escapeHtml(summary)}</div>
      <div class="round-chips">${rounds}</div>
      <div class="round-over-scores">
        <span>Nosotros <b>${params.scores.team0}</b></span>
        <span>Ellos <b>${params.scores.team1}</b></span>
      </div>
      <button class="btn-new-round" data-testid="next-hand" onclick="window._uiCallbacks?.onNewRound()">Siguiente mano</button>
    `;

    this.container.appendChild(panel);
  }

  private renderGameOverPanel(params: {
    gameOverWinner: number | null;
    gameOverScores: { team0: number; team1: number };
    partidaHistory: PartidaHistory;
    players: PlayerConfig[];
  }): void {
    if (params.gameOverWinner === null) return;
    const history = params.partidaHistory;
    const humanTeam = params.players.find((p) => p.isHuman)?.team ?? 0;
    const won = params.gameOverWinner === humanTeam;
    const totalHands = history.hands.length;

    let handSummaryHtml = '<div class="hand-history" data-testid="game-over-history">';
    for (let i = 0; i < totalHands; i++) {
      const h = history.hands[i];
      const winnerLabel = h.handWinnerTeam >= 0
        ? (h.handWinnerTeam === humanTeam ? 'Nosotros' : 'Ellos')
        : 'Empate';
      handSummaryHtml += `
        <div class="hand-entry">
          <span>Mano ${i + 1}: ${winnerLabel} (${h.pointsAwarded} pts)</span>
          <span class="hand-entry-score">${h.team0Score} – ${h.team1Score}</span>
        </div>`;
    }
    handSummaryHtml += '</div>';

    const panel = document.createElement('div');
    panel.className = 'game-over-panel paper-panel';
    panel.style.display = 'flex';
    panel.setAttribute('data-testid', 'game-over');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Fin de la partida');
    panel.innerHTML = `
      <div class="paper-kicker">Fin de la partida</div>
      <div class="game-over-text" data-testid="game-over-winner">${won ? '¡Ganaste la partida!' : 'Ganó el rival'}</div>
      <div class="round-over-scores">
        <span>Nosotros <b>${params.gameOverScores.team0}</b></span>
        <span>Ellos <b>${params.gameOverScores.team1}</b></span>
      </div>
      <div class="hand-history-header">Historial de la partida</div>
      ${handSummaryHtml}
      <div class="match-meta">
        <span>${totalHands} manos jugadas</span>
        <span>· Iniciado ${escapeHtml(new Date(history.startedAt).toLocaleTimeString())}</span>
      </div>
      <button class="btn-new-game" data-testid="new-game" onclick="window._uiCallbacks?.onNewGame()">Nuevo juego</button>
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
    handWinnerTeam: number;
    players: PlayerConfig[];
    piePlayerId: string;
    starterId: string;
    dealerId: string;
  }): void {
    const controls = this.container.querySelector('.controls');
    if (!controls) return;

    controls.innerHTML = '';

    // Hide controls when showing round-over panel (hand is resolved)
    if (params.firstHandCompleted && params.handWinnerTeam >= 0) return;
    if (params.isGameOver) return;

    const humanPlayer = params.players.find(p => p.isHuman);
    if (!humanPlayer) return;

    const isHumanTurn = params.currentTurnPlayerId === humanPlayer.id;

    // Envido: ANY player can call envido in round 0 before playing
    // Also available when truco is pending ("envido va primero")
    const showEnvido = params.currentRound === 0
      && params.envido.phase === 'none'
      && params.envido.pointsAwarded === 0
      && (isHumanTurn || (params.truco.level > 0 && !params.truco.accepted));

    if (showEnvido) {
      const envidoGroup = document.createElement('div');
      envidoGroup.className = 'envido-group';
      const mk = (text: string, sub: string, testid: string, cls: string, onClick: () => void) => {
        const b = document.createElement('button');
        b.className = `action-btn ${cls}`;
        b.setAttribute('data-testid', testid);
        b.innerHTML = `${escapeHtml(text)}<em>${escapeHtml(sub)}</em>`;
        b.addEventListener('click', onClick);
        return b;
      };
      envidoGroup.appendChild(mk('Envido', '2 pts', 'action-envido', 'btn-envido', () => this.callbacks.onEnvidoOpen()));
      envidoGroup.appendChild(mk('Real Envido', '3 pts', 'action-real-envido', 'btn-real', () => this.callbacks.onEnvidoOpenType('real-envido')));
      envidoGroup.appendChild(mk('Falta Envido', 'a falta', 'action-falta-envido', 'btn-falta-envido', () => this.callbacks.onEnvidoOpenType('falta-envido')));
      controls.appendChild(envidoGroup);
    }

    // Truco button: show when it's human's turn and no envido pending
    // If truco was accepted, the ACCEPTING team can raise (not the challenger)
    // If no truco active, anyone can call Truco
    const humanCanRaiseTruco = params.truco.level > 0
      && params.truco.accepted
      && params.truco.lastChallengerTeam !== humanPlayer?.team
      && params.truco.level < 3;
    const humanCanCallTruco = params.truco.level === 0;
    const showTrucoBtn = isHumanTurn
      && params.envido.phase === 'none'
      && !params.isGameOver
      && (humanCanRaiseTruco || humanCanCallTruco);

    if (showTrucoBtn) {
      const btnTruco = document.createElement('button');
      btnTruco.className = 'action-btn btn-truco-primary';
      btnTruco.setAttribute('data-testid', 'action-truco');
      // If we get here with level > 0, it means opponent challenged and we can raise
      if (params.truco.level > 0) {
        const levelNames: { [level: number]: string } = { 1: 'Retruco', 2: 'Vale cuatro' };
        const nextPts: { [level: number]: number } = { 1: 3, 2: 4 };
        btnTruco.innerHTML = `Subir a ${escapeHtml(levelNames[params.truco.level] || 'Truco')}<em>vale ${nextPts[params.truco.level] ?? ''}</em>`;
        btnTruco.addEventListener('click', () => this.callbacks.onTrucoRaise());
      } else {
        btnTruco.innerHTML = 'Truco<em>2 pts</em>';
        btnTruco.addEventListener('click', () => this.callbacks.onTrucoChallenge());
      }
      controls.appendChild(btnTruco);
    }

    // Irse al Mazo — show when it's the human's turn (not on round 0 envido opening phase)
    const canIrseAlMazo = isHumanTurn
      && !params.isGameOver
      && !(params.firstHandCompleted && params.currentRound >= 3);

    if (canIrseAlMazo) {
      const btnMazo = document.createElement('button');
      btnMazo.className = 'action-btn btn-mazo';
      btnMazo.setAttribute('data-testid', 'action-mazo');
      btnMazo.innerHTML = 'Irse al mazo<em>otros ganan el canto</em>';
      btnMazo.addEventListener('click', () => this.callbacks.onIrseAlMazo());
      controls.appendChild(btnMazo);
    }

    // Response panels (envido/truco pending from opponent)
    if (params.envido.phase !== 'none') {
      this.renderEnvidoPanel(params.envido, params.players);
    } else if (params.truco.level > 0 && !params.truco.accepted) {
      this.renderTrucoPanel(params.truco, params.players);
    } else {
      this.closeResponsePanel();
    }
  }
}
