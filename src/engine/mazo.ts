// Irse al mazo — historia 1-5 (GDD §8).
// Acá vive TODO el mazo: cuándo se puede uno ir y cuánto paga. `legal.ts` y `apply.ts`
// solo delegan. Nadie fuera de `scoring.ts` suma puntos ni cierra la mano: el mazo cierra
// la mano con `endHand` (razón 'MAZO') y deja que el puntaje lo reparta `addPoints`.
// Los tantos del envido/flor ya resueltos en la mano se cobran en el momento y no se tocan;
// no hay punto extra por irse en primera sin cantar envido [DECISIÓN 2026-09].

import { endHand } from './scoring.js';
import { rejectPendingTruco, trucoPoints } from './truco.js';
import { teamOf } from './turns.js';
import type { Action, GameEvent, MatchState, PlayerId, TeamId } from './types.js';

/** El otro equipo (solo hay dos). */
function rivalTeam(team: TeamId): TeamId {
  return team === 0 ? 1 : 0;
}

/**
 * ¿`playerId` puede irse al mazo ahora? (AC 1, GDD §8)
 * - en `PLAYING`, si es el actor (su turno);
 * - en `AWAITING_TRUCO`, si es el respondedor: se va al mazo en vez de contestar;
 * - **no** en `AWAITING_ENVIDO` ni `AWAITING_FLOR` (primero hay que responder el canto)
 *   [ENG-09], ni en `HAND_OVER` / `MATCH_OVER` (no hay mano que cerrar).
 */
export function canGoToMazo(state: MatchState, playerId: PlayerId): boolean {
  if (state.phase === 'PLAYING') return state.hand.turnId === playerId;
  if (state.phase !== 'AWAITING_TRUCO') return false;
  const pending = state.hand.truco.pending;
  return pending !== null && pending.responderId === playerId;
}

/** Acciones legales del mazo (AC 1): el `MAZO` o nada. */
export function mazoActions(state: MatchState, playerId: PlayerId): Action[] {
  return canGoToMazo(state, playerId) ? [{ type: 'MAZO' }] : [];
}

/**
 * Irse al mazo (AC 2, GDD §8): avisa (`MAZO` antes de `POINTS`), registra el canto en el
 * historial de la mano y la cierra con `endHand` (razón 'MAZO', así que el `HandRecord`
 * sale con el motivo del mazo).
 * - en `PLAYING`: el equipo rival suma el nivel **querido** vigente (1 si no hubo truco);
 * - respondiendo a un truco pendiente: equivale a **no quiero**, así que suma el equipo
 *   que lo cantó, con el valor **no querido** de ese nivel.
 */
export function applyMazo(state: MatchState, events: GameEvent[], playerId: PlayerId): void {
  const team = teamOf(state, playerId);
  events.push({ type: 'MAZO', playerId, team });
  state.hand.cantos.push({ kind: 'MAZO', by: playerId, team });

  if (state.phase === 'AWAITING_TRUCO') {
    const noQuerido = rejectPendingTruco(state);
    endHand(state, events, { winnerTeam: noQuerido.winnerTeam, points: noQuerido.points, reason: 'MAZO' });
    return;
  }

  endHand(state, events, { winnerTeam: rivalTeam(team), points: trucoPoints(state), reason: 'MAZO' });
}
