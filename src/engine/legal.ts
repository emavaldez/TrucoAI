// Única fuente de legalidad: quién decide ahora y qué puede hacer.
// La UI y la IA derivan todo de acá: no existe acción fuera de turno.

import { canCallEnvido, envidoFirstCalls, envidoResponseActions, openingEnvidoCalls } from './envido.js';
import { canCallTruco, trucoResponseActions } from './truco.js';
import type { Action, MatchState, PlayerId } from './types.js';

/**
 * Devuelve el `playerId` que debe decidir ahora, o `null` si ya no hay decisión.
 *
 * En `AWAITING_TRUCO` decide el respondedor del canto pendiente (AC 3). En
 * `AWAITING_ENVIDO` decide el respondedor del canto de envido pendiente (1-4). En
 * `AWAITING_FLOR` todavía devuelve `null`: la historia 1-8 la implementa.
 */
export function getActor(state: MatchState): PlayerId | null {
  switch (state.phase) {
    case 'PLAYING':
      return state.hand.turnId;
    case 'AWAITING_TRUCO':
      return state.hand.truco.pending === null ? null : state.hand.truco.pending.responderId;
    case 'AWAITING_ENVIDO':
      return state.hand.envido.pending === null ? null : state.hand.envido.pending.responderId;
    case 'AWAITING_FLOR':
    case 'HAND_OVER':
    case 'MATCH_OVER':
      return null;
  }
}

/**
 * Acciones legales de `playerId` en el estado actual.
 * Fuera de turno (o sin actor) devuelve `[]`.
 * Orden en `PLAYING`: primero el canto de truco, después los cantos de envido (E, R, F)
 * y por último un `PLAY_CARD` por carta de la mano, en orden.
 */
export function getLegalActions(state: MatchState, playerId: PlayerId): Action[] {
  const actor = getActor(state);
  if (actor === null || playerId !== actor) return [];

  switch (state.phase) {
    case 'AWAITING_TRUCO':
      // Nunca PLAY_CARD con un canto pendiente [ENG-02]; el respondedor puede, además,
      // cantar envido si todavía tiene derecho ("el envido está primero", AC 3) [UI-05].
      return [...trucoResponseActions(state, playerId), ...envidoFirstCalls(state, playerId)];
    case 'AWAITING_ENVIDO':
      // Nunca PLAY_CARD ni CALL_TRUCO con el envido pendiente [ENG-02].
      return envidoResponseActions(state, playerId);
    case 'PLAYING': {
      const actions: Action[] = [];
      if (canCallTruco(state, playerId)) actions.push({ type: 'CALL_TRUCO' });
      if (canCallEnvido(state, playerId)) actions.push(...openingEnvidoCalls());
      // TODO(historias 1-5 / 1-8): flor y mazo.
      for (const card of state.hand.hands[playerId]) actions.push({ type: 'PLAY_CARD', cardId: card.id });
      return actions;
    }
    default:
      // AWAITING_FLOR (1-8), HAND_OVER y MATCH_OVER: sin acciones.
      return [];
  }
}

/** Igualdad estructural de acciones: mismo `type` y mismos campos. */
export function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  const own = (action: Action): Record<string, unknown> =>
    Object.fromEntries(Object.entries(action).filter(([key]) => key !== 'type'));
  const fieldsA = own(a);
  const fieldsB = own(b);
  const keysA = Object.keys(fieldsA);
  const keysB = Object.keys(fieldsB);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => fieldsA[key] === fieldsB[key]);
}
