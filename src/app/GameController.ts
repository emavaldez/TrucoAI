// Orquestación de la partida (arquitectura §6, historia 3-1). Sin DOM.
// - Un solo estado (`MatchState`) y un solo driver de IA: después de cada cambio, si el actor
//   es una IA se programa UNA decisión, guardando `state.version`; si al ejecutarse la versión
//   cambió, no hace nada (nunca hay dos acciones por la misma decisión) [UI-03, UI-06].
// - Nueva partida y fin de mano cancelan todo lo programado.
// - La IA ve solo `getObservation`; si su política devolviera algo ilegal, se juega la primera
//   acción legal (nunca se cuelga).

import { applyAction, createMatch, createRng, getActor, getLegalActions, getObservation, pieOf, startNextHand } from '../engine/index.js';
import type { Action, Card, GameEvent, MatchState, PlayerId, Rng, RuleSet, TeamId } from '../engine/index.js';
import { createPolicy, type Difficulty, type Policy } from '../ai/policy.js';
import {
  aiInstructions,
  aiSigns,
  availableSigns,
  instructionInfo,
  INSTRUCTIONS,
  type GivenInstruction,
  type Instruction,
  type Signal,
  type SignKind,
} from '../ai/signs.js';
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
  /**
   * Señas que ve el humano: si es el pie, las que le hacen sus compañeros; si no, las que él le hizo
   * a su pie. Nunca las de los rivales.
   */
  signals: Signal[];
  /** indicaciones vigentes del pie del equipo del humano */
  instructions: GivenInstruction[];
  /** el humano es el pie de su equipo en esta mano (y hay señas) */
  humanIsPie: boolean;
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
  /** señas hechas en la mano en curso (de los dos equipos: cada pie solo ve las de sus compañeros) */
  private signals: Signal[] = [];
  /** indicaciones vigentes de cada pie (una de cartas y una de truco como mucho) */
  private instructions: GivenInstruction[] = [];

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
      signals: this.humanIsPie()
        ? this.signalsFor(HUMAN_ID)
        : this.signals.filter((signal) => signal.from === HUMAN_ID),
      instructions: this.instructions.filter((given) => this.teamOf(given.from) === this.teamOf(HUMAN_ID)),
      humanIsPie: this.humanIsPie(),
    };
  }

  /** Acciones legales del humano ahora (vacío si no le toca). */
  humanLegalActions(): Action[] {
    return getLegalActions(this.state, HUMAN_ID);
  }

  /** ¿Se pueden hacer señas en esta mano? (4 o 6 jugadores y nunca en pica-pica) */
  signalsAllowed(): boolean {
    const phase = this.state.phase;
    return this.settings.playerCount >= 4 && this.state.hand.picaPica === null && phase !== 'HAND_OVER' && phase !== 'MATCH_OVER';
  }

  /**
   * Señas que el humano todavía puede hacer: solo antes de jugar su primera carta, y solo las
   * verdaderas (lo que tiene), sin repetir.
   */
  humanSignalOptions(): SignKind[] {
    // Las señas se le hacen al pie: el pie no hace señas, da indicaciones.
    if (!this.signalsAllowed() || this.humanIsPie()) return [];
    const hand = this.state.hand.hands[HUMAN_ID];
    const dealt = this.state.hand.dealt[HUMAN_ID];
    if (!hand || !dealt || hand.length < dealt.length) return [];
    const sent = new Set(this.signals.filter((signal) => signal.from === HUMAN_ID).map((signal) => signal.kind));
    return availableSigns(hand, dealt, this.state.rules.flor)
      .map((sign) => sign.kind)
      .filter((kind) => !sent.has(kind));
  }

  /** ¿El humano es el pie de su equipo en esta mano (y hay señas)? */
  humanIsPie(): boolean {
    return this.signalsAllowed() && this.isPieNow(HUMAN_ID);
  }

  /** Indicaciones que puede dar el humano cuando es el pie (durante toda la mano). */
  humanInstructionOptions(): Instruction[] {
    if (!this.humanIsPie()) return [];
    const truco = this.state.hand.truco.level === 0;
    return INSTRUCTIONS.filter((info) => info.group === 'cartas' || truco).map((info) => info.kind);
  }

  /** El humano (pie) les indica algo a sus compañeros. No es una acción del motor. */
  sendHumanInstruction(kind: Instruction): boolean {
    if (!this.humanInstructionOptions().includes(kind)) return false;
    this.setInstruction({ from: HUMAN_ID, kind });
    this.lastEvents = [];
    this.notify();
    return true;
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
    this.dealSignals();
    this.afterChange();
  }

  /** Acción del humano. Rechaza (sin cambiar nada) si no es su turno o no es legal. */
  dispatchHuman(action: Action): { ok: boolean; error?: string } {
    if (getActor(this.state) !== HUMAN_ID) return { ok: false, error: 'NOT_YOUR_TURN' };
    return this.apply(HUMAN_ID, action);
  }

  /** Seña del humano a sus compañeros. No es una acción del motor: no cambia el turno. */
  sendHumanSignal(kind: SignKind): boolean {
    if (!this.humanSignalOptions().includes(kind)) return false;
    const hand = this.state.hand.hands[HUMAN_ID];
    const option = availableSigns(hand, this.state.hand.dealt[HUMAN_ID], this.state.rules.flor).find((sign) => sign.kind === kind);
    this.signals = [...this.signals, { from: HUMAN_ID, kind, cardId: option?.cardId ?? null }];
    // El pie (IA) vuelve a pensar sus indicaciones con la seña nueva.
    this.refreshAiInstructions(this.state.hand.tricks.length === 0);
    // Sin eventos del motor: la interfaz solo vuelve a dibujar.
    this.lastEvents = [];
    this.notify();
    return true;
  }

  /** "Siguiente mano": solo en `HAND_OVER`. */
  continueAfterHand(): boolean {
    if (this.state.phase !== 'HAND_OVER') return false;
    this.scheduler.cancelAll();
    const next = startNextHand(this.state);
    this.state = next.state;
    this.lastEvents = next.events;
    this.dealSignals();
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

  private teamOf(playerId: PlayerId): number {
    return this.state.seats.find((seat) => seat.id === playerId)?.team ?? -1;
  }

  private isPieNow(playerId: PlayerId): boolean {
    const team = this.teamOf(playerId);
    return (team === 0 || team === 1) && pieOf(this.state, team as TeamId) === playerId;
  }

  /**
   * Al empezar la mano, cada IA que no es pie le hace sus señas a su pie (GDD §2.1), y cada pie
   * de la IA da sus primeras indicaciones.
   */
  private dealSignals(): void {
    this.signals = [];
    this.instructions = [];
    if (!this.signalsAllowed()) return;
    const hand = this.state.hand;
    for (const seat of this.state.seats) {
      if (seat.isHuman || this.isPieNow(seat.id)) continue;
      this.signals.push(...aiSigns(seat.id, hand.hands[seat.id], hand.dealt[seat.id], this.state.rules.flor));
    }
    this.refreshAiInstructions(true);
  }

  /** Las señas que ve `playerId`: si es el pie, las de sus compañeros; si no, ninguna. */
  private signalsFor(playerId: PlayerId): Signal[] {
    if (!this.signalsAllowed() || !this.isPieNow(playerId)) return [];
    const team = this.teamOf(playerId);
    return this.signals.filter((signal) => signal.from !== playerId && this.teamOf(signal.from) === team);
  }

  /** Lo que el pie le indicó a `playerId` (nada si él mismo es el pie). */
  private instructionsFor(playerId: PlayerId): Instruction[] {
    if (!this.signalsAllowed() || this.isPieNow(playerId)) return [];
    const team = this.teamOf(playerId);
    return this.instructions.filter((given) => this.teamOf(given.from) === team).map((given) => given.kind);
  }

  private setInstruction(given: GivenInstruction): void {
    const group = instructionInfo(given.kind).group;
    const team = this.teamOf(given.from);
    this.instructions = [
      ...this.instructions.filter((old) => !(this.teamOf(old.from) === team && instructionInfo(old.kind).group === group)),
      given,
    ];
  }

  /** Los pies de la IA indican según su mano y las señas recibidas (al empezar la mano y en cada baza). */
  private refreshAiInstructions(withTruco: boolean): void {
    if (!this.signalsAllowed()) return;
    const hand = this.state.hand;
    const played = new Map<PlayerId, Card[]>();
    for (const trick of [...hand.tricks, hand.currentTrick]) {
      for (const play of trick.plays) played.set(play.playerId, [...(played.get(play.playerId) ?? []), play.card]);
    }
    for (const team of [0, 1] as const) {
      const pie = pieOf(this.state, team);
      if (pie === HUMAN_ID) continue;
      const given = aiInstructions(pie, hand.hands[pie], this.signalsFor(pie), played, withTruco && hand.truco.level === 0);
      for (const instruction of given) this.setInstruction(instruction);
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
    if (events.some((event) => event.type === 'TRICK_WON')) {
      wait += this.timing.trickPause;
      this.refreshAiInstructions(false);
    }
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
        action = policy.decide(getObservation(this.state, actor), this.rng, this.signalsFor(actor), this.instructionsFor(actor));
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
