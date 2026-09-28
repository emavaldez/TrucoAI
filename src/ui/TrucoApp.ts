// Aplicación en el navegador: monta la UI, la conecta con el GameController y maneja
// entrada (clics con delegación sobre `data-act` / `data-ui`, teclado) y el escalado del lienzo.
// Sin `onclick` inline ni callbacks globales (arquitectura §8).

import { getActor } from '../engine/index.js';
import type { Action } from '../engine/index.js';
import type { Difficulty } from '../ai/policy.js';
import { loadNetModels } from '../ai/rl/netPolicy.js';
import { INTENT_TEXT } from '../ai/talk/intents.js';
import { loadSemantic, semanticReady } from '../ai/talk/semantic.js';
import { interpret } from '../ai/talk/understand.js';
import type { Instruction, SignKind } from '../ai/signs.js';
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
import { escapeHtml } from './escape.js';
import { playerName } from './text.js';
import { SoundBoard } from './sound.js';
import { CANVAS, canvasScale, chooseLayout, tooShortLandscape, type LayoutMode } from './layout.js';
import { decodeAction, encodeAction } from './pieces.js';
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
      difficulty: parsed.difficulty === 'easy' || parsed.difficulty === 'hard' || parsed.difficulty === 'expert' ? parsed.difficulty : 'normal',
      flor: parsed.flor === true,
      picaPica: parsed.picaPica !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

const ADVICE_KEY = 'truco-consejos';
/** alto reservado abajo para la barra de la mesa (px de pantalla) */
const TALKBAR_H = 62;
const TALK_PLACEHOLDER = 'Hablale a la mesa: «truco», «¿tenés tanto?», «cantá», «tiro el ancho»…';
const FREE_TALK_KEY = 'truco-frases-libres';

function loadFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'on';
  } catch {
    return false;
  }
}

function saveFlag(key: string, on: boolean): void {
  try {
    window.localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    // sin almacenamiento: vale solo para esta sesión
  }
}

/** Reconocimiento de voz del navegador (Chrome: webkitSpeechRecognition). */
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

function speechRecognition(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function loadAdvice(): boolean {
  try {
    return window.localStorage.getItem(ADVICE_KEY) === 'on';
  } catch {
    return false;
  }
}

function saveAdvice(on: boolean): void {
  try {
    window.localStorage.setItem(ADVICE_KEY, on ? 'on' : 'off');
  } catch {
    // sin almacenamiento: vale solo para esta sesión
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
  private readonly sound: SoundBoard;
  private mode: LayoutMode = 'desktop';
  private paused = false;
  private autoAck: boolean;
  private lockedUntil = 0;
  /** claves `data-anim` del render anterior: solo lo que aparece por primera vez se anima */
  private seenAnim = new Set<string>();
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDialogKey = '';
  private matchSeed: number | null;
  /** la lista de señas está abierta */
  private signsOpen = false;
  /** modo consejo: en tu turno, el % con que la red jugaría cada opción */
  private advice = loadAdvice();
  /** entender frases libres con EmbeddingGemma (se baja al activarlo) */
  private freeTalk = loadFlag(FREE_TALK_KEY);
  /** barra para hablarle a la mesa (fuera del canvas: no se redibuja con cada cambio) */
  private readonly talkbar: HTMLFormElement;
  private lastSpeechId = 0;
  private listening = false;
  /** en el celular la barra va plegada (un botón) para no achicar la mesa; se abre al tocarlo */
  private talkOpen = false;
  private readonly talkToggle: HTMLButtonElement;
  /** respuestas rápidas cuando un compañero te consulta, y preguntas sugeridas (fuera del canvas) */
  private readonly talkQuick: HTMLElement;
  private readonly talkSuggest: HTMLElement;
  private quickKey = '';

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
    // En las pruebas automáticas, sin sonido.
    this.sound = new SoundBoard(config.test ? false : undefined);
    const stored = loadSettings();
    this.settings = {
      playerCount: config.players ?? stored.playerCount,
      difficulty: config.difficulty ?? stored.difficulty,
      flor: config.flor ?? stored.flor,
      picaPica: config.picaPica ?? stored.picaPica,
    };

    root.innerHTML =
      '<div class="stage"><div class="canvas" id="truco-canvas"></div><div class="rotate-layer"></div></div>' +
      '<form class="talkbar" data-testid="talkbar" hidden autocomplete="off">' +
      '<button type="button" class="talk-mic" data-testid="talk-mic" aria-label="Hablar (mantené apretado o tocá y hablá)" title="Hablar">🎤</button>' +
      `<input class="talk-input" data-testid="talk-input" type="text" enterkeyhint="send" placeholder="${TALK_PLACEHOLDER}" aria-label="Hablale a la mesa">` +
      '<span class="talk-suggest" data-testid="talk-suggest"></span>' +
      '<button type="submit" class="talk-send" data-testid="talk-send">Decir</button>' +
      '</form>' +
      '<button type="button" class="talk-toggle" data-testid="talk-toggle" hidden aria-label="Hablarle a la mesa">💬</button>' +
      '<div class="talk-quick" data-testid="talk-quick" role="group" aria-label="Respuestas rápidas" hidden></div>' +
      '<div class="sr-only" aria-live="polite" id="truco-live"></div>';
    this.stage = root.querySelector('.stage') as HTMLElement;
    this.canvas = root.querySelector('#truco-canvas') as HTMLElement;
    this.live = root.querySelector('#truco-live') as HTMLElement;
    this.talkbar = root.querySelector('.talkbar') as HTMLFormElement;
    this.talkToggle = root.querySelector('.talk-toggle') as HTMLButtonElement;
    this.talkQuick = root.querySelector('.talk-quick') as HTMLElement;
    this.talkSuggest = root.querySelector('.talk-suggest') as HTMLElement;
    this.setupTalkbar();
    // Las voces llegan tarde en Chrome: cuando llegan, el menú muestra la lista para elegir.
    this.sound.onVoices = () => {
      if (this.screen === 'menu') this.render();
    };
    if (this.freeTalk) void loadSemantic();

    // Las redes del nivel Experta (~3 MB): se bajan en segundo plano; hasta que llegan juega la difícil.
    void loadNetModels().then(() => this.onModelsLoaded());
    root.addEventListener('click', (event) => this.onClick(event));
    root.addEventListener('change', (event) => this.onChange(event));
    window.addEventListener('keydown', (event) => this.onKey(event));
    window.addEventListener('resize', () => this.fit());
    this.fit();

    if (config.test) this.exposeTestHooks();
    if (config.autostart) this.startMatch();
    else this.render();
  }

  /** Llegaron las redes: si hay algo en pantalla que las usa (consejos), se vuelve a dibujar. */
  private onModelsLoaded(): void {
    if (this.screen === 'game') this.render();
  }

  // ---------- escalado ----------

  private fit(): void {
    const w = window.innerWidth;
    // La barra para hablarle a la mesa ocupa el borde de abajo: la mesa se achica para no taparla.
    const reserve = this.talkbar && !this.talkbar.hidden ? TALKBAR_H : 0;
    const h = window.innerHeight - reserve;
    const mode = chooseLayout(w, window.innerHeight);
    const changed = mode !== this.mode;
    this.mode = mode;
    const size = CANVAS[mode];
    const scale = canvasScale(mode, w, h);
    this.canvas.style.width = `${size.w}px`;
    this.canvas.style.height = `${size.h}px`;
    this.canvas.style.transform = `translate(-50%, calc(-50% - ${reserve / 2}px)) scale(${scale})`;
    this.canvas.dataset.layout = mode;
    const rotate = this.stage.querySelector('.rotate-layer') as HTMLElement;
    rotate.innerHTML = tooShortLandscape(w, h) ? renderRotateHint() : '';
    if (changed) this.render();
  }

  // ---------- partida ----------

  private startMatch(): void {
    saveSettings(this.settings);
    this.lastSpeechId = 0;
    this.paused = false;
    this.signsOpen = false;
    this.log.reset();
    this.log.sayingGap = this.timing.sayingGap;
    this.sound.stop();
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
    // Lo que se dijo en voz alta desde la última vez: globo, feed y voz (las IA hablan con su voz).
    let delay = 0;
    for (const line of snap.speech) {
      if (line.id <= this.lastSpeechId) continue;
      this.lastSpeechId = line.id;
      this.log.speak(snap.state, line.playerId, line.text, now, delay);
      if (line.playerId !== 'p0') {
        const seat = snap.state.seats.find((s) => s.id === line.playerId)?.seat ?? 1;
        const text = line.text;
        if (delay === 0) this.sound.say(text, seat);
        else setTimeout(() => this.sound.say(text, seat), delay);
        delay += 700;
      }
    }
    this.sound.play(snap.events, snap.state, this.timing.sayingGap);
    if (this.log.announcement) this.live.textContent = this.log.announcement;
    this.render();
  }

  private scheduleExpiry(): void {
    if (this.expiryTimer !== null) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    const next = this.log.nextExpiry();
    if (next === null) return;
    // En ese momento aparece o se va algo (globo, aviso): se vuelve a dibujar.
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      this.render();
    }, Math.max(30, next - Date.now() + 20));
  }

  // ---------- render ----------

  private render(): void {
    const focusKey = this.focusKey();
    const over = this.snapshot?.state.phase === 'MATCH_OVER';
    const noTalk = this.screen !== 'game' || this.paused || !this.controller || over;
    const compact = this.mode === 'portrait';
    const hideBar = noTalk || (compact && !this.talkOpen);
    this.talkToggle.hidden = noTalk || !compact || this.talkOpen;
    if (this.talkbar.hidden !== hideBar) {
      this.talkbar.hidden = hideBar;
      this.fit();
    }
    if (this.screen === 'menu' || !this.controller || !this.snapshot) {
      this.canvas.innerHTML = renderMenu(this.settings, this.mode, this.sound.enabled, this.advice, this.freeTalk, {
        options: this.sound.voiceOptions(),
        selected: this.sound.voicePref,
      });
      this.canvas.dataset.screen = 'menu';
      this.restoreFocus(focusKey, 'menu');
      return;
    }
    const snap = this.snapshot;
    this.renderQuick(noTalk, hideBar);
    const state = snap.state;
    const now = Date.now();
    this.log.prune(now);
    const actor = getActor(state);
    const legal = this.controller.humanLegalActions();
    const signOptions = this.paused ? [] : this.controller.humanSignalOptions();
    const instructionOptions = this.paused ? [] : this.controller.humanInstructionOptions();
    const humanIsPie = snap.humanIsPie;
    // Sin ser pie: señas antes de jugar tu primera carta; indicaciones desde la 2da baza (mesa abierta).
    const instructing = !humanIsPie && signOptions.length === 0 && instructionOptions.length > 0;
    const canTalk = humanIsPie || instructing ? instructionOptions.length > 0 : signOptions.length > 0;
    if (!canTalk || responsePanelOpen({ state, actor, legal })) this.signsOpen = false;
    let html = renderGame({
      state,
      settings: snap.settings,
      mode: this.mode,
      legal,
      actor,
      log: this.log,
      now,
      talk: {
        signals: snap.signals,
        signOptions,
        instructions: snap.instructions,
        instructionOptions,
        humanIsPie,
        instructing,
        open: this.signsOpen,
      },
    });
    let dialog = '';
    if (state.phase === 'MATCH_OVER') {
      html += renderGameOver(state, snap.settings, this.log, this.mode);
      dialog = `over-${state.version}`;
    } else if (state.phase === 'HAND_OVER' && snap.summaryVisible) {
      html += renderHandSummary(state, this.log, this.autoAck, this.mode);
      dialog = `summary-${state.hand.number}`;
    } else if (this.paused) {
      html += renderPause(this.autoAck, this.sound.enabled, this.advice);
      dialog = 'pause';
    } else if (responsePanelOpen({ state, actor, legal })) {
      dialog = `resp-${state.version}`;
    } else if (this.signsOpen) {
      dialog = 'signs';
    }
    this.canvas.innerHTML = html;
    if (this.advice && !this.paused) this.showAdvice();
    this.canvas.dataset.screen = 'game';
    this.canvas.dataset.phase = state.phase;
    this.canvas.dataset.actor = actor ?? '';
    this.canvas.dataset.version = String(state.version);
    this.markEntrances();
    this.restoreFocus(focusKey, dialog);
    this.scheduleExpiry();
  }

  /**
   * Modo consejo: a cada carta y botón de tu turno le pone el % con que la red lo jugaría, y marca
   * la opción que más le gusta. No cambia nada del juego.
   */
  private showAdvice(): void {
    const advice = this.controller?.humanAdvice() ?? [];
    if (advice.length === 0) return;
    const byCode = new Map(advice.map((entry) => [encodeAction(entry.action), entry.prob]));
    const top = encodeAction(advice[0].action);
    for (const el of this.canvas.querySelectorAll<HTMLElement>('[data-act]')) {
      const prob = byCode.get(el.dataset.act as string);
      if (prob === undefined) continue;
      el.dataset.advice = `${Math.round(prob * 100)}%`;
      if (el.dataset.act === top) el.dataset.adviceTop = '';
    }
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
    this.sound.unlock();
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
      case 'signs':
        this.signsOpen = !this.signsOpen;
        this.render();
        break;
      case 'sign':
        if (this.paused || !this.controller) return;
        this.signsOpen = false;
        // Si ya no se puede (jugaste tu carta), no pasa nada: se vuelve a dibujar sin la lista.
        if (!this.controller.sendHumanSignal(value as SignKind)) this.render();
        break;
      case 'instr':
        if (this.paused || !this.controller) return;
        this.signsOpen = false;
        if (!this.controller.sendHumanInstruction(value as Instruction)) this.render();
        break;
      case 'menu':
        this.paused = false;
        this.controller?.stop();
        this.sound.stop();
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
    else if (ui === 'voice') {
      this.sound.setVoice((event.target as unknown as HTMLSelectElement).value);
      return;
    } else if (ui === 'sound') {
      this.sound.setEnabled(input.checked);
      this.render();
      return;
    } else if (ui === 'freetalk') {
      this.freeTalk = input.checked;
      saveFlag(FREE_TALK_KEY, input.checked);
      if (input.checked) void this.loadFreeTalk();
      this.render();
      return;
    } else if (ui === 'advice') {
      this.advice = input.checked;
      saveAdvice(input.checked);
      this.render();
      return;
    } else if (ui === 'autoack') {
      this.autoAck = input.checked;
      this.controller?.setAutoAck(input.checked);
    }
    if (this.screen === 'menu') this.render();
  }

  private onKey(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // Escribiendo en la barra de la mesa: las teclas son texto, no atajos.
    if (event.target instanceof HTMLInputElement && event.target.type === 'text') return;
    const snap = this.snapshot;
    if (this.screen !== 'game' || !snap || !this.controller) {
      if (event.key === 'Enter' && this.screen === 'menu' && !(document.activeElement instanceof HTMLButtonElement)) this.startMatch();
      return;
    }
    if (event.key === 'Escape') {
      if (isBlockingModal(snap)) return;
      if (this.signsOpen) {
        this.signsOpen = false;
        this.render();
        return;
      }
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

  // ---------- hablarle a la mesa ----------

  private setupTalkbar(): void {
    const input = this.talkbar.querySelector('.talk-input') as HTMLInputElement;
    const mic = this.talkbar.querySelector('.talk-mic') as HTMLButtonElement;
    this.talkbar.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = input.value;
      input.value = '';
      void this.submitTalk(text);
      if (this.mode === 'portrait') this.setTalkOpen(false);
    });
    const quick = (event: Event): void => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-say]');
      if (button?.dataset.say) void this.submitTalk(button.dataset.say);
    };
    this.talkQuick.addEventListener('click', quick);
    this.talkSuggest.addEventListener('click', quick);
    this.talkToggle.addEventListener('click', () => {
      this.setTalkOpen(true);
      input.focus();
    });
    // Si te están consultando y empezás a escribir, el compañero te espera.
    input.addEventListener('input', () => this.holdConsult());
    input.addEventListener('focus', () => this.holdConsult());
    input.addEventListener('blur', () => {
      // En el celular, al salir de la barra sin escribir nada vuelve a plegarse.
      setTimeout(() => {
        if (this.mode === 'portrait' && !input.value && !this.listening && !this.talkbar.contains(document.activeElement)) this.setTalkOpen(false);
      }, 150);
    });
    if (!speechRecognition()) {
      mic.hidden = true;
      return;
    }
    mic.addEventListener('click', () => this.listen(input, mic));
  }

  /** Micrófono (Chrome): escucha una frase en español rioplatense y la manda como si la hubieras escrito. */
  private listen(input: HTMLInputElement, mic: HTMLButtonElement): void {
    const Ctor = speechRecognition();
    if (!Ctor || this.listening) return;
    const recognition = new Ctor();
    recognition.lang = 'es-AR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;
    recognition.continuous = false;
    this.listening = true;
    this.holdConsult();
    mic.classList.add('talk-mic--on');
    input.placeholder = 'Te escucho…';
    recognition.onresult = (event) => {
      const alternatives = Array.from(event.results[0] ?? []).map((alt) => alt.transcript);
      const text = alternatives[0] ?? '';
      if (text) void this.submitTalk(text, alternatives);
    };
    const reset = (): void => {
      this.listening = false;
      mic.classList.remove('talk-mic--on');
      input.placeholder = TALK_PLACEHOLDER;
    };
    recognition.onend = reset;
    recognition.onerror = (event) => {
      reset();
      if (event.error === 'not-allowed') this.tell('Para hablar, dale permiso al micrófono.');
    };
    recognition.start();
  }

  /** Lo que dijiste (escrito o hablado) va a la mesa: se entiende y se actúa. */
  private async submitTalk(text: string, alternatives: string[] = []): Promise<void> {
    if (!this.controller || !text.trim()) return;
    // Si el reconocimiento de voz dudó, se prueba cada alternativa con las reglas antes que el modelo.
    let chosen = text;
    let result = await interpret(text, this.freeTalk);
    for (const alt of alternatives.slice(1)) {
      if (result.understood) break;
      const other = await interpret(alt, false);
      if (other.understood) {
        chosen = alt;
        result = other;
      }
    }
    const said = this.controller.humanSays(chosen, result.understood);
    if (said.note) {
      const guess = !said.understood && result.guess ? ` ¿Quisiste ${INTENT_TEXT[result.guess.label]}? Decilo más claro.` : '';
      this.tell(said.note + guess);
    }
  }

  /**
   * Botones rápidos: si un compañero te consulta ("¿Canto tanto?", "¿Qué hacemos?"), sus respuestas; si no,
   * las preguntas que te conviene hacer. Tocar uno es como decirlo. Si no contestás a tiempo, decide solo.
   */
  private renderQuick(noTalk: boolean, barHidden: boolean): void {
    const snap = this.snapshot;
    const consult = !noTalk && snap ? snap.consult : null;
    const all = !consult && !noTalk && snap && !barHidden ? snap.suggestions : [];
    // En el celular la barra es angosta: una sola sugerencia.
    const suggestions = this.mode === 'portrait' ? all.slice(0, 1) : all;
    const title = consult ? `${playerName(snap!.state, consult.askerId)}: «${consult.question}»` : '';
    const key = `${consult?.id ?? ''}|${title}|${consult?.options.join('|') ?? ''}|${suggestions.join('|')}|${barHidden}`;
    if (key === this.quickKey) return;
    this.quickKey = key;
    const button = (text: string, cls: string): string => `<button type="button" class="${cls}" data-say="${escapeHtml(text)}">${escapeHtml(text)}</button>`;
    // La consulta va arriba de la barra (es corta: decide solo si no contestás); las sugerencias, dentro.
    this.talkQuick.hidden = !consult;
    this.talkQuick.classList.toggle('talk-quick--low', barHidden);
    this.talkQuick.innerHTML = consult
      ? `<span class="talk-quick-title">${escapeHtml(title)}</span>` +
        consult.options.map((text) => button(text, 'talk-quick-btn')).join('') +
        // Barra de tiempo: si no contestás, decide solo (escribir o hablar la estira).
        (consult.waitMs > 0
          ? `<span class="talk-quick-timer" aria-hidden="true"><span style="animation-duration:${consult.waitMs}ms"></span></span>`
          : '')
      : '';
    this.talkSuggest.innerHTML = suggestions.map((text) => button(text, 'talk-suggest-btn')).join('');
  }

  private lastHold = 0;

  /** Estás escribiendo o hablando durante una consulta: que el compañero espere (como mucho cada 2 s). */
  private holdConsult(): void {
    if (!this.snapshot?.consult || !this.controller) return;
    const now = Date.now();
    if (now - this.lastHold < 2000) return;
    this.lastHold = now;
    this.controller.holdConsult();
  }

  private setTalkOpen(open: boolean): void {
    if (this.talkOpen === open) return;
    this.talkOpen = open;
    this.render();
  }

  private tell(text: string): void {
    this.log.tell(text, Date.now());
    this.live.textContent = text;
    this.render();
  }

  private async loadFreeTalk(): Promise<void> {
    if (semanticReady()) return;
    const ok = await loadSemantic((fraction) => {
      const label = this.canvas.querySelector('[data-testid="freetalk-status"]');
      if (label) label.textContent = `bajando el modelo… ${Math.round(fraction * 100)}%`;
    });
    const label = this.canvas.querySelector('[data-testid="freetalk-status"]');
    if (label) label.textContent = ok ? 'listo' : 'no se pudo bajar';
  }

  private exposeTestHooks(): void {
    (window as unknown as { __truco: unknown }).__truco = {
      state: () => this.controller?.getState() ?? null,
      legal: () => this.controller?.humanLegalActions() ?? [],
      settings: () => ({ ...this.settings }),
      summaryVisible: () => this.snapshot?.summaryVisible ?? false,
      signals: () => this.snapshot?.signals ?? [],
      instructions: () => this.snapshot?.instructions ?? [],
      speech: () => this.snapshot?.speech ?? [],
      say: (text: string) => this.submitTalk(text),
      humanIsPie: () => this.snapshot?.humanIsPie ?? false,
    };
  }
}
