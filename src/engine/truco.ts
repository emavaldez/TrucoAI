// Truco — reglas de cantos de la historia 1-3.
// Acá solo vive el puntaje de la mano según el nivel querido: es el valor que
// `scoring.ts` usa para cerrar una mano sin truco (1) o con truco querido (2/3/4).

import type { MatchState } from './types.js';

/**
 * Puntos de la mano según el nivel QUERIDO (índice = `truco.level`), GDD §5:
 * sin canto 1, truco 2, retruco 3, vale cuatro 4.
 */
const ACCEPTED_POINTS: readonly number[] = [1, 2, 3, 4];

/** Puntos que vale la mano por el truco querido vigente (1 si nadie cantó truco). */
export function trucoPoints(state: MatchState): number {
  return ACCEPTED_POINTS[state.hand.truco.level];
}
