// Estimaciones por muestreo (Monte Carlo) **solo desde las cartas no vistas** (GDD §11.1-11.2):
// se reparten al azar las cartas que no vi entre los demás jugadores y se juega el resto de la mano
// con la política de cartas. Nunca mira manos ajenas: todo sale de la `Observation`.

import { cardRank, envidoScore } from '../engine/index.js';
import type { Card, Observation, PlayerId, Rng, TeamId, TrickPlay } from '../engine/index.js';
import { chooseCard, trickLeader, type TrickWinner } from './cardPlay.js';
import type { SignalKnowledge } from './signs.js';
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

/**
 * Lectura de lo público (dificultad difícil, GDD §11.2): restricciones sobre el envido de los
 * otros jugadores que salen de la `Observation` (envidos dichos, cantos de envido hechos).
 */
export interface EnvidoConstraint {
  min: number;
  max: number;
}

export type Constraints = Map<PlayerId, EnvidoConstraint>;

/** Arma las restricciones a partir de lo que se vio y se dijo en la mano. */
export function publicConstraints(obs: Observation): Constraints {
  const out: Constraints = new Map();
  for (const entry of obs.publicScores) {
    if (entry.kind === 'ENVIDO' && entry.playerId !== obs.selfId) out.set(entry.playerId, { min: entry.score, max: entry.score });
  }
  // "Me dio" / "Son buenas": no llegaba al número que se había dicho.
  for (const saying of obs.envidoSayings) {
    if (saying.kind === 'SCORE' || saying.playerId === obs.selfId || saying.against === undefined) continue;
    const current = out.get(saying.playerId);
    out.set(saying.playerId, { min: current?.min ?? 0, max: Math.min(current?.max ?? 33, saying.against) });
  }
  for (const canto of obs.envidoChain) {
    if (canto.by === obs.selfId || out.has(canto.by)) continue;
    // Quien canta envido suele tener con qué: al menos 25 (real/falta, 27).
    out.set(canto.by, { min: canto.call === 'E' ? 25 : 27, max: 33 });
  }
  return out;
}

/**
 * Reparte las cartas no vistas entre los demás participantes (cantidad = lo que les queda).
 * Con señas de compañeros: las cartas exactas señadas van a quien las señó y el resto de lo
 * señado (un 3, flor, 27 o más, nada) se respeta por rechazo, igual que el envido público.
 */
function sampleHands(
  obs: Observation,
  participants: readonly PlayerId[],
  rng: Rng,
  constraints?: Constraints,
  knowledge?: SignalKnowledge,
): Map<PlayerId, Card[]> {
  const left = cardsLeft(obs, participants);
  const forcedIds = new Set<string>();
  for (const [playerId, cards] of knowledge?.forced ?? []) {
    if (participants.includes(playerId)) for (const card of cards) forcedIds.add(card.id);
  }
  const free = obs.unseenCards.filter((card) => !forcedIds.has(card.id));
  const checks = (constraints?.size ?? 0) + (knowledge?.tests.size ?? 0);
  const tries = checks > 0 ? 40 : 1;
  let hands = new Map<PlayerId, Card[]>();
  for (let attempt = 0; attempt < tries; attempt++) {
    const pool = shuffled(free, rng);
    hands = new Map<PlayerId, Card[]>();
    let cursor = 0;
    for (const playerId of participants) {
      if (playerId === obs.selfId) {
        hands.set(playerId, obs.myHand.slice());
        continue;
      }
      const count = left.get(playerId) ?? 0;
      const forced = (knowledge?.forced.get(playerId) ?? []).slice(0, count);
      const rest = count - forced.length;
      hands.set(playerId, [...forced, ...pool.slice(cursor, cursor + rest)]);
      cursor += rest;
    }
    if (satisfies(obs, hands, constraints, knowledge)) break;
  }
  return hands;
}

/** ¿El reparto respeta el envido público y las señas? (lo mostrado + lo que tendría en la mano) */
function satisfies(obs: Observation, hands: Map<PlayerId, Card[]>, constraints?: Constraints, knowledge?: SignalKnowledge): boolean {
  for (const [playerId, range] of constraints ?? []) {
    const hidden = hands.get(playerId);
    if (hidden === undefined) continue;
    const score = envidoScore([...shownBy(obs, playerId), ...hidden]);
    if (score < range.min || score > range.max) return false;
  }
  for (const [playerId, tests] of knowledge?.tests ?? []) {
    const hidden = hands.get(playerId);
    if (hidden === undefined || playerId === obs.selfId) continue;
    const dealt = [...shownBy(obs, playerId), ...hidden];
    if (!tests.every((test) => test(dealt))) return false;
  }
  return true;
}

/**
 * Probabilidad de que mi equipo gane la mano jugando las cartas que quedan
 * (sin contar cantos futuros). `samples` repartos al azar de lo no visto.
 */
export function handWinProbability(
  obs: Observation,
  rng: Rng,
  samples: number,
  constraints?: Constraints,
  knowledge?: SignalKnowledge,
): number {
  const participants = participantsOf(obs);
  const teams = teamMap(obs);
  const manoTeam = teams.get(participants[0]) as TeamId;
  const n = participants.length;
  let wins = 0;

  for (let s = 0; s < samples; s++) {
    const hands = sampleHands(obs, participants, rng, constraints, knowledge);
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
export function envidoWinProbability(
  obs: Observation,
  rng: Rng,
  samples: number,
  constraints?: Constraints,
  knowledge?: SignalKnowledge,
): number {
  const participants = participantsOf(obs);
  const teams = teamMap(obs);
  const myTeam = obs.selfTeam;
  const myScore = envidoScore(obs.myDealt);
  const shown = new Map(participants.map((playerId) => [playerId, shownBy(obs, playerId)]));
  let wins = 0;

  for (let s = 0; s < samples; s++) {
    const hands = sampleHands(obs, participants, rng, constraints, knowledge);
    let bestScore = -1;
    let bestTeam: TeamId = myTeam;
    // Empate: gana el que dice antes (el orden de `participants` arranca en el mano).
    for (const playerId of participants) {
      const score =
        playerId === obs.selfId ? myScore : envidoScore([...(shown.get(playerId) ?? []), ...(hands.get(playerId) ?? [])]);
      if (score > bestScore) {
        bestScore = score;
        bestTeam = teams.get(playerId) as TeamId;
      }
    }
    if (bestTeam === myTeam) wins += 1;
  }
  return wins / samples;
}
