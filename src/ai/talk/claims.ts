// Cuándo se habla en voz alta en la mesa (r4, la red que habla y escucha) y qué quiere decir cada dicho.
// Es la versión de la charla que usan el entrenamiento y, después, el juego: los momentos son los mismos que
// las consultas del juego (GDD §2.3).
// - Tanto: cuando el pie va a decidir en la 1ra baza y todavía puede cantar envido ("¿canto tanto?"), cada
//   compañero suyo que todavía no habló del tanto en esta mano dice algo (o se calla).
// - Cartas: cuando al equipo le cantan truco ("¿qué hacemos?"), cada compañero del que contesta dice algo
//   (o se calla), una vez por nivel de truco.
// Todo lo dicho es público: lo escuchan los dos equipos.

import { cardRank, envidoScore, getLegalActions, pieOf } from '../../engine/index.js';
import type { Card, MatchState, PlayerId, TeamId } from '../../engine/index.js';
import type { TalkTopic } from '../rl/actions.js';
import type { PublicClaim } from './team.js';

export interface ClaimMoment {
  speaker: PlayerId;
  topic: TalkTopic;
  /** clave para no repetir (un dicho por tema y momento) */
  key: string;
}

function teamOf(state: MatchState, playerId: PlayerId): TeamId {
  return (state.seats.find((seat) => seat.id === playerId)?.team ?? 0) as TeamId;
}

/**
 * Quiénes tienen que decir algo antes de que decida `actor` (vacío si nadie). `said` son las claves de lo que
 * ya se dijo en esta mano; `topics`, de qué se habla (el piloto de r4 solo habla del tanto).
 */
export function claimMoments(state: MatchState, actor: PlayerId, said: ReadonlySet<string>, topics: readonly TalkTopic[]): ClaimMoment[] {
  if (state.rules.playerCount < 4 || state.hand.picaPica !== null) return [];
  const team = teamOf(state, actor);
  const mates = state.hand.participants.filter((id) => id !== actor && teamOf(state, id) === team);
  const out: ClaimMoment[] = [];
  if (
    topics.includes('tanto') &&
    state.phase === 'PLAYING' &&
    state.hand.tricks.length === 0 &&
    pieOf(state, team) === actor &&
    getLegalActions(state, actor).some((a) => a.type === 'CALL_ENVIDO')
  ) {
    for (const speaker of mates) {
      const key = `tanto-${speaker}`;
      if (!said.has(key)) out.push({ speaker, topic: 'tanto', key });
    }
  }
  if (topics.includes('cartas') && state.phase === 'AWAITING_TRUCO' && state.hand.truco.pending?.responderId === actor) {
    for (const speaker of mates) {
      const key = `cartas-${state.hand.truco.pending.level}-${speaker}`;
      if (!said.has(key)) out.push({ speaker, topic: 'cartas', key });
    }
  }
  return out;
}

/** Lo que tiene de verdad (para medir cuánto miente): el tanto de sus 3 cartas y lo que le queda en la mano. */
export function trueLevel(topic: TalkTopic, dealt: readonly Card[], hand: readonly Card[]): 'mucho' | 'algo' | 'nada' {
  if (topic === 'tanto') {
    const score = envidoScore(dealt);
    return score >= 28 ? 'mucho' : score >= 24 ? 'algo' : 'nada';
  }
  const ranks = hand.map(cardRank);
  const big = ranks.filter((rank) => rank >= 10).length;
  const good = ranks.filter((rank) => rank >= 8).length;
  if (big >= 2 || (big === 1 && good >= 2)) return 'mucho';
  if (big === 1 || good >= 1) return 'algo';
  return 'nada';
}

/** Lo último que dijo cada uno sobre cada tema (lo que ve la red: un dicho nuevo reemplaza al anterior). */
export function latestClaims(claims: readonly PublicClaim[]): PublicClaim[] {
  const last = new Map<string, PublicClaim>();
  for (const claim of claims) last.set(`${claim.from}-${claim.about}`, claim);
  return [...last.values()];
}
