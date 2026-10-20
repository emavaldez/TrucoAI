// La carta que pide una indicación del pie (MATA, PASA, PARDA, TRANQUILO). Vale para la heurística y para la red
// (TRANQUILO la aplica también la red: se entrenó con otro significado, "libre").

import { cardRank } from '../engine/index.js';
import type { Card, Observation, PlayerId, TeamId } from '../engine/index.js';
import { lowest, trickLeader } from './cardPlay.js';
import type { Instruction } from './signs.js';
import { participantsOf, teamMap } from './table.js';

/**
 * La carta que pide una indicación del pie, o `null` si no hay indicación de cartas que decida:
 * - PASA: la más baja (la mata el pie).
 * - MATA: la que gana la baza (si ya la tiene el equipo, la más baja).
 * - PARDA: empardar si se puede; si no, ganar; si no, la más baja.
 * - TRANQUILO ("jugá chica, guardá la grande", Emmanuel 2026-10-20): nunca la mejor carta. Al abrir, la mejor de
 *   las otras; contestando, gana barato sin la mejor y, si no puede, la más baja. Con una sola carta, esa.
 */
export function cardForInstruction(obs: Observation, instructions: readonly Instruction[], teams: ReadonlyMap<PlayerId, TeamId> = teamMap(obs)): Card | null {
  const hand = obs.myHand;
  if (hand.length === 0 || obs.picaPica !== null) return null;
  const plays = obs.currentTrick.plays.length >= participantsOf(obs).length ? [] : obs.currentTrick.plays;
  const lead = trickLeader(plays, teams);
  const byRank = [...hand].sort((a, b) => cardRank(a) - cardRank(b));
  if (instructions.includes('PASA')) return lowest(hand);
  if (instructions.includes('MATA')) {
    if (plays.length === 0) return byRank[byRank.length - 1];
    if (lead.winner === obs.selfTeam) return lowest(hand);
    return byRank.find((card) => cardRank(card) > lead.rank) ?? lowest(hand);
  }
  if (instructions.includes('PARDA')) {
    return byRank.find((card) => cardRank(card) === lead.rank) ?? byRank.find((card) => cardRank(card) > lead.rank) ?? lowest(hand);
  }
  if (instructions.includes('TRANQUILO')) {
    if (hand.length === 1) return hand[0];
    const rest = byRank.slice(0, -1);
    if (plays.length === 0) return rest[rest.length - 1];
    if (lead.winner === obs.selfTeam) return lowest(hand);
    return rest.find((card) => cardRank(card) > lead.rank) ?? lowest(hand);
  }
  return null;
}
