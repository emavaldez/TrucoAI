/**
 * Bot jugador para los tests de partidas completas (historia 0-2, AC 3).
 *
 * RNG propio (mulberry32) con semilla: nunca `Math.random`, así cada test es
 * reproducible y el `seed` del título significa algo.
 *
 * Prioridad por paso: ack → next-hand → answer → call (10%) → play.
 *
 * Política de envido (ciclo 1 de la auditoría de la 0-2): el bot **nunca** canta
 * Falta Envido — vale lo que le falta al que va perdiendo, así que una sola mano
 * puede cerrar la partida y el test deja de ejercitar el juego (era la causa de
 * las partidas de 4p seed 1 y 6p seed 1 que terminaban en 9 y 12 pasos con 30-0).
 * Ante una Falta Envido pendiente responde **no quiero**: nunca la juega.
 */

import type { DriverAction } from './driver/types';

export type AnswerKind = 'quiero' | 'no-quiero' | 'subir' | 'son-buenas';

/** Pesos de AC 3: quiero 60 / no-quiero 25 / subir 10 / son-buenas 5. */
export const ANSWER_WEIGHTS: Record<AnswerKind, number> = {
  quiero: 60,
  'no-quiero': 25,
  subir: 10,
  'son-buenas': 5,
};

/** Probabilidad de cantar (envido/real envido/truco/mazo) en un paso. */
export const CALL_PROBABILITY = 0.1;

/** PRNG determinista de 32 bits: mismo `seed` → misma secuencia. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ¿El panel de respuesta visible es el del envido? El legacy solo ofrece "Son
 * buenas" en el panel de envido (el de truco tiene Quiero / No quiero / Subir):
 * es la única señal del DOM que distingue los dos paneles.
 */
export function isEnvidoPanel(answers: Array<{ answer: AnswerKind }>): boolean {
  return answers.some((answer) => answer.answer === 'son-buenas');
}

export class Bot {
  private readonly rnd: () => number;

  /**
   * El bot ya subió el envido en esta mano. El legacy no expone el nivel del
   * envido pendiente en el DOM, pero después de un Real Envido del humano el
   * único escalón que le queda a la IA es Falta Envido (`src/App.ts`), así que
   * si el panel de envido vuelve a aparecer lo pendiente es una Falta Envido.
   */
  private envidoRaised = false;

  constructor(seed: number) {
    this.rnd = mulberry32(seed);
  }

  /** Próxima acción, o `null` si no hay nada que hacer (esperando a la IA). */
  next(actions: DriverAction[]): DriverAction | null {
    const ack = actions.find((a) => a.kind === 'ack');
    if (ack) return ack;

    const nextHand = actions.find((a) => a.kind === 'next-hand');
    if (nextHand) {
      // El envido se canta una vez por mano: la mano siguiente arranca limpia.
      this.envidoRaised = false;
      return nextHand;
    }

    const answers = actions.filter((a): a is Extract<DriverAction, { kind: 'answer' }> => a.kind === 'answer');
    if (answers.length > 0) return this.answer(answers);

    // Falta Envido: nunca se canta (puede terminar la partida en una sola mano).
    const calls = actions.filter(
      (a): a is Extract<DriverAction, { kind: 'call' }> => a.kind === 'call' && a.call !== 'falta-envido',
    );
    if (calls.length > 0 && this.rnd() < CALL_PROBABILITY) {
      return calls[Math.floor(this.rnd() * calls.length)];
    }

    const plays = actions.filter((a): a is Extract<DriverAction, { kind: 'play' }> => a.kind === 'play');
    if (plays.length > 0) return plays[Math.floor(this.rnd() * plays.length)];

    return null;
  }

  /** Respuesta del panel (envido o truco) con los pesos de AC 3. */
  private answer(answers: Array<Extract<DriverAction, { kind: 'answer' }>>): DriverAction {
    const envidoPanel = isEnvidoPanel(answers);

    if (envidoPanel && this.envidoRaised) {
      // Falta Envido pendiente: no quiero (vale lo que le falta al que va perdiendo).
      this.envidoRaised = false;
      const refuse = answers.find((a) => a.answer === 'no-quiero');
      if (refuse) return refuse;
    }

    const chosen = answers[this.pickWeightedAnswer(answers.map((a) => a.answer))];
    if (envidoPanel) this.envidoRaised = chosen.answer === 'subir';
    return chosen;
  }

  /** Ruleta entre las respuestas visibles, con los pesos de AC 3. */
  private pickWeightedAnswer(available: AnswerKind[]): number {
    const total = available.reduce((sum, answer) => sum + ANSWER_WEIGHTS[answer], 0);
    let roll = this.rnd() * total;
    for (let i = 0; i < available.length; i++) {
      roll -= ANSWER_WEIGHTS[available[i]];
      if (roll < 0) return i;
    }
    return available.length - 1;
  }
}
