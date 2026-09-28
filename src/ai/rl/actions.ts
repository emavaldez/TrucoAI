// Espacio de acciones fijo para la red (sin flor: el entrenamiento es siempre sin flor).
// Las cartas se eligen por posición en la mano ordenada de mayor a menor (`sortedHand`).
// 0–11: acciones del motor. 12–18: indicaciones del pie a sus compañeros (4 y 6 jugadores), que no son
// acciones del motor: el pie las decide al empezar la mano (cartas y truco) y después de cada baza
// (cartas). Las redes viejas (12 salidas) siguen sirviendo para 2 jugadores.

import type { Action, Observation } from '../../engine/index.js';
import type { Instruction } from '../signs.js';
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
  'INDICA_MATA',
  'INDICA_PASA',
  'INDICA_PARDA',
  'INDICA_TRANQUILO',
  'INDICA_CANTA_TRUCO',
  'INDICA_ESPERA',
  'INDICA_NADA_TRUCO',
] as const;

export const N_ACTIONS = ACTION_NAMES.length;
/** Acciones del motor (las redes de 2 jugadores tienen solo estas salidas). */
export const N_ENGINE_ACTIONS = 12;

/** Indicación de cartas de cada índice (12–15). */
export const CARD_INSTRUCTIONS: Instruction[] = ['MATA', 'PASA', 'PARDA', 'TRANQUILO'];
/** Indicación de truco de cada índice (16–18); `null` = no indica nada de truco. */
export const TRUCO_INSTRUCTIONS: (Instruction | null)[] = ['CANTA_TRUCO', 'ESPERA', null];
export const FIRST_CARD_INSTRUCTION = 12;
export const FIRST_TRUCO_INSTRUCTION = 16;

export type InstructionDecision = 'cartas' | 'truco';

/** Máscara de una decisión de indicación del pie: solo las indicaciones de ese grupo. */
export function instructionMask(kind: InstructionDecision): Uint8Array {
  const mask = new Uint8Array(N_ACTIONS);
  const [from, count] = kind === 'cartas' ? [FIRST_CARD_INSTRUCTION, CARD_INSTRUCTIONS.length] : [FIRST_TRUCO_INSTRUCTION, TRUCO_INSTRUCTIONS.length];
  for (let i = 0; i < count; i++) mask[from + i] = 1;
  return mask;
}

/** Índice de lo que indicó la heurística en una decisión de ese grupo (para imitarla). */
export function instructionIndex(kind: InstructionDecision, given: readonly Instruction[]): number {
  if (kind === 'cartas') {
    const found = CARD_INSTRUCTIONS.findIndex((instruction) => given.includes(instruction));
    return FIRST_CARD_INSTRUCTION + (found < 0 ? CARD_INSTRUCTIONS.indexOf('TRANQUILO') : found);
  }
  const found = TRUCO_INSTRUCTIONS.findIndex((instruction) => instruction !== null && given.includes(instruction));
  return FIRST_TRUCO_INSTRUCTION + (found < 0 ? TRUCO_INSTRUCTIONS.length - 1 : found);
}

/** La indicación que corresponde a un índice 12–18 (`null` para "nada de truco"). */
export function instructionOf(index: number): Instruction | null {
  if (index >= FIRST_CARD_INSTRUCTION && index < FIRST_CARD_INSTRUCTION + CARD_INSTRUCTIONS.length) return CARD_INSTRUCTIONS[index - FIRST_CARD_INSTRUCTION];
  if (index >= FIRST_TRUCO_INSTRUCTION && index < FIRST_TRUCO_INSTRUCTION + TRUCO_INSTRUCTIONS.length) return TRUCO_INSTRUCTIONS[index - FIRST_TRUCO_INSTRUCTION];
  throw new Error(`no es una indicación: ${index}`);
}

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
