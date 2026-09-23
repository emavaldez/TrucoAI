// Turnos y "quién responde": utilidades neutrales, sin reglas de ningún canto.
// Las comparten truco (1-3), envido (1-4) y flor (1-8), así que viven acá y no
// dentro de uno de esos módulos.
// Depende solo de los tipos: nada de DOM, timers ni aleatoriedad.

import type { MatchState, PlayerId, Seat, TeamId } from './types.js';

/** Equipo de un jugador según los asientos; tira si no está sentado. */
export function teamOfSeat(seats: readonly Seat[], playerId: PlayerId): TeamId {
  const seat = seats.find((candidate) => candidate.id === playerId);
  if (seat === undefined) throw new Error(`UNKNOWN_PLAYER: ${playerId}`);
  return seat.team;
}

/** Equipo de un jugador en la partida. */
export function teamOf(state: MatchState, playerId: PlayerId): TeamId {
  return teamOfSeat(state.seats, playerId);
}

/** ¿El asiento de `playerId` es el humano? (falso si no está sentado) */
function isHuman(state: MatchState, playerId: PlayerId): boolean {
  return state.seats.some((seat) => seat.id === playerId && seat.isHuman);
}

/**
 * Quién responde el canto de `callerId` (AC 2, GDD §5): entre los `participants`
 * del equipo contrario al que cantó, si está el humano responde el humano; si no,
 * el primero de ese equipo **después** del que cantó en el orden de `participants`
 * (circular). En una submano de pica-pica `participants` es el par, así que el
 * humano solo responde si está en el par [ENG-14].
 */
export function responderFor(state: MatchState, callerId: PlayerId): PlayerId {
  const participants = state.hand.participants;
  const callerTeam = teamOf(state, callerId);
  const rivals = participants.filter((playerId) => teamOfSeat(state.seats, playerId) !== callerTeam);

  const human = rivals.find((playerId) => isHuman(state, playerId));
  if (human !== undefined) return human;
  if (rivals.length === 0) throw new Error(`NO_RIVAL: ${callerId}`);

  const start = participants.indexOf(callerId);
  if (start === -1) throw new Error(`UNKNOWN_PLAYER: ${callerId}`);
  for (let step = 1; step <= participants.length; step++) {
    const candidate = participants[(start + step) % participants.length];
    if (teamOfSeat(state.seats, candidate) !== callerTeam) return candidate;
  }

  throw new Error(`NO_RIVAL: ${callerId}`);
}
