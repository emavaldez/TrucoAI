// Lo que contestan las IA cuando les hablan (pedido de Emmanuel 2026-09-28). Todo es público: lo oye
// la mesa entera. Los compañeros contestan la verdad, en términos de seña ("tengo buen envido", "algo
// tengo"): nunca cartas exactas ni números. Los rivales contestan con una chicana.

import { cardRank, envidoScore } from '../../engine/index.js';
import type { Card, MatchState, PlayerId, Rng } from '../../engine/index.js';
import { instructionInfo, type Instruction } from '../signs.js';
import { matchesSign } from '../signs.js';
import type { CardRef } from './intents.js';

export function partnerEnvidoAnswer(dealt: readonly Card[]): string {
  const score = envidoScore(dealt);
  if (score >= 31) return '¡Tengo muchos!';
  if (score >= 28) return 'Tengo buenos tantos.';
  if (score >= 25) return 'Algo tengo.';
  return 'No, poco y nada.';
}

export function partnerTrucoAnswer(hand: readonly Card[]): string {
  const ranks = hand.map(cardRank);
  const big = ranks.filter((rank) => rank >= 10).length; // 7 de oro o más
  const good = ranks.filter((rank) => rank >= 8).length; // un 2 o más
  if (big >= 2 || (big === 1 && good >= 2)) return 'Tengo para el truco.';
  if (big === 1 || good >= 1) return 'Algo tengo.';
  if (hand.length === 0) return 'Ya no me quedan cartas.';
  return 'Nada, estoy seco.';
}

/** Lo que dice el pie cuando le preguntan qué hacer: sus indicaciones vigentes. */
export function pieWhatToDo(instructions: readonly Instruction[]): string {
  if (instructions.length === 0) return 'Jugá tranquilo.';
  return instructions.map((kind) => instructionInfo(kind).label).join(' ');
}

const RIVAL_BANTER = [
  'Hablá menos y jugá más.',
  'Eso lo vamos a ver.',
  'Tranquilo, que la noche es larga.',
  'Con esas cartas yo también hablaría.',
  'Mirá que te estoy escuchando, eh.',
  'Seguí así, que vamos bien.',
];

const RIVAL_ON_QUESTION = ['Eso no se pregunta, che.', '¿Y a vos qué te importa?', 'Preguntale a tu compañero.'];

export function rivalBanter(rng: Rng, question = false): string {
  const lines = question ? RIVAL_ON_QUESTION : RIVAL_BANTER;
  return lines[Math.floor(rng.next() * lines.length)];
}

/** La carta de la mano que corresponde a lo que se nombró (o `null` si no la tiene o es ambigua). */
export function resolveCard(hand: readonly Card[], ref: CardRef): Card | null {
  if (hand.length === 0) return null;
  const byRank = [...hand].sort((a, b) => cardRank(a) - cardRank(b));
  if (ref.pick === 'alta') return byRank[byRank.length - 1];
  if (ref.pick === 'baja') return byRank[0];
  if (ref.pick === 'media') return byRank.length === 3 ? byRank[1] : null;
  const matches = hand.filter((card) => (ref.number === undefined || card.number === ref.number) && (ref.suit === undefined || card.suit === ref.suit));
  // "El ancho" sin palo: el ancho verdadero que tenga (espada o basto) antes que un ancho falso.
  if (matches.length > 1 && ref.number === 1 && ref.suit === undefined) {
    const real = matches.filter((card) => card.suit === 'espada' || card.suit === 'basto');
    if (real.length === 1) return real[0];
  }
  return matches.length === 1 ? matches[0] : null;
}

/** ¿La carta nombrada tiene seña? Devuelve la seña que corresponde (para pasarle la info al pie). */
export function signForCard(card: Card, kinds: readonly string[]): string | null {
  for (const kind of kinds) if (matchesSign(kind as Parameters<typeof matchesSign>[0], card)) return kind;
  return null;
}

/** Los compañeros del jugador (sin él). */
export function partnersOf(state: MatchState, playerId: PlayerId): PlayerId[] {
  const team = state.seats.find((seat) => seat.id === playerId)?.team;
  return state.seats.filter((seat) => seat.team === team && seat.id !== playerId).map((seat) => seat.id);
}

export function rivalsOf(state: MatchState, playerId: PlayerId): PlayerId[] {
  const team = state.seats.find((seat) => seat.id === playerId)?.team;
  return state.seats.filter((seat) => seat.team !== team).map((seat) => seat.id);
}
