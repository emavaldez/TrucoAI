// Juego de cartas de la IA (épica 2, historia 2-2): abre bajo, gana con la mínima que alcanza,
// no le gana al compañero que va ganando, cierra con la más alta cuando la baza decide,
// y emparda cuando la parda le da la mano. Funciones puras: también las usan las simulaciones.

import { cardRank } from '../engine/index.js';
import type { Card, PlayerId, TeamId, TrickPlay } from '../engine/index.js';

export type TrickWinner = TeamId | 'PARDA';

export interface CardContext {
  /** mis cartas */
  hand: readonly Card[];
  /** jugadas de la baza en curso */
  plays: readonly TrickPlay[];
  myTeam: TeamId;
  teams: ReadonlyMap<PlayerId, TeamId>;
  /** resultado de las bazas ya jugadas de la mano */
  results: readonly TrickWinner[];
  /** cuántos rivales juegan después de mí en esta baza */
  rivalsAfter: number;
}

export function lowest(cards: readonly Card[]): Card {
  return cards.reduce((low, card) => (cardRank(card) < cardRank(low) ? card : low));
}

export function highest(cards: readonly Card[]): Card {
  return cards.reduce((high, card) => (cardRank(card) > cardRank(high) ? card : high));
}

/** Quién va ganando la baza: equipo, parda, o `null` si nadie jugó. */
export function trickLeader(plays: readonly TrickPlay[], teams: ReadonlyMap<PlayerId, TeamId>): {
  winner: TrickWinner | null;
  rank: number;
} {
  if (plays.length === 0) return { winner: null, rank: -1 };
  const rank = Math.max(...plays.map((play) => cardRank(play.card)));
  const bestTeams = new Set(plays.filter((play) => cardRank(play.card) === rank).map((play) => teams.get(play.playerId)));
  if (bestTeams.size > 1) return { winner: 'PARDA', rank };
  return { winner: [...bestTeams][0] as TeamId, rank };
}

/** Elige la carta a jugar (política "normal"). */
export function chooseCard(ctx: CardContext): Card {
  const { hand } = ctx;
  if (hand.length === 1) return hand[0];

  const weWonBefore = ctx.results.includes(ctx.myTeam);
  const trickIndex = ctx.results.length;

  // Abrir la baza: en la primera, bajo; después, la baza decide (o casi): la más alta.
  if (ctx.plays.length === 0) return trickIndex === 0 ? lowest(hand) : highest(hand);

  const lead = trickLeader(ctx.plays, ctx.teams);
  const byRank = [...hand].sort((a, b) => cardRank(a) - cardRank(b));

  // Mi equipo va ganando: no le gano al compañero.
  if (lead.winner === ctx.myTeam) return lowest(hand);

  const beating = byRank.filter((card) => cardRank(card) > lead.rank);
  const tying = byRank.filter((card) => cardRank(card) === lead.rank);

  // Parda que gana la mano: ya ganamos una baza antes.
  if (tying.length > 0 && weWonBefore && ctx.rivalsAfter === 0) return tying[0];

  if (beating.length > 0) return beating[0];

  if (tying.length > 0) {
    // Primera baza parda: decide la siguiente; conviene si me queda una carta fuerte.
    if (trickIndex === 0) {
      const rest = hand.filter((card) => card !== tying[0]);
      if (rest.length > 0 && cardRank(highest(rest)) >= 9) return tying[0];
    }
    if (weWonBefore) return tying[0];
    // Primera fue parda y esta también: decide la tercera; empardar no pierde.
    if (ctx.results.length > 0 && ctx.results.every((result) => result === 'PARDA')) return tying[0];
  }

  return lowest(hand);
}
