// ¿Un compañero cumplió la indicación de su pie con esta decisión? Para el premio por obedecer
// (training/PLAN.md, fase 4). Misma lectura de las indicaciones que la heurística (src/ai/policy.ts):
// - "¡Matá!": si abre la baza, la más alta; si el rival va ganando y puede superarlo, una que lo supere.
// - "Pasá": la más baja.
// - "Pardá": si el rival va ganando y tiene una igual, esa.
// - "Cantá truco" / "Esperá": cuando puede cantar truco en su turno, cantarlo / no cantarlo.
// Devuelve la suma de +1 (cumplió) y −1 (no cumplió) por cada indicación vigente que dice algo sobre
// esta decisión (0 si ninguna): entre −2 y +2.

import type { Observation, TeamId } from '../../src/engine/index.js';
import type { Instruction } from '../../src/ai/signs.js';
import { cardRank, sortedHand } from './cards.js';

export function compliance(obs: Observation, instructions: readonly Instruction[], action: number, mask: Uint8Array): number {
  let score = 0;
  const truco = instructions.find((kind) => kind === 'CANTA_TRUCO' || kind === 'ESPERA');
  // Puede cantar truco en su turno (no está respondiendo un canto).
  if (truco && mask[3] && !mask[4] && !mask[9]) score += truco === 'CANTA_TRUCO' ? (action === 3 ? 1 : -1) : action === 3 ? -1 : 1;

  const cards = instructions.find((kind) => kind === 'MATA' || kind === 'PASA' || kind === 'PARDA');
  const playable = [0, 1, 2].filter((i) => mask[i]).length;
  if (!cards || action > 2 || playable < 2) return score;
  const hand = sortedHand(obs.myHand);
  const played = cardRank(hand[action]);
  const ranks = hand.map(cardRank);
  const teams = new Map(obs.seats.map((seat) => [seat.id, seat.team as TeamId]));
  const participants = obs.picaPica !== null ? 2 : obs.seats.length;
  const plays = obs.currentTrick.plays.length >= participants ? [] : obs.currentTrick.plays;
  const top = plays.length > 0 ? Math.max(...plays.map((play) => cardRank(play.card))) : -1;
  const topTeams = new Set(plays.filter((play) => cardRank(play.card) === top).map((play) => teams.get(play.playerId)));
  const rivalsLead = plays.length > 0 && topTeams.size === 1 && !topTeams.has(obs.selfTeam);

  if (cards === 'PASA') score += played === Math.min(...ranks) ? 1 : -1;
  else if (cards === 'MATA') {
    if (plays.length === 0) score += played === Math.max(...ranks) ? 1 : -1;
    else if (rivalsLead && ranks.some((rank) => rank > top)) score += played > top ? 1 : -1;
  } else if (cards === 'PARDA') {
    if (rivalsLead && ranks.includes(top)) score += played === top ? 1 : -1;
  }
  return score;
}
