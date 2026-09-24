// Simulador masivo con invariantes — historia 1-6 (test-strategy.md §2).
// Vive FUERA de `src/engine` porque no es runtime del juego: solo consume la API
// pública (`../engine/index.js`) y nada más. Juega partidas completas eligiendo
// acciones legales —por defecto una al azar con un RNG de semilla derivada— y,
// con `check: true`, verifica después de CADA acción los invariantes 1 a 10 de
// `docs/planning/test-strategy.md` §2. Cualquier violación tira un `Error`
// descriptivo con semilla, número de mano y última acción.

import {
  applyAction,
  createDeck,
  createMatch,
  createRng,
  getActor,
  getLegalActions,
  getObservation,
  startNextHand,
} from '../engine/index.js';
import type {
  Action,
  Card,
  GameEvent,
  MatchState,
  Observation,
  PlayerId,
  Rng,
  RuleSet,
  TrickPlay,
} from '../engine/index.js';

export interface SimulateMatchOptions {
  /** Las mismas reglas de `createMatch`; `playerCount` es obligatorio. */
  rules: Partial<RuleSet> & Pick<RuleSet, 'playerCount'>;
  /** Semilla de la partida (el RNG del simulador se deriva de esta). */
  seed: number;
  /** Política: elige una acción de `legal`. Por defecto, una al azar con `rng`. */
  pickAction?: (legal: Action[], rng: Rng, obs: Observation) => Action;
  /** Verifica los invariantes después de cada acción (lento pero demoledor). */
  check?: boolean;
}

export interface SimulateMatchResult {
  /** Estado final (siempre `phase: 'MATCH_OVER'` si no tiró). */
  state: MatchState;
  /** Cantidad de acciones aplicadas (no cuenta los `startNextHand`). */
  steps: number;
  /** Todos los eventos emitidos durante la partida. */
  events: GameEvent[];
}

/** Tope de acciones por partida: si se pasa, la simulación quedó trabada. */
export const MAX_SIMULATE_STEPS = 20000;

/** Invariante 10: toda partida termina en ≤ 200 manos. */
const MAX_HANDS = 200;

/** Acción imposible en cualquier fase (carta inexistente): sonda del rechazo [INV-4]. */
const PROBE_ILLEGAL: Action = { type: 'PLAY_CARD', cardId: '99-copa' };

/** Motivos de `HandRecord` que pagan la mano por truco (nunca pueden pasar de 4) [INV-7]. */
const TRUCO_CLOSE_REASONS = new Set(['BAZAS', 'NO_QUIERO', 'MAZO', 'PICA_PICA']);

/** Ruptura de invariante: siempre con semilla, mano y última acción [AC 3]. */
class InvariantError extends Error {
  constructor(inv: string, detail: string, seed: number, state: MatchState, lastAction: Action | null) {
    super(
      `[sim] Invariante ${inv} falló: ${detail} ` +
        `(seed=${seed}, mano=${state.hand.number}, última acción=${JSON.stringify(lastAction)})`,
    );
    this.name = 'InvariantError';
  }
}

/** Política por defecto: acción legal al azar. */
function pickRandomLegal(legal: Action[], rng: Rng): Action {
  return legal[Math.floor(rng.next() * legal.length)];
}

/**
 * Todas las jugadas de la mano, sin duplicar: cuando la última baza cerró la mano,
 * `completeTrick` la registra en `hand.tricks` y deja las mismas jugadas en
 * `hand.currentTrick` (tricks.ts), así que esa baza contaría dos veces.
 */
function handPlays(hand: MatchState['hand']): TrickPlay[] {
  const plays: TrickPlay[] = [];
  for (const trick of hand.tricks) plays.push(...trick.plays);
  if (hand.currentTrick.plays.length < hand.participants.length) plays.push(...hand.currentTrick.plays);
  return plays;
}

/** Invariante 1 y 2: conservación de las 40 cartas y tope de 3 jugadas por jugador. */
function checkCards(seed: number, state: MatchState, lastAction: Action | null): void {
  const fail = (inv: string, detail: string): never => {
    throw new InvariantError(inv, detail, seed, state, lastAction);
  };

  const plays = handPlays(state.hand);
  const seen = new Set<string>();
  for (const seat of state.seats) {
    const playerId: PlayerId = seat.id;
    const dealt = state.hand.dealt[playerId];
    const remaining = state.hand.hands[playerId];
    const played = plays.filter((play) => play.playerId === playerId).map((play) => play.card.id);

    // [INV-2] nadie juega más de 3 cartas en la mano (en pica-pica, por submano: mismas 3 cartas).
    if (played.length > 3) fail('INV-2', `${playerId} jugó ${played.length} cartas`);
    // [INV-1] las 3 repartidas son únicas entre jugadores, y mano restante + jugadas = repartidas.
    const dealtIds = new Set<string>();
    for (const card of dealt) {
      if (seen.has(card.id) || dealtIds.has(card.id)) fail('INV-1', `carta duplicada ${card.id}`);
      seen.add(card.id);
      dealtIds.add(card.id);
    }
    for (const id of played) if (!dealtIds.has(id)) fail('INV-1', `${playerId} jugó ${id} que no le fue repartida`);
    for (const card of remaining) {
      if (!dealtIds.has(card.id)) fail('INV-1', `${playerId} tiene en mano ${card.id} que no le fue repartida`);
    }
    if (remaining.length + played.length !== dealt.length) {
      fail('INV-1', `${playerId}: ${remaining.length} en mano + ${played.length} jugadas ≠ ${dealt.length} repartidas`);
    }
  }
  if (seen.size !== 3 * state.seats.length) fail('INV-1', `${seen.size} cartas repartidas ≠ ${3 * state.seats.length}`);
}

/** Invariante 5: con un canto pendiente (`AWAITING_*`), jugar carta nunca es legal. */
function checkNoPlayWhileAwaiting(seed: number, state: MatchState, lastAction: Action | null): void {
  if (!state.phase.startsWith('AWAITING_')) return;
  const actor = getActor(state);
  if (actor === null) return;
  const legal = getLegalActions(state, actor);
  if (legal.some((action) => action.type === 'PLAY_CARD')) {
    throw new InvariantError('INV-5', `PLAY_CARD legal con canto pendiente (${state.phase})`, seed, state, lastAction);
  }
}

/** Invariante 6: el marcador sube, no pasa el objetivo, y la partida termina al llegar. */
function checkScores(seed: number, before: MatchState, after: MatchState, lastAction: Action | null): void {
  const target = after.rules.targetScore;
  for (const team of [0, 1] as const) {
    if (after.scores[team] < before.scores[team]) {
      throw new InvariantError('INV-6', `el equipo ${team} bajó de ${before.scores[team]} a ${after.scores[team]}`, seed, after, lastAction);
    }
    if (after.scores[team] > target) {
      throw new InvariantError('INV-6', `el equipo ${team} pasó el objetivo (${after.scores[team]})`, seed, after, lastAction);
    }
  }
  const reachedTarget = after.scores[0] >= target || after.scores[1] >= target;
  if (reachedTarget && after.phase !== 'MATCH_OVER') {
    throw new InvariantError('INV-6', `alguien llegó a ${target} y la partida no terminó`, seed, after, lastAction);
  }
  if (after.phase === 'MATCH_OVER') {
    if (after.winnerTeam === null || !reachedTarget) {
      throw new InvariantError('INV-6', `MATCH_OVER sin ganador al objetivo`, seed, after, lastAction);
    }
  }
}

/** Invariante 7: truco nunca más de 4 por mano; envido/flor según tabla. */
function checkHandPoints(seed: number, state: MatchState, lastAction: Action | null): void {
  for (const record of state.history) {
    if (TRUCO_CLOSE_REASONS.has(record.reason) && record.points > 4) {
      throw new InvariantError('INV-7', `mano ${record.number} pagó ${record.points} por truco (${record.reason})`, seed, state, lastAction);
    }
  }
  const envido = state.hand.envido.result;
  if (envido !== null) {
    const hasFalta = state.hand.envido.chain.some((canto) => canto.call === 'F');
    const cap = hasFalta ? state.rules.targetScore : 7;
    if (envido.points < 1 || envido.points > cap) {
      throw new InvariantError('INV-7', `envido pagó ${envido.points} (tope ${cap})`, seed, state, lastAction);
    }
  }
}

/** Invariante 8: el envido se cierra al terminar la primera baza. */
function checkEnvidoClosed(seed: number, state: MatchState, lastAction: Action | null): void {
  if (state.hand.tricks.length === 0) return;
  const envido = state.hand.envido;
  if (envido.status === 'calling' || envido.pending !== null) {
    throw new InvariantError('INV-8', `envido sigue abierto tras la primera baza (status=${envido.status})`, seed, state, lastAction);
  }
}

/** Invariante 9 [AI-09]: la observación de nadie revela cartas ni tantos ocultos. */
function checkNoLeaks(seed: number, state: MatchState, lastAction: Action | null): void {
  const deck = createDeck();
  for (const seat of state.seats) {
    const playerId: PlayerId = seat.id;
    const obs = getObservation(state, playerId);

    // [INV-9a] jugadas propias coherentes: repartidas = en mano + jugadas.
    const dealtCount = state.hand.dealt[playerId].length;
    const remainingCount = obs.myHand.length;
    const myPlays = handPlays(state.hand).filter((play) => play.playerId === playerId).length;
    if (remainingCount + myPlays !== dealtCount) {
      throw new InvariantError('INV-9', `${playerId}: mi mano visible no cierra con mis jugadas`, seed, state, lastAction);
    }

    // [INV-9b] ni las manos ni los tantos de envido de OTROS se filtran en la parte pública.
    const others = new Set<string>();
    for (const other of state.seats) {
      if (other.id === playerId) continue;
      for (const card of state.hand.hands[other.id]) others.add(card.id);
    }
    const serial = JSON.stringify({ ...obs, unseenCards: undefined });
    for (const id of others) {
      if (serial.includes(`"${id}"`)) {
        throw new InvariantError('INV-9', `la observación de ${playerId} revela la carta ${id}`, seed, state, lastAction);
      }
    }
    const revealedIds = new Set([
      ...(state.hand.envido.result?.revealed ?? []).map((entry) => entry.playerId),
      ...(state.hand.flor.result?.revealed ?? []).map((entry) => entry.playerId),
    ]);
    for (const entry of obs.publicScores) {
      if (!revealedIds.has(entry.playerId)) {
        throw new InvariantError('INV-9', `publicScores de ${playerId} filtra el envido de ${entry.playerId}`, seed, state, lastAction);
      }
    }

    // [INV-9c] `unseenCards` depende solo de lo público: mis repartidas + jugadas de otros.
    const excluded = new Set<string>(obs.myDealt.map((card: Card) => card.id));
    for (const play of obs.tricks.flatMap((trick) => trick.plays).concat(obs.currentTrick.plays)) {
      if (play.playerId !== playerId) excluded.add(play.card.id);
    }
    const expected = deck.filter((card: Card) => !excluded.has(card.id));
    const actualIds = obs.unseenCards.map((card: Card) => card.id).join(',');
    const expectedIds = expected.map((card: Card) => card.id).join(',');
    if (actualIds !== expectedIds) {
      throw new InvariantError('INV-9', `unseenCards de ${playerId} no coincide con lo público`, seed, state, lastAction);
    }
  }
}

/** Chequeo completo después de una acción aplicada (invariante 3 incluido). */
function checkAfterStep(seed: number, before: MatchState, after: MatchState, lastAction: Action | null): void {
  if (after.hand.number > MAX_HANDS) {
    throw new InvariantError('INV-10', `la partida superó las ${MAX_HANDS} manos`, seed, after, lastAction);
  }
  checkCards(seed, after, lastAction);
  checkScores(seed, before, after, lastAction);
  checkHandPoints(seed, after, lastAction);
  checkEnvidoClosed(seed, after, lastAction);
  checkNoPlayWhileAwaiting(seed, after, lastAction);

  // [INV-3] no hay cuelgues: fuera de fin de mano/partida siempre hay actor con acciones.
  if (after.phase !== 'HAND_OVER' && after.phase !== 'MATCH_OVER') {
    const actor = getActor(after);
    if (actor === null) {
      throw new InvariantError('INV-3', `sin actor en fase ${after.phase}`, seed, after, lastAction);
    }
    if (getLegalActions(after, actor).length === 0) {
      throw new InvariantError('INV-3', `${actor} no tiene acciones legales en fase ${after.phase}`, seed, after, lastAction);
    }
  }

  checkNoLeaks(seed, after, lastAction);
}

/**
 * Juega una partida completa (hasta `MATCH_OVER`) eligiendo acciones legales.
 * Con `check: true` verifica los invariantes de `docs/planning/test-strategy.md` §2
 * después de CADA acción y tira `Error` con semilla, mano y última acción si algo falla.
 * En `HAND_OVER` arranca la mano siguiente con `startNextHand`.
 */
export function simulateMatch(opts: SimulateMatchOptions): SimulateMatchResult {
  const rng: Rng = createRng((Math.imul(opts.seed, 0x5bd1e995) ^ 0x9e3779b9) >>> 0);
  const pick = opts.pickAction ?? pickRandomLegal;
  const check = opts.check ?? false;

  let state = createMatch({ rules: opts.rules, seed: opts.seed });
  const events: GameEvent[] = [];
  let steps = 0;
  let lastAction: Action | null = null;

  while (state.phase !== 'MATCH_OVER') {
    if (steps >= MAX_SIMULATE_STEPS) {
      throw new InvariantError('INV-3', `superó los ${MAX_SIMULATE_STEPS} pasos sin terminar`, state.seed, state, lastAction);
    }

    if (state.phase === 'HAND_OVER') {
      const next = startNextHand(state);
      state = next.state;
      events.push(...next.events);
      continue;
    }

    const actor = getActor(state);
    if (actor === null) {
      throw new InvariantError('INV-3', `sin actor en fase ${state.phase}`, state.seed, state, lastAction);
    }
    const obs = getObservation(state, actor);
    const legal = obs.legalActions;
    if (legal.length === 0) {
      throw new InvariantError('INV-3', `${actor} no tiene acciones legales`, state.seed, state, lastAction);
    }

    const action = pick(legal, rng, obs);
    if (check) {
      // [INV-4a] la acción elegida tiene que estar en la lista legal.
      if (!legal.some((candidate) => JSON.stringify(candidate) === JSON.stringify(action))) {
        throw new InvariantError('INV-4', `la política eligió ${JSON.stringify(action)}, que no es legal`, state.seed, state, action);
      }
      // [INV-4b] toda acción fuera de la lista es rechazada por el motor.
      const probe = applyAction(state, actor, PROBE_ILLEGAL);
      if (probe.ok) {
        throw new InvariantError('INV-4', `el motor aceptó una acción ilegal (${JSON.stringify(PROBE_ILLEGAL)})`, state.seed, state, action);
      }
    }

    const result = applyAction(state, actor, action);
    if (!result.ok) {
      throw new InvariantError(
        'INV-4',
        `el motor rechazó una acción legal (${result.error})`,
        state.seed,
        state,
        action,
      );
    }

    const before = state;
    state = result.state;
    lastAction = action;
    steps += 1;
    events.push(...result.events);

    if (check) checkAfterStep(state.seed, before, state, lastAction);
  }

  return { state, steps, events };
}
