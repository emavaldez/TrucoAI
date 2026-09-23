// Resolución de bazas — historia 1-2.
// En esta historia (1-1) es solo un stub: marca el punto de extensión que
// `apply.ts` llama cuando todos los participantes de la baza ya jugaron.

import type { GameEvent, MatchState } from './types.js';

/**
 * Cierra la baza actual (ganador, parda, próxima mano de la baza, fin de mano).
 * TODO(historia 1-2): implementar `completeTrick` (bazas, parda, fin de mano).
 */
export function completeTrick(_state: MatchState, _events: GameEvent[]): void {
  throw new Error('NOT_IMPLEMENTED: historia 1-2');
}
