// Política de la IA (épica 2): decide una acción de `obs.legalActions` con heurísticas
// (GDD §11). Solo ve la `Observation`; nunca manos ajenas. Tres dificultades:
// fácil (mucho azar, umbrales gruesos), normal (reglas firmes) y difícil (más muestras,
// presión de marcador y farol controlado).

import { cardRank, envidoScore, envidoValue } from '../engine/index.js';
import type { Action, Card, EnvidoCall, Observation, Rng } from '../engine/index.js';
import { chooseCard, lowest, trickLeader } from './cardPlay.js';
import { envidoWinProbability, handWinProbability, publicConstraints } from './estimate.js';
import { signalKnowledge, signaledTopRank, type Instruction, type Signal, type SignalKnowledge } from './signs.js';
import { nextToPlay, participantsOf, playsThisHand, teamMap } from './table.js';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Policy {
  /**
   * `signals` = señas que me hicieron mis compañeros en esta mano (solo las recibe el pie).
   * `instructions` = lo que me indicó el pie de mi equipo (si no soy el pie).
   */
  decide(obs: Observation, rng: Rng, signals?: readonly Signal[], instructions?: readonly Instruction[]): Action;
}

export interface DifficultyProfile {
  /** fracción de decisiones que son una acción legal al azar */
  randomActionRate: number;
  /** muestras de Monte Carlo por estimación */
  samples: number;
  /** probabilidad de farolear (cantar sin tener) */
  bluffRate: number;
  /** tiene en cuenta el marcador (falta envido, riesgo de perder la partida) */
  useScorePressure: boolean;
  /** lee lo público: envidos dichos y cantos → manos probables de los demás */
  readPublic: boolean;
  /** umbrales de probabilidad */
  trucoCall: number;
  trucoRaise: number;
  /** umbral mínimo para querer, por nivel pendiente (1 truco, 2 retruco, 3 vale cuatro) */
  trucoAccept: [number, number, number];
  envidoCall: number;
  envidoReal: number;
  envidoFalta: number;
}

export const PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    randomActionRate: 0.45,
    samples: 24,
    bluffRate: 0,
    useScorePressure: false,
    readPublic: false,
    trucoCall: 0.75,
    trucoRaise: 0.85,
    trucoAccept: [0.5, 0.55, 0.6],
    envidoCall: 0.7,
    envidoReal: 0.85,
    envidoFalta: 0.95,
  },
  normal: {
    randomActionRate: 0.05,
    samples: 80,
    bluffRate: 0,
    useScorePressure: false,
    readPublic: false,
    trucoCall: 0.66,
    trucoRaise: 0.74,
    trucoAccept: [0.4, 0.46, 0.52],
    envidoCall: 0.56,
    envidoReal: 0.74,
    envidoFalta: 0.9,
  },
  hard: {
    randomActionRate: 0,
    samples: 160,
    bluffRate: 0.08,
    useScorePressure: true,
    readPublic: true,
    trucoCall: 0.62,
    trucoRaise: 0.72,
    trucoAccept: [0.36, 0.44, 0.5],
    envidoCall: 0.52,
    envidoReal: 0.7,
    envidoFalta: 0.86,
  },
};

const TRUCO_ACCEPTED = [1, 2, 3, 4];

function has(legal: readonly Action[], predicate: (action: Action) => boolean): Action | undefined {
  return legal.find(predicate);
}

function envidoCall(legal: readonly Action[], call: EnvidoCall): Action | undefined {
  return has(legal, (a) => a.type === 'CALL_ENVIDO' && a.call === call);
}

/** Valor de la falta envido para el ganador `team` (GDD §6.5), con lo público. */
function faltaFor(obs: Observation, team: 0 | 1): number {
  if (obs.picaPica !== null) return 7;
  const leader = Math.max(obs.scores[0], obs.scores[1]);
  if (leader < 15) return obs.rules.targetScore - obs.scores[team];
  return obs.rules.targetScore - leader;
}

/** Querido / no querido de una cadena de envido (GDD §6.3). */
function chainValue(chain: readonly EnvidoCall[], falta: number): { querido: number; noQuerido: number } {
  const sum = (calls: readonly EnvidoCall[]): number =>
    calls.includes('F') ? falta : calls.reduce((total, call) => total + (call === 'R' ? 3 : 2), 0);
  return { querido: sum(chain), noQuerido: chain.length <= 1 ? 1 : sum(chain.slice(0, -1)) };
}

function florScoreOf(obs: Observation): number {
  return 20 + obs.myDealt.reduce((total, card) => total + envidoValue(card), 0);
}

/**
 * Acción legal al azar para el "ruido" de la dificultad, pero nunca una locura: sin mazo ni
 * falta envido (que a 0-0 define la partida entera) si hay otra opción.
 */
function randomAction(legal: readonly Action[], rng: Rng): Action {
  const sane = legal.filter((a) => a.type !== 'MAZO' && !(a.type === 'CALL_ENVIDO' && a.call === 'F'));
  const options = sane.length > 0 ? sane : legal;
  return options[Math.floor(rng.next() * options.length)];
}

function rivalTeam(obs: Observation): 0 | 1 {
  return obs.selfTeam === 0 ? 1 : 0;
}

export class HeuristicPolicy implements Policy {
  /** señas de los compañeros para la decisión en curso */
  private signals: readonly Signal[] = [];
  private knowledge: SignalKnowledge | undefined;
  /** indicaciones del pie para la decisión en curso */
  private instructions: readonly Instruction[] = [];

  constructor(private readonly profile: DifficultyProfile) {}

  decide(obs: Observation, rng: Rng, signals: readonly Signal[] = [], instructions: readonly Instruction[] = []): Action {
    this.instructions = obs.picaPica === null ? instructions : [];
    // En pica-pica no hay señas; y solo cuentan las de compañeros (de mi equipo, no mías).
    const team = new Map(obs.seats.map((seat) => [seat.id, seat.team]));
    this.signals =
      obs.picaPica === null ? signals.filter((signal) => signal.from !== obs.selfId && team.get(signal.from) === obs.selfTeam) : [];
    this.knowledge = this.signals.length > 0 ? signalKnowledge(obs.selfId, this.signals, obs.unseenCards) : undefined;
    const legal = obs.legalActions;
    if (legal.length === 0) throw new Error('NO_LEGAL_ACTIONS');
    if (legal.length === 1) return legal[0];

    const declare = has(legal, (a) => a.type === 'DECLARE_FLOR');
    if (declare) return declare;

    if (rng.next() < this.profile.randomActionRate) return randomAction(legal, rng);

    switch (obs.phase) {
      case 'AWAITING_FLOR':
        return this.answerFlor(obs, legal);
      case 'AWAITING_ENVIDO':
        return this.answerEnvido(obs, legal, rng);
      case 'AWAITING_TRUCO':
        return this.envidoFirst(obs, legal, rng) ?? this.answerTruco(obs, legal, rng);
      default:
        return this.playTurn(obs, legal, rng);
    }
  }

  // ---------- flor ----------

  private answerFlor(obs: Observation, legal: readonly Action[]): Action {
    const score = florScoreOf(obs);
    const pick = (answer: string): Action | undefined =>
      has(legal, (a) => a.type === 'ANSWER_FLOR' && a.answer === answer);
    const falta = faltaFor(obs, obs.selfTeam);
    if (score >= 37 && falta <= 12) return pick('CONTRAFLOR_AL_RESTO') ?? pick('QUIERO') ?? legal[0];
    if (has(legal, (a) => a.type === 'ANSWER_FLOR' && a.answer === 'ACHICO')) {
      if (score >= 33) return pick('CONTRAFLOR') ?? legal[0];
      return pick('ACHICO') ?? legal[0];
    }
    const threshold = has(legal, (a) => a.type === 'ANSWER_FLOR' && a.answer === 'CONTRAFLOR_AL_RESTO') ? 31 : 34;
    return (score >= threshold ? pick('QUIERO') : pick('NO_QUIERO')) ?? legal[0];
  }

  // ---------- envido ----------

  private envidoWin(obs: Observation, rng: Rng): number {
    const constraints = this.profile.readPublic ? publicConstraints(obs) : undefined;
    return envidoWinProbability(obs, rng, this.profile.samples, constraints, this.knowledge);
  }

  /** Canto de apertura según la probabilidad de ganar el envido. */
  private openEnvido(obs: Observation, legal: readonly Action[], rng: Rng): Action | undefined {
    if (!envidoCall(legal, 'E')) return undefined;
    const p = this.envidoWin(obs, rng);
    const falta = faltaFor(obs, obs.selfTeam);
    const bluff = rng.next() < this.profile.bluffRate && envidoScore(obs.myDealt) >= 20;
    if (p >= this.profile.envidoFalta && (falta <= 10 || this.pressure(obs))) return envidoCall(legal, 'F');
    if (p >= this.profile.envidoReal) return envidoCall(legal, 'R');
    if (p >= this.profile.envidoCall || bluff) return envidoCall(legal, 'E');
    return undefined;
  }

  /** "El envido está primero": responder al truco con envido si conviene. */
  private envidoFirst(obs: Observation, legal: readonly Action[], rng: Rng): Action | undefined {
    return this.openEnvido(obs, legal, rng);
  }

  /** Presión de marcador: el rival está cerca de ganar y nosotros lejos. */
  private pressure(obs: Observation): boolean {
    if (!this.profile.useScorePressure) return false;
    const rival = obs.scores[rivalTeam(obs)];
    const own = obs.scores[obs.selfTeam];
    return rival >= 24 && own <= rival - 6;
  }

  private answerEnvido(obs: Observation, legal: readonly Action[], rng: Rng): Action {
    const p = this.envidoWin(obs, rng);
    const chain = obs.envidoChain.map((canto) => canto.call);
    const falta = faltaFor(obs, obs.selfTeam);
    const value = chainValue(chain, falta);
    const quiero = has(legal, (a) => a.type === 'ANSWER_ENVIDO' && a.answer === 'QUIERO') as Action;
    const noQuiero = has(legal, (a) => a.type === 'ANSWER_ENVIDO' && a.answer === 'NO_QUIERO') as Action;

    // Si no querer ya le da la partida al rival, no hay nada que perder queriendo.
    const rivalScore = obs.scores[rivalTeam(obs)];
    if (rivalScore + value.noQuerido >= obs.rules.targetScore) return quiero;

    if (p >= this.profile.envidoFalta && envidoCall(legal, 'F') && (falta <= 10 || this.pressure(obs))) {
      return envidoCall(legal, 'F') as Action;
    }
    if (p >= this.profile.envidoReal && envidoCall(legal, 'R') && !chain.includes('F')) return envidoCall(legal, 'R') as Action;

    // Querer si la esperanza de puntos es mejor que no querer: Q(2p-1) ≥ -NQ.
    const needed = (1 - value.noQuerido / value.querido) / 2;
    // La falta entera de la partida exige más seguridad.
    const matchOnTheLine = rivalScore + value.querido >= obs.rules.targetScore;
    const threshold = Math.max(needed, matchOnTheLine ? 0.5 : 0) + 0.04;
    return p >= threshold ? quiero : noQuiero;
  }

  // ---------- truco ----------

  private handWin(obs: Observation, rng: Rng): number {
    const constraints = this.profile.readPublic ? publicConstraints(obs) : undefined;
    return handWinProbability(obs, rng, this.profile.samples, constraints, this.knowledge);
  }

  private answerTruco(obs: Observation, legal: readonly Action[], rng: Rng): Action {
    const pending = obs.truco.pending;
    const quiero = has(legal, (a) => a.type === 'ANSWER_TRUCO' && a.answer === 'QUIERO');
    const noQuiero = has(legal, (a) => a.type === 'ANSWER_TRUCO' && a.answer === 'NO_QUIERO');
    if (pending === null || quiero === undefined || noQuiero === undefined) return legal[0];

    const level = pending.level;
    const rivalScore = obs.scores[rivalTeam(obs)];
    // No querer ya le da la partida: se quiere siempre.
    if (rivalScore + level >= obs.rules.targetScore) return quiero;

    const p = this.handWin(obs, rng);
    const raise = has(legal, (a) => a.type === 'CALL_TRUCO');
    if (raise && p >= this.profile.trucoRaise) return raise;
    // Esperanza: querer (L+1)(2p-1) contra no querer −L; con margen por los cantos que pueden venir.
    const needed = 1 / (2 * (level + 1));
    const threshold = Math.max(needed, this.profile.trucoAccept[level - 1]);
    // Si querer y perder le da la partida al rival, más cuidado.
    const risky = rivalScore + TRUCO_ACCEPTED[level] >= obs.rules.targetScore;
    return p >= (risky ? Math.max(threshold, 0.5) : threshold) ? quiero : noQuiero;
  }

  // ---------- mi turno ----------

  private playTurn(obs: Observation, legal: readonly Action[], rng: Rng): Action {
    const envido = this.openEnvido(obs, legal, rng);
    if (envido) return envido;

    const truco = has(legal, (a) => a.type === 'CALL_TRUCO');
    const cards = legal.filter((a): a is Extract<Action, { type: 'PLAY_CARD' }> => a.type === 'PLAY_CARD');
    // Lo que dice el pie manda sobre el truco: "cantá truco" / "esperá".
    if (truco && obs.truco.level === 0 && this.instructions.includes('CANTA_TRUCO')) return truco;
    if (truco && !this.instructions.includes('ESPERA')) {
      const p = this.handWin(obs, rng);
      const level = obs.truco.level;
      const threshold = level === 0 ? this.profile.trucoCall : this.profile.trucoRaise;
      const bluff = rng.next() < this.profile.bluffRate && p >= 0.3;
      if (p >= threshold || bluff) return truco;
    }

    if (cards.length === 0) return legal[0];
    const participants = participantsOf(obs);
    const teams = teamMap(obs);
    const leaderIndex = participants.indexOf(obs.currentTrick.leaderId);
    const n = participants.length;
    let rivalsAfter = 0;
    let teammateAfterTop = -1;
    const played = playsThisHand(obs);
    for (let k = obs.currentTrick.plays.length + 1; k < n; k++) {
      const playerId = participants[(leaderIndex + k) % n];
      if (teams.get(playerId) !== obs.selfTeam) rivalsAfter += 1;
      else {
        const theirs = played.filter((play) => play.playerId === playerId).map((play) => play.card);
        teammateAfterTop = Math.max(teammateAfterTop, signaledTopRank(playerId, this.signals, theirs));
      }
    }
    // Defensa: si por algún motivo no soy el que juega según la mesa, juego la más baja.
    if (nextToPlay(obs, participants) !== obs.selfId) return cards[0];
    const ordered = this.followInstruction(obs, teams);
    if (ordered) return cards.find((a) => a.cardId === ordered.id) ?? cards[0];
    const card = chooseCard({
      hand: obs.myHand,
      plays: obs.currentTrick.plays,
      myTeam: obs.selfTeam,
      teams,
      results: obs.tricks.map((trick) => trick.winnerTeam),
      rivalsAfter,
      teammateAfterTop,
    });
    return cards.find((a) => a.cardId === card.id) ?? cards[0];
  }

  /** La carta que pide el pie ("¡matá!", "pasá", "pardá"), o `null` si juego a mi criterio. */
  private followInstruction(obs: Observation, teams: ReturnType<typeof teamMap>): Card | null {
    const hand = obs.myHand;
    if (hand.length === 0) return null;
    const plays = obs.currentTrick.plays.length >= participantsOf(obs).length ? [] : obs.currentTrick.plays;
    const lead = trickLeader(plays, teams);
    const byRank = [...hand].sort((a, b) => cardRank(a) - cardRank(b));
    if (this.instructions.includes('PASA')) return lowest(hand);
    if (this.instructions.includes('MATA')) {
      if (plays.length === 0) return byRank[byRank.length - 1];
      if (lead.winner === obs.selfTeam) return lowest(hand);
      return byRank.find((card) => cardRank(card) > lead.rank) ?? lowest(hand);
    }
    if (this.instructions.includes('PARDA')) {
      return byRank.find((card) => cardRank(card) === lead.rank) ?? byRank.find((card) => cardRank(card) > lead.rank) ?? lowest(hand);
    }
    return null;
  }
}

export function createPolicy(difficulty: Difficulty): Policy {
  return new HeuristicPolicy(PROFILES[difficulty]);
}

/** Política aleatoria (para arena y tests). */
export const randomPolicy: Policy = {
  decide(obs, rng) {
    return obs.legalActions[Math.floor(rng.next() * obs.legalActions.length)];
  },
};
