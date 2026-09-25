// Pica-pica (6 jugadores) — historia 1-7, GDD §10.
// Acá vive TODO el pica-pica: cuándo se activa, cómo alternan las manos, cómo se arman
// los pares y cómo arranca cada submano. El cierre de cada submano lo hace `scoring.ts`
// (`endHand`), que es el único lugar que suma puntos y cierra manos.

import type { EnvidoState, FlorState, GameEvent, HandState, MatchState, PlayerId, TrickPlay, TrickResult, TrucoState } from './types.js';

/** Rango de puntos (inclusive) en el que los dos equipos habilitan el pica-pica (GDD §10). */
export const PICA_PICA_MIN = 5;
export const PICA_PICA_MAX = 25;

/** ¿La partida juega con pica-pica? Solo en 6 y con la opción encendida. */
export function picaPicaEnabled(state: MatchState): boolean {
  return state.rules.playerCount === 6 && state.rules.picaPica;
}

/** ¿El marcador habilita el pica-pica? Los dos equipos entre 5 y 25 (inclusive). */
export function picaPicaEligible(scores: readonly [number, number]): boolean {
  return scores.every((score) => score >= PICA_PICA_MIN && score <= PICA_PICA_MAX);
}

/**
 * Decide si la mano que arranca es de pica-pica y actualiza la alternancia (AC 1):
 * - fuera de rango → mano redonda y `picaPicaNext = true` (la primera elegible es pica-pica);
 * - en rango → es pica-pica si `picaPicaNext`, y la alternancia se invierte.
 */
export function nextHandIsPicaPica(state: MatchState): boolean {
  if (!picaPicaEnabled(state)) return false;
  if (!picaPicaEligible(state.scores)) {
    state.picaPicaNext = true;
    return false;
  }
  const isPicaPica = state.picaPicaNext;
  state.picaPicaNext = !isPicaPica;
  return isPicaPica;
}

/**
 * Pares de las 3 submanos (AC 2): `[mano + k, mano + k + 3]` para k = 0, 1, 2, en asientos.
 * El primero de cada par es el más cercano al mano: es el mano de su submano.
 */
export function picaPicaPairs(state: MatchState, manoId: PlayerId): [PlayerId, PlayerId][] {
  const n = state.seats.length;
  const manoSeat = state.seats.findIndex((seat) => seat.id === manoId);
  const pairs: [PlayerId, PlayerId][] = [];
  for (let k = 0; k < 3; k++) {
    pairs.push([state.seats[(manoSeat + k) % n].id, state.seats[(manoSeat + k + 3) % n].id]);
  }
  return pairs;
}

function emptyTruco(): TrucoState {
  return { level: 0, pending: null, quieroTeam: null };
}

function emptyEnvido(): EnvidoState {
  return { chain: [], pending: null, status: 'none', resumeTrucoAfter: false, result: null };
}

function emptyFlor(): FlorState {
  return { declared: [], pending: null, status: 'none', resumePhase: null, result: null };
}

/**
 * Arranca la submano `k` (AC 3): el par juega solo, con bazas, truco, envido y flor propios.
 * El estado de la mano (cartas, cantos, resultados de submanos anteriores) se conserva.
 */
export function startSubmano(state: MatchState, events: GameEvent[], k: 0 | 1 | 2): void {
  const hand = state.hand;
  const pica = hand.picaPica;
  if (pica === null) throw new Error('NOT_PICA_PICA');
  const pair = pica.pairs[k];
  pica.submano = k;
  hand.participants = [pair[0], pair[1]];
  hand.turnId = pair[0];
  hand.tricks = [];
  hand.currentTrick = { leaderId: pair[0], plays: [] };
  hand.truco = emptyTruco();
  hand.envido = emptyEnvido();
  hand.flor = emptyFlor();
  state.phase = 'PLAYING';
  events.push({ type: 'SUBMANO_STARTED', submano: k, pair: [pair[0], pair[1]] });
}

/** Convierte la mano recién repartida en una mano de pica-pica y arranca la submano 0. */
export function setupPicaPicaHand(state: MatchState, events: GameEvent[]): void {
  state.hand.picaPica = {
    submano: 0,
    pairs: picaPicaPairs(state, state.hand.manoId),
    results: [],
    startScores: [state.scores[0], state.scores[1]],
  };
  startSubmano(state, events, 0);
}

/** Bazas de toda la mano: las de submanos ya cerradas y las de la submano (o mano) en curso. */
export function allHandTricks(hand: HandState): TrickResult[] {
  const pica = hand.picaPica;
  if (pica === null) return hand.tricks.slice();
  const closed = pica.results.flatMap((result) => result.tricks);
  // La submano en curso todavía no tiene resultado: sus bazas están solo en `hand.tricks`.
  const currentOpen = pica.results.length <= pica.submano;
  return currentOpen ? [...closed, ...hand.tricks] : closed;
}

/**
 * Todas las cartas jugadas en la mano, sin duplicar: submanos cerradas (bazas + baza sin
 * terminar), bazas de la submano/mano en curso y la baza en curso si está incompleta
 * (cuando la última baza cierra la mano, `completeTrick` la deja también en `currentTrick`).
 */
export function allHandPlays(hand: HandState): TrickPlay[] {
  const plays: TrickPlay[] = [];
  const pica = hand.picaPica;
  if (pica !== null) {
    for (const result of pica.results) {
      for (const trick of result.tricks) plays.push(...trick.plays);
      plays.push(...result.openPlays);
    }
  }
  const currentOpen = pica === null || pica.results.length <= pica.submano;
  if (currentOpen) {
    for (const trick of hand.tricks) plays.push(...trick.plays);
    if (hand.currentTrick.plays.length < hand.participants.length) plays.push(...hand.currentTrick.plays);
  }
  return plays;
}
