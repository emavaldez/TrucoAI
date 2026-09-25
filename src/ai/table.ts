// Lectura de la mesa desde una `Observation` (solo información pública + la propia).
// Deriva el orden de juego, quién juega ahora en la baza y cuántas cartas le quedan a cada uno.
// No importa nada del motor salvo tipos y helpers puros (arquitectura §7, ADR-4).

import type { Card, Observation, PlayerId, TeamId, TrickPlay } from '../engine/index.js';

/** Jugadores de la mano (o de la submano de pica-pica) en orden de juego desde el mano efectivo. */
export function participantsOf(obs: Observation): PlayerId[] {
  if (obs.picaPica !== null) {
    const pair = obs.picaPica.pairs[obs.picaPica.submano];
    return [pair[0], pair[1]];
  }
  const n = obs.seats.length;
  const manoSeat = obs.seats.findIndex((seat) => seat.id === obs.manoId);
  const order: PlayerId[] = [];
  for (let i = 0; i < n; i++) order.push(obs.seats[(manoSeat + i) % n].id);
  return order;
}

/** Equipo de cada jugador. */
export function teamMap(obs: Observation): Map<PlayerId, TeamId> {
  return new Map(obs.seats.map((seat) => [seat.id, seat.team]));
}

/** Quién juega la próxima carta de la baza en curso. */
export function nextToPlay(obs: Observation, participants: readonly PlayerId[]): PlayerId {
  const leaderIndex = participants.indexOf(obs.currentTrick.leaderId);
  return participants[(leaderIndex + obs.currentTrick.plays.length) % participants.length];
}

/** Cartas jugadas en la mano/submano en curso (bazas cerradas + baza actual). */
export function playsThisHand(obs: Observation): TrickPlay[] {
  const plays: TrickPlay[] = [];
  for (const trick of obs.tricks) plays.push(...trick.plays);
  const trickComplete = obs.currentTrick.plays.length >= participantsOf(obs).length;
  if (!trickComplete) plays.push(...obs.currentTrick.plays);
  return plays;
}

/** Cartas que le quedan en la mano a cada participante (la propia se conoce; las otras solo en cantidad). */
export function cardsLeft(obs: Observation, participants: readonly PlayerId[]): Map<PlayerId, number> {
  const played = playsThisHand(obs);
  const left = new Map<PlayerId, number>();
  for (const playerId of participants) {
    left.set(playerId, playerId === obs.selfId ? obs.myHand.length : 3 - played.filter((p) => p.playerId === playerId).length);
  }
  return left;
}

/** Cartas que un jugador ya mostró en la mano en curso. */
export function shownBy(obs: Observation, playerId: PlayerId): Card[] {
  return playsThisHand(obs)
    .filter((play) => play.playerId === playerId)
    .map((play) => play.card);
}
