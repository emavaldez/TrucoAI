// Aplicación en el navegador: monta la UI, la conecta con el GameController y maneja
// entrada (clics con delegación sobre `data-act` / `data-ui`, teclado) y el escalado del lienzo.
// Sin `onclick` inline ni callbacks globales (arquitectura §8).

import { getActor } from '../engine/index.js';
import type { Action } from '../engine/index.js';
import type { Difficulty } from '../ai/policy.js';
import {
  FAST_TIMING,
  GameController,
  HUMAN_ID,
  NORMAL_TIMING,
  type ControllerSnapshot,
  type MatchSettings,
  type Timing,
} from '../app/GameController.js';
import { createTimerScheduler } from '../app/scheduler.js';
import type { UrlConfig } from '../app/urlConfig.js';
import { EventLog } from './eventLog.js';
import { CANVAS, canvasScale, chooseLayout, tooShortLandscape, type LayoutMode } from './layout.js';
import { decodeAction } from './pieces.js';
import { renderGameOver, renderHandSummary, renderMenu, renderPause, renderRotateHint } from './screens.js';
import { renderGame, responsePanelOpen } from './table.js';

const SETTINGS_KEY = 'trucoai.settings.v2';
const INPUT_LOCK_MS = 350;
const NEXT_HAND_LOCK_MS = 250;

const DEFAULT_SETTINGS: MatchSettings = { playerCount: 2, difficulty: 'normal', flor: false, picaPica: true };

function loadSettings(): MatchSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<MatchSettings>;
    return {
      playerCount: parsed.playerCount === 2 || parsed.playerCount === 4 || parsed.playerCount === 6 ? parsed.playerCount : 2,
      difficulty: parsed.difficulty === 'easy' || parsed.difficulty === 'hard' ? parsed.difficulty : 'normal',
      flor: parsed.flor === true,
      picaPica: parsed.picaPica !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: MatchSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // almacenamiento no disponible (modo privado): no pasa nada
  }
}

type Screen = 'menu' | 'game';

/** ¿Hay un resumen o fin de partida en pantalla? (ahí Escape no pausa) */
function isBlockingModal(snap: ControllerSnapshot): boolean {
  return snap.state.phase === 'HAND_OVER' || snap.state.phase === 'MATCH_OVER';
}

export class TrucoApp {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly canvas: HTMLElement;
  private readonly live: HTMLElement;
  private readonly config: UrlConfig;
  private readonly timing: Timing;
  private settings: MatchSettings;
  private screen: Screen = 'menu';
  private controller: GameController | null = null;
  private snapshot: ControllerSnapshot | null = null;
  private readonly log = new EventLog();
  private mode: LayoutMode = 'desktop';
  private paused = false;
  private autoAck: boolean;
  private lockedUntil = 0;
  /** claves `data-anim` del render anterior: solo lo que aparece por primera vez se anima */
  private seenAnim = new Set<string>();
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDialogKey = '';
  private matchSeed: number | null;

  constructor(root: HTMLElement, config: UrlConfig) {
    this.root = root;
    this.config = config;
    this.autoAck = config.autoAck;
    this.matchSeed = config.seed;
    this.timing = config.fast
      ? FAST_TIMING
      : config.aiDelay !== null
        ? { ...NORMAL_TIMING, aiDelay: [config.aiDelay, config.aiDelay] }
        : NORMAL_TIMING;
    const stored = loadSettings();
    this.settings = {
      playerCount: config.players ?? stored.playerCount,
      difficulty: config.difficulty ?? stored.difficulty,
      flor: config.flor ?? stored.flor,
      picaPica: config.picaPica ?? stored.picaPica,
    };

    root.innerHTML =
      '<div class="stage"><div class="canvas" id="truco-canvas"></div><div class="rotate-layer"></div></div>' +
      '<div class="sr-only" aria-live="polite" id="truco-live"></div>';
    this.stage = root.querySelector('.stage') as HTMLElement;
    this.canvas = root.querySelector('#truco-canvas') as HTMLElement;
    this.live = root.querySelector('#truco-live') as HTMLElement;

    root.addEventListener('click', (event) => this.onClick(event));
    root.addEventListener('change', (event) => this.onChange(event));
    window.addEventListener('keydown', (event) => this.onKey(event));
    window.addEventListener('resize', () => this.fit());
    this.fit();

    if (config.test) this.exposeTestHooks();
    if (config.autostart) this.startMatch();
    else this.render();
  }

  // ---------- escalado ----------

  private fit(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const mode = chooseLayout(w, h);
    const changed = mode !== this.mode;
    this.mode = mode;
    const size = CANVAS[mode];
    const scale = canvasScale(mode, w, h);
    this.canvas.style.width = `${size.w}px`;
    this.canvas.style.height = `${size.h}px`;
    this.canvas.style.transform = `translate(-50%, -50%) scale(${scale})`;
    this.canvas.dataset.layout = mode;
    const rotate = this.stage.querySelector('.rotate-layer') as HTMLElement;
    rotate.innerHTML = tooShortLandscape(w, h) ? renderRotateHint() : '';
    if (changed) this.render();
  }

  // ---------- partida ----------

  private startMatch(): void {
    saveSettings(this.settings);
    this.paused = false;
    this.log.reset();
    this.controller?.stop();
    const seed = this.matchSeed ?? Math.floor(Math.random() * 0x7fffffff);
    this.controller = new GameController({
      settings: this.settings,
      seed,
      scheduler: createTimerScheduler(),
      timing: this.timing,
      autoAck: this.autoAck,
    });
    this.controller.subscribe((snap) => this.onSnapshot(snap));
    this.screen = 'game';
    this.controller.start();
  }

  private onSnapshot(snap: ControllerSnapshot): void {
    this.snapshot = snap;
    const now = Date.now();
    this.log.ingest(snap.events, snap.state, now);
    if (this.log.announcement) this.live.textContent = this.log.announcement;
    this.render();
  }

  private scheduleExpiry(): void {
    if (this.expiryTimer !== null) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    const next = this.log.nextExpiry();
    if (next === null) return;
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      if (this.log.prune(Date.now())) this.render();
      else this.scheduleExpiry();
    }, Math.max(30, next - Date.now() + 20));
  }

  // ---------- render ----------

  private render(): void {
    const focusKey = this.focusKey();
    if (this.screen === 'menu' || !this.controller || !this.snapshot) {
      this.canvas.innerHTML = renderMenu(this.settings, this.mode);
      this.canvas.dataset.screen = 'menu';
      this.restoreFocus(focusKey, 'menu');
      return;
    }
    const snap = this.snapshot;
    const state = snap.state;
    const now = Date.now();
    this.log.prune(now);
    const actor = getActor(state);
    const legal = this.controller.humanLegalActions();
    let html = renderGame({
      state,
      settings: snap.settings,
      mode: this.mode,
      legal,
      actor,
      log: this.log,
      now,
    });
    let dialog = '';
    if (state.phase === 'MATCH_OVER') {
      html += renderGameOver(state, snap.settings, this.log, this.mode);
      dialog = `over-${state.version}`;
    } else if (state.phase === 'HAND_OVER' && snap.summaryVisible) {
      html += renderHandSummary(state, this.log, this.autoAck, this.mode);
      dialog = `summary-${state.hand.number}`;
    } else if (this.paused) {
      html += renderPause(this.autoAck);
      dialog = 'pause';
    } else if (responsePanelOpen({ state, actor, legal })) {
      dialog = `resp-${state.version}`;
    }
    this.canvas.innerHTML = html;
    this.canvas.dataset.screen = 'game';
    this.canvas.dataset.phase = state.phase;
    this.canvas.dataset.actor = actor ?? '';
    this.canvas.dataset.version = String(state.version);
    this.markEntrances();
    this.restoreFocus(focusKey, dialog);
    this.scheduleExpiry();
  }

  /** Anima solo lo que recién aparece (re-renderizar no repite la animación). */
  private markEntrances(): void {
    const current = new Set<string>();
    for (const el of this.canvas.querySelectorAll<HTMLElement>('[data-anim]')) {
      const key = el.dataset.anim as string;
      current.add(key);
      if (!this.seenAnim.has(key)) el.classList.add('anim-in');
    }
    this.seenAnim = current;
  }

  private focusKey(): string | null {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !this.canvas.contains(active)) return null;
    return active.dataset.act ? `act:${active.dataset.act}` : active.dataset.ui ? `ui:${active.dataset.ui}` : null;
  }

  private restoreFocus(key: string | null, dialog: string): void {
    // Al abrirse un panel nuevo, el foco va a su primer botón (AC 7 de la 0-4, accesibilidad §7).
    if (dialog && dialog !== this.lastDialogKey) {
      this.lastDialogKey = dialog;
      const dialogs = this.canvas.querySelectorAll<HTMLElement>('[role="dialog"]');
      const top = dialogs[dialogs.length - 1];
      const target = top?.querySelector<HTMLElement>('[data-autofocus]') ?? top?.querySelector<HTMLElement>('button, input');
      target?.focus({ preventScroll: true });
      return;
    }
    this.lastDialogKey = dialog;
    if (!key) return;
    const [kind, value] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const selector = kind === 'act' ? `[data-act="${CSS.escape(value)}"]` : `[data-ui="${CSS.escape(value)}"]`;
    this.canvas.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  }

  // ---------- entrada ----------

  private humanAct(action: Action): void {
    if (!this.controller) return;
    const now = Date.now();
    // Un doble clic no dispara el botón que aparece debajo [UI doble clic].
    if (now < this.lockedUntil) return;
    const result = this.controller.dispatchHuman(action);
    if (result.ok) this.lockedUntil = now + INPUT_LOCK_MS;
  }

  private onClick(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act], [data-ui]');
    if (!target || !this.root.contains(target)) return;
    if (target instanceof HTMLInputElement) return; // los checkbox van por `change`
    if (target.dataset.act !== undefined) {
      if (!this.controller || this.paused) return;
      const action = decodeAction(target.dataset.act, this.controller.humanLegalActions());
      if (action) this.humanAct(action);
      return;
    }
    const ui = target.dataset.ui ?? '';
    this.onUi(ui);
  }

  private onUi(ui: string): void {
    const [command, value] = ui.split(':');
    switch (command) {
      case 'players':
        this.settings = { ...this.settings, playerCount: Number(value) as 2 | 4 | 6 };
        this.render();
        break;
      case 'difficulty':
        this.settings = { ...this.settings, difficulty: value as Difficulty };
        this.render();
        break;
      case 'start':
        this.startMatch();
        break;
      case 'next':
        if (this.paused || Date.now() < this.lockedUntil) return;
        // Un doble toque en "Siguiente mano" no juega una carta de la mano nueva.
        this.lockedUntil = Date.now() + NEXT_HAND_LOCK_MS;
        this.controller?.continueAfterHand();
        break;
      case 'pause': {
        // El resumen de mano y el fin de partida ya son pausas: ahí no se abre el menú.
        const phase = this.snapshot?.state.phase;
        if (phase === 'MATCH_OVER' || phase === 'HAND_OVER') return;
        this.paused = true;
        this.controller?.stop();
        this.render();
        break;
      }
      case 'resume':
        this.paused = false;
        this.controller?.resume();
        this.render();
        break;
      case 'restart':
      case 'again':
        this.matchSeed = this.config.seed === null ? null : (this.matchSeed ?? 0) + 1;
        this.startMatch();
        break;
      case 'menu':
        this.paused = false;
        this.controller?.stop();
        this.controller = null;
        this.snapshot = null;
        this.screen = 'menu';
        this.render();
        break;
      default:
        break;
    }
  }

  private onChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const ui = input.dataset.ui;
    if (!ui) return;
    if (ui === 'flor') this.settings = { ...this.settings, flor: input.checked };
    else if (ui === 'picapica') this.settings = { ...this.settings, picaPica: input.checked };
    else if (ui === 'autoack') {
      this.autoAck = input.checked;
      this.controller?.setAutoAck(input.checked);
    }
    if (this.screen === 'menu') this.render();
  }

  private onKey(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const snap = this.snapshot;
    if (this.screen !== 'game' || !snap || !this.controller) {
      if (event.key === 'Enter' && this.screen === 'menu' && !(document.activeElement instanceof HTMLButtonElement)) this.startMatch();
      return;
    }
    if (event.key === 'Escape') {
      if (isBlockingModal(snap)) return;
      this.onUi(this.paused ? 'resume' : 'pause');
      return;
    }
    if (this.paused) return;
    const state = snap.state;
    if (event.key === 'Enter' && state.phase === 'HAND_OVER' && snap.summaryVisible) {
      if (document.activeElement instanceof HTMLButtonElement && document.activeElement.dataset.ui !== 'next') return;
      event.preventDefault();
      this.onUi('next');
      return;
    }
    if (getActor(state) !== HUMAN_ID) return;
    const legal = this.controller.humanLegalActions();
    const key = event.key.toLowerCase();
    let action: Action | undefined;
    if (key === 'q') action = legal.find((a) => (a.type === 'ANSWER_TRUCO' || a.type === 'ANSWER_ENVIDO' || a.type === 'ANSWER_FLOR') && a.answer === 'QUIERO');
    else if (key === 'n') action = legal.find((a) => (a.type === 'ANSWER_TRUCO' || a.type === 'ANSWER_ENVIDO' || a.type === 'ANSWER_FLOR') && a.answer === 'NO_QUIERO');
    else if (key === 'r' && state.phase === 'AWAITING_TRUCO') action = legal.find((a) => a.type === 'CALL_TRUCO');
    else if (['1', '2', '3'].includes(key)) {
      const card = state.hand.hands[HUMAN_ID][Number(key) - 1];
      action = card ? legal.find((a) => a.type === 'PLAY_CARD' && a.cardId === card.id) : undefined;
    }
    if (action) {
      event.preventDefault();
      this.humanAct(action);
    }
  }

  // ---------- hooks de test ----------

  private exposeTestHooks(): void {
    (window as unknown as { __truco: unknown }).__truco = {
      state: () => this.controller?.getState() ?? null,
      legal: () => this.controller?.humanLegalActions() ?? [],
      settings: () => ({ ...this.settings }),
      summaryVisible: () => this.snapshot?.summaryVisible ?? false,
    };
  }
}
