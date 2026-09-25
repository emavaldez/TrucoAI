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

/**
 * El pie de un equipo (GDD §2): el último de ese equipo en `participants` (el orden de juego
 * desde el mano). Con 2 jugadores, y en cada submano de pica-pica, cada uno es su propio pie.
 */
export function pieOf(state: MatchState, team: TeamId): PlayerId {
  const members = state.hand.participants.filter((playerId) => teamOfSeat(state.seats, playerId) === team);
  if (members.length === 0) throw new Error(`NO_PIE: equipo ${team}`);
  return members[members.length - 1];
}

/** ¿`playerId` es el pie de su equipo? */
export function isPie(state: MatchState, playerId: PlayerId): boolean {
  return pieOf(state, teamOf(state, playerId)) === playerId;
}

/**
 * Quién responde el canto de `callerId` (GDD §2.2, decisión 2026-09-25): **el pie del equipo
 * contrario** (en una submano de pica-pica `participants` es el par, así que responde el rival del par).
 */
export function responderFor(state: MatchState, callerId: PlayerId): PlayerId {
  const callerTeam = teamOf(state, callerId);
  return pieOf(state, callerTeam === 0 ? 1 : 0);
}
