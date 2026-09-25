// Orquestación de la partida (arquitectura §6, historia 3-1). Sin DOM.
// - Un solo estado (`MatchState`) y un solo driver de IA: después de cada cambio, si el actor
//   es una IA se programa UNA decisión, guardando `state.version`; si al ejecutarse la versión
//   cambió, no hace nada (nunca hay dos acciones por la misma decisión) [UI-03, UI-06].
// - Nueva partida y fin de mano cancelan todo lo programado.
// - La IA ve solo `getObservation`; si su política devolviera algo ilegal, se juega la primera
//   acción legal (nunca se cuelga).

import { applyAction, createMatch, createRng, getActor, getLegalActions, getObservation, startNextHand } from '../engine/index.js';
import type { Action, GameEvent, MatchState, PlayerId, Rng, RuleSet } from '../engine/index.js';
import { createPolicy, type Difficulty, type Policy } from '../ai/policy.js';
import type { Scheduler } from './scheduler.js';

export const HUMAN_ID: PlayerId = 'p0';

export interface MatchSettings {
  playerCount: 2 | 4 | 6;
  difficulty: Difficulty;
  flor: boolean;
  /** solo con 6 jugadores */
  picaPica: boolean;
}

export interface Timing {
  /** rango de "pensar" de la IA, en ms (GDD §11.3) */
  aiDelay: [number, number];
  /** pausa extra después de una baza completa (para verla) */
  trickPause: number;
  /** pausa al empezar una submano de pica-pica */
  submanoPause: number;
  /** espera antes de mostrar el resumen de la mano */
  handOverDelay: number;
  /** espera antes de cantar sola la flor del humano */
  autoFlorDelay: number;
  /** pausa por cada cosa que se dice al cantar los tantos ("33", "me dio", "son buenas") */
  sayingGap: number;
}

export const NORMAL_TIMING: Timing = {
  aiDelay: [800, 1600],
  trickPause: 1000,
  submanoPause: 1400,
  handOverDelay: 1300,
  autoFlorDelay: 700,
  sayingGap: 900,
};

export const FAST_TIMING: Timing = {
  aiDelay: [0, 0],
  trickPause: 0,
  submanoPause: 0,
  handOverDelay: 0,
  autoFlorDelay: 0,
  sayingGap: 0,
};

export interface ControllerOptions {
  settings: MatchSettings;
  seed: number;
  scheduler: Scheduler;
  timing?: Timing;
  /** pasar solo a la mano siguiente */
  autoAck?: boolean;
  /** para tests: política del humano (juega sola) */
  humanPolicy?: Policy;
}

export interface ControllerSnapshot {
  state: MatchState;
  settings: MatchSettings;
  /** eventos del último cambio */
  events: GameEvent[];
  /** el resumen de la mano ya se puede mostrar */
  summaryVisible: boolean;
  /** IA que está "pensando" (programada) */
  thinking: PlayerId | null;
  autoAck: boolean;
}

export type Listener = (snapshot: ControllerSnapshot) => void;

function rulesOf(settings: MatchSettings): Partial<RuleSet> & Pick<RuleSet, 'playerCount'> {
  return { playerCount: settings.playerCount, flor: settings.flor, picaPica: settings.playerCount === 6 && settings.picaPica };
}

export class GameController {
  private state: MatchState;
  private settings: MatchSettings;
  private seed: number;
  private rng: Rng;
  private readonly scheduler: Scheduler;
  private readonly timing: Timing;
  private policies = new Map<PlayerId, Policy>();
  private readonly listeners = new Set<Listener>();
  private lastEvents: GameEvent[] = [];
  private summaryVisible = false;
  private thinking: PlayerId | null = null;
  private autoAck: boolean;
  private readonly humanPolicy?: Policy;
  private matchCount = 0;

  constructor(opts: ControllerOptions) {
    this.scheduler = opts.scheduler;
    this.timing = opts.timing ?? NORMAL_TIMING;
    this.autoAck = opts.autoAck ?? false;
    this.humanPolicy = opts.humanPolicy;
    this.settings = opts.settings;
    this.seed = opts.seed;
    this.rng = createRng(opts.seed);
    this.state = createMatch({ rules: rulesOf(opts.settings), seed: opts.seed });
    this.setupPolicies();
  }

  // ---------- lectura ----------

  getState(): MatchState {
    return this.state;
  }

  snapshot(): ControllerSnapshot {
    return {
      state: this.state,
      settings: this.settings,
      events: this.lastEvents,
      summaryVisible: this.summaryVisible,
      thinking: this.thinking,
      autoAck: this.autoAck,
    };
  }

  /** Acciones legales del humano ahora (vacío si no le toca). */
  humanLegalActions(): Action[] {
    return getLegalActions(this.state, HUMAN_ID);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------- comandos ----------

  /** Arranca la primera decisión (después de suscribirse la UI). */
  start(): void {
    this.lastEvents = [
      {
        type: 'HAND_STARTED',
        hand: this.state.hand.number,
        dealerId: this.state.hand.dealerId,
        manoId: this.state.hand.manoId,
        picaPica: this.state.hand.picaPica !== null,
      },
    ];
    this.afterChange();
  }

  /** Acción del humano. Rechaza (sin cambiar nada) si no es su turno o no es legal. */
  dispatchHuman(action: Action): { ok: boolean; error?: string } {
    if (getActor(this.state) !== HUMAN_ID) return { ok: false, error: 'NOT_YOUR_TURN' };
    return this.apply(HUMAN_ID, action);
  }

  /** "Siguiente mano": solo en `HAND_OVER`. */
  continueAfterHand(): boolean {
    if (this.state.phase !== 'HAND_OVER') return false;
    this.scheduler.cancelAll();
    const next = startNextHand(this.state);
    this.state = next.state;
    this.lastEvents = next.events;
    this.afterChange();
    return true;
  }

  /** Partida nueva: cancela todo lo pendiente y arranca de cero [UI-01]. */
  newMatch(settings?: MatchSettings, seed?: number): void {
    this.scheduler.cancelAll();
    this.matchCount += 1;
    if (settings) this.settings = settings;
    this.seed = seed ?? (this.seed + 7919 * this.matchCount) >>> 0;
    this.rng = createRng(this.seed);
    this.state = createMatch({ rules: rulesOf(this.settings), seed: this.seed });
    this.setupPolicies();
    this.start();
  }

  setAutoAck(value: boolean): void {
    this.autoAck = value;
    if (value && this.state.phase === 'HAND_OVER' && this.summaryVisible) this.scheduleAutoAck();
  }

  /** Retoma después de una pausa: vuelve a programar lo que correspondía (sin repetir eventos). */
  resume(): void {
    this.scheduler.cancelAll();
    this.lastEvents = [];
    this.afterChange();
  }

  /** Corta todo (pausa o salir al menú). */
  stop(): void {
    this.scheduler.cancelAll();
    this.thinking = null;
  }

  // ---------- internos ----------

  private setupPolicies(): void {
    this.policies = new Map();
    for (const seat of this.state.seats) {
      if (seat.isHuman) continue;
      // Los compañeros del humano juegan siempre en "normal" (GDD §11.2).
      const difficulty: Difficulty = seat.team === 0 ? 'normal' : this.settings.difficulty;
      this.policies.set(seat.id, createPolicy(difficulty));
    }
  }

  private apply(playerId: PlayerId, action: Action): { ok: boolean; error?: string } {
    const result = applyAction(this.state, playerId, action);
    if (!result.ok) return { ok: false, error: result.error };
    this.state = result.state;
    this.lastEvents = result.events;
    this.afterChange();
    return { ok: true };
  }

  private notify(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }

  private delay(): number {
    const [min, max] = this.timing.aiDelay;
    return min + Math.floor(this.rng.next() * (max - min + 1));
  }

  private afterChange(): void {
    this.summaryVisible = false;
    this.thinking = null;
    const state = this.state;
    const version = state.version;
    const events = this.lastEvents;

    if (state.phase === 'HAND_OVER') {
      this.scheduler.schedule(this.timing.handOverDelay, () => {
        if (this.state.version !== version || this.state.phase !== 'HAND_OVER') return;
        this.summaryVisible = true;
        this.lastEvents = [];
        this.notify();
        if (this.autoAck) this.scheduleAutoAck();
      });
      this.notify();
      return;
    }
    if (state.phase === 'MATCH_OVER') {
      this.notify();
      return;
    }

    const actor = getActor(state);
    if (actor === null) {
      this.notify();
      return;
    }

    let wait = 0;
    if (events.some((event) => event.type === 'TRICK_WON')) wait += this.timing.trickPause;
    if (events.some((event) => event.type === 'SUBMANO_STARTED')) wait += this.timing.submanoPause;
    // Que se lleguen a escuchar los tantos antes de seguir jugando.
    for (const event of events) if (event.type === 'ENVIDO_RESOLVED') wait += event.sayings.length * this.timing.sayingGap;

    if (actor === HUMAN_ID && this.humanPolicy === undefined) {
      const legal = getLegalActions(state, HUMAN_ID);
      // La flor es obligatoria: si es lo único que puede hacer, la interfaz la canta sola (GDD §7).
      if (legal.length === 1 && legal[0].type === 'DECLARE_FLOR') {
        this.scheduler.schedule(wait + this.timing.autoFlorDelay, () => {
          if (this.state.version !== version) return;
          this.apply(HUMAN_ID, { type: 'DECLARE_FLOR' });
        });
      }
      this.notify();
      return;
    }

    this.thinking = actor;
    this.scheduler.schedule(wait + this.delay(), () => {
      if (this.state.version !== version) return;
      this.playAi(actor);
    });
    this.notify();
  }

  private playAi(actor: PlayerId): void {
    const policy = actor === HUMAN_ID ? this.humanPolicy : this.policies.get(actor);
    const legal = getLegalActions(this.state, actor);
    if (legal.length === 0) return;
    let action = legal[0];
    if (policy) {
      try {
        action = policy.decide(getObservation(this.state, actor), this.rng);
      } catch (error) {
        console.warn('[truco] la IA falló al decidir; juega la primera acción legal', error);
      }
    }
    const result = this.apply(actor, action);
    if (!result.ok) {
      console.warn('[truco] la IA eligió una acción ilegal; juega la primera legal', action, result.error);
      this.apply(actor, legal[0]);
    }
  }

  private scheduleAutoAck(): void {
    const version = this.state.version;
    this.scheduler.schedule(this.timing.handOverDelay, () => {
      if (this.state.version !== version || this.state.phase !== 'HAND_OVER') return;
      this.continueAfterHand();
    });
  }
}
