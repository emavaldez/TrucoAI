// Estimaciones por muestreo (Monte Carlo) **solo desde las cartas no vistas** (GDD §11.1-11.2):
// se reparten al azar las cartas que no vi entre los demás jugadores y se juega el resto de la mano
// con la política de cartas. Nunca mira manos ajenas: todo sale de la `Observation`.

import { cardRank, envidoScore } from '../engine/index.js';
import type { Card, Observation, PlayerId, Rng, TeamId, TrickPlay } from '../engine/index.js';
import { chooseCard, trickLeader, type TrickWinner } from './cardPlay.js';
import { cardsLeft, participantsOf, shownBy, teamMap } from './table.js';

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Ganador de la mano con esas bazas (GDD §4.2), o `null` si todavía no está decidida. */
export function handDecided(results: readonly TrickWinner[], manoTeam: TeamId): TeamId | null {
  for (let count = 1; count <= Math.min(results.length, 3); count++) {
    const winner = decidedWith(results.slice(0, count), manoTeam);
    if (winner !== null) return winner;
  }
  return null;
}

function decidedWith(results: readonly TrickWinner[], manoTeam: TeamId): TeamId | null {
  const won = results.filter((r): r is TeamId => r !== 'PARDA');
  const by0 = won.filter((team) => team === 0).length;
  const by1 = won.length - by0;
  if (by0 === 2) return 0;
  if (by1 === 2) return 1;
  if (won.length === 1 && results.length >= 2) return won[0];
  if (won.length === 2 && results.length === 3) return won[0];
  if (won.length === 0 && results.length === 3) return manoTeam;
  return null;
}

/** Reparte las cartas no vistas entre los demás participantes (cantidad = lo que les queda). */
function sampleHands(obs: Observation, participants: readonly PlayerId[], rng: Rng): Map<PlayerId, Card[]> {
  const left = cardsLeft(obs, participants);
  const pool = shuffled(obs.unseenCards, rng);
  const hands = new Map<PlayerId, Card[]>();
  let cursor = 0;
  for (const playerId of participants) {
    if (playerId === obs.selfId) {
      hands.set(playerId, obs.myHand.slice());
      continue;
    }
    const count = left.get(playerId) ?? 0;
    hands.set(playerId, pool.slice(cursor, cursor + count));
    cursor += count;
  }
  return hands;
}

/**
 * Probabilidad de que mi equipo gane la mano jugando las cartas que quedan
 * (sin contar cantos futuros). `samples` repartos al azar de lo no visto.
 */
export function handWinProbability(obs: Observation, rng: Rng, samples: number): number {
  const participants = participantsOf(obs);
  const teams = teamMap(obs);
  const manoTeam = teams.get(participants[0]) as TeamId;
  const n = participants.length;
  let wins = 0;

  for (let s = 0; s < samples; s++) {
    const hands = sampleHands(obs, participants, rng);
    const results: TrickWinner[] = obs.tricks.map((trick) => trick.winnerTeam);
    let plays: TrickPlay[] = obs.currentTrick.plays.length >= n ? [] : obs.currentTrick.plays.slice();
    let leaderId = obs.currentTrick.leaderId;
    let winner = handDecided(results, manoTeam);
    let guard = 0;

    while (winner === null && guard < 40) {
      guard += 1;
      const leaderIndex = participants.indexOf(leaderId);
      const actor = participants[(leaderIndex + plays.length) % n];
      const hand = hands.get(actor) ?? [];
      if (hand.length === 0) break;
      const myTeam = teams.get(actor) as TeamId;
      let rivalsAfter = 0;
      for (let k = plays.length + 1; k < n; k++) {
        if (teams.get(participants[(leaderIndex + k) % n]) !== myTeam) rivalsAfter += 1;
      }
      const card = chooseCard({ hand, plays, myTeam, teams, results, rivalsAfter });
      hands.set(
        actor,
        hand.filter((c) => c !== card),
      );
      plays = [...plays, { playerId: actor, card }];

      if (plays.length === n) {
        const lead = trickLeader(plays, teams);
        const trickWinner = lead.winner as TrickWinner;
        results.push(trickWinner);
        if (trickWinner !== 'PARDA') {
          const first = plays.find((play) => teams.get(play.playerId) === trickWinner && cardRank(play.card) === lead.rank);
          if (first) leaderId = first.playerId;
        }
        plays = [];
        winner = handDecided(results, manoTeam);
      }
    }
    if (winner === teams.get(obs.selfId)) wins += 1;
  }
  return wins / samples;
}

/**
 * Probabilidad de que mi equipo gane el envido si se quiere: cada rival y compañero tiene
 * lo que ya mostró más cartas al azar de lo no visto. Empate: el que dice antes (desde el mano).
 */
export function envidoWinProbability(obs: Observation, rng: Rng, samples: number): number {
  const participants = participantsOf(obs);
  const teams = teamMap(obs);
  const myTeam = obs.selfTeam;
  const myScore = envidoScore(obs.myDealt);
  const shown = new Map(participants.map((playerId) => [playerId, shownBy(obs, playerId)]));
  let wins = 0;

  for (let s = 0; s < samples; s++) {
    const pool = shuffled(obs.unseenCards, rng);
    let cursor = 0;
    let bestScore = -1;
    let bestTeam: TeamId = myTeam;
    for (const playerId of participants) {
      let score: number;
      if (playerId === obs.selfId) {
        score = myScore;
      } else {
        const known = shown.get(playerId) ?? [];
        const hidden = pool.slice(cursor, cursor + (3 - known.length));
        cursor += 3 - known.length;
        score = envidoScore([...known, ...hidden]);
      }
      if (score > bestScore) {
        bestScore = score;
        bestTeam = teams.get(playerId) as TeamId;
      }
    }
    if (bestTeam === myTeam) wins += 1;
  }
  return wins / samples;
}
