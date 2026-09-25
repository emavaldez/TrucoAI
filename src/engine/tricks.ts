// Resolución de bazas y de la mano — historia 1-2.
// Módulo puro y determinista: recibe los jugadores de la baza y no conoce DOM,
// RNG ni timers. La jerarquía de las cartas vive solo en `cards.ts` [ENG-20].

import { cardRank } from './cards.js';
import { resolveSingleTeamFlor } from './flor.js';
import { endHand } from './scoring.js';
import { teamOfSeat } from './turns.js';
import type { GameEvent, MatchState, PlayerId, Seat, TeamId, TrickPlay, TrickResult } from './types.js';

/** Lo que dejó una baza: equipo ganador (o `'PARDA'`) y quién jugó la carta máxima. */
export interface TrickOutcome {
  winnerTeam: TeamId | 'PARDA';
  winnerPlayerId: PlayerId | null;
}

/**
 * Ganador de la mano después de cada baza.
 * `winnerTeam` está presente si y solo si `decided` es verdadero [ENG-08].
 */
export type HandWinner = { decided: true; winnerTeam: TeamId } | { decided: false };

/**
 * Resuelve una baza (AC 1): gana el equipo de la carta de mayor `cardRank`.
 * Si el rango máximo lo jugaron equipos distintos es parda (`'PARDA'`, sin ganador);
 * si lo jugaron dos cartas del mismo equipo, gana ese equipo y `winnerPlayerId` es
 * el primero de sus jugadores que jugó esa carta máxima.
 */
export function resolveTrick(plays: readonly TrickPlay[], seats: readonly Seat[]): TrickOutcome {
  if (plays.length === 0) throw new Error('EMPTY_TRICK');

  const topRank = plays.reduce((max, play) => Math.max(max, cardRank(play.card)), -1);
  const best = plays.filter((play) => cardRank(play.card) === topRank);
  const bestTeams = best.map((play) => teamOfSeat(seats, play.playerId));

  if (bestTeams.some((team) => team !== bestTeams[0])) {
    return { winnerTeam: 'PARDA', winnerPlayerId: null };
  }
  return { winnerTeam: bestTeams[0], winnerPlayerId: best[0].playerId };
}

/**
 * Ganador de la mano, evaluado después de cada baza (AC 2 / tabla del GDD §4.2) [ENG-08].
 * Devuelve el resultado apenas la mano queda decidida: la decisión es la baza más
 * temprana que la define, así que las bazas que ya no se juegan no cambian nada.
 * `manoTeam` es el equipo del mano EFECTIVO (`hand.participants[0]`), nunca `dealerId + 1`.
 */
export function resolveHandWinner(tricks: readonly (TeamId | 'PARDA')[], manoTeam: TeamId): HandWinner {
  const played = Math.min(tricks.length, 3);
  for (let count = 1; count <= played; count++) {
    const winnerTeam = winnerSoFar(tricks.slice(0, count), manoTeam);
    if (winnerTeam !== undefined) return { decided: true, winnerTeam };
  }
  return { decided: false };
}

/** Ganador con esas bazas jugadas en orden, o `undefined` si la mano todavía no se decidió. */
function winnerSoFar(tricks: readonly (TeamId | 'PARDA')[], manoTeam: TeamId): TeamId | undefined {
  const won = tricks.filter((team): team is TeamId => team !== 'PARDA');
  const wonBy0 = won.filter((team) => team === 0).length;
  const wonBy1 = won.length - wonBy0;

  // Dos bazas ganadas alcanzan, y el de la primera gana si después empatan (X Y P).
  if (wonBy0 === 2) return 0;
  if (wonBy1 === 2) return 1;

  // Una sola baza ganada y ya van dos jugadas (la otra parda): gana ese equipo.
  if (won.length === 1 && tricks.length >= 2) return won[0];

  // Una para cada uno: la tercera define, y si es parda gana el de la primera.
  // (Si la tercera la hubiera ganado alguien, ya habría vuelto por los dos casos de arriba.)
  if (won.length === 2 && tricks.length === 3) return won[0];

  // Todas pardas: gana el equipo del mano.
  if (won.length === 0 && tricks.length === 3) return manoTeam;

  return undefined;
}

/** Quién abre la próxima baza: el ganador de la anterior; tras una parda, el mismo que la abrió [ENG-07]. */
export function nextLeader(trick: TrickResult): PlayerId {
  return trick.winnerPlayerId ?? trick.leaderId;
}

/** Equipo del mano efectivo: el primero de `participants` (en pica-pica, el primero del par). */
function manoTeamOf(state: MatchState): TeamId {
  return teamOfSeat(state.seats, state.hand.participants[0]);
}

/**
 * Cierra la baza actual cuando todos los `participants` ya jugaron (AC 4):
 * la registra con su `leaderId`, emite `TRICK_WON` con el índice 0-based ya actualizado [ENG-16]
 * y, si la mano quedó decidida, la cierra con `endHand`; si no, abre la baza siguiente
 * con el líder de AC 3 y le da el turno.
 */
export function completeTrick(state: MatchState, events: GameEvent[]): void {
  const hand = state.hand;
  const plays = hand.currentTrick.plays;
  if (plays.length !== hand.participants.length) throw new Error('INCOMPLETE_TRICK');

  const outcome = resolveTrick(plays, state.seats);
  hand.tricks.push({
    plays: plays.slice(),
    winnerTeam: outcome.winnerTeam,
    winnerPlayerId: outcome.winnerPlayerId,
    leaderId: hand.currentTrick.leaderId,
  });
  events.push({
    type: 'TRICK_WON',
    trick: hand.tricks.length - 1,
    winnerTeam: outcome.winnerTeam,
    winnerPlayerId: outcome.winnerPlayerId,
  });

  // La flor de un solo equipo se cobra al completarse la primera baza (historia 1-8, AC 5).
  if (hand.tricks.length === 1) {
    resolveSingleTeamFlor(state, events);
    if (state.phase === 'MATCH_OVER') return;
  }

  const winner = resolveHandWinner(
    hand.tricks.map((trick) => trick.winnerTeam),
    manoTeamOf(state),
  );
  if (winner.decided) {
    endHand(state, events, { winnerTeam: winner.winnerTeam, reason: 'BAZAS' });
    return;
  }

  const leader = nextLeader(hand.tricks[hand.tricks.length - 1]);
  hand.currentTrick = { leaderId: leader, plays: [] };
  hand.turnId = leader;
}
