// La red entrenada por refuerzo jugando en el juego (training/PLAN.md, fase 5).
// - 2 jugadores: r2 (iteración 2000). 4 y 6: r3 (equipos, con indicaciones del pie).
// - Siempre sin flor ni pica-pica (así se entrenó): si la partida tiene flor o pica-pica, juega la
//   heurística que se le pase como respaldo. También si los pesos todavía no cargaron.
// - Usa exactamente la misma codificación que el entrenamiento (encode.ts) y la misma inferencia (mlp.ts).

import type { Action, Observation, Rng } from '../../engine/index.js';
import type { Policy } from '../policy.js';
import type { Instruction, Signal } from '../signs.js';
import { ACTION_NAMES, instructionMask, instructionOf, legalMask, N_ENGINE_ACTIONS, type InstructionDecision } from './actions.js';
import { encodeObs, layoutHash, obsLayout } from './encode.js';
import { mlpFromBuffers, type Mlp, type MlpMeta } from './mlp.js';

export interface NetModels {
  /** mano a mano */
  two: Mlp | null;
  /** 4 y 6 jugadores (sabe dar indicaciones de pie) */
  teams: Mlp | null;
}

let models: NetModels = { two: null, teams: null };
let loading: Promise<NetModels> | null = null;

/** Para tests y para cargar desde otro lado. */
export function setNetModels(next: NetModels): void {
  models = next;
}

export function netModels(): NetModels {
  return models;
}

async function fetchMlp(base: string): Promise<Mlp> {
  const [metaRes, binRes] = await Promise.all([fetch(`${base}.json`), fetch(`${base}.bin`)]);
  if (!metaRes.ok || !binRes.ok) throw new Error(`no se pudo bajar la red ${base}`);
  return mlpFromBuffers((await metaRes.json()) as MlpMeta, await binRes.arrayBuffer());
}

/** Baja las redes (una sola vez). Si falla, el nivel Experta juega con la heurística difícil. */
export function loadNetModels(baseUrl = `${(import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}models/`): Promise<NetModels> {
  if (!loading) {
    loading = Promise.all([fetchMlp(`${baseUrl}red-2`), fetchMlp(`${baseUrl}red-equipos`)])
      .then(([two, teams]) => {
        models = { two, teams };
        return models;
      })
      .catch((error: unknown) => {
        console.warn('[truco] no se pudieron cargar las redes; el nivel Experta juega con la heurística', error);
        loading = null;
        return models;
      });
  }
  return loading;
}

let expectedHash: string | null = null;
function layoutOk(mlp: Mlp, obs: Observation): boolean {
  expectedHash ??= layoutHash(obsLayout(obs));
  return mlp.meta.layoutHash === expectedHash;
}

/** La red que juega con esta cantidad de jugadores, o `null` si no hay (o no se puede usar). */
export function netFor(obs: Observation): Mlp | null {
  if (obs.rules.flor || obs.picaPica !== null || (obs.rules.playerCount === 6 && obs.rules.picaPica)) return null;
  const mlp = obs.seats.length === 2 ? (models.two ?? models.teams) : models.teams;
  return mlp && layoutOk(mlp, obs) ? mlp : null;
}

export interface NetAdvice {
  /** acción del motor (o null si es una indicación del pie) */
  action: Action;
  /** nombre de la acción en la red (PLAY_0, TRUCO, …) */
  name: (typeof ACTION_NAMES)[number];
  prob: number;
}

export class NetPolicy implements Policy {
  /** La red ve también las indicaciones que dio ella misma cuando es pie (como en el entrenamiento). */
  readonly usesTeamInstructions = true;

  constructor(private readonly fallback: Policy) {}

  decide(obs: Observation, rng: Rng, signals: readonly Signal[] = [], instructions: readonly Instruction[] = []): Action {
    const mlp = netFor(obs);
    if (!mlp || obs.legalActions.length === 0) return this.fallback.decide(obs, rng, signals, instructions);
    if (obs.legalActions.length === 1) return obs.legalActions[0];
    let legal: ReturnType<typeof legalMask>;
    try {
      legal = legalMask(obs);
    } catch {
      return this.fallback.decide(obs, rng, signals, instructions);
    }
    const choice = mlp.act(encodeObs(obs, { signals, instructions }), legal.mask, rng);
    return legal.actions[choice.action] ?? this.fallback.decide(obs, rng, signals, instructions);
  }

  /** ¿Esta red sabe dar indicaciones de pie en esta partida? Si no, el pie indica con la heurística. */
  canInstruct(obs: Observation): boolean {
    const mlp = netFor(obs);
    return !!mlp && mlp.meta.nActions > N_ENGINE_ACTIONS;
  }

  /**
   * Lo que indica el pie de la red: una decisión por grupo (cartas, y truco al empezar la mano), en ese
   * orden y viendo lo que ya indicó, igual que en el entrenamiento. `null` = no indica nada de truco.
   */
  instruct(
    obs: Observation,
    rng: Rng,
    signals: readonly Signal[],
    current: readonly Instruction[],
    kinds: readonly InstructionDecision[],
  ): Instruction[] {
    const mlp = netFor(obs);
    if (!mlp || mlp.meta.nActions <= N_ENGINE_ACTIONS) return [];
    const out: Instruction[] = [];
    let told = [...current];
    for (const kind of kinds) {
      const choice = mlp.act(encodeObs(obs, { signals, instructions: told }), instructionMask(kind), rng);
      const instruction = instructionOf(choice.action);
      if (!instruction) continue;
      out.push(instruction);
      const group = kind === 'cartas' ? ['MATA', 'PASA', 'PARDA', 'TRANQUILO'] : ['CANTA_TRUCO', 'ESPERA'];
      told = [...told.filter((given) => !group.includes(given)), instruction];
    }
    return out;
  }
}

/**
 * Qué haría la red en el lugar de este jugador (modo consejo): las acciones legales ordenadas por
 * probabilidad. Vacío si la red no juega esta partida.
 */
export function netAdvice(obs: Observation, signals: readonly Signal[] = [], instructions: readonly Instruction[] = []): NetAdvice[] {
  const mlp = netFor(obs);
  if (!mlp || obs.legalActions.length === 0) return [];
  let legal: ReturnType<typeof legalMask>;
  try {
    legal = legalMask(obs);
  } catch {
    return [];
  }
  const probs = mlp.probs(encodeObs(obs, { signals, instructions }), legal.mask);
  const out: NetAdvice[] = [];
  legal.actions.forEach((action, index) => {
    if (action && legal.mask[index]) out.push({ action, name: ACTION_NAMES[index], prob: probs[index] });
  });
  return out.sort((a, b) => b.prob - a.prob);
}
