// Puntaje y cierre de mano — el ÚNICO lugar del motor que suma puntos y cierra manos.
// Todos los caminos (bazas, truco no querido, mazo, envido, flor y pica-pica en las
// historias siguientes) terminan acá: nadie más escribe `scores`, `hand.result`,
// `history` ni la fase de fin de mano.

import { envidoCantoPoints } from './envido.js';
import { trucoCantoPoints, trucoPoints } from './truco.js';
import type { GameEvent, HandRecord, MatchState, TeamId } from './types.js';

/** Razón del evento `POINTS` (la tabla de `types.ts`). */
export type PointsReason = 'ENVIDO' | 'FLOR' | 'TRUCO' | 'MANO' | 'NO_QUIERO' | 'MAZO';

/**
 * Motivos de cierre de mano que conoce esta historia.
 * `PICA_PICA` lo agrega la 1-7 (cierre de submanos).
 */
export type HandEndReason = 'BAZAS' | 'NO_QUIERO' | 'MAZO';

/**
 * Motivo del `HandRecord` cuando la partida termina **en medio** de una mano (AC 5) [UI-16]:
 * la mano cortada igual queda en el historial, con `points: 0`.
 */
export const MATCH_ENDED = 'MATCH_ENDED';

/** Motivo de cierre de mano → razón del evento `POINTS` (GDD §9). */
const POINTS_REASON: Record<HandEndReason, PointsReason> = {
  BAZAS: 'MANO',
  NO_QUIERO: 'NO_QUIERO',
  MAZO: 'MAZO',
};

export interface EndHandOptions {
  winnerTeam: TeamId;
  reason: HandEndReason;
  /** Si no viene, sale de `trucoPoints(state)` (GDD §5). */
  points?: number;
}

/**
 * Completa `points` y `pointsTo` de los cantos de la mano antes de guardarlos en el
 * `HandRecord` (AC 5, GDD §9): el historial dice qué se cantó, si se quiso y cuántos puntos
 * cobró qué equipo. Los cantos sin respuesta y los de mazo quedan como están. Las tablas de
 * cada canto viven en su módulo (`truco.ts`, `envido.ts`); acá solo se escriben en el record.
 */
function completeCantos(state: MatchState, handWinnerTeam: TeamId): void {
  for (const canto of state.hand.cantos) {
    const payout = trucoCantoPoints(canto, handWinnerTeam) ?? envidoCantoPoints(state, canto);
    if (payout === null) continue;
    canto.points = payout.points;
    canto.pointsTo = payout.pointsTo;
  }
}

/** Agrega la mano jugada al historial con el marcador ya actualizado [ENG-15]. */
function pushRecord(
  state: MatchState,
  opts: { winnerTeam: TeamId; points: number; reason: string },
): void {
  completeCantos(state, opts.winnerTeam);
  const record: HandRecord = {
    number: state.hand.number,
    dealerId: state.hand.dealerId,
    manoId: state.hand.manoId,
    picaPica: state.hand.picaPica !== null,
    tricks: state.hand.tricks.slice(),
    cantos: state.hand.cantos.slice(),
    winnerTeam: opts.winnerTeam,
    points: opts.points,
    reason: opts.reason,
    scoresAfter: [state.scores[0], state.scores[1]],
  };
  state.history.push(record);
}

/**
 * Suma los puntos al equipo y avisa (`POINTS`).
 * Si el equipo llega al objetivo o más, la partida termina en el acto [ENG-01]:
 * marcador con tope, `phase = 'MATCH_OVER'`, `winnerTeam`, un único evento `MATCH_OVER`,
 * y de ahí en adelante no hay actor ni acción legal.
 * Si la partida terminó **en medio** de una mano (el envido llegó a 30 antes de que la mano
 * se cerrara), la mano cortada igual queda en el historial con `reason: 'MATCH_ENDED'` y
 * `points: 0` (AC 5) [UI-16]; una mano que ya cerró `endHand` no se duplica.
 */
export function addPoints(
  state: MatchState,
  events: GameEvent[],
  team: TeamId,
  points: number,
  reason: PointsReason,
): void {
  state.scores[team] += points;
  events.push({ type: 'POINTS', team, points, reason });

  if (state.scores[team] >= state.rules.targetScore) {
    state.scores[team] = state.rules.targetScore; // tope: el marcador se muestra a 30
    state.phase = 'MATCH_OVER';
    state.winnerTeam = team;
    // `hand.result` lo escribe `endHand` antes de sumar: si está en null, la mano quedó a
    // medio jugar y hay que dejarla en el historial [UI-16].
    if (state.hand.result === null) {
      pushRecord(state, { winnerTeam: team, points: 0, reason: MATCH_ENDED });
    }
    events.push({ type: 'MATCH_OVER', winnerTeam: team, scores: [state.scores[0], state.scores[1]] });
  }
}

/**
 * Cierra la mano: puntos (vía `addPoints`), `hand.result`, `HandRecord` en el
 * historial y `HAND_OVER`. Si la mano terminó la partida, la fase queda en
 * `MATCH_OVER` y el único aviso es `MATCH_OVER`: no hay fin de mano que mostrar.
 */
export function endHand(state: MatchState, events: GameEvent[], opts: EndHandOptions): void {
  const points = opts.points ?? trucoPoints(state);

  // `hand.result` se escribe ANTES de sumar: `addPoints` usa ese campo para saber que la
  // mano ya la cerró `endHand` (y no agregar un `HandRecord` `MATCH_ENDED` de más).
  state.hand.result = { winnerTeam: opts.winnerTeam, points, reason: opts.reason };
  addPoints(state, events, opts.winnerTeam, points, POINTS_REASON[opts.reason]);
  pushRecord(state, { winnerTeam: opts.winnerTeam, points, reason: opts.reason });

  if (state.phase === 'MATCH_OVER') return;
  state.phase = 'HAND_OVER';
  events.push({ type: 'HAND_OVER', winnerTeam: opts.winnerTeam, points, reason: opts.reason });
}
