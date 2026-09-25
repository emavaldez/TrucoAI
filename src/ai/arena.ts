// Arena: enfrenta dos políticas en partidas con semilla (historia 2-1, GDD §11.2).
// Asientos alternados: en la mitad de las partidas la política A juega en el equipo 0 y en la
// otra mitad en el equipo 1, para que el asiento del humano/mano no sesgue el resultado.

import { applyAction, createMatch, createRng, getActor, getObservation, startNextHand } from '../engine/index.js';
import type { MatchState, RuleSet } from '../engine/index.js';
import type { Policy } from './policy.js';

export interface ArenaResult {
  games: number;
  winsA: number;
  rate: number;
  /** intervalo de confianza 95% de Wilson */
  low: number;
  high: number;
}

/** Intervalo de Wilson al 95% para `wins` de `n`. */
export function wilson(wins: number, n: number): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const z = 1.96;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: center - half, high: center + half };
}

/** Juega una partida completa: el equipo `teamA` usa la política A; el otro, la B. */
export function playMatch(
  rules: Partial<RuleSet> & Pick<RuleSet, 'playerCount'>,
  seed: number,
  a: Policy,
  b: Policy,
  teamA: 0 | 1,
): MatchState {
  let state = createMatch({ rules, seed });
  const rng = createRng((seed * 2654435761) >>> 0);
  let guard = 0;
  while (state.phase !== 'MATCH_OVER') {
    guard += 1;
    if (guard > 20_000) throw new Error(`arena: partida trabada (seed ${seed})`);
    if (state.phase === 'HAND_OVER') {
      state = startNextHand(state).state;
      continue;
    }
    const actor = getActor(state);
    if (actor === null) throw new Error(`arena: sin actor en ${state.phase} (seed ${seed})`);
    const team = state.seats.find((seat) => seat.id === actor)?.team;
    const policy = team === teamA ? a : b;
    const obs = getObservation(state, actor);
    const action = policy.decide(obs, rng);
    const result = applyAction(state, actor, action);
    if (!result.ok) throw new Error(`arena: acción ilegal ${JSON.stringify(action)} (${result.error}, seed ${seed})`);
    state = result.state;
  }
  return state;
}

/** `games` partidas de A contra B con asientos alternados. */
export function runArena(
  rules: Partial<RuleSet> & Pick<RuleSet, 'playerCount'>,
  a: Policy,
  b: Policy,
  games: number,
  seed: number,
): ArenaResult {
  let winsA = 0;
  for (let game = 0; game < games; game++) {
    const teamA: 0 | 1 = game % 2 === 0 ? 0 : 1;
    const final = playMatch(rules, seed + game, a, b, teamA);
    if (final.winnerTeam === teamA) winsA += 1;
  }
  const { low, high } = wilson(winsA, games);
  return { games, winsA, rate: winsA / games, low, high };
}
