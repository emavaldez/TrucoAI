// Actor del entrenamiento: juega partidas con el motor real y escribe lo que hace falta para
// aprender. Lo lanza training/learner (uno por núcleo), con un trabajo en JSON:
//   node --import tsx training/actors/rollout.ts <trabajo.json>
// Modos:
//   bc     — la heurística "maestra" juega y se guarda (observación, máscara, acción) para imitarla.
//   ppo    — la red actual juega contra la liga; se guarda la trayectoria de cada mano con su recompensa.
//   eval   — partidas duplicadas A contra B (mismas cartas, asientos cambiados); resultado en JSON.
//   wtable — la heurística juega contra sí misma y se arma la tabla de probabilidad de ganar.

import { readFile, rename, writeFile } from 'node:fs/promises';
import { applyAction, createMatch, createRng, envidoScore, getActor, getObservation, pieOf, startNextHand } from '../../src/engine/index.js';
import type { MatchState, PlayerId, Rng, TeamId } from '../../src/engine/index.js';
import { createPolicy, type Difficulty, type Policy } from '../../src/ai/policy.js';
import { aiInstructions } from '../../src/ai/signs.js';
import {
  EMPTY_TALK,
  dealTalk,
  instructionsFor,
  playedCards,
  signalsFor,
  talkAllowed,
  withInstruction,
  type TableTalk,
} from '../../src/ai/tableTalk.js';
import { claimMoments, trueLevel } from '../../src/ai/talk/claims.js';
import { addVerdicts, checkClaims, trustFor, type Reputation, type SpokenClaim } from '../../src/ai/talk/reputation.js';
import { aiCardsAnswer, aiTantoAnswer, rivalPieStillToAct, tacticalDecision, type PublicClaim } from '../../src/ai/talk/team.js';
import {
  FIRST_TALK_ACTION,
  TALK_LEVELS,
  talkIndex,
  talkMask,
  talkOf,
  type TalkTopic,
  CARD_INSTRUCTIONS,
  FIRST_CARD_INSTRUCTION,
  FIRST_TRUCO_INSTRUCTION,
  N_ACTIONS,
  N_ENGINE_ACTIONS,
  TRUCO_INSTRUCTIONS,
  actionIndex,
  instructionIndex,
  instructionMask,
  instructionOf,
  legalMask,
  type InstructionDecision,
} from '../../src/ai/rl/actions.js';
import { encodeObs, encodePriv, layoutHash, obsLayout, PRIV_DIM, talkExtras } from '../../src/ai/rl/encode.js';
import { compliance } from '../env/obey.js';
import type { Mlp } from '../../src/ai/rl/mlp.js';
import { loadMlp } from '../env/loadMlp.js';
import { computeWTable, wValue, type HandDistribution, type WTable } from '../env/wtable.js';

/**
 * `mute`: se calla siempre (lo que dice queda como "calla"); `deaf`: no escucha (no ve lo dicho, y si es heurística
 * no le cree a nadie). Sirven para medir cuánto vale hablar y escuchar (r4).
 */
type TalkFlags = { mute?: boolean; deaf?: boolean };
type AgentSpec = ({ kind: 'mlp'; path: string; greedy?: boolean } | { kind: 'heur'; difficulty: Difficulty } | { kind: 'self' }) & TalkFlags;

interface Job {
  mode: 'bc' | 'ppo' | 'eval' | 'wtable' | 'wtable-from-dist';
  /** wtable-from-dist: distribución juntada por el learner */
  dist?: string;
  seed: number;
  matches: number;
  players: 2 | 4 | 6;
  out: string;
  wtable?: string;
  /** ppo: la red que aprende */
  learner?: string;
  /** ppo: rivales con peso; bc: rivales de la maestra */
  opponents?: (AgentSpec & { weight: number; name?: string })[];
  /** bc: la heurística que se imita */
  teacher?: Difficulty;
  /** eval */
  a?: AgentSpec;
  b?: AgentSpec;
  /** ppo: premio por cumplir cada indicación del pie (se suma a la recompensa de esa decisión) */
  obeyBonus?: number;
  /**
   * r4: se habla en voz alta en la mesa (de qué temas); sin esto, nadie dice nada (como hasta r3).
   * `reputation`: lo dicho se comprueba al terminar cada mano y cada jugador arrastra en la partida cuántas veces
   * dijo la verdad y cuántas mintió (la red lo ve; la heurística le cree según eso).
   * `matchCredit`: la trayectoria de cada jugador es la partida entera (el premio sigue siendo mano por mano, pero
   * una mentira carga con lo que cueste en las manos siguientes).
   */
  talk?: { topics: TalkTopic[]; reputation?: boolean; matchCredit?: boolean };
}

// ---------- agentes ----------

interface Agent {
  name: string;
  mlp?: Mlp;
  greedy?: boolean;
  policy?: Policy;
  /** la red ve lo dicho (se entrenó con el tramo `claims`) */
  hears?: boolean;
  /** la red ve además la reputación (tramo `reputation`) */
  hearsRep?: boolean;
  mute?: boolean;
  deaf?: boolean;
}

/** Huellas de la observación: sin lo dicho (hasta r3) y con lo dicho (r4). */
interface Hashes {
  base: string;
  claims: string;
  reputation: string;
}

const mlpCache = new Map<string, Mlp>();

async function makeAgent(spec: AgentSpec, learner: Agent | null, name: string, hashes: Hashes): Promise<Agent> {
  const flags = { mute: spec.mute, deaf: spec.deaf };
  if (spec.kind === 'self') {
    if (!learner) throw new Error('"self" sin red que aprende');
    return spec.mute || spec.deaf ? { ...learner, ...flags, name } : learner;
  }
  if (spec.kind === 'heur') return { name, policy: createPolicy(spec.difficulty), ...flags };
  let mlp = mlpCache.get(spec.path);
  if (!mlp) {
    mlp = await loadMlp(spec.path);
    if (![hashes.base, hashes.claims, hashes.reputation].includes(mlp.meta.layoutHash)) {
      throw new Error(`la red ${spec.path} se entrenó con otra observación (${mlp.meta.layoutHash} ≠ ${Object.values(hashes).join(' / ')})`);
    }
    mlpCache.set(spec.path, mlp);
  }
  const hash = mlp.meta.layoutHash;
  return { name, mlp, greedy: spec.greedy, hears: hash !== hashes.base, hearsRep: hash === hashes.reputation, ...flags };
}

/** ¿Esta red sabe hablar? (tiene las salidas 19–26) */
function netTalks(agent: Agent): boolean {
  return !!agent.mlp && agent.mlp.meta.nActions > FIRST_TALK_ACTION;
}

// ---------- buffers que crecen ----------

class Grow {
  private data: Uint8Array;
  length = 0;
  constructor(private readonly width: number, initial = 1 << 16) {
    this.data = new Uint8Array(initial * width);
  }
  push(values: ArrayLike<number>, scale: number): void {
    if ((this.length + 1) * this.width > this.data.length) {
      const next = new Uint8Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    const base = this.length * this.width;
    for (let i = 0; i < this.width; i++) this.data[base + i] = Math.round(values[i] * scale);
    this.length += 1;
  }
  bytes(): Uint8Array {
    return this.data.subarray(0, this.length * this.width);
  }
}

class GrowF32 {
  private data = new Float32Array(1 << 16);
  length = 0;
  push(value: number): void {
    if (this.length >= this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = value;
  }
  bytes(): Uint8Array {
    return new Uint8Array(this.data.buffer, 0, this.length * 4);
  }
}

interface Step {
  obs: Float32Array;
  priv: Float32Array | null;
  mask: Uint8Array;
  act: number;
  logp: number;
  /** premio por obedecer al pie en esta decisión (ya multiplicado) */
  bonus?: number;
  /** con `matchCredit`: el premio de la mano que terminó después de esta decisión */
  handReward?: number;
}

class Recorder {
  readonly obs: Grow;
  readonly priv: Grow;
  readonly mask = new Grow(N_ACTIONS);
  readonly act = new Grow(1);
  readonly logp = new GrowF32();
  readonly rew = new GrowF32();
  readonly done = new Grow(1);
  constructor(readonly obsDim: number, private readonly withPriv: boolean) {
    this.obs = new Grow(obsDim);
    this.priv = new Grow(withPriv ? PRIV_DIM : 1);
  }
  /** Una trayectoria (las decisiones de un jugador en una mano), con la recompensa al final. */
  trajectory(steps: readonly Step[], reward: number): void {
    steps.forEach((step, i) => {
      this.obs.push(step.obs, 255);
      if (this.withPriv && step.priv) this.priv.push(step.priv, 255);
      this.mask.push(step.mask, 1);
      this.act.push([step.act], 1);
      this.logp.push(step.logp);
      const last = i === steps.length - 1;
      this.rew.push((last ? reward : 0) + (step.bonus ?? 0) + (step.handReward ?? 0));
      this.done.push([last ? 1 : 0], 1);
    });
  }
  get count(): number {
    return this.act.length;
  }
  async write(prefix: string, meta: object): Promise<void> {
    const files: [string, Uint8Array][] = [
      ['obs.u8', this.obs.bytes()],
      ['mask.u8', this.mask.bytes()],
      ['act.u8', this.act.bytes()],
      ['logp.f32', this.logp.bytes()],
      ['rew.f32', this.rew.bytes()],
      ['done.u8', this.done.bytes()],
    ];
    if (this.withPriv) files.push(['priv.u8', this.priv.bytes()]);
    for (const [ext, bytes] of files) {
      await writeFile(`${prefix}.${ext}.tmp`, bytes);
      await rename(`${prefix}.${ext}.tmp`, `${prefix}.${ext}`);
    }
    // El meta va último: si está, el resto está completo.
    await writeFile(`${prefix}.meta.json.tmp`, JSON.stringify({ ...meta, n: this.count, obsDim: this.obsDim, privDim: this.withPriv ? PRIV_DIM : 0, nActions: N_ACTIONS }));
    await rename(`${prefix}.meta.json.tmp`, `${prefix}.meta.json`);
  }
}

// ---------- una partida ----------

function teamOf(state: MatchState, playerId: PlayerId): TeamId {
  return state.seats.find((seat) => seat.id === playerId)?.team ?? 0;
}

/**
 * Cómo le va al envido de la red que aprende, por mano en la que lo cantó (abrir o subir):
 * `farol` con 23 o menos de tantos, `tantos` con 24 o más. Por grupo: manos, en cuántas el rival
 * no quiso, puntos de envido netos (ganados − perdidos) y cambio en la probabilidad de ganar la
 * partida en esa mano (ΔW, lo mismo que la recompensa).
 */
interface EnvidoGroup {
  hands: number;
  noQuiso: number;
  points: number;
  dW: number;
}
type EnvidoStats = Record<'farol' | 'tantos', EnvidoGroup>;

function emptyEnvidoStats(): EnvidoStats {
  return { farol: { hands: 0, noQuiso: 0, points: 0, dW: 0 }, tantos: { hands: 0, noQuiso: 0, points: 0, dW: 0 } };
}

const ENVIDO_CALLS = new Set([6, 7, 8]); // ENVIDO, REAL_ENVIDO, FALTA_ENVIDO

/**
 * La charla de la mesa del lado que aprende: qué indican sus pies (cuántas veces cada indicación) y
 * cuánto obedecen sus compañeros (decisiones en que una indicación decía algo, cumplidas, no cumplidas).
 */
interface TalkStats {
  cartas: number[];
  truco: number[];
  obey: { decisions: number; ok: number; bad: number };
}

function emptyTalkStats(): TalkStats {
  return { cartas: CARD_INSTRUCTIONS.map(() => 0), truco: TRUCO_INSTRUCTIONS.map(() => 0), obey: { decisions: 0, ok: 0, bad: 0 } };
}

/**
 * Lo que dice en voz alta la red que aprende (r4) y cómo escucha:
 * - `tanto` / `cartas`: [lo que tiene de verdad (mucho, algo, nada)][lo que dijo (mucho, algo, nada, calla)].
 *   El tanto se separa en `engano` (el pie rival todavía podía cantar: mentir podía convenir) y `resto`.
 * - `escucha`: cuando la red es pie y puede abrir el envido en la 1ra baza, según lo que dijo del tanto el otro
 *   equipo ("nada", "tiene" o nada dicho): [oportunidades, veces que cantó].
 * - `engano`: manos en que el equipo de la red dijo "nada" de tanto teniendo 28 o más: en cuántas cantó el rival
 *   y los puntos de envido netos.
 */
interface ClaimStats {
  tanto: { engano: number[][]; resto: number[][] };
  cartas: number[][];
  escucha: Record<'nada' | 'tiene' | 'nada_dicho' | 'nada_confiable' | 'nada_mentiroso', [number, number]>;
  engano: { hands: number; rivalSang: number; points: number };
  /** dichos de la red que se pudieron comprobar: [comprobados, mentiras pescadas] */
  pescado: [number, number];
  /** por tema: [dichos de la red (sin contar callarse), cuántos se pudieron comprobar al terminar la mano] */
  comprobado: Record<TalkTopic, [number, number]>;
}

function emptyClaimStats(): ClaimStats {
  const grid = () => [0, 1, 2].map(() => [0, 0, 0, 0]);
  return {
    tanto: { engano: grid(), resto: grid() },
    cartas: grid(),
    escucha: { nada: [0, 0], tiene: [0, 0], nada_dicho: [0, 0], nada_confiable: [0, 0], nada_mentiroso: [0, 0] },
    engano: { hands: 0, rivalSang: 0, points: 0 },
    pescado: [0, 0],
    comprobado: { tanto: [0, 0], cartas: [0, 0] },
  };
}

const TRUTH = ['mucho', 'algo', 'nada'] as const;

/** ¿Este agente decide las indicaciones del pie con la red? (las redes de 2 jugadores no saben: heurística) */
function netInstructs(agent: Agent): boolean {
  return !!agent.mlp && agent.mlp.meta.nActions > N_ENGINE_ACTIONS;
}

interface MatchResult {
  winnerTeam: TeamId;
  scores: [number, number];
  hands: { manoTeam: TeamId; delta: [number, number] }[];
  decisions: number;
}

/**
 * Juega una partida. `seatAgents[i]` juega el asiento i. `record(i)` dice si se guardan sus decisiones.
 * Para ppo, `wtable` da la recompensa de cada mano.
 */
function playMatch(
  job: Job,
  matchSeed: number,
  seatAgents: Agent[],
  rng: Rng,
  record: (seat: number) => boolean,
  recorder: Recorder | null,
  wtable: WTable | null,
  envido: EnvidoStats | null = null,
  talkStats: TalkStats | null = null,
  claimStats: ClaimStats | null = null,
): MatchResult {
  let state = createMatch({ rules: { playerCount: job.players, flor: false, picaPica: false }, seed: matchSeed });
  const seatIndex = new Map(state.seats.map((seat) => [seat.id, seat.seat]));
  const pending = new Map<PlayerId, Step[]>();
  /** jugadores (de los que se guardan) que cantaron envido en esta mano, y en qué grupo */
  const sang = new Map<PlayerId, keyof EnvidoStats>();
  const obeyBonus = job.obeyBonus ?? 0;
  let talk: TableTalk = EMPTY_TALK;
  // Charla pública (r4): lo dicho en esta mano, qué momentos ya se hablaron, quién espera para subir el envido.
  const withClaims = !!job.talk;
  const withRep = !!job.talk?.reputation;
  const matchCredit = !!job.talk?.matchCredit;
  /** reputación en la partida (no se borra entre manos) */
  const reputation: Reputation = {};
  let claims: SpokenClaim[] = [];
  let said = new Set<string>();
  let slowPlay = new Set<TeamId>();
  const baitTeams = new Set<TeamId>();

  /** La observación codificada para este agente: las redes de r4 ven lo dicho; las demás, no. */
  const encodeFor = (agent: Agent, obs: ReturnType<typeof getObservation>, extras: ReturnType<typeof talkExtras>): Float32Array => {
    const hears = agent.mlp ? agent.hears : withClaims;
    const hearsRep = agent.mlp ? agent.hearsRep : withRep;
    if (!hears) return encodeObs(obs, extras);
    return encodeObs(obs, { ...extras, claims: agent.deaf ? [] : claims, ...(hearsRep ? { reputation: agent.deaf ? {} : reputation } : {}) });
  };

  /** Lo dicho, como lo escucha la heurística: con reputación, le cree más o menos a cada uno. */
  const heardClaims = (): PublicClaim[] => (withRep ? claims.map((c) => ({ ...c, trust: trustFor(reputation[c.from]) })) : claims);

  /** Alguien dice algo en voz alta (o se calla) en un momento de la charla. */
  const speak = (speaker: PlayerId, topic: TalkTopic, key: string): void => {
    const seat = seatIndex.get(speaker) as number;
    const agent = seatAgents[seat];
    let level: PublicClaim['level'] = 'calla';
    if (agent.mute) level = 'calla';
    else if (netTalks(agent)) {
      const x = encodeFor(agent, getObservation(state, speaker), talkExtras(state, talk, speaker));
      const mask = talkMask(topic);
      const choice = (agent.mlp as Mlp).act(x, mask, rng, agent.greedy);
      level = talkOf(choice.action).level;
      if (record(seat) && recorder) pushStep(speaker, { obs: x, priv: encodePriv(state, speaker), mask, act: choice.action, logp: choice.logp });
    } else if (agent.policy) {
      // La heurística contesta como en el juego: la verdad, salvo el engaño del envido (src/ai/talk/team.ts).
      level = topic === 'tanto' ? aiTantoAnswer(state, speaker, rng).claim.level : aiCardsAnswer(state, speaker).claim.level;
      if (record(seat) && recorder) {
        const x = encodeFor(agent, getObservation(state, speaker), talkExtras(state, talk, speaker));
        pushStep(speaker, { obs: x, priv: null, mask: talkMask(topic), act: talkIndex(topic, level), logp: 0 });
      }
    }
    if (claimStats && record(seat) && agent.mlp) {
      const truth = TRUTH.indexOf(trueLevel(topic, state.hand.dealt[speaker] ?? [], state.hand.hands[speaker] ?? []));
      const grid = topic === 'cartas' ? claimStats.cartas : rivalPieStillToAct(state, speaker) ? claimStats.tanto.engano : claimStats.tanto.resto;
      grid[truth][TALK_LEVELS.indexOf(level)] += 1;
      if (topic === 'tanto' && level === 'nada' && truth === 0) baitTeams.add(teamOf(state, speaker));
    }
    said.add(key);
    claims.push({ from: speaker, about: topic, level, cards: topic === 'cartas' ? (state.hand.hands[speaker] ?? []).map((c) => c.id) : [] });
  };

  const pushStep = (playerId: PlayerId, step: Step): void => {
    const steps = pending.get(playerId) ?? [];
    steps.push(step);
    pending.set(playerId, steps);
  };

  /**
   * Los pies indican (4 y 6 jugadores): al empezar la mano cartas y truco; después de cada baza, cartas.
   * Un pie de la red decide (y se guarda como una decisión más de su trayectoria); uno heurístico usa la
   * regla de siempre, y si es el que se imita, se guarda lo que indicó.
   */
  const pieTalk = (startOfHand: boolean): void => {
    if (!talkAllowed(state)) return;
    const played = playedCards(state);
    for (const team of [0, 1] as const) {
      const pie = pieOf(state, team);
      const seat = seatIndex.get(pie) as number;
      const agent = seatAgents[seat];
      const kinds: InstructionDecision[] = startOfHand && state.hand.truco.level === 0 ? ['cartas', 'truco'] : ['cartas'];
      if (netInstructs(agent)) {
        for (const kind of kinds) {
          const obs = getObservation(state, pie);
          const x = encodeFor(agent, obs, talkExtras(state, talk, pie));
          const mask = instructionMask(kind);
          const choice = (agent.mlp as Mlp).act(x, mask, rng, agent.greedy);
          const instruction = instructionOf(choice.action);
          if (instruction) talk = withInstruction(state, talk, { from: pie, kind: instruction });
          if (record(seat)) {
            if (recorder) pushStep(pie, { obs: x, priv: encodePriv(state, pie), mask, act: choice.action, logp: choice.logp });
            if (talkStats) {
              if (kind === 'cartas') talkStats.cartas[choice.action - FIRST_CARD_INSTRUCTION] += 1;
              else talkStats.truco[choice.action - FIRST_TRUCO_INSTRUCTION] += 1;
            }
          }
        }
      } else {
        const given = aiInstructions(pie, state.hand.hands[pie], signalsFor(state, talk, pie), played, kinds.includes('truco'));
        if (record(seat) && recorder && agent.policy) {
          for (const kind of kinds) {
            const obs = getObservation(state, pie);
            const act = instructionIndex(kind, given.map((g) => g.kind));
            pushStep(pie, { obs: encodeFor(agent, obs, talkExtras(state, talk, pie)), priv: null, mask: instructionMask(kind), act, logp: 0 });
          }
        }
        for (const instruction of given) talk = withInstruction(state, talk, instruction);
      }
    }
  };

  const startHand = (): void => {
    claims = [];
    said = new Set();
    slowPlay = new Set();
    baitTeams.clear();
    talk = dealTalk(state, () => true);
    pieTalk(true);
  };
  startHand();
  const hands: MatchResult['hands'] = [];
  let handStart: [number, number] = [state.scores[0], state.scores[1]];
  let manoTeam = teamOf(state, state.hand.manoId);
  let decisions = 0;
  let guard = 0;

  const closeHand = (): void => {
    const after: [number, number] = [state.scores[0], state.scores[1]];
    hands.push({ manoTeam, delta: [after[0] - handStart[0], after[1] - handStart[1]] });
    const rewardFor = (team: TeamId): number => {
      if (!wtable) return 0;
      const before = wValue(wtable, handStart[team], handStart[1 - team], manoTeam === team ? 1 : 0);
      const end =
        state.phase === 'MATCH_OVER'
          ? state.winnerTeam === team
            ? 1
            : 0
          : wValue(wtable, after[team], after[1 - team], manoTeam === team ? 0 : 1);
      return end - before;
    };
    if (matchCredit) {
      // La partida entera es una trayectoria: el premio de la mano se anota en la última decisión de cada uno.
      for (const [playerId, steps] of pending) {
        const last = steps[steps.length - 1];
        if (last) last.handReward = (last.handReward ?? 0) + rewardFor(teamOf(state, playerId));
      }
      if (state.phase === 'MATCH_OVER' && recorder) for (const steps of pending.values()) if (steps.length > 0) recorder.trajectory(steps, 0);
    } else {
      for (const [playerId, steps] of pending) {
        if (steps.length === 0 || !recorder) continue;
        recorder.trajectory(steps, rewardFor(teamOf(state, playerId)));
      }
    }
    if (withClaims) {
      // Se comprueba lo dicho siempre (para medir); la reputación solo se arrastra si está prendida.
      const verdicts = checkClaims(state, claims);
      if (withRep) addVerdicts(reputation, verdicts);
      if (claimStats) {
        const mine = (from: PlayerId): boolean => {
          const seat = seatIndex.get(from) as number;
          return record(seat) && !!seatAgents[seat].mlp;
        };
        for (const c of claims) if (c.level !== 'calla' && mine(c.from)) claimStats.comprobado[c.about][0] += 1;
        for (const v of verdicts) {
          if (!mine(v.from)) continue;
          claimStats.comprobado[v.about][1] += 1;
          claimStats.pescado[0] += 1;
          if (v.verdict === 'mentira') claimStats.pescado[1] += 1;
        }
      }
    }
    const result = state.hand.envido.result;
    if (envido && result) {
      for (const [playerId, group] of sang) {
        const team = teamOf(state, playerId);
        const g = envido[group];
        g.hands += 1;
        if (!result.accepted && result.winnerTeam === team) g.noQuiso += 1;
        g.points += result.winnerTeam === team ? result.points : -result.points;
        g.dW += rewardFor(team);
      }
    }
    if (claimStats) {
      for (const team of baitTeams) {
        claimStats.engano.hands += 1;
        const first = state.hand.envido.chain[0];
        if (first && first.team !== team) claimStats.engano.rivalSang += 1;
        if (result) claimStats.engano.points += result.winnerTeam === team ? result.points : -result.points;
      }
    }
    if (!matchCredit || state.phase === 'MATCH_OVER') pending.clear();
    sang.clear();
    talk = EMPTY_TALK;
  };

  while (state.phase !== 'MATCH_OVER' && guard++ < 20000) {
    if (state.phase === 'HAND_OVER') {
      state = startNextHand(state).state;
      handStart = [state.scores[0], state.scores[1]];
      manoTeam = teamOf(state, state.hand.manoId);
      startHand();
      continue;
    }
    const actor = getActor(state) as PlayerId;
    const seat = seatIndex.get(actor) as number;
    const agent = seatAgents[seat];
    // Antes de que decida, hablan los que tienen que hablar ("¿canto tanto?", "¿qué hacemos?").
    if (job.talk) for (const moment of claimMoments(state, actor, said, job.talk.topics)) speak(moment.speaker, moment.topic, moment.key);
    const obs = getObservation(state, actor);
    let action = obs.legalActions[0];
    decisions += 1;
    const extras = talkExtras(state, talk, actor);
    if (agent.mlp) {
      const x = encodeFor(agent, obs, extras);
      const { mask, actions } = legalMask(obs);
      const choice = agent.mlp.act(x, mask, rng, agent.greedy);
      action = actions[choice.action] ?? action;
      if (claimStats && record(seat) && obs.phase === 'PLAYING' && obs.tricks.length === 0 && mask[6]) {
        // Escuchar: ¿canta envido distinto según lo que dijo del tanto el otro equipo?
        const rivals = claims.filter((c) => c.about === 'tanto' && c.level !== 'calla' && teamOf(state, c.from) !== teamOf(state, actor));
        const bucket = rivals.length === 0 ? 'nada_dicho' : rivals.some((c) => c.level !== 'nada') ? 'tiene' : 'nada';
        const calls = ENVIDO_CALLS.has(choice.action) ? 1 : 0;
        claimStats.escucha[bucket][0] += 1;
        claimStats.escucha[bucket][1] += calls;
        if (bucket === 'nada' && withRep) {
          // ¿Le cree menos a un "no tengo nada" de alguien que ya pescó mintiendo?
          const liar = rivals.some((c) => (reputation[c.from]?.mentira ?? 0) > 0);
          const sub = liar ? 'nada_mentiroso' : 'nada_confiable';
          claimStats.escucha[sub][0] += 1;
          claimStats.escucha[sub][1] += calls;
        }
      }
      if (record(seat) && ENVIDO_CALLS.has(choice.action) && !sang.has(actor)) {
        sang.set(actor, envidoScore(state.hand.dealt[actor] ?? []) <= 23 ? 'farol' : 'tantos');
      }
      if (record(seat)) {
        // Premio por obedecer al pie (solo los compañeros: el pie no recibe indicaciones).
        const told = instructionsFor(state, talk, actor);
        const obeyed = told.length > 0 ? compliance(obs, told, choice.action, mask) : 0;
        if (talkStats && told.length > 0 && obeyed !== 0) {
          talkStats.obey.decisions += 1;
          if (obeyed > 0) talkStats.obey.ok += 1;
          else talkStats.obey.bad += 1;
        }
        if (recorder) pushStep(actor, { obs: x, priv: encodePriv(state, actor), mask, act: choice.action, logp: choice.logp, bonus: obeyBonus * obeyed });
      }
    } else if (agent.policy) {
      const signals = signalsFor(state, talk, actor);
      // Con charla, la heurística escucha (le cree a lo dicho) y hace la jugada de esperar y subir, como en el juego.
      const team = teamOf(state, actor);
      const tactic = job.talk ? tacticalDecision({ state, actor, signals, advice: {}, slowPlaying: slowPlay.has(team) }) : null;
      if (tactic?.slowPlay) slowPlay.add(team);
      if (tactic?.action) action = tactic.action;
      else {
        const exclude = tactic?.exclude;
        const view = exclude ? { ...obs, legalActions: obs.legalActions.filter((a) => !exclude(a)) } : obs;
        const heard = job.talk && !agent.deaf ? heardClaims() : [];
        action = agent.policy.decide(view, rng, signals, instructionsFor(state, talk, actor), heard);
      }
      if (record(seat) && recorder && obs.legalActions.length > 1) {
        // Imitación: solo decisiones con opciones (con una sola legal no hay nada que aprender).
        const { mask } = legalMask(obs);
        pushStep(actor, { obs: encodeFor(agent, obs, extras), priv: null, mask, act: actionIndex(action, obs), logp: 0 });
      }
    }
    const result = applyAction(state, actor, action);
    if (!result.ok) throw new Error(`acción ilegal ${JSON.stringify(action)}: ${result.error}`);
    state = result.state;
    if (state.phase === 'HAND_OVER' || state.phase === 'MATCH_OVER') closeHand();
    else if (result.events.some((event) => event.type === 'TRICK_WON')) pieTalk(false);
  }
  if (state.phase !== 'MATCH_OVER') throw new Error(`la partida ${matchSeed} no terminó`);
  return { winnerTeam: state.winnerTeam as TeamId, scores: [state.scores[0], state.scores[1]], hands, decisions };
}

function pickWeighted<T extends { weight: number }>(items: readonly T[], rng: Rng): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = rng.next() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

// ---------- modos ----------

async function main(): Promise<void> {
  const job = JSON.parse(await readFile(process.argv[2], 'utf8')) as Job;
  const rng = createRng(job.seed >>> 0);
  const sample = getObservation(createMatch({ rules: { playerCount: job.players, flor: false, picaPica: false }, seed: 1 }), 'p0');
  const layout = obsLayout(sample, !!job.talk, !!job.talk?.reputation);
  const hash = layoutHash(layout);
  const hashes: Hashes = {
    base: layoutHash(obsLayout(sample)),
    claims: layoutHash(obsLayout(sample, true)),
    reputation: layoutHash(obsLayout(sample, true, true)),
  };
  const obsDim = layout.reduce((sum, part) => sum + part.size, 0);
  const n = job.players;
  const started = Date.now();

  if (job.mode === 'wtable-from-dist') {
    const merged = JSON.parse(await readFile(job.dist as string, 'utf8')) as { hands: number; dist: HandDistribution };
    const table = computeWTable(merged.dist, `heurística difícil contra sí misma, ${merged.hands} manos`);
    await writeFile(`${job.out}.json.tmp`, JSON.stringify(table));
    await rename(`${job.out}.json.tmp`, `${job.out}.json`);
    return;
  }

  if (job.mode === 'wtable') {
    const hard: Agent = { name: 'hard', policy: createPolicy(job.teacher ?? 'hard') };
    const counts = new Map<string, number>();
    let total = 0;
    for (let m = 0; m < job.matches; m++) {
      const result = playMatch(job, job.seed * 100003 + m, new Array(n).fill(hard), rng, () => false, null, null);
      for (const hand of result.hands) {
        const x = hand.delta[hand.manoTeam];
        const y = hand.delta[1 - hand.manoTeam];
        const key = `${x},${y}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        total += 1;
      }
    }
    const dist: HandDistribution = [...counts].map(([key, c]) => {
      const [x, y] = key.split(',').map(Number);
      return [x, y, c / total];
    });
    await writeFile(`${job.out}.dist.json`, JSON.stringify({ hands: total, dist }));
    const table = computeWTable(dist, `${job.teacher ?? 'hard'} vs ${job.teacher ?? 'hard'}, ${total} manos`);
    await writeFile(`${job.out}.json`, JSON.stringify(table));
    return;
  }

  if (job.mode === 'eval') {
    const a = await makeAgent(job.a as AgentSpec, null, 'A', hashes);
    const b = await makeAgent(job.b as AgentSpec, null, 'B', hashes);
    let winsA = 0;
    let games = 0;
    let pointsA = 0;
    let pointsB = 0;
    let decisions = 0;
    for (let m = 0; m < job.matches; m++) {
      const matchSeed = job.seed * 100003 + m;
      // Partida doble: mismas cartas, A primero en el equipo 0 y después en el 1.
      for (const teamA of [0, 1] as const) {
        const agents = Array.from({ length: n }, (_, seat) => ((seat % 2) as TeamId) === teamA ? a : b);
        const result = playMatch(job, matchSeed, agents, rng, () => false, null, null);
        games += 1;
        if (result.winnerTeam === teamA) winsA += 1;
        pointsA += result.scores[teamA];
        pointsB += result.scores[1 - teamA];
        decisions += result.decisions;
      }
    }
    await writeFile(job.out, JSON.stringify({ games, winsA, pointsA, pointsB, decisions, seconds: (Date.now() - started) / 1000 }));
    return;
  }

  const wtable = job.wtable ? (JSON.parse(await readFile(job.wtable, 'utf8')) as WTable) : null;

  if (job.mode === 'bc') {
    const teacher: Agent = { name: 'teacher', policy: createPolicy(job.teacher ?? 'hard') };
    const opponents = job.opponents ?? [{ kind: 'heur', difficulty: 'hard', weight: 1 } as const];
    const recorder = new Recorder(obsDim, false);
    let decisions = 0;
    for (let m = 0; m < job.matches; m++) {
      const spec = pickWeighted(opponents, rng);
      const opponent = await makeAgent(spec, null, spec.name ?? spec.kind, hashes);
      const teacherTeam = (m % 2) as TeamId;
      const agents = Array.from({ length: n }, (_, seat) => ((seat % 2) as TeamId) === teacherTeam ? teacher : opponent);
      const result = playMatch(job, job.seed * 100003 + m, agents, rng, (seat) => seat % 2 === teacherTeam, recorder, wtable);
      decisions += result.decisions;
    }
    await recorder.write(job.out, { mode: 'bc', layoutHash: hash, matches: job.matches, decisions, seconds: (Date.now() - started) / 1000 });
    return;
  }

  // ppo
  const learner = await makeAgent({ kind: 'mlp', path: job.learner as string }, null, 'learner', hashes);
  const opponents = job.opponents ?? [{ kind: 'self', weight: 1 } as const];
  const recorder = new Recorder(obsDim, true);
  const stats: Record<string, { matches: number; wins: number }> = {};
  const envido = emptyEnvidoStats();
  const talkStats = emptyTalkStats();
  const claimStats = emptyClaimStats();
  let decisions = 0;
  for (let m = 0; m < job.matches; m++) {
    const spec = pickWeighted(opponents, rng);
    const name = spec.name ?? (spec.kind === 'heur' ? `heur-${spec.difficulty}` : spec.kind);
    const opponent = await makeAgent(spec, learner, name, hashes);
    const learnerTeam = (m % 2) as TeamId;
    const selfPlay = opponent === learner;
    const agents = Array.from({ length: n }, (_, seat) => ((seat % 2) as TeamId) === learnerTeam ? learner : opponent);
    const result = playMatch(job, job.seed * 100003 + m, agents, rng, (seat) => selfPlay || seat % 2 === learnerTeam, recorder, wtable, envido, talkStats, job.talk ? claimStats : null);
    decisions += result.decisions;
    const entry = (stats[name] ??= { matches: 0, wins: 0 });
    entry.matches += 1;
    if (result.winnerTeam === learnerTeam) entry.wins += 1;
  }
  await recorder.write(job.out, { mode: 'ppo', layoutHash: hash, players: job.players, matches: job.matches, decisions, stats, envido, talk: talkStats, ...(job.talk ? { claims: claimStats } : {}), seconds: (Date.now() - started) / 1000 });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
