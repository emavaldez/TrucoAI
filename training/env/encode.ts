// Codificación de la observación para la red (training/PLAN.md). Es LA única implementación:
// la usan los actores del entrenamiento y la va a usar el juego en el navegador.
// - `encodeObs`: solo lo que ve el jugador (Observation + señas + indicación del pie).
// - `encodePriv`: lo que solo ve el crítico durante el entrenamiento (las manos ajenas).
// Todo relativo al que decide: asiento relativo 0 = yo, 1 = el siguiente en el orden de juego, etc.

import { envidoScore } from '../../src/engine/index.js';
import type { MatchState, Observation, PlayerId } from '../../src/engine/index.js';
import type { Signal, SignKind } from '../../src/ai/signs.js';
import { cardIndex, cardRank, envidoValue, sortedHand, suitIndex } from './cards.js';

export const MAX_SEATS = 6;

export const SIGN_KINDS: SignKind[] = [
  'ANCHO_ESPADA',
  'ANCHO_BASTO',
  'SIETE_ESPADA',
  'SIETE_ORO',
  'TRES',
  'DOS',
  'ANCHO_FALSO',
  'NADA',
  'FLOR',
  'ENVIDO',
];

/** Indicaciones del pie a sus compañeros (training/PLAN.md, confirmadas por Emmanuel). */
export const INSTRUCTIONS = ['MATA', 'PASA', 'PARDA', 'TRANQUILO', 'CANTA_ENVIDO', 'NO_CANTES', 'CANTA_TRUCO', 'ESPERA'] as const;
export type Instruction = (typeof INSTRUCTIONS)[number];

/** Arma el vector registrando el nombre de cada tramo (para el layout y los tests golden). */
class Builder {
  readonly values: number[] = [];
  readonly layout: { name: string; size: number }[] = [];
  section(name: string, size: number): (index: number, value: number) => void {
    const start = this.values.length;
    for (let i = 0; i < size; i++) this.values.push(0);
    this.layout.push({ name, size });
    return (index, value) => {
      if (index < 0 || index >= size) throw new Error(`${name}: índice ${index} fuera de rango`);
      this.values[start + index] = value;
    };
  }
  scalar(name: string, value: number): void {
    this.section(name, 1)(0, value);
  }
}

function relSeatFn(obs: Observation): (playerId: PlayerId) => number {
  const n = obs.seats.length;
  const mine = obs.seats.find((seat) => seat.id === obs.selfId)?.seat ?? 0;
  const bySeat = new Map(obs.seats.map((seat) => [seat.id, seat.seat]));
  return (playerId) => (((bySeat.get(playerId) ?? 0) - mine) % n + n) % n;
}

function faltaFor(obs: Observation, team: 0 | 1): number {
  if (obs.picaPica !== null) return 7;
  const leader = Math.max(obs.scores[0], obs.scores[1]);
  if (leader < 15) return obs.rules.targetScore - obs.scores[team];
  return obs.rules.targetScore - leader;
}

function chainPoints(calls: readonly string[], falta: number): number {
  if (calls.includes('F')) return falta;
  return calls.reduce((total, call) => total + (call === 'R' ? 3 : 2), 0);
}

export interface EncodeExtras {
  /** señas recibidas de compañeros en esta mano */
  signals?: readonly Signal[];
  /** indicación vigente del pie de mi equipo */
  instruction?: Instruction | null;
}

function build(obs: Observation, extras: EncodeExtras = {}): Builder {
  const b = new Builder();
  const rel = relSeatFn(obs);
  const teamOf = new Map(obs.seats.map((seat) => [seat.id, seat.team]));
  const us = obs.selfTeam;
  const them = (1 - us) as 0 | 1;

  b.section('players', 3)([2, 4, 6].indexOf(obs.seats.length), 1);

  const hand = b.section('myHand', 40);
  for (const card of obs.myHand) hand(cardIndex(card), 1);

  const sorted = sortedHand(obs.myHand);
  for (let slot = 0; slot < 3; slot++) {
    const put = b.section(`slot${slot}`, 20);
    const card = sorted[slot];
    if (!card) continue;
    put(0, 1);
    put(1 + cardRank(card), 1);
    put(15, envidoValue(card) / 7);
    put(16 + suitIndex(card), 1);
  }

  const florRule = obs.rules.flor;
  const dealt = obs.myDealt;
  const hasFlor = dealt.length === 3 && dealt.every((card) => card.suit === dealt[0].suit);
  b.scalar('myEnvido', envidoScore(dealt) / 33);
  b.scalar('myFlor', florRule && hasFlor ? 1 : 0);

  // Cartas jugadas por asiento relativo y baza.
  const played = b.section('played', MAX_SEATS * 3 * 40);
  obs.tricks.forEach((trick, t) => {
    if (t >= 3) return; // pica-pica: bazas de submanos anteriores (no se entrena con pica-pica)
    for (const play of trick.plays) played((rel(play.playerId) * 3 + t) * 40 + cardIndex(play.card), 1);
  });
  const currentIndex = obs.tricks.length;
  const n = obs.picaPica !== null ? 2 : obs.seats.length;
  const currentPlays = obs.currentTrick.plays.length >= n ? [] : obs.currentTrick.plays;
  if (currentIndex < 3) {
    for (const play of currentPlays) played((rel(play.playerId) * 3 + currentIndex) * 40 + cardIndex(play.card), 1);
  }

  // Baza en curso.
  b.scalar('trickPlays', currentPlays.length / MAX_SEATS);
  b.section('trickLeader', MAX_SEATS)(rel(obs.currentTrick.leaderId), 1);
  b.section('trickIndex', 3)(Math.min(currentIndex, 2), 1);
  const best = b.section('trickBestRank', 14);
  const bestTeam = b.section('trickBestTeam', 4); // nos, ellos, parda, nadie
  if (currentPlays.length === 0) bestTeam(3, 1);
  else {
    const top = Math.max(...currentPlays.map((play) => cardRank(play.card)));
    best(top, 1);
    const teams = new Set(currentPlays.filter((play) => cardRank(play.card) === top).map((play) => teamOf.get(play.playerId)));
    bestTeam(teams.size > 1 ? 2 : teams.has(us) ? 0 : 1, 1);
  }

  // Resultado de las bazas.
  for (let t = 0; t < 3; t++) {
    const put = b.section(`trick${t}`, 4); // nos, ellos, parda, sin jugar
    const trick = obs.tricks[t];
    if (!trick) put(3, 1);
    else put(trick.winnerTeam === 'PARDA' ? 2 : trick.winnerTeam === us ? 0 : 1, 1);
  }

  // Posición.
  b.section('mano', MAX_SEATS)(rel(obs.manoId), 1);
  b.section('dealer', MAX_SEATS)(rel(obs.dealerId), 1);
  b.scalar('isMano', obs.isMano ? 1 : 0);
  b.scalar('isPie', obs.isPie ? 1 : 0);
  b.scalar('manoTeamIsUs', teamOf.get(obs.manoId) === us ? 1 : 0);

  // Marcador.
  const target = obs.rules.targetScore;
  b.scalar('scoreUs', obs.scores[us] / target);
  b.scalar('scoreThem', obs.scores[them] / target);
  b.scalar('buenasUs', obs.scores[us] >= 15 ? 1 : 0);
  b.scalar('buenasThem', obs.scores[them] >= 15 ? 1 : 0);
  b.scalar('faltaUs', faltaFor(obs, us) / target);
  b.scalar('faltaThem', faltaFor(obs, them) / target);

  // Fase.
  b.section('phase', 3)(obs.phase === 'AWAITING_TRUCO' ? 1 : obs.phase === 'AWAITING_ENVIDO' ? 2 : 0, 1);

  // Truco.
  const truco = obs.truco;
  b.section('trucoLevel', 4)(truco.level, 1);
  b.section('trucoPending', 4)(truco.pending?.level ?? 0, 1);
  const trucoCaller = b.section('trucoCaller', 2);
  if (truco.pending) trucoCaller(truco.pending.callerTeam === us ? 0 : 1, 1);
  b.section('trucoQuiero', 3)(truco.quieroTeam === null ? 2 : truco.quieroTeam === us ? 0 : 1, 1);

  // Envido.
  const statuses = ['none', 'calling', 'resolved', 'cancelled'];
  b.section('envidoStatus', 4)(Math.max(0, statuses.indexOf(obs.envidoStatus)), 1);
  const chain = obs.envidoChain.map((canto) => canto.call);
  b.scalar('envidoE', chain.filter((call) => call === 'E').length / 2);
  b.scalar('envidoR', chain.includes('R') ? 1 : 0);
  b.scalar('envidoF', chain.includes('F') ? 1 : 0);
  const lastCaller = b.section('envidoLastCaller', 2);
  const last = obs.envidoChain[obs.envidoChain.length - 1];
  if (last) lastCaller(last.team === us ? 0 : 1, 1);
  const falta = last ? faltaFor(obs, last.team === us ? them : us) : 0;
  b.scalar('envidoQuerido', chain.length > 0 ? chainPoints(chain, falta) / target : 0);
  b.scalar('envidoNoQuerido', chain.length > 1 ? chainPoints(chain.slice(0, -1), falta) / target : chain.length === 1 ? 1 / target : 0);

  // Tantos dichos por cada uno.
  const said = b.section('envidoSaid', MAX_SEATS * 4); // dijo número, número, me dio/son buenas, cota
  for (const entry of obs.publicScores) {
    if (entry.kind !== 'ENVIDO') continue;
    said(rel(entry.playerId) * 4, 1);
    said(rel(entry.playerId) * 4 + 1, entry.score / 33);
  }
  for (const saying of obs.envidoSayings) {
    if (saying.kind === 'SCORE') continue;
    said(rel(saying.playerId) * 4 + 2, 1);
    said(rel(saying.playerId) * 4 + 3, (saying.against ?? 0) / 33);
  }

  // Señas recibidas (por asiento relativo).
  const signs = b.section('signals', MAX_SEATS * SIGN_KINDS.length);
  for (const signal of extras.signals ?? []) {
    if (signal.from === obs.selfId) continue;
    signs(rel(signal.from) * SIGN_KINDS.length + SIGN_KINDS.indexOf(signal.kind), 1);
  }
  const instruction = b.section('instruction', INSTRUCTIONS.length);
  if (extras.instruction) instruction(INSTRUCTIONS.indexOf(extras.instruction), 1);

  b.scalar('picaPica', obs.picaPica !== null ? 1 : 0);
  return b;
}

/** Cada valor se redondea a k/255: así se guarda sin pérdida en un byte y el juego ve exactamente lo mismo. */
export function quantize(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255) / 255;
}

/** Vector de entrada de la política (solo información del jugador), en [0, 1] y cuantizado. */
export function encodeObs(obs: Observation, extras?: EncodeExtras): Float32Array {
  const builder = build(obs, extras);
  return Float32Array.from(builder.values, quantize);
}

/** Huella del layout (nombres y tamaños): la red guarda la suya y se comparan al cargar. */
export function layoutHash(layout: { name: string; size: number }[]): string {
  let h = 0x811c9dc5;
  for (const ch of layout.map((part) => `${part.name}:${part.size}`).join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Tramos del vector (nombre y tamaño), para documentar y verificar compatibilidad. */
export function obsLayout(sample: Observation): { name: string; size: number }[] {
  return build(sample).layout;
}

export const PRIV_DIM = (MAX_SEATS - 1) * 41;

/** Lo que ve solo el crítico: las cartas que le quedan a cada uno y su envido. */
export function encodePriv(state: MatchState, selfId: PlayerId): Float32Array {
  const out = new Float32Array(PRIV_DIM);
  const n = state.seats.length;
  const mine = state.seats.find((seat) => seat.id === selfId)?.seat ?? 0;
  for (const seat of state.seats) {
    const r = (((seat.seat - mine) % n) + n) % n;
    if (r === 0) continue;
    const base = (r - 1) * 41;
    for (const card of state.hand.hands[seat.id] ?? []) out[base + cardIndex(card)] = 1;
    out[base + 40] = quantize(envidoScore(state.hand.dealt[seat.id] ?? []) / 33);
  }
  return out;
}
