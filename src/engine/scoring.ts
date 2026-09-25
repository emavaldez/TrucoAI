// Puntaje y cierre de mano — el ÚNICO lugar del motor que suma puntos y cierra manos.
// Todos los caminos (bazas, truco no querido, mazo, envido, flor y pica-pica en las
// historias siguientes) terminan acá: nadie más escribe `scores`, `hand.result`,
// `history` ni la fase de fin de mano.

import { envidoCantoPoints } from './envido.js';
import { florCantoPoints, resolveSingleTeamFlor } from './flor.js';
import { allHandTricks, startSubmano } from './picapica.js';
import { trucoCantoPoints, trucoPoints } from './truco.js';
import { teamOf } from './turns.js';
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
    // Ya completado (una submano anterior de pica-pica): no se pisa con el ganador de otra.
    if (canto.points !== undefined) continue;
    const payout =
      trucoCantoPoints(canto, handWinnerTeam) ?? envidoCantoPoints(state, canto) ?? florCantoPoints(state, canto);
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
    tricks: allHandTricks(state.hand),
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

/** ¿La partida terminó? (función aparte: la fase cambia dentro de `addPoints`). */
function isMatchOver(state: MatchState): boolean {
  return state.phase === 'MATCH_OVER';
}

/**
 * Cierra la mano: puntos (vía `addPoints`), `hand.result`, `HandRecord` en el
 * historial y `HAND_OVER`. Si la mano terminó la partida, la fase queda en
 * `MATCH_OVER` y el único aviso es `MATCH_OVER`: no hay fin de mano que mostrar.
 */
export function endHand(state: MatchState, events: GameEvent[], opts: EndHandOptions): void {
  const points = opts.points ?? trucoPoints(state);

  // Una flor declarada por un solo equipo se cobra aunque la mano termine antes de la 1ª baza.
  resolveSingleTeamFlor(state, events);
  if (isMatchOver(state)) return;

  if (state.hand.picaPica !== null) {
    endSubmano(state, events, { ...opts, points });
    return;
  }

  // `hand.result` se escribe ANTES de sumar: `addPoints` usa ese campo para saber que la
  // mano ya la cerró `endHand` (y no agregar un `HandRecord` `MATCH_ENDED` de más).
  state.hand.result = { winnerTeam: opts.winnerTeam, points, reason: opts.reason };
  addPoints(state, events, opts.winnerTeam, points, POINTS_REASON[opts.reason]);
  pushRecord(state, { winnerTeam: opts.winnerTeam, points, reason: opts.reason });

  if (isMatchOver(state)) return;
  state.phase = 'HAND_OVER';
  events.push({ type: 'HAND_OVER', winnerTeam: opts.winnerTeam, points, reason: opts.reason });
}

/**
 * Cierre de una submano de pica-pica (historia 1-7, GDD §10): sus puntos van al equipo
 * ganador **en el momento**; si quedan submanos, arranca la siguiente dentro de la misma
 * acción (siempre hay actor [AI-04, UI-02]); si era la última, cierra la mano.
 * Un "no quiero" o un mazo terminan **solo esa submano** [ENG-14].
 */
function endSubmano(state: MatchState, events: GameEvent[], opts: Required<EndHandOptions>): void {
  const hand = state.hand;
  const pica = hand.picaPica;
  if (pica === null) throw new Error('NOT_PICA_PICA');

  completeCantos(state, opts.winnerTeam);
  pica.results.push({
    pair: pica.pairs[pica.submano],
    winnerTeam: opts.winnerTeam,
    points: opts.points,
    reason: opts.reason,
    tricks: hand.tricks.slice(),
    openPlays: hand.currentTrick.plays.length < hand.participants.length ? hand.currentTrick.plays.slice() : [],
  });
  addPoints(state, events, opts.winnerTeam, opts.points, POINTS_REASON[opts.reason]);
  if (state.phase === 'MATCH_OVER') return;

  if (pica.submano < 2) {
    startSubmano(state, events, (pica.submano + 1) as 1 | 2);
    return;
  }

  // Fin de la mano: gana el equipo que sumó más en toda la mano — submanos, envidos y flores —
  // (empate → equipo del mano). Lo sumado es la diferencia del marcador desde el comienzo de la mano.
  const before = pica.startScores;
  const byTeam: [number, number] = [state.scores[0] - before[0], state.scores[1] - before[1]];
  const manoTeam = teamOf(state, hand.manoId);
  const winnerTeam: TeamId = byTeam[0] === byTeam[1] ? manoTeam : byTeam[0] > byTeam[1] ? 0 : 1;
  const total = byTeam[0] + byTeam[1];
  hand.result = { winnerTeam, points: total, reason: 'PICA_PICA' };
  pushRecord(state, { winnerTeam, points: total, reason: 'PICA_PICA' });
  state.phase = 'HAND_OVER';
  events.push({ type: 'HAND_OVER', winnerTeam, points: total, reason: 'PICA_PICA' });
}
