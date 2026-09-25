// Espacio de acciones fijo para la red (sin flor: el entrenamiento es siempre sin flor).
// Las cartas se eligen por posición en la mano ordenada de mayor a menor (`sortedHand`).

import type { Action, Observation } from '../../src/engine/index.js';
import { sortedHand } from './cards.js';

export const ACTION_NAMES = [
  'PLAY_0',
  'PLAY_1',
  'PLAY_2',
  'TRUCO',
  'TRUCO_QUIERO',
  'TRUCO_NO_QUIERO',
  'ENVIDO',
  'REAL_ENVIDO',
  'FALTA_ENVIDO',
  'ENVIDO_QUIERO',
  'ENVIDO_NO_QUIERO',
  'MAZO',
] as const;

export const N_ACTIONS = ACTION_NAMES.length;

/** Índice de una acción del motor, o -1 si no tiene lugar (flor). */
export function actionIndex(action: Action, obs: Observation): number {
  switch (action.type) {
    case 'PLAY_CARD': {
      const slot = sortedHand(obs.myHand).findIndex((card) => card.id === action.cardId);
      return slot;
    }
    case 'CALL_TRUCO':
      return 3;
    case 'ANSWER_TRUCO':
      return action.answer === 'QUIERO' ? 4 : 5;
    case 'CALL_ENVIDO':
      return action.call === 'E' ? 6 : action.call === 'R' ? 7 : 8;
    case 'ANSWER_ENVIDO':
      return action.answer === 'QUIERO' ? 9 : 10;
    case 'MAZO':
      return 11;
    default:
      return -1;
  }
}

/** Máscara de acciones legales (1 = legal) y la acción del motor de cada índice. */
export function legalMask(obs: Observation): { mask: Uint8Array; actions: (Action | null)[] } {
  const mask = new Uint8Array(N_ACTIONS);
  const actions: (Action | null)[] = new Array(N_ACTIONS).fill(null);
  for (const action of obs.legalActions) {
    const index = actionIndex(action, obs);
    if (index < 0) throw new Error(`acción sin lugar en la red (¿flor?): ${action.type}`);
    mask[index] = 1;
    actions[index] = action;
  }
  return { mask, actions };
}
