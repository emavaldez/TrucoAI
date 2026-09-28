// Lo que puede querer decir un jugador cuando habla o escribe en la mesa (pedido de Emmanuel 2026-09-28).
// Una lista cerrada de intenciones: el intérprete (reglas y, opcionalmente, EmbeddingGemma) elige una,
// y el controlador decide qué hace en el juego. Todo lo que se dice es público (decisión de Emmanuel).

import type { CardNumber, Suit } from '../../engine/index.js';

export const INTENT_LABELS = [
  // cantos y respuestas (a la mesa). Decir la palabra es cantar: «tenés para el truco?» ya es cantar truco.
  'CANTA_TRUCO', // truco, retruco o vale cuatro (el que toque)
  'QUIERO',
  'NO_QUIERO',
  'ENVIDO',
  'REAL_ENVIDO',
  'FALTA_ENVIDO',
  'MAZO',
  'JUGAR_CARTA',
  // indicaciones y consejos al equipo (sin nombrar el canto: «cantá», «jugá callado», «cantá el tanto»)
  'IND_MATA',
  'IND_PASA',
  'IND_PARDA',
  'IND_TRANQUILO',
  'IND_CANTA_TRUCO', // «cantá»
  'IND_ESPERA', // «jugá callado»
  'IND_CANTA_TANTO', // «cantá el tanto»
  'IND_CALLADO_TANTO', // «callado el tanto»
  'SUBILE', // «subile», «subí»: responder subiendo
  // preguntas al equipo
  'PREG_TANTO', // «¿tenés tanto?», «¿cuánto tenés?»
  'PREG_CARTAS', // «¿tenés algo?», «¿cómo venís?»
  'PREG_CANTO', // «¿canto?», «¿cantamos?» (el truco)
  'PREG_CANTO_TANTO', // «¿canto tanto?»
  'PREG_QUE_HAGO', // «¿qué hago?», «¿qué hacemos?»
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
  /** de qué habla una afirmación ("tengo 30" es tanto; "tengo el ancho", "no tengo nada" son cartas) */
  about?: 'tanto' | 'cartas';
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
  IND_MATA: 'decir «¡matá!»',
  IND_PASA: 'decir «pasá»',
  IND_PARDA: 'decir «pardá»',
  IND_TRANQUILO: 'decir «jugá tranquilo»',
  IND_CANTA_TRUCO: 'decir «cantá»',
  IND_ESPERA: 'decir «jugá callado»',
  IND_CANTA_TANTO: 'decir «cantá el tanto»',
  IND_CALLADO_TANTO: 'decir «callado el tanto»',
  SUBILE: 'decir «subile»',
  PREG_TANTO: 'preguntar por el tanto',
  PREG_CARTAS: 'preguntar cómo viene',
  PREG_CANTO: 'preguntar si cantás',
  PREG_CANTO_TANTO: 'preguntar si cantás el tanto',
  PREG_QUE_HAGO: 'preguntar qué hacer',
  TENGO: 'decir que tenés',
  NO_TENGO: 'decir que no tenés',
  CHARLA: 'charla',
};
