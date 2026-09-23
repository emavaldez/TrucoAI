// Única fuente de legalidad: quién decide ahora y qué puede hacer.
// La UI y la IA derivan todo de acá: no existe acción fuera de turno.

import type { Action, MatchState, PlayerId } from './types.js';

/**
 * Devuelve el `playerId` que debe decidir ahora, o `null` si ya no hay decisión.
 *
 * TODO(historias 1-3 / 1-4 / 1-8): en `AWAITING_TRUCO`, `AWAITING_ENVIDO` y
 * `AWAITING_FLOR` acá va el `responderId` del canto pendiente. En esta historia
 * esas fases todavía no se alcanzan, así que devuelven `null`.
 */
export function getActor(state: MatchState): PlayerId | null {
  switch (state.phase) {
    case 'PLAYING':
      return state.hand.turnId;
    case 'AWAITING_TRUCO':
    case 'AWAITING_ENVIDO':
    case 'AWAITING_FLOR':
    case 'HAND_OVER':
    case 'MATCH_OVER':
      return null;
  }
}

/**
 * Acciones legales de `playerId` en el estado actual.
 * Fuera de turno (o sin actor) devuelve `[]`.
 */
export function getLegalActions(state: MatchState, playerId: PlayerId): Action[] {
  const actor = getActor(state);
  if (actor === null || playerId !== actor) return [];
  // TODO(historias 1-3 / 1-4 / 1-8): cantos de truco/envido/flor y mazo.
  return state.hand.hands[playerId].map((card): Action => ({ type: 'PLAY_CARD', cardId: card.id }));
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
