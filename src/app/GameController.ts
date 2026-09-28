// Orquestación de la partida (arquitectura §6, historia 3-1). Sin DOM.
// - Un solo estado (`MatchState`) y un solo driver de IA: después de cada cambio, si el actor
//   es una IA se programa UNA decisión, guardando `state.version`; si al ejecutarse la versión
//   cambió, no hace nada (nunca hay dos acciones por la misma decisión) [UI-03, UI-06].
// - Nueva partida y fin de mano cancelan todo lo programado.
// - La IA ve solo `getObservation`; si su política devolviera algo ilegal, se juega la primera
//   acción legal (nunca se cuelga).

import { applyAction, createMatch, createRng, getActor, getLegalActions, getObservation, startNextHand } from '../engine/index.js';
import type { Action, GameEvent, MatchState, PlayerId, Rng, RuleSet, TeamId } from '../engine/index.js';
import { createPolicy, type Difficulty, type Policy } from '../ai/policy.js';
import { NetPolicy, netAdvice, type NetAdvice } from '../ai/rl/netPolicy.js';
import { parseRules } from '../ai/talk/parse.js';
import type { Understanding } from '../ai/talk/intents.js';
import { partnersOf, pieWhatToDo, resolveCard, rivalBanter, rivalsOf } from '../ai/talk/respond.js';
import {
  aiCardsAnswer,
  aiResponseOpinion,
  aiTantoAnswer,
  tacticalDecision,
  type PublicClaim,
  type TeamAdvice,
} from '../ai/talk/team.js';
import { availableSigns, instructionInfo, INSTRUCTIONS, type GivenInstruction, type Instruction, type Signal, type SignKind } from '../ai/signs.js';
import {
  EMPTY_TALK,
  dealTalk,
  instructionsFor,
  isPieNow,
  refreshHeuristicInstructions,
  signalsFor,
  talkAllowed,
  teamInstructions,
  teamOfPlayer,
  withInstruction,
  type TableTalk,
} from '../ai/tableTalk.js';
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
  /** cuánto espera la IA tu respuesta cuando consulta al equipo ("¿canto tanto?", "¿qué hacemos?") */
  consultWait: number;
}

export const NORMAL_TIMING: Timing = {
  aiDelay: [800, 1600],
  trickPause: 1000,
  submanoPause: 1400,
  handOverDelay: 1300,
  autoFlorDelay: 700,
  sayingGap: 900,
  consultWait: 10000,
};

export const FAST_TIMING: Timing = {
  aiDelay: [0, 0],
  trickPause: 0,
  submanoPause: 0,
  handOverDelay: 0,
  autoFlorDelay: 0,
  sayingGap: 0,
  consultWait: 0,
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
  /** lo que se dijo en voz alta en la partida (lo último primero no: en orden), para globos y voz */
  speech: Utterance[];
  /** un compañero de la IA te está consultando (respuestas rápidas) */
  consult: Consult | null;
  /** preguntas que te conviene hacerle al equipo ahora (sos el pie o te toca contestar) */
  suggestions: string[];
}

/** Consulta de un compañero de la IA al equipo, esperando tu respuesta. */
export interface Consult {
  askerId: PlayerId;
  /** tanto: el pie pregunta si canta · respuesta: qué contestar a un canto · jugada: qué carta jugar */
  kind: 'tanto' | 'respuesta' | 'jugada';
  question: string;
  options: string[];
  /** cuánto espera (ms) desde `id`: cambia cada vez que se estira la espera (para la barra de tiempo) */
  waitMs: number;
  id: number;
}

/** Algo que alguien dijo en la mesa (público). */
export interface Utterance {
  id: number;
  playerId: PlayerId;
  text: string;
}

/** Resultado de hablarle a la mesa: qué se entendió, si hizo algo y, si no, por qué. */
export interface SayResult {
  understood: Understanding | null;
  /** hizo algo en el juego (jugó, cantó, indicó) o alguien contestó */
  ok: boolean;
  /** aviso para el humano ("Ahora no podés cantar truco", "No te entendí") */
  note?: string;
}

export type Listener = (snapshot: ControllerSnapshot) => void;

function rulesOf(settings: MatchSettings): Partial<RuleSet> & Pick<RuleSet, 'playerCount'> {
  // Mesa abierta en equipo: desde la 2da baza contesta cualquiera (GDD §2.2, decisión 2026-09-28).
  return {
    playerCount: settings.playerCount,
    flor: settings.flor,
    picaPica: settings.playerCount === 6 && settings.picaPica,
    openTable: settings.playerCount >= 4,
  };
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
  /** señas e indicaciones de la mano en curso (src/ai/tableTalk.ts) */
  private talk: TableTalk = EMPTY_TALK;
  /** lo dicho en voz alta (las últimas frases) */
  private speech: Utterance[] = [];
  private speechId = 0;
  /** lo que se afirmó en voz alta en esta mano (los rivales de la IA lo escuchan) */
  private claims: PublicClaim[] = [];
  /** consejo del equipo del humano para su pie / el que contesta (de esta mano) */
  private advice: TeamAdvice = {};
  /** equipos cuyo pie decidió esperar y subir el envido en esta mano */
  private slowPlay = new Set<TeamId>();
  /** consultas ya hechas en esta mano (para no repetirlas) */
  private asked = new Set<string>();
  private consult: Consult | null = null;
  /** la decisión programada del que consultó (para estirar la espera si estás escribiendo o hablando) */
  private consultTimer: { cancel: () => void; actor: PlayerId; version: number } | null = null;
  private consultHolds = 0;
  private consultSeq = 0;
  /** baza en la que el humano ya indicó algo de cartas (-1: todavía no en esta mano) */
  private humanInstructedTrick = -1;

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
        : this.talk.signals.filter((signal) => signal.from === HUMAN_ID),
      instructions: this.talk.instructions.filter((given) => this.teamOf(given.from) === this.teamOf(HUMAN_ID)),
      humanIsPie: this.humanIsPie(),
      speech: this.speech,
      consult: this.consult && this.teamOf(this.consult.askerId) === this.teamOf(HUMAN_ID) && this.consult.askerId !== HUMAN_ID ? this.consult : null,
      suggestions: this.humanSuggestions(),
    };
  }

  /** Acciones legales del humano ahora (vacío si no le toca). */
  humanLegalActions(): Action[] {
    return getLegalActions(this.state, HUMAN_ID);
  }

  /** ¿Se pueden hacer señas en esta mano? (4 o 6 jugadores y nunca en pica-pica) */
  signalsAllowed(): boolean {
    return talkAllowed(this.state);
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
    const sent = new Set(this.talk.signals.filter((signal) => signal.from === HUMAN_ID).map((signal) => signal.kind));
    return availableSigns(hand, dealt, this.state.rules.flor)
      .map((sign) => sign.kind)
      .filter((kind) => !sent.has(kind));
  }

  /** ¿El humano es el pie de su equipo en esta mano (y hay señas)? */
  humanIsPie(): boolean {
    return this.signalsAllowed() && this.isPieNow(HUMAN_ID);
  }

  /** ¿El humano puede dar indicaciones? El pie, siempre; desde la 2da baza, cualquiera (mesa abierta). */
  humanCanInstruct(): boolean {
    return this.humanIsPie() || (this.signalsAllowed() && !!this.state.rules.openTable && this.state.hand.tricks.length >= 1);
  }

  /** Indicaciones que puede dar el humano (el pie durante toda la mano; cualquiera desde la 2da baza). */
  humanInstructionOptions(): Instruction[] {
    if (!this.humanCanInstruct()) return [];
    const truco = this.state.hand.truco.level === 0;
    return INSTRUCTIONS.filter((info) => info.group === 'cartas' || truco).map((info) => info.kind);
  }

  /** El humano (pie) les indica algo a sus compañeros. No es una acción del motor. */
  sendHumanInstruction(kind: Instruction): boolean {
    if (!this.humanInstructionOptions().includes(kind)) return false;
    this.setInstruction({ from: HUMAN_ID, kind });
    if (instructionInfo(kind).group === 'cartas') this.humanInstructedTrick = this.state.hand.tricks.length;
    this.lastEvents = [];
    this.notify();
    return true;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---------- comandos ----------

  /**
   * El humano habla o escribe en la mesa (todo es público). Se entiende con las reglas (o con lo que
   * ya entendió el modelo, `understood`) y se actúa: jugar o cantar si es legal, indicar si es pie,
   * preguntarle al compañero (contesta la verdad, en términos de seña), afirmar lo que tiene (si es
   * cierto y todavía puede hacer señas, le llega al pie como seña) o charlar (contesta un rival).
   */
  humanSays(text: string, understood?: Understanding | null): SayResult {
    const clean = text.trim();
    if (!clean) return { understood: null, ok: false };
    this.say(HUMAN_ID, clean);
    const u = understood === undefined ? parseRules(clean) : understood;
    const done = (result: SayResult): SayResult => {
      this.lastEvents = [];
      this.notify();
      return result;
    };
    if (!u) return done({ understood: null, ok: false, note: 'No te entendí. Probá con «truco», «quiero», «tiro el ancho», «¿tenés tanto?», «cantá» o «matá».' });

    const legal = this.humanLegalActions();
    const play = (predicate: (action: Action) => boolean, what: string): SayResult => {
      const action = legal.find(predicate);
      if (!action) return done({ understood: u, ok: false, note: what });
      const result = this.dispatchHuman(action);
      return { understood: u, ok: result.ok, note: result.ok ? undefined : what };
    };
    const partners = partnersOf(this.state, HUMAN_ID);
    const rivals = rivalsOf(this.state, HUMAN_ID);
    const aiPartners = partners.filter((id) => id !== HUMAN_ID);
    const aiPie = aiPartners.find((id) => this.isPieNow(id));
    const consult = this.consult && this.teamOf(this.consult.askerId) === this.teamOf(HUMAN_ID) ? this.consult : null;
    // Contestar una consulta del equipo: el consejo le llega al que decide, que juega enseguida.
    const answer = (advice: TeamAdvice): SayResult => {
      this.advice = { ...this.advice, ...advice };
      if (consult) this.answerConsult();
      if (consult) this.say(consult.askerId, 'Dale.');
      return done({ understood: u, ok: true });
    };
    const notYourTurn = (word: string): string =>
      `Dijiste «${word}»: en la mesa eso es cantarlo, pero ahora no podés.`;

    switch (u.label) {
      case 'CANTA_TRUCO':
        if (consult?.kind === 'respuesta' && !legal.some((a) => a.type === 'CALL_TRUCO')) return answer({ resp: 'subile' });
        return play((a) => a.type === 'CALL_TRUCO', notYourTurn('truco'));
      case 'ENVIDO':
      case 'REAL_ENVIDO':
      case 'FALTA_ENVIDO': {
        const call = u.label === 'ENVIDO' ? 'E' : u.label === 'REAL_ENVIDO' ? 'R' : 'F';
        const word = u.label === 'ENVIDO' ? 'envido' : u.label === 'REAL_ENVIDO' ? 'real envido' : 'falta envido';
        // Contestando «¿qué hacemos?» a un truco: «el envido está primero» (canta el que contesta).
        if (consult?.kind === 'respuesta' && this.state.phase === 'AWAITING_TRUCO') {
          if (getLegalActions(this.state, consult.askerId).some((a) => a.type === 'CALL_ENVIDO')) return answer({ resp: 'envido', call });
        } else if (consult?.kind === 'respuesta' && !legal.some((a) => a.type === 'CALL_ENVIDO')) return answer({ resp: 'subile', call: u.label === 'ENVIDO' ? undefined : call });
        if (consult?.kind === 'tanto') return answer({ tanto: 'canta' });
        const pieOnly = this.signalsAllowed() && !this.isPieNow(HUMAN_ID) && this.state.hand.tricks.length === 0;
        return play((a) => a.type === 'CALL_ENVIDO' && a.call === call, pieOnly ? `Dijiste «${word}», pero el envido lo canta el pie.` : notYourTurn(word));
      }
      case 'QUIERO':
      case 'NO_QUIERO': {
        const yes = u.label === 'QUIERO';
        if (consult?.kind === 'respuesta') return answer({ resp: yes ? 'quiero' : 'no' });
        return play(
          (a) => (a.type === 'ANSWER_TRUCO' || a.type === 'ANSWER_ENVIDO') && a.answer === (yes ? 'QUIERO' : 'NO_QUIERO'),
          'Nadie te cantó nada para contestar.',
        );
      }
      case 'SUBILE':
        if (consult?.kind === 'respuesta') return answer({ resp: 'subile' });
        return play((a) => a.type === 'CALL_TRUCO' || (a.type === 'CALL_ENVIDO' && this.state.phase === 'AWAITING_ENVIDO'), 'Ahora no hay nada para subir.');
      case 'MAZO':
        return play((a) => a.type === 'MAZO', 'Ahora no podés irte al mazo.');
      case 'JUGAR_CARTA': {
        const card = u.card ? resolveCard(this.state.hand.hands[HUMAN_ID] ?? [], u.card) : null;
        if (!card) return done({ understood: u, ok: false, note: 'No tenés esa carta (o no sé cuál de las tuyas es).' });
        return play((a) => a.type === 'PLAY_CARD' && a.cardId === card.id, 'Ahora no podés jugar una carta.');
      }
      case 'IND_CANTA_TANTO':
      case 'IND_CALLADO_TANTO':
        if (this.isPieNow(HUMAN_ID) || !aiPie) return done({ understood: u, ok: false, note: 'El tanto lo decide el pie: sos vos.' });
        return answer({ tanto: u.label === 'IND_CANTA_TANTO' ? 'canta' : 'callado' });
      case 'IND_MATA':
      case 'IND_PASA':
      case 'IND_PARDA':
      case 'IND_TRANQUILO':
      case 'IND_CANTA_TRUCO':
      case 'IND_ESPERA': {
        // Contestándole al pie "¿canto tanto?": "cantá" / "jugá callado" son sobre el tanto.
        if (consult?.kind === 'tanto' && (u.label === 'IND_CANTA_TRUCO' || u.label === 'IND_ESPERA')) {
          return answer({ tanto: u.label === 'IND_CANTA_TRUCO' ? 'canta' : 'callado' });
        }
        const kind = u.label.slice(4) as Instruction;
        if (!this.humanCanInstruct()) {
          return done({ understood: u, ok: false, note: this.signalsAllowed() ? 'En la 1ra baza indica el pie; desde la 2da, cualquiera.' : 'Las indicaciones son para jugar en equipo (4 o 6).' });
        }
        const ok = this.sendHumanInstruction(kind);
        if (ok && consult?.kind === 'jugada') return answer({});
        return { understood: u, ok, note: ok ? undefined : 'Esa indicación ya no se puede dar en esta mano.' };
      }
      case 'PREG_TANTO':
      case 'PREG_CANTO_TANTO':
      case 'PREG_CARTAS':
      case 'PREG_CANTO': {
        if (aiPartners.length === 0) {
          this.say(rivals[0], rivalBanter(this.rng, true));
          return done({ understood: u, ok: true });
        }
        for (const partner of aiPartners) {
          if (u.label === 'PREG_TANTO' || u.label === 'PREG_CANTO_TANTO') {
            const reply = aiTantoAnswer(this.state, partner, this.rng);
            this.say(partner, reply.text);
            this.claims.push(reply.claim);
          } else {
            const reply = aiCardsAnswer(this.state, partner);
            const text = u.label === 'PREG_CANTO' ? (reply.claim.level === 'nada' ? 'No, jugá callado.' : 'Cantá.') : reply.text;
            this.say(partner, text);
            this.claims.push(reply.claim);
          }
        }
        return done({ understood: u, ok: true });
      }
      case 'PREG_QUE_HAGO': {
        if (aiPartners.length === 0) this.say(rivals[0], rivalBanter(this.rng, true));
        else if (this.state.phase === 'AWAITING_TRUCO' || this.state.phase === 'AWAITING_ENVIDO') {
          for (const partner of aiPartners) this.say(partner, aiResponseOpinion(this.state, partner).text);
        } else if (aiPie) this.say(aiPie, pieWhatToDo(instructionsFor(this.state, this.talk, HUMAN_ID)));
        else this.say(aiPartners[0], 'Vos sos el pie: decime vos.');
        return done({ understood: u, ok: true });
      }
      case 'TENGO':
      case 'NO_TENGO': {
        // Contestándole al pie «¿canto tanto?», «tengo» / «no tengo nada» son sobre el tanto.
        const about = consult?.kind === 'tanto' && !u.card ? 'tanto' : (u.about ?? 'cartas');
        this.claims.push({ from: HUMAN_ID, about, level: u.label === 'NO_TENGO' ? 'nada' : u.score !== undefined && u.score >= 28 ? 'mucho' : 'algo' });
        // Si todavía puede hacerle señas al pie y lo que dice es cierto, al pie le llega como seña.
        const options = this.humanSignalOptions();
        const hand = this.state.hand.hands[HUMAN_ID] ?? [];
        const told: SignKind[] = [];
        if (u.label === 'NO_TENGO' && about === 'cartas' && options.includes('NADA')) told.push('NADA');
        if (u.label === 'TENGO') {
          const named = u.card ? resolveCard(hand, u.card) : null;
          const all = availableSigns(hand, this.state.hand.dealt[HUMAN_ID] ?? [], this.state.rules.flor);
          if (named) {
            const sign = all.find((option) => option.cardId === named.id);
            if (sign && options.includes(sign.kind)) told.push(sign.kind);
          }
          if (about === 'tanto' && options.includes('ENVIDO')) told.push('ENVIDO');
        }
        for (const kind of told) this.sendHumanSignal(kind);
        if (consult?.kind === 'tanto' && about === 'tanto') return answer({ tanto: u.label === 'TENGO' ? 'canta' : 'callado' });
        if (aiPie) this.say(aiPie, 'Dale.');
        return done({ understood: u, ok: true });
      }
      case 'CHARLA':
        if (rivals.length > 0) this.say(rivals[Math.floor(this.rng.next() * rivals.length)], rivalBanter(this.rng));
        return done({ understood: u, ok: true });
    }
    return done({ understood: u, ok: false });
  }

  /** Preguntas que te conviene hacerle al equipo ahora (botones rápidos). */
  private humanSuggestions(): string[] {
    if (!this.signalsAllowed() || getActor(this.state) !== HUMAN_ID) return [];
    const legal = getLegalActions(this.state, HUMAN_ID);
    if (this.state.phase === 'AWAITING_TRUCO' || this.state.phase === 'AWAITING_ENVIDO') return ['¿Qué hacemos?'];
    if (this.state.phase !== 'PLAYING') return [];
    if (this.isPieNow(HUMAN_ID)) {
      return legal.some((a) => a.type === 'CALL_ENVIDO') ? ['¿Canto tanto?', '¿Tienen algo?'] : ['¿Tienen algo?'];
    }
    // No sos el pie: en la 1ra baza se le pregunta al pie; después se coordina entre todos.
    return this.state.hand.tricks.length === 0 ? ['¿Qué juego?'] : ['¿Qué hago?', '¿Qué te queda?'];
  }

  /**
   * Estirar la espera de una consulta (estás escribiendo o hablando): el que preguntó espera otro rato
   * entero. Hasta 3 veces por consulta. Devuelve si la estiró.
   */
  holdConsult(): boolean {
    const consult = this.consult;
    const timer = this.consultTimer;
    if (!consult || !timer || this.consultHolds >= 3 || this.timing.consultWait <= 0) return false;
    if (timer.version !== this.state.version || getActor(this.state) !== timer.actor) return false;
    timer.cancel();
    this.consultHolds += 1;
    this.consult = { ...consult, waitMs: this.timing.consultWait, id: ++this.consultSeq };
    this.scheduleConsultDecision(timer.actor, this.timing.consultWait);
    this.notify();
    return true;
  }

  private scheduleConsultDecision(actor: PlayerId, ms: number): void {
    const version = this.state.version;
    const cancel = this.scheduler.schedule(ms, () => {
      if (this.state.version !== version) return;
      this.playAi(actor);
    });
    this.consultTimer = { cancel, actor, version };
  }

  /** Se contestó la consulta: el que preguntó decide enseguida (sin esperar el resto del tiempo). */
  private answerConsult(): void {
    const consult = this.consult;
    this.consult = null;
    this.consultTimer?.cancel();
    this.consultTimer = null;
    if (!consult || getActor(this.state) !== consult.askerId) return;
    const version = this.state.version;
    this.scheduler.schedule(400, () => {
      if (this.state.version !== version) return;
      this.playAi(consult.askerId);
    });
  }

  /**
   * Antes de que decida una IA del equipo del humano, se habla en equipo (GDD §2.3):
   * - el pie pregunta si canta el tanto (1ra baza);
   * - el que contesta un canto pregunta qué hacer («el envido está primero» si todavía se puede);
   * - antes de jugar una carta: si sos el pie, tu compañero te pregunta qué juega (en cualquier baza, salvo
   *   que ya le hayas indicado en esta baza); si el pie es de la IA, le pregunta a él en la 1ra baza, y desde
   *   la 2da pregunta a todos (el pie contesta y vos podés indicar).
   * Los compañeros de la IA contestan enseguida; al humano se le dan respuestas rápidas y un rato para
   * contestar. Devuelve cuánto hay que esperar (0 si no hay que esperarte).
   */
  private maybeConsult(actor: PlayerId): number {
    if (!this.signalsAllowed() || actor === HUMAN_ID || this.teamOf(actor) !== this.teamOf(HUMAN_ID)) return 0;
    const state = this.state;
    const legal = getLegalActions(state, actor);
    const trick = state.hand.tricks.length;
    const humanPie = this.isPieNow(HUMAN_ID);
    const aiPie = partnersOf(state, HUMAN_ID).find((id) => id !== HUMAN_ID && this.isPieNow(id));
    let consult: Omit<Consult, 'waitMs' | 'id'> | null = null;
    let wait = this.timing.consultWait;
    if (state.phase === 'PLAYING' && this.isPieNow(actor) && trick === 0 && legal.some((a) => a.type === 'CALL_ENVIDO') && !this.asked.has('tanto')) {
      this.asked.add('tanto');
      consult = { askerId: actor, kind: 'tanto', question: '¿Canto tanto?', options: ['Cantá el tanto', 'Jugá callado', 'Tengo tanto', 'No tengo nada'] };
    } else if (state.phase === 'AWAITING_TRUCO' || state.phase === 'AWAITING_ENVIDO') {
      const key = `resp-${state.phase}-${state.hand.truco.level}-${state.hand.envido.chain.length}`;
      if (!this.asked.has(key)) {
        this.asked.add(key);
        const options = ['Quiero', 'No quiero', 'Subile'];
        if (state.phase === 'AWAITING_TRUCO' && legal.some((a) => a.type === 'CALL_ENVIDO')) options.unshift('El envido está primero');
        consult = { askerId: actor, kind: 'respuesta', question: '¿Qué hacemos?', options };
      }
    } else if (state.phase === 'PLAYING' && legal.some((a) => a.type === 'PLAY_CARD') && !this.isPieNow(actor)) {
      const key = `jugada-${trick}-${actor}`;
      if (this.asked.has(key) || this.humanInstructedTrick === trick) return 0;
      this.asked.add(key);
      const questions = ['¿Qué juego?', '¿Qué tiro?', '¿Qué hago?'];
      const question = questions[Math.floor(this.rng.next() * questions.length)];
      const options = ['¡Matá!', 'Pasá', 'Pardá', 'Jugá tranquilo'];
      if (humanPie) {
        consult = { askerId: actor, kind: 'jugada', question, options };
      } else if (aiPie) {
        // Le pregunta al pie de la IA, que contesta con lo que indica.
        this.say(actor, question);
        this.say(aiPie, pieWhatToDo(this.instructionsFor(actor)));
        if (trick === 0) return 0;
        // Desde la 2da baza se coordina entre todos: tenés un rato para indicar otra cosa.
        this.consult = { askerId: actor, kind: 'jugada', question, options, waitMs: Math.round(wait * 0.5), id: ++this.consultSeq };
        this.consultHolds = 0;
        return this.consult.waitMs;
      }
    }
    if (!consult) return 0;
    this.say(actor, consult.question);
    for (const partner of partnersOf(state, actor)) {
      if (partner === HUMAN_ID || consult.kind === 'jugada') continue;
      if (consult.kind === 'tanto') {
        const reply = aiTantoAnswer(state, partner, this.rng);
        this.say(partner, reply.text);
        this.claims.push(reply.claim);
      } else {
        this.say(partner, aiResponseOpinion(state, partner).text);
      }
    }
    if (wait <= 0) wait = 0;
    this.consult = { ...consult, waitMs: wait, id: ++this.consultSeq };
    this.consultHolds = 0;
    return wait;
  }

  /** Alguien dice algo en voz alta (queda en `speech` para los globos y la voz). */
  private say(playerId: PlayerId | undefined, text: string): void {
    if (!playerId) return;
    this.speechId += 1;
    this.speech = [...this.speech.slice(-19), { id: this.speechId, playerId, text }];
  }

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
    this.talk = { ...this.talk, signals: [...this.talk.signals, { from: HUMAN_ID, kind, cardId: option?.cardId ?? null }] };
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
      // Los compañeros del humano juegan en "normal" (GDD §11.2), salvo en "experta": ahí también son la
      // red, que aprendió a coordinar con su pie (y a hacerle caso si el pie es el humano).
      const expert = this.settings.difficulty === 'expert';
      const difficulty: Difficulty = seat.team === 0 && !expert ? 'normal' : this.settings.difficulty;
      this.policies.set(seat.id, createPolicy(difficulty));
    }
  }

  private teamOf(playerId: PlayerId): number {
    return teamOfPlayer(this.state, playerId);
  }

  private isPieNow(playerId: PlayerId): boolean {
    return isPieNow(this.state, playerId);
  }

  /**
   * Al empezar la mano, cada IA que no es pie le hace sus señas a su pie (GDD §2.1), y cada pie
   * de la IA da sus primeras indicaciones.
   */
  private dealSignals(): void {
    this.claims = [];
    this.advice = {};
    this.slowPlay = new Set();
    this.asked = new Set();
    this.consult = null;
    this.consultTimer = null;
    this.humanInstructedTrick = -1;
    this.talk = dealTalk(this.state, (playerId) => playerId !== HUMAN_ID);
    this.refreshAiInstructions(true);
  }

  /** Las señas que ve `playerId`: si es el pie, las de sus compañeros; si no, ninguna. */
  private signalsFor(playerId: PlayerId): Signal[] {
    return signalsFor(this.state, this.talk, playerId);
  }

  /** Lo que el pie le indicó a `playerId` (nada si él mismo es el pie). */
  private instructionsFor(playerId: PlayerId): Instruction[] {
    return instructionsFor(this.state, this.talk, playerId);
  }

  private setInstruction(given: GivenInstruction): void {
    this.talk = withInstruction(this.state, this.talk, given);
  }

  /**
   * Los pies de la IA indican según su mano y las señas recibidas (al empezar la mano y en cada baza).
   * Un pie de la red decide con la red (igual que en el entrenamiento); los demás, con la heurística.
   */
  private refreshAiInstructions(withTruco: boolean): void {
    if (!talkAllowed(this.state)) return;
    const netPie = (pieId: PlayerId): NetPolicy | null => {
      const policy = pieId === HUMAN_ID ? undefined : this.policies.get(pieId);
      return policy instanceof NetPolicy && policy.canInstruct(getObservation(this.state, pieId)) ? policy : null;
    };
    // Lo que indicó el humano (mesa abierta) sigue vigente en la mano: el pie de la IA no se lo pisa.
    const fromHuman = this.talk.instructions.filter((given) => given.from === HUMAN_ID);
    this.talk = refreshHeuristicInstructions(this.state, this.talk, withTruco, (pieId) => pieId !== HUMAN_ID && !netPie(pieId));
    for (const seat of this.state.seats) {
      const policy = isPieNow(this.state, seat.id) ? netPie(seat.id) : null;
      if (!policy) continue;
      const kinds = withTruco && this.state.hand.truco.level === 0 ? (['cartas', 'truco'] as const) : (['cartas'] as const);
      const given = policy.instruct(
        getObservation(this.state, seat.id),
        this.rng,
        this.signalsFor(seat.id),
        teamInstructions(this.state, this.talk, seat.id),
        kinds,
      );
      for (const kind of given) this.setInstruction({ from: seat.id, kind });
    }
    for (const given of fromHuman) this.setInstruction(given);
  }

  /**
   * Modo consejo: qué haría la red en el lugar del humano (acciones legales con su probabilidad).
   * Vacío si no es su turno o si la red no juega esta partida (flor, pica-pica, pesos sin cargar).
   */
  humanAdvice(): NetAdvice[] {
    if (getActor(this.state) !== HUMAN_ID || getLegalActions(this.state, HUMAN_ID).length < 2) return [];
    return netAdvice(getObservation(this.state, HUMAN_ID), this.signalsFor(HUMAN_ID), teamInstructions(this.state, this.talk, HUMAN_ID));
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
    const consultWait = this.humanPolicy === undefined ? this.maybeConsult(actor) : 0;
    if (consultWait > 0) this.scheduleConsultDecision(actor, Math.max(wait + this.delay(), consultWait));
    else {
      this.scheduler.schedule(wait + this.delay(), () => {
        if (this.state.version !== version) return;
        this.playAi(actor);
      });
    }
    this.notify();
  }

  private playAi(actor: PlayerId): void {
    const policy = actor === HUMAN_ID ? this.humanPolicy : this.policies.get(actor);
    const legal = getLegalActions(this.state, actor);
    if (legal.length === 0) return;
    if (this.consult?.askerId === actor) {
      this.consult = null;
      this.consultTimer = null;
    }
    let action = legal[0];
    if (policy) {
      try {
        // La red ve también lo que indicó ella misma si es pie (así se entrenó); la heurística, solo lo que le indicaron.
        const told = policy instanceof NetPolicy ? teamInstructions(this.state, this.talk, actor) : this.instructionsFor(actor);
        const team = this.teamOf(actor) as TeamId;
        const advice = team === this.teamOf(HUMAN_ID) && actor !== HUMAN_ID ? this.advice : {};
        // Táctica de equipo encima de la política: seguir el consejo del equipo, o esperar y subir el tanto.
        const tactic = actor === HUMAN_ID ? null : tacticalDecision({ state: this.state, actor, signals: this.signalsFor(actor), advice, slowPlaying: this.slowPlay.has(team) });
        if (tactic?.slowPlay) this.slowPlay.add(team);
        if (tactic?.action) action = tactic.action;
        else {
          const obs = getObservation(this.state, actor);
          const exclude = tactic?.exclude;
          const view = exclude ? { ...obs, legalActions: obs.legalActions.filter((a) => !exclude(a)) } : obs;
          action = policy.decide(view, this.rng, this.signalsFor(actor), told, this.claims);
        }
        if (this.state.phase === 'AWAITING_TRUCO' || this.state.phase === 'AWAITING_ENVIDO') this.advice = { ...this.advice, resp: undefined, call: undefined };
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
