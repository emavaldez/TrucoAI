// Helpers compartidos por los tests del motor.
// `deckFor` arma un mazo fijo para que cada jugador reciba exactamente las cartas pedidas;
// `playTrick`/`playTricks` juegan bazas enteras en el orden real de turno.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyAction } from '../apply.js';
import { createDeck } from '../cards.js';
import { getActor, getLegalActions } from '../legal.js';
import type { Action, Card, CardNumber, EnvidoCall, GameEvent, MatchState, PlayerId, Rng, Suit } from '../types.js';

/** Arma una carta a partir de su id ("1-espada", "7-oro", "12-copa"). */
export function card(id: string): Card {
  const [number, suit] = id.split('-');
  return { id, number: Number(number) as CardNumber, suit: suit as Suit };
}

/** Ids de una lista de cartas (para comparar con `toEqual`). */
export function ids(cards: readonly Card[]): string[] {
  return cards.map((c) => c.id);
}

/** Asiento de un `playerId` ("p3" → 3). */
export function seatOf(playerId: PlayerId): number {
  return Number(playerId.slice(1));
}

/**
 * Mazo fijo para un reparto: la carta `k` del mazo va al asiento `(manoSeat + k) % n`,
 * así que la vuelta `round` del asiento `s` sale de `k = (s - manoSeat) mod n + round * n`.
 * Los lugares no pedidos se completan con cartas de un mazo real (sin repetir).
 */
export function deckFor(handsByPlayer: Record<PlayerId, string[]>, manoSeat: number, n: number): Card[] {
  const slots: (Card | undefined)[] = new Array(3 * n).fill(undefined);

  for (const playerId of Object.keys(handsByPlayer)) {
    const seat = seatOf(playerId);
    const requested = handsByPlayer[playerId];
    for (let round = 0; round < 3; round++) {
      const k = ((((seat - manoSeat) % n) + n) % n) + round * n;
      slots[k] = card(requested[round]);
    }
  }

  const used = new Set(slots.filter((slot): slot is Card => slot !== undefined).map((c) => c.id));
  const filler = createDeck().filter((c) => !used.has(c.id));
  let nextFiller = 0;

  return slots.map((slot) => {
    if (slot === undefined) {
      const c = filler[nextFiller];
      nextFiller += 1;
      return c;
    }
    return slot;
  });
}

/**
 * Juega una baza completa en el orden real de turno (`getActor` decide quién sigue):
 * `cards[playerId]` es la carta que juega cada uno. Tira si algo no es legal.
 */
export function playTrick(state: MatchState, cards: Record<PlayerId, string>): { state: MatchState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];

  for (let i = 0; i < state.hand.participants.length; i++) {
    const actor = getActor(current);
    if (actor === null) throw new Error('playTrick: no hay actor (¿la mano ya terminó?)');
    const cardId: string | undefined = cards[actor];
    if (cardId === undefined) throw new Error(`playTrick: falta la carta de ${actor}`);
    const result = applyAction(current, actor, { type: 'PLAY_CARD', cardId });
    if (!result.ok) throw new Error(`playTrick: ${actor} no puede jugar ${cardId} (${result.error})`);
    current = result.state;
    events.push(...result.events);
  }

  return { state: current, events };
}

/** Juega varias bazas seguidas, una por elemento. */
export function playTricks(
  state: MatchState,
  ...tricks: Record<PlayerId, string>[]
): { state: MatchState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];

  for (const cards of tricks) {
    const played = playTrick(current, cards);
    current = played.state;
    events.push(...played.events);
  }

  return { state: current, events };
}

/** Canta truco/retruco/vale cuatro con `playerId`; tira si no es legal. */
export function callTruco(state: MatchState, playerId: PlayerId): { state: MatchState; events: GameEvent[] } {
  return act(state, playerId, { type: 'CALL_TRUCO' }, 'callTruco');
}

/** Juega la primera carta del actor actual: el turno lo decide el motor, no el test. */
export function playFirstCard(state: MatchState): { state: MatchState; events: GameEvent[] } {
  const actor = getActor(state);
  if (actor === null) throw new Error('playFirstCard: no hay actor');
  const cardId = state.hand.hands[actor][0]?.id;
  if (cardId === undefined) throw new Error(`playFirstCard: ${actor} no tiene cartas`);
  return act(state, actor, { type: 'PLAY_CARD', cardId }, 'playFirstCard');
}

/** Juega la primera carta de cada actor hasta que le toque a `playerId` (p. ej. al pie, que es quien canta envido). */
export function untilTurnOf(state: MatchState, playerId: PlayerId): MatchState {
  let current = state;
  let guard = 0;
  while (getActor(current) !== playerId) {
    if (guard++ > 12) throw new Error(`untilTurnOf: nunca le toca a ${playerId}`);
    current = playFirstCard(current).state;
  }
  return current;
}

/** Responde el canto de truco pendiente; tira si no es legal. */
export function answerTruco(
  state: MatchState,
  playerId: PlayerId,
  answer: 'QUIERO' | 'NO_QUIERO',
): { state: MatchState; events: GameEvent[] } {
  return act(state, playerId, { type: 'ANSWER_TRUCO', answer }, 'answerTruco');
}

/** Se va al mazo con `playerId`; tira si no es legal. */
export function goToMazo(state: MatchState, playerId: PlayerId): { state: MatchState; events: GameEvent[] } {
  return act(state, playerId, { type: 'MAZO' }, 'goToMazo');
}

/** Canta (o sube) el envido con `playerId`; tira si no es legal. */
export function callEnvido(
  state: MatchState,
  playerId: PlayerId,
  call: EnvidoCall,
): { state: MatchState; events: GameEvent[] } {
  return act(state, playerId, { type: 'CALL_ENVIDO', call }, 'callEnvido');
}

/** Responde el canto de envido pendiente; tira si no es legal. */
export function answerEnvido(
  state: MatchState,
  playerId: PlayerId,
  answer: 'QUIERO' | 'NO_QUIERO',
): { state: MatchState; events: GameEvent[] } {
  return act(state, playerId, { type: 'ANSWER_ENVIDO', answer }, 'answerEnvido');
}

/** Aplica una acción que tiene que ser legal; tira con el error del motor si no lo es. */
function act(
  state: MatchState,
  playerId: PlayerId,
  action: Action,
  who: string,
): { state: MatchState; events: GameEvent[] } {
  const result = applyAction(state, playerId, action);
  if (!result.ok) throw new Error(`${who}: ${playerId} no puede ${action.type} (${result.error})`);
  return { state: result.state, events: result.events };
}

/**
 * Acción legal al azar del actor, con el `Rng` dado: para tests de invariantes y
 * simulaciones (determinista si el `Rng` viene con semilla). Tira si no hay actor.
 */
export function randomLegalAction(state: MatchState, rng: Rng): { playerId: PlayerId; action: Action } {
  const playerId = getActor(state);
  if (playerId === null) throw new Error('randomLegalAction: no hay actor');
  const legal = getLegalActions(state, playerId);
  if (legal.length === 0) throw new Error(`randomLegalAction: ${playerId} no tiene acciones legales`);
  return { playerId, action: legal[Math.floor(rng.next() * legal.length)] };
}

/**
 * Copia del estado con el marcador dado. SOLO para tests de fin de partida:
 * el motor arranca siempre 0-0 y nadie fuera de `scoring.ts` escribe `scores`.
 */
export function withScores(state: MatchState, scores: [number, number]): MatchState {
  const next = structuredClone(state);
  next.scores = [scores[0], scores[1]];
  return next;
}

/** Todos los .ts de `src/engine` (salteando `__tests__`): ruta relativa y código, para chequeos de fuente. */
export function engineSources(): { file: string; source: string }[] {
  const root = fileURLToPath(new URL('../', import.meta.url));

  const walk = (dir: string): string[] => {
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === '__tests__') continue;
        found.push(...walk(full));
      } else if (entry.endsWith('.ts')) {
        found.push(full);
      }
    }
    return found;
  };

  return walk(root).map((absolute) => ({ file: relative(root, absolute), source: readFileSync(absolute, 'utf8') }));
}
