// Truco — reglas de los cantos (historia 1-3).
// Acá vive TODO el truco: la tabla de puntos (única [ENG-20]), la legalidad de
// cantar y responder, y las transiciones de `truco.pending` / `truco.level` /
// `truco.quieroTeam` / `phase`. `legal.ts` y `apply.ts` solo delegan.
// Nadie fuera de `scoring.ts` suma puntos ni cierra la mano: el "no quiero" llama a `endHand`.

import { endHand } from './scoring.js';
import { responderFor, teamOf } from './turns.js';
import type { Action, CantoRecord, GameEvent, MatchState, PlayerId, TeamId } from './types.js';

/**
 * Tabla ÚNICA de puntos del truco (GDD §5) [ENG-20]: el índice es el nivel
 * (0 sin canto, 1 truco, 2 retruco, 3 vale cuatro).
 * `accepted` = querido (lo que paga `endHand` por bazas) · `rejected` = no querido.
 */
export const TRUCO_POINTS = {
  accepted: [1, 2, 3, 4],
  rejected: [0, 1, 2, 3],
} as const;

/** Canto que corresponde a cada nivel cantado (1..3). */
const CANTO_KIND: Record<1 | 2 | 3, 'TRUCO' | 'RETRUCO' | 'VALE4'> = {
  1: 'TRUCO',
  2: 'RETRUCO',
  3: 'VALE4',
};

/** Nivel de cada canto de truco: la inversa de `CANTO_KIND`, para el historial (AC 5). */
const LEVEL_OF_CANTO: Record<'TRUCO' | 'RETRUCO' | 'VALE4', 1 | 2 | 3> = {
  TRUCO: 1,
  RETRUCO: 2,
  VALE4: 3,
};

/** Puntos que vale la mano por el truco querido vigente (1 si nadie cantó truco). */
export function trucoPoints(state: MatchState): number {
  return TRUCO_POINTS.accepted[state.hand.truco.level];
}

/**
 * ¿`playerId` puede cantar o subir el truco en su turno de `PLAYING`? (AC 1)
 * Hace falta que sea el actor, que no haya un canto pendiente, que no se haya llegado
 * al vale cuatro y, si ya hay un nivel querido, que el actor sea del equipo que tiene
 * el quiero: **nadie sube su propio canto** (AC 9).
 */
export function canCallTruco(state: MatchState, playerId: PlayerId): boolean {
  if (state.phase !== 'PLAYING' || state.hand.turnId !== playerId) return false;
  const truco = state.hand.truco;
  if (truco.pending !== null) return false;
  if (truco.level >= 3) return false;
  return truco.level === 0 || truco.quieroTeam === teamOf(state, playerId);
}

/**
 * Acciones legales del respondedor en `AWAITING_TRUCO` (AC 3): quiero, no quiero y
 * subir un escalón (si se puede). Nunca `PLAY_CARD` [ENG-02]: con un canto pendiente
 * no se juega ninguna carta.
 */
export function trucoResponseActions(state: MatchState, playerId: PlayerId): Action[] {
  const pending = state.hand.truco.pending;
  if (pending === null || pending.responderId !== playerId) return [];

  const actions: Action[] = [
    { type: 'ANSWER_TRUCO', answer: 'QUIERO' },
    { type: 'ANSWER_TRUCO', answer: 'NO_QUIERO' },
  ];
  if (pending.level < 3) actions.push({ type: 'CALL_TRUCO' });
  return actions;
}

/** Completa el último canto de truco de la mano con su respuesta (AC 4, 5 y 6). */
function answerLastTrucoCanto(cantos: readonly CantoRecord[], answer: 'QUIERO' | 'NO_QUIERO'): void {
  for (let index = cantos.length - 1; index >= 0; index--) {
    const canto = cantos[index];
    if (canto.kind === 'TRUCO' || canto.kind === 'RETRUCO' || canto.kind === 'VALE4') {
      canto.answer = answer;
      return;
    }
  }
}

/**
 * Canta el escalón siguiente (AC 1) o lo sube como respuesta — "quiero retruco" (AC 5).
 * Si venía un canto pendiente, primero acepta ese nivel y después canta el siguiente:
 * el nuevo `pending` queda a cargo del respondedor de `responderFor` y la fase sigue
 * en `AWAITING_TRUCO` hasta que el rival conteste.
 */
export function applyCallTruco(state: MatchState, events: GameEvent[], playerId: PlayerId): void {
  const truco = state.hand.truco;
  const pending = truco.pending;
  const team = teamOf(state, playerId);

  if (pending !== null) {
    answerLastTrucoCanto(state.hand.cantos, 'QUIERO');
    truco.level = pending.level;
    truco.quieroTeam = team;
    events.push({ type: 'TRUCO_ANSWERED', playerId, answer: 'QUIERO' });
  }

  const level = ((pending === null ? truco.level : pending.level) + 1) as 1 | 2 | 3;
  truco.pending = { level, callerId: playerId, callerTeam: team, responderId: responderFor(state, playerId) };
  state.phase = 'AWAITING_TRUCO';
  events.push({ type: 'TRUCO_CALLED', playerId, level });
  state.hand.cantos.push({ kind: CANTO_KIND[level], by: playerId, team });
}

/**
 * Respuesta al canto pendiente (AC 4 y 6).
 * - `QUIERO`: el nivel pendiente queda querido por el equipo del respondedor, la mano
 *   vuelve a `PLAYING` y sigue jugando el mismo de antes (no cambia `hand.turnId`).
 * - `NO_QUIERO`: la mano termina **en el acto** y el que cantó suma el valor no querido
 *   [ENG-03]; no se juega ninguna carta más.
 */
export function applyAnswerTruco(
  state: MatchState,
  events: GameEvent[],
  playerId: PlayerId,
  answer: 'QUIERO' | 'NO_QUIERO',
): void {
  const truco = state.hand.truco;
  const pending = truco.pending;
  if (pending === null) throw new Error('NO_PENDING_TRUCO');

  events.push({ type: 'TRUCO_ANSWERED', playerId, answer });

  if (answer === 'QUIERO') {
    answerLastTrucoCanto(state.hand.cantos, 'QUIERO');
    truco.level = pending.level;
    truco.quieroTeam = teamOf(state, playerId);
    truco.pending = null;
    state.phase = 'PLAYING';
    return;
  }

  const rejected = rejectPendingTruco(state);
  endHand(state, events, { winnerTeam: rejected.winnerTeam, reason: 'NO_QUIERO', points: rejected.points });
}

/**
 * Da por **no querido** el truco pendiente sin responderlo (AC 2, GDD §8): lo usa el mazo,
 * que vale lo mismo que un "no quiero". Marca el canto como `NO_QUIERO`, deja el canto sin
 * pendiente — `phase === 'AWAITING_TRUCO' ⇔ pending !== null` [ENG-18] — y devuelve quién
 * cobra y cuánto. La mano la cierra quien llama, con `endHand`.
 */
export function rejectPendingTruco(state: MatchState): { winnerTeam: TeamId; points: number } {
  const truco = state.hand.truco;
  const pending = truco.pending;
  if (pending === null) throw new Error('NO_PENDING_TRUCO');

  answerLastTrucoCanto(state.hand.cantos, 'NO_QUIERO');
  truco.pending = null;
  return { winnerTeam: pending.callerTeam, points: TRUCO_POINTS.rejected[pending.level] };
}

/** ¿Es un canto de truco? */
function isTrucoCanto(kind: CantoRecord['kind']): kind is 'TRUCO' | 'RETRUCO' | 'VALE4' {
  return kind === 'TRUCO' || kind === 'RETRUCO' || kind === 'VALE4';
}

/**
 * Puntos de un canto de truco ya respondido y a quién van (AC 5, GDD §9), para el historial:
 * - querido: el valor del nivel lo cobra quien gane la mano (`handWinnerTeam`, porque el
 *   truco querido se paga con la mano);
 * - no querido: el valor no querido lo cobra el equipo que lo cantó.
 * `null` si no es un canto de truco o todavía no tiene respuesta.
 */
export function trucoCantoPoints(
  canto: CantoRecord,
  handWinnerTeam: TeamId,
): { points: number; pointsTo: TeamId } | null {
  if (!isTrucoCanto(canto.kind) || canto.answer === undefined) return null;
  const level = LEVEL_OF_CANTO[canto.kind];
  if (canto.answer === 'QUIERO') return { points: TRUCO_POINTS.accepted[level], pointsTo: handWinnerTeam };
  if (canto.answer === 'NO_QUIERO') return { points: TRUCO_POINTS.rejected[level], pointsTo: canto.team };
  return null;
}
