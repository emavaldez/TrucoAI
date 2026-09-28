// Lo que puede querer decir un jugador cuando habla o escribe en la mesa (pedido de Emmanuel 2026-09-28).
// Una lista cerrada de intenciones: el intérprete (reglas y, opcionalmente, EmbeddingGemma) elige una,
// y el controlador decide qué hace en el juego. Todo lo que se dice es público (decisión de Emmanuel).

import type { CardNumber, Suit } from '../../engine/index.js';

export const INTENT_LABELS = [
  // cantos y respuestas (a la mesa)
  'CANTA_TRUCO', // truco, retruco o vale cuatro (el que toque)
  'QUIERO',
  'NO_QUIERO',
  'ENVIDO',
  'REAL_ENVIDO',
  'FALTA_ENVIDO',
  'MAZO',
  'JUGAR_CARTA',
  // indicaciones del pie a sus compañeros
  'IND_MATA',
  'IND_PASA',
  'IND_PARDA',
  'IND_TRANQUILO',
  'IND_CANTA_TRUCO',
  'IND_ESPERA',
  // preguntas al compañero
  'PREG_ENVIDO',
  'PREG_TRUCO',
  'PREG_QUE_HAGO',
  // afirmaciones sobre la propia mano
  'TENGO',
  'NO_TENGO',
  // cualquier otra cosa (chicanas, charla)
  'CHARLA',
] as const;

export type IntentLabel = (typeof INTENT_LABELS)[number];

/** Qué carta nombró: una carta concreta (número y palo, o solo número) o una por posición. */
export interface CardRef {
  number?: CardNumber;
  suit?: Suit;
  pick?: 'alta' | 'baja' | 'media';
}

export interface Understanding {
  label: IntentLabel;
  /** probabilidad (1 para las reglas; la del modelo para EmbeddingGemma) */
  prob: number;
  source: 'reglas' | 'modelo';
  card?: CardRef;
  /** de qué habla una afirmación ("tengo 30", "tengo el ancho", "no tengo nada") */
  about?: 'envido' | 'truco';
  /** tantos que dijo tener ("tengo 30") */
  score?: number;
  /** lo que se entendió, para mostrar ("entendí: truco") */
  text: string;
}

export const INTENT_TEXT: Record<IntentLabel, string> = {
  CANTA_TRUCO: 'cantar truco',
  QUIERO: 'quiero',
  NO_QUIERO: 'no quiero',
  ENVIDO: 'envido',
  REAL_ENVIDO: 'real envido',
  FALTA_ENVIDO: 'falta envido',
  MAZO: 'irse al mazo',
  JUGAR_CARTA: 'jugar una carta',
  IND_MATA: 'indicar «¡matá!»',
  IND_PASA: 'indicar «pasá»',
  IND_PARDA: 'indicar «pardá»',
  IND_TRANQUILO: 'indicar «jugá tranquilo»',
  IND_CANTA_TRUCO: 'indicar «cantá truco»',
  IND_ESPERA: 'indicar «esperá»',
  PREG_ENVIDO: 'preguntar por el envido',
  PREG_TRUCO: 'preguntar por el truco',
  PREG_QUE_HAGO: 'preguntar qué hacer',
  TENGO: 'decir que tenés',
  NO_TENGO: 'decir que no tenés',
  CHARLA: 'charla',
};
