// Textos de la interfaz (español rioplatense). Un solo lugar para nombres de cantos,
// equipos y acciones, así la UI no inventa textos distintos para lo mismo [UI-11].

import { TRUCO_LABELS } from './labels.js';
import type { Card, EnvidoCall, MatchState, PlayerId, TeamId } from '../engine/index.js';

export { TRUCO_LABELS };

export const ENVIDO_LABELS: Record<EnvidoCall, string> = { E: 'Envido', R: 'Real envido', F: 'Falta envido' };

export const HUMAN_TEAM: TeamId = 0;

export function teamName(team: TeamId): string {
  return team === HUMAN_TEAM ? 'Nosotros' : 'Ellos';
}

export function playerName(state: MatchState, playerId: PlayerId): string {
  return state.seats.find((seat) => seat.id === playerId)?.name ?? playerId;
}

export function teamOfPlayer(state: MatchState, playerId: PlayerId): TeamId {
  return state.seats.find((seat) => seat.id === playerId)?.team ?? 0;
}

/** Sujeto para frases: "Vos" conjuga distinto ("Vos cantaste"). */
export function isHumanId(playerId: PlayerId): boolean {
  return playerId === 'p0';
}

/** Verbo conjugado para el jugador: vos → segunda persona, el resto → tercera. */
export function verb(playerId: PlayerId, vos: string, el: string): string {
  return isHumanId(playerId) ? vos : el;
}

/** "el 7 de espada" */
export function cardName(card: Pick<Card, 'number' | 'suit'>): string {
  return `el ${card.number} de ${card.suit}`;
}

export function ordinal(index: number): string {
  return ['1ª', '2ª', '3ª'][index] ?? `${index + 1}ª`;
}

export function pointsText(points: number): string {
  return points === 1 ? '1 punto' : `${points} puntos`;
}

/** Iniciales del asiento ("Rival 2" → "R2", "Compañero" → "C", "Vos" → "VOS"). */
export function initials(name: string, isHuman: boolean): string {
  if (isHuman) return 'VOS';
  const words = name.split(/\s+/);
  if (words.length > 1 && /\d/.test(words[1])) return (words[0][0] + words[1]).toUpperCase();
  return words
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
