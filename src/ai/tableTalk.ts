// Lo que se hablan los compañeros en la mesa (GDD §2.1 y §2.2): señas al pie e indicaciones del pie.
// No son acciones del motor. Es lógica pura (estado de la partida + lo hablado → lo hablado nuevo)
// que usan el juego (GameController) y el entrenamiento (training/actors), para que las dos cosas
// funcionen exactamente igual.
// - Solo con 4 y 6 jugadores, nunca en una mano de pica-pica.
// - Cada jugador que no es pie le hace sus señas a su pie al empezar la mano; solo el pie las ve.
// - El pie da indicaciones a sus compañeros: una de cartas y una de truco como mucho a la vez (en el juego,
//   con mesa abierta, después de la 1ra baza indica cualquiera: RuleSet.openTable).

import { pieOf } from '../engine/index.js';
import type { Card, MatchState, PlayerId, TeamId } from '../engine/index.js';
import { aiInstructions, aiSigns, instructionInfo, type GivenInstruction, type Instruction, type Signal } from './signs.js';

export interface TableTalk {
  /** señas hechas en la mano en curso (de los dos equipos: cada pie solo ve las de sus compañeros) */
  signals: Signal[];
  /** indicaciones vigentes de cada pie */
  instructions: GivenInstruction[];
}

export const EMPTY_TALK: TableTalk = { signals: [], instructions: [] };

export function teamOfPlayer(state: MatchState, playerId: PlayerId): number {
  return state.seats.find((seat) => seat.id === playerId)?.team ?? -1;
}

/** ¿Se pueden hacer señas en esta mano? (4 o 6 jugadores y nunca en pica-pica) */
export function talkAllowed(state: MatchState): boolean {
  return (
    state.rules.playerCount >= 4 && state.hand.picaPica === null && state.phase !== 'HAND_OVER' && state.phase !== 'MATCH_OVER'
  );
}

export function isPieNow(state: MatchState, playerId: PlayerId): boolean {
  const team = teamOfPlayer(state, playerId);
  return (team === 0 || team === 1) && pieOf(state, team as TeamId) === playerId;
}

/** Las señas que ve `playerId`: si es el pie, las de sus compañeros; si no, ninguna. */
export function signalsFor(state: MatchState, talk: TableTalk, playerId: PlayerId): Signal[] {
  if (!talkAllowed(state) || !isPieNow(state, playerId)) return [];
  const team = teamOfPlayer(state, playerId);
  return talk.signals.filter((signal) => signal.from !== playerId && teamOfPlayer(state, signal.from) === team);
}

/**
 * Lo que los compañeros le indicaron a `playerId` (no lo que indicó él). En el entrenamiento solo indica
 * el pie; en el juego con mesa abierta, después de la 1ra baza puede indicar cualquiera (también al pie).
 */
export function instructionsFor(state: MatchState, talk: TableTalk, playerId: PlayerId): Instruction[] {
  if (!talkAllowed(state)) return [];
  const team = teamOfPlayer(state, playerId);
  return talk.instructions.filter((given) => given.from !== playerId && teamOfPlayer(state, given.from) === team).map((given) => given.kind);
}

/** Las indicaciones vigentes del pie del equipo de `playerId` (el pie también sabe lo que dijo). */
export function teamInstructions(state: MatchState, talk: TableTalk, playerId: PlayerId): Instruction[] {
  if (!talkAllowed(state)) return [];
  const team = teamOfPlayer(state, playerId);
  return talk.instructions.filter((given) => teamOfPlayer(state, given.from) === team).map((given) => given.kind);
}

/** Una indicación nueva reemplaza a la vigente del mismo grupo (cartas o truco) de ese equipo. */
export function withInstruction(state: MatchState, talk: TableTalk, given: GivenInstruction): TableTalk {
  const group = instructionInfo(given.kind).group;
  const team = teamOfPlayer(state, given.from);
  return {
    ...talk,
    instructions: [
      ...talk.instructions.filter((old) => !(teamOfPlayer(state, old.from) === team && instructionInfo(old.kind).group === group)),
      given,
    ],
  };
}

/**
 * Al empezar la mano: cada jugador que no es pie y que `signs(playerId)` deja (la IA; el humano las hace
 * a mano) le hace a su pie las señas de lo que tiene. Las indicaciones arrancan vacías.
 */
export function dealTalk(state: MatchState, signs: (playerId: PlayerId) => boolean): TableTalk {
  if (!talkAllowed(state)) return EMPTY_TALK;
  const hand = state.hand;
  const signals: Signal[] = [];
  for (const seat of state.seats) {
    if (!signs(seat.id) || isPieNow(state, seat.id)) continue;
    signals.push(...aiSigns(seat.id, hand.hands[seat.id], hand.dealt[seat.id], state.rules.flor));
  }
  return { signals, instructions: [] };
}

/** Cartas que ya jugó cada uno en la mano. */
export function playedCards(state: MatchState): Map<PlayerId, Card[]> {
  const hand = state.hand;
  const played = new Map<PlayerId, Card[]>();
  for (const trick of [...hand.tricks, hand.currentTrick]) {
    for (const play of trick.plays) played.set(play.playerId, [...(played.get(play.playerId) ?? []), play.card]);
  }
  return played;
}

/**
 * Los pies que indican con la regla de la heurística (`heuristicPie(pieId)`) vuelven a indicar según su
 * mano y las señas: al empezar la mano (`withTruco`, si todavía no se cantó truco) y después de cada baza.
 */
export function refreshHeuristicInstructions(
  state: MatchState,
  talk: TableTalk,
  withTruco: boolean,
  heuristicPie: (pieId: PlayerId) => boolean,
): TableTalk {
  if (!talkAllowed(state)) return talk;
  const hand = state.hand;
  const played = playedCards(state);
  let next = talk;
  for (const team of [0, 1] as const) {
    const pie = pieOf(state, team);
    if (!heuristicPie(pie)) continue;
    const given = aiInstructions(pie, hand.hands[pie], signalsFor(state, next, pie), played, withTruco && hand.truco.level === 0);
    for (const instruction of given) next = withInstruction(state, next, instruction);
  }
  return next;
}
