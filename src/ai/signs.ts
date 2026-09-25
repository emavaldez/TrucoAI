// Señas entre compañeros (pedido de Emmanuel 2026-09-25). No son acciones del reglamento: van por
// fuera del motor, entre jugadores del mismo equipo, al empezar la mano (4 y 6 jugadores, nunca en
// Pica Pica). Una seña dice qué carta (o qué tipo de carta) tiene el que la hace; no dice más que eso.

import { cardRank, envidoScore } from '../engine/index.js';
import type { Card, PlayerId } from '../engine/index.js';

export type SignKind =
  | 'ANCHO_ESPADA'
  | 'ANCHO_BASTO'
  | 'SIETE_ESPADA'
  | 'SIETE_ORO'
  | 'TRES'
  | 'DOS'
  | 'ANCHO_FALSO'
  | 'NADA'
  | 'FLOR'
  | 'ENVIDO';

export interface Signal {
  from: PlayerId;
  kind: SignKind;
  /** la carta a la que se refiere (solo la conoce el que la hizo: nunca se usa para decidir) */
  cardId: string | null;
}

export interface SignInfo {
  kind: SignKind;
  /** para el botón: "Guiñar un ojo" */
  gesture: string;
  /** para lo que hizo otro: "Guiñó un ojo" */
  seen: string;
  /** qué significa: "Ancho de basto" */
  meaning: string;
}

/** La tabla de señas confirmada por Emmanuel (2026-09-25), en el orden en que se ofrecen. */
export const SIGNS: SignInfo[] = [
  { kind: 'ANCHO_ESPADA', gesture: 'Levantar las cejas', seen: 'Levantó las cejas', meaning: 'Ancho de espada' },
  { kind: 'ANCHO_BASTO', gesture: 'Guiñar un ojo', seen: 'Guiñó un ojo', meaning: 'Ancho de basto' },
  { kind: 'SIETE_ESPADA', gesture: 'Torcer la boca a la derecha', seen: 'Torció la boca a la derecha', meaning: '7 de espada' },
  { kind: 'SIETE_ORO', gesture: 'Torcer la boca a la izquierda', seen: 'Torció la boca a la izquierda', meaning: '7 de oro' },
  { kind: 'TRES', gesture: 'Morderse el labio de abajo', seen: 'Se mordió el labio', meaning: 'Un 3' },
  { kind: 'DOS', gesture: 'Fruncir los labios (un beso)', seen: 'Frunció los labios', meaning: 'Un 2' },
  { kind: 'ANCHO_FALSO', gesture: 'Sacar la punta de la lengua', seen: 'Sacó la punta de la lengua', meaning: 'Ancho falso' },
  { kind: 'FLOR', gesture: 'Inflar los cachetes', seen: 'Infló los cachetes', meaning: 'Flor' },
  { kind: 'ENVIDO', gesture: 'Subir la nariz', seen: 'Subió la nariz', meaning: 'Envido (27 o más)' },
  { kind: 'NADA', gesture: 'Cerrar los ojos', seen: 'Cerró los ojos', meaning: 'Nada que valga' },
];

export function signInfo(kind: SignKind): SignInfo {
  return SIGNS.find((sign) => sign.kind === kind) as SignInfo;
}

/** Señas que hablan de una carta (se ven hasta que esa carta se juega). */
export const CARD_SIGNS: SignKind[] = ['ANCHO_ESPADA', 'ANCHO_BASTO', 'SIETE_ESPADA', 'SIETE_ORO', 'TRES', 'DOS', 'ANCHO_FALSO'];

/** ¿La carta corresponde a esa seña? */
export function matchesSign(kind: SignKind, card: Card): boolean {
  switch (kind) {
    case 'ANCHO_ESPADA':
      return card.id === '1-espada';
    case 'ANCHO_BASTO':
      return card.id === '1-basto';
    case 'SIETE_ESPADA':
      return card.id === '7-espada';
    case 'SIETE_ORO':
      return card.id === '7-oro';
    case 'TRES':
      return card.number === 3;
    case 'DOS':
      return card.number === 2;
    case 'ANCHO_FALSO':
      return card.id === '1-copa' || card.id === '1-oro';
    default:
      return false;
  }
}

export const ENVIDO_SIGN_MIN = 27;

function hasFlor(cards: readonly Card[]): boolean {
  return cards.length === 3 && cards.every((card) => card.suit === cards[0].suit);
}

/**
 * Señas que puede hacer alguien con esas cartas (las verdaderas): una por carta que tenga seña,
 * flor, envido de 27 o más, y "nada" si no tiene ninguna carta con seña.
 * `hand` = lo que le queda; `dealt` = las 3 repartidas (para envido y flor).
 */
export function availableSigns(hand: readonly Card[], dealt: readonly Card[], florRule: boolean): { kind: SignKind; cardId: string | null }[] {
  const out: { kind: SignKind; cardId: string | null }[] = [];
  for (const kind of CARD_SIGNS) {
    const card = hand.find((candidate) => matchesSign(kind, candidate));
    if (card) out.push({ kind, cardId: card.id });
  }
  const flor = florRule && hasFlor(dealt);
  if (flor) out.push({ kind: 'FLOR', cardId: null });
  if (!flor && envidoScore(dealt) >= ENVIDO_SIGN_MIN) out.push({ kind: 'ENVIDO', cardId: null });
  if (out.every((sign) => !CARD_SIGNS.includes(sign.kind))) out.push({ kind: 'NADA', cardId: null });
  return out;
}

/**
 * Las señas que hace la IA al empezar la mano: las dos cartas más fuertes que tengan seña,
 * más flor o envido si corresponde; si no tiene nada, "nada".
 */
export function aiSigns(from: PlayerId, hand: readonly Card[], dealt: readonly Card[], florRule: boolean): Signal[] {
  const options = availableSigns(hand, dealt, florRule);
  const cards = options
    .filter((sign) => CARD_SIGNS.includes(sign.kind))
    .sort((a, b) => {
      const card = (id: string | null): Card | undefined => hand.find((c) => c.id === id);
      return cardRank(card(b.cardId) as Card) - cardRank(card(a.cardId) as Card);
    })
    .slice(0, 2);
  const extra = options.filter((sign) => !CARD_SIGNS.includes(sign.kind));
  return [...cards, ...extra].map((sign) => ({ from, kind: sign.kind, cardId: sign.cardId }));
}

// ---------- lo que la IA saca de las señas de sus compañeros ----------

/** Rango de truco garantizado por una seña de carta (1 de espada 13 … ancho falso 7). */
const SIGN_RANK: Partial<Record<SignKind, number>> = {
  ANCHO_ESPADA: 13,
  ANCHO_BASTO: 12,
  SIETE_ESPADA: 11,
  SIETE_ORO: 10,
  TRES: 9,
  DOS: 8,
  ANCHO_FALSO: 7,
};

const EXACT_CARD: Partial<Record<SignKind, string>> = {
  ANCHO_ESPADA: '1-espada',
  ANCHO_BASTO: '1-basto',
  SIETE_ESPADA: '7-espada',
  SIETE_ORO: '7-oro',
};

export interface SignalKnowledge {
  /** cartas exactas que tiene en la mano cada compañero (señadas y todavía sin jugar) */
  forced: Map<PlayerId, Card[]>;
  /** condiciones sobre las 3 cartas repartidas de cada compañero */
  tests: Map<PlayerId, ((dealt: readonly Card[]) => boolean)[]>;
}

/** Condición que cumplen las 3 cartas repartidas de quien hizo la seña. */
export function signTest(kind: SignKind): (dealt: readonly Card[]) => boolean {
  switch (kind) {
    case 'FLOR':
      return (dealt) => hasFlor(dealt);
    case 'ENVIDO':
      return (dealt) => envidoScore(dealt) >= ENVIDO_SIGN_MIN;
    case 'NADA':
      return (dealt) => !dealt.some((card) => CARD_SIGNS.some((sign) => matchesSign(sign, card)));
    default:
      return (dealt) => dealt.some((card) => matchesSign(kind, card));
  }
}

/**
 * Lo que se sabe de las manos de los compañeros por sus señas. `unseen` = cartas que yo no vi
 * (una carta exacta señada que ya se jugó no se fuerza). Nunca usa `cardId` salvo para las
 * cartas exactas, que la seña ya dice cuáles son.
 */
export function signalKnowledge(selfId: PlayerId, signals: readonly Signal[], unseen: readonly Card[]): SignalKnowledge {
  const forced = new Map<PlayerId, Card[]>();
  const tests = new Map<PlayerId, ((dealt: readonly Card[]) => boolean)[]>();
  for (const signal of signals) {
    if (signal.from === selfId) continue;
    const exact = EXACT_CARD[signal.kind];
    if (exact) {
      const card = unseen.find((c) => c.id === exact);
      if (card) forced.set(signal.from, [...(forced.get(signal.from) ?? []), card]);
    }
    tests.set(signal.from, [...(tests.get(signal.from) ?? []), signTest(signal.kind)]);
  }
  return { forced, tests };
}

/**
 * La carta más alta que seguro le queda a un compañero por sus señas (rango de truco), o -1.
 * `played` = cartas que ya jugó en la mano.
 */
export function signaledTopRank(playerId: PlayerId, signals: readonly Signal[], played: readonly Card[]): number {
  let best = -1;
  for (const signal of signals) {
    if (signal.from !== playerId) continue;
    const rank = SIGN_RANK[signal.kind];
    if (rank === undefined) continue;
    // Si ya jugó una carta de esa seña, no sabemos si le queda otra.
    if (played.some((card) => matchesSign(signal.kind, card))) continue;
    best = Math.max(best, rank);
  }
  return best;
}
