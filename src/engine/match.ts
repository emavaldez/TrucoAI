// Partida y mano: creación, reparto (3 vueltas desde el mano) y rotación del repartidor.
// Reparto y rotación viven acá; el RNG entra siempre por parámetro.

import { createDeck } from './cards.js';
import { createRng, nextInt, shuffle } from './rng.js';
import type {
  Card,
  EnvidoState,
  FlorState,
  GameEvent,
  HandState,
  MatchState,
  PlayerId,
  RuleSet,
  Rng,
  Seat,
  TeamId,
  TrucoState,
} from './types.js';

/** Nombres por defecto de los asientos (el asiento 0 es siempre el humano). */
const DEFAULT_NAMES: Record<2 | 4 | 6, string[]> = {
  2: ['Vos', 'Rival'],
  4: ['Vos', 'Rival 1', 'Compañero', 'Rival 2'],
  6: ['Vos', 'Rival 1', 'Compañero 1', 'Rival 2', 'Compañero 2', 'Rival 3'],
};

export interface CreateMatchOptions {
  /** `playerCount` es obligatorio; el resto de las reglas se completa con defaults. */
  rules: Partial<RuleSet> & Pick<RuleSet, 'playerCount'>;
  seed: number;
  names?: string[];
  firstDealerSeat?: number;
  /** Mazo fijo para tests: se usa tal cual, sin mezclar. */
  deck?: Card[];
}

/** Completa los defaults del ruleset: targetScore 30, flor false, pica-pica solo en 6. */
function completeRules(rules: Partial<RuleSet> & Pick<RuleSet, 'playerCount'>): RuleSet {
  return {
    playerCount: rules.playerCount,
    targetScore: rules.targetScore ?? 30,
    flor: rules.flor ?? false,
    picaPica: rules.picaPica ?? (rules.playerCount === 6),
  };
}

function createSeats(rules: RuleSet, names: string[] | undefined): Seat[] {
  const seats: Seat[] = [];
  for (let i = 0; i < rules.playerCount; i++) {
    seats.push({
      id: `p${i}`,
      seat: i,
      team: (i % 2) as TeamId,
      name: names?.[i] ?? DEFAULT_NAMES[rules.playerCount][i],
      isHuman: i === 0,
    });
  }
  return seats;
}

function emptyTruco(): TrucoState {
  return { level: 0, pending: null, quieroTeam: null };
}

function emptyEnvido(): EnvidoState {
  return { chain: [], pending: null, status: 'none', resumeTrucoAfter: false, result: null };
}

function emptyFlor(): FlorState {
  return { declared: [], pending: null, status: 'none', resumePhase: null, result: null };
}

interface BuildHandParams {
  number: number;
  seats: Seat[];
  dealerSeat: number;
  rng: Rng;
  /** Si viene, es el mazo de la mano (sin mezclar). */
  deck?: Card[];
}

/**
 * Reparte una mano y arma su `HandState`.
 * 3 vueltas, una carta por jugador por vuelta, empezando por el mano:
 * la carta `k` del mazo va al asiento `(manoSeat + k) % n`, para `k = 0..3n-1`.
 */
function buildHand(params: BuildHandParams): HandState {
  const seats = params.seats;
  const n = seats.length;
  const dealerId = seats[params.dealerSeat].id;
  const manoSeat = (params.dealerSeat + 1) % n;
  const manoId = seats[manoSeat].id;

  const deck = params.deck ?? shuffle(createDeck(), params.rng);

  const dealt: Record<PlayerId, Card[]> = {};
  const hands: Record<PlayerId, Card[]> = {};
  const participants: PlayerId[] = [];
  for (let i = 0; i < n; i++) {
    const id = seats[(manoSeat + i) % n].id;
    dealt[id] = [];
    hands[id] = [];
    participants.push(id);
  }

  for (let k = 0; k < 3 * n; k++) {
    const playerId = seats[(manoSeat + k) % n].id;
    const dealtCard: Card = { ...deck[k] };
    dealt[playerId].push(dealtCard);
    // copia independiente: jugar una carta no toca `dealt`
    hands[playerId].push({ ...dealtCard });
  }

  return {
    number: params.number,
    dealerId,
    manoId,
    dealt,
    hands,
    tricks: [],
    currentTrick: { leaderId: manoId, plays: [] },
    turnId: manoId,
    participants,
    truco: emptyTruco(),
    envido: emptyEnvido(),
    flor: emptyFlor(),
    picaPica: null,
    cantos: [],
    result: null,
  };
}

/** Posición (asiento) del repartidor actual, según el `dealerId` de la mano. */
function dealerSeatOf(state: MatchState): number {
  return state.seats.findIndex((seat) => seat.id === state.hand.dealerId);
}

/**
 * Crea una partida con la primera mano ya repartida (`phase: 'PLAYING'`).
 * Mismo `seed` ⇒ mismo repartidor y mismas manos.
 */
export function createMatch(opts: CreateMatchOptions): MatchState {
  const rules = completeRules(opts.rules);
  const seats = createSeats(rules, opts.names);
  const rng = createRng(opts.seed);
  const dealerSeat = opts.firstDealerSeat ?? nextInt(rng, seats.length);
  const hand = buildHand({ number: 1, seats, dealerSeat, rng, deck: opts.deck });

  return {
    version: 0,
    rules,
    seed: opts.seed,
    rngState: rng.getState(),
    seats,
    scores: [0, 0],
    phase: 'PLAYING',
    hand,
    picaPicaNext: false, // TODO(historia 1-7): condición de pica-pica en 6 jugadores
    history: [],
    winnerTeam: null,
  };
}

/**
 * Arranca la mano siguiente rotando el repartidor al asiento siguiente [ENG-06].
 * Solo se puede llamar en `HAND_OVER`; si no, tira `NOT_HAND_OVER`.
 */
export function startNextHand(state: MatchState, opts?: { deck?: Card[] }): { state: MatchState; events: GameEvent[] } {
  if (state.phase !== 'HAND_OVER') throw new Error('NOT_HAND_OVER');

  const next = structuredClone(state);
  const rng = createRng(next.rngState);
  const dealerSeat = (dealerSeatOf(next) + 1) % next.seats.length;
  next.hand = buildHand({
    number: next.hand.number + 1,
    seats: next.seats,
    dealerSeat,
    rng,
    deck: opts?.deck,
  });
  next.rngState = rng.getState();
  next.phase = 'PLAYING';

  const events: GameEvent[] = [
    {
      type: 'HAND_STARTED',
      hand: next.hand.number,
      dealerId: next.hand.dealerId,
      manoId: next.hand.manoId,
      // TODO(historia 1-7): pica-pica según la alternancia (`picaPicaNext`).
      picaPica: false,
    },
  ];

  return { state: next, events };
}
