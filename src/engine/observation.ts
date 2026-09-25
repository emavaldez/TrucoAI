// Observación pública — historia 1-6 [AI-09].
// Lo ÚNICO que ve la IA: información propia + información jugada por los demás.
// Nunca revela cartas de otros que no hayan pisado la mesa, ni tantos de envido
// que no se hayan dicho (`revealed`). El contrato vive en `types.ts` (architecture.md §4).
// Módulo puro: no muta el estado recibido y devuelve objetos nuevos (clonados), así
// que mutar la observación no toca el `MatchState`.

import { createDeck } from './cards.js';
import { getLegalActions } from './legal.js';
import { allHandPlays } from './picapica.js';
import { isPie } from './turns.js';
import type { Card, MatchState, Observation, PlayerId } from './types.js';

/** Todas las cartas jugadas en la mano actual: bazas cerradas + baza en curso. */
function allPlays(state: MatchState): { playerId: PlayerId; card: Card }[] {
  // En pica-pica incluye las submanos ya cerradas (también bazas que quedaron sin terminar).
  return allHandPlays(state.hand);
}

/**
 * `mazo − mis repartidas − jugadas por otros en la mano`, en el orden de `createDeck()`.
 * Incluye las jugadas de submanos anteriores en pica-pica: todas quedan en `hand.tricks`.
 * Lo que YO jugé ya está cubierto por `myDealt` (fue repartido a mí).
 */
function unseenCardsFor(state: MatchState, playerId: PlayerId): Card[] {
  const excluded = new Set<string>(state.hand.dealt[playerId].map((card) => card.id));
  for (const play of allPlays(state)) {
    if (play.playerId !== playerId) excluded.add(play.card.id);
  }
  return createDeck().filter((card) => !excluded.has(card.id));
}

/** ¿`playerId` es el mano efectivo (el primero de `participants`)? */
function isManoOf(state: MatchState, playerId: PlayerId): boolean {
  return state.hand.participants[0] === playerId;
}

/** ¿`playerId` es el pie: el último de su equipo en `participants`? */
function isPieOf(state: MatchState, playerId: PlayerId): boolean {
  return isPie(state, playerId);
}

/**
 * Los tantos que se dijeron en voz alta: el `revealed` del envido (1-4) y, cuando
 * exista, el de la flor (1-8). Los puntajes de quienes no revelaron NO aparecen [AI-09].
 */
function publicScoresOf(state: MatchState): Observation['publicScores'] {
  return [
    ...(state.hand.envido.result?.revealed ?? []).map((entry) => ({ ...entry, kind: 'ENVIDO' as const })),
    ...(state.hand.flor.result?.revealed ?? []).map((entry) => ({ ...entry, kind: 'FLOR' as const })),
  ];
}

/**
 * Construye la observación pública para `playerId` (architecture.md §4).
 * Tira `UNKNOWN_PLAYER` si el jugador no está en la mano (nunca un estado roto).
 */
export function getObservation(state: MatchState, playerId: PlayerId): Observation {
  if (state.hand.hands[playerId] === undefined) throw new Error(`UNKNOWN_PLAYER: ${playerId}`);
  const seat = state.seats.find((candidate) => candidate.id === playerId);
  if (seat === undefined) throw new Error(`UNKNOWN_PLAYER: ${playerId}`);

  return {
    selfId: playerId,
    selfTeam: seat.team,
    seats: structuredClone(state.seats),
    rules: structuredClone(state.rules),
    scores: [state.scores[0], state.scores[1]],
    phase: state.phase,
    dealerId: state.hand.dealerId,
    manoId: state.hand.manoId,
    isMano: isManoOf(state, playerId),
    isPie: isPieOf(state, playerId),
    myHand: structuredClone(state.hand.hands[playerId]),
    myDealt: structuredClone(state.hand.dealt[playerId]),
    currentTrick: structuredClone(state.hand.currentTrick),
    tricks: structuredClone(state.hand.tricks),
    unseenCards: unseenCardsFor(state, playerId),
    truco: structuredClone(state.hand.truco),
    envidoChain: structuredClone(state.hand.envido.chain),
    envidoStatus: state.hand.envido.status,
    publicScores: publicScoresOf(state),
    envidoSayings: structuredClone(state.hand.envido.result?.sayings ?? []),
    florDeclared: state.hand.flor.declared.map((declaration) => declaration.playerId),
    picaPica: structuredClone(state.hand.picaPica),
    legalActions: getLegalActions(state, playerId),
  };
}
