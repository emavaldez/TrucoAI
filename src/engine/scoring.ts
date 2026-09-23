// Puntaje y cierre de mano — el ÚNICO lugar del motor que suma puntos y cierra manos.
// Todos los caminos (bazas, truco no querido, mazo, envido, flor y pica-pica en las
// historias siguientes) terminan acá: nadie más escribe `scores`, `hand.result`,
// `history` ni la fase de fin de mano.

import { trucoPoints } from './truco.js';
import type { GameEvent, HandRecord, MatchState, TeamId } from './types.js';

/** Razón del evento `POINTS` (la tabla de `types.ts`). */
export type PointsReason = 'ENVIDO' | 'FLOR' | 'TRUCO' | 'MANO' | 'NO_QUIERO' | 'MAZO';

/**
 * Motivos de cierre de mano que conoce esta historia.
 * `PICA_PICA` lo agrega la 1-7 (cierre de submanos) y `MATCH_ENDED` la 1-5.
 */
export type HandEndReason = 'BAZAS' | 'NO_QUIERO' | 'MAZO';

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
 * Suma los puntos al equipo y avisa (`POINTS`).
 * Si el equipo llega al objetivo o más, la partida termina en el acto [ENG-01]:
 * marcador con tope, `phase = 'MATCH_OVER'`, `winnerTeam`, evento `MATCH_OVER`,
 * y a partir de ahí no hay actor ni acción legal.
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

  addPoints(state, events, opts.winnerTeam, points, POINTS_REASON[opts.reason]);

  state.hand.result = { winnerTeam: opts.winnerTeam, points, reason: opts.reason };
  const record: HandRecord = {
    number: state.hand.number,
    dealerId: state.hand.dealerId,
    manoId: state.hand.manoId,
    picaPica: state.hand.picaPica !== null,
    tricks: state.hand.tricks.slice(),
    cantos: state.hand.cantos.slice(),
    winnerTeam: opts.winnerTeam,
    points,
    reason: opts.reason,
    scoresAfter: [state.scores[0], state.scores[1]],
  };
  state.history.push(record);

  if (state.phase === 'MATCH_OVER') return;
  state.phase = 'HAND_OVER';
  events.push({ type: 'HAND_OVER', winnerTeam: opts.winnerTeam, points, reason: opts.reason });
}
