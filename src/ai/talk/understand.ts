// Entender lo que dijo el humano: primero las reglas (instantáneas); si no entienden y el modelo está
// activo, EmbeddingGemma. Si el modelo no está seguro, no se actúa: se le pregunta si quiso decir eso.

import type { Understanding } from './intents.js';
import { parseRules } from './parse.js';
import { semanticReady, semanticUnderstand } from './semantic.js';

/** Por debajo de esta probabilidad el modelo no actúa: pregunta. */
export const MODEL_MIN_PROB = 0.5;

export interface Interpretation {
  /** lo que se va a hacer (null = no se entendió) */
  understood: Understanding | null;
  /** lo que el modelo creyó, si no llegó a la probabilidad mínima */
  guess?: Understanding;
}

export async function interpret(text: string, useModel: boolean): Promise<Interpretation> {
  const rules = parseRules(text);
  if (rules || !useModel || !semanticReady()) return { understood: rules };
  const model = await semanticUnderstand(text);
  if (!model) return { understood: null };
  return model.prob >= MODEL_MIN_PROB ? { understood: model } : { understood: null, guess: model };
}
