// Mesa en equipo en el juego: el pie consulta el tanto, el que contesta pregunta qué hacer, y desde la 2da
// baza cualquiera indica (mesa abierta).

import { describe, expect, it } from 'vitest';
import { getActor } from '../../engine/index.js';
import { FAST_TIMING, GameController, HUMAN_ID, type MatchSettings } from '../GameController.js';
import { createManualScheduler, type ManualScheduler } from '../scheduler.js';

const SETTINGS: MatchSettings = { playerCount: 4, difficulty: 'normal', flor: false, picaPica: false };

function make(seed: number, consultWait = 5000, settings: Partial<MatchSettings> = {}) {
  const scheduler = createManualScheduler();
  const controller = new GameController({ settings: { ...SETTINGS, ...settings }, seed, scheduler, timing: { ...FAST_TIMING, consultWait } });
  controller.start();
  return { controller, scheduler };
}

/** Avanza (jugando la carta más a la izquierda cuando le toca al humano) hasta que `until` dé true. */
function advance(controller: GameController, scheduler: ManualScheduler, until: () => boolean, limit = 200): boolean {
  for (let i = 0; i < limit; i++) {
    if (until()) return true;
    if (getActor(controller.getState()) === HUMAN_ID) {
      const card = controller.humanLegalActions().find((action) => action.type === 'PLAY_CARD');
      if (!card) return false;
      controller.dispatchHuman(card);
    } else if (!scheduler.runNext()) return false;
  }
  return until();
}

/** Una partida en la que el pie de la IA de tu equipo te consulta el tanto. */
function withTantoConsult() {
  for (let seed = 1; seed < 200; seed++) {
    const made = make(seed);
    if (made.controller.humanIsPie()) continue;
    if (
      advance(made.controller, made.scheduler, () => made.controller.snapshot().consult !== null || made.controller.getState().hand.tricks.length > 0)
    ) {
      if (made.controller.snapshot().consult?.kind === 'tanto') return made;
    }
  }
  throw new Error('no encontré semilla');
}

describe('consultas del equipo', () => {
  it('el pie de la IA pregunta «¿Canto tanto?» en voz alta, con respuestas rápidas', () => {
    const { controller } = withTantoConsult();
    const snap = controller.snapshot();
    expect(snap.consult).toMatchObject({ askerId: 'p2', kind: 'tanto', question: '¿Canto tanto?' });
    expect(snap.consult?.options).toContain('Cantá el tanto');
    expect(snap.speech.some((line) => line.playerId === 'p2' && line.text === '¿Canto tanto?')).toBe(true);
  });

  it('«Cantá el tanto» → el pie canta envido enseguida', () => {
    const { controller, scheduler } = withTantoConsult();
    expect(controller.humanSays('Cantá el tanto').ok).toBe(true);
    expect(controller.snapshot().consult).toBeNull();
    scheduler.runNext();
    const chain = controller.getState().hand.envido.chain;
    expect(chain[0]).toMatchObject({ by: 'p2', call: 'E' });
  });

  it('«Jugá callado» → el pie no canta el tanto', () => {
    const { controller, scheduler } = withTantoConsult();
    controller.humanSays('Jugá callado');
    scheduler.runNext();
    expect(controller.getState().hand.envido.chain.every((call) => call.by !== 'p2')).toBe(true);
  });

  it('si no contestás, el pie decide solo cuando se cumple el tiempo', () => {
    const { controller, scheduler } = withTantoConsult();
    const version = controller.getState().version;
    scheduler.runNext();
    expect(controller.getState().version).toBeGreaterThan(version);
    expect(controller.snapshot().consult).toBeNull();
  });

  it('con tiempos rápidos (consultWait 0) la partida no se traba', () => {
    for (let seed = 1; seed < 6; seed++) {
      const { controller, scheduler } = make(seed, 0);
      expect(advance(controller, scheduler, () => controller.getState().phase === 'HAND_OVER', 400)).toBe(true);
    }
  });

  it('cuando sos el pie en la 1ra baza te sugiere preguntar «¿Canto tanto?»', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { controller, scheduler } = make(seed);
      if (!controller.humanIsPie()) continue;
      advance(controller, scheduler, () => getActor(controller.getState()) === HUMAN_ID);
      if (controller.getState().phase !== 'PLAYING' || !controller.humanLegalActions().some((action) => action.type === 'CALL_ENVIDO')) continue;
      expect(controller.snapshot().suggestions).toEqual(['¿Canto tanto?', '¿Tienen algo?']);
      expect(controller.humanSays('¿Canto tanto?').ok).toBe(true);
      expect(controller.snapshot().speech.at(-1)?.playerId).toBe('p2');
      return;
    }
    throw new Error('no encontré semilla');
  });
});

describe('mesa abierta', () => {
  it('desde la 2da baza el humano que no es pie puede indicar, y el pie de la IA no se lo pisa', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { controller, scheduler } = make(seed, 0);
      if (controller.humanIsPie()) continue;
      expect(controller.humanInstructionOptions()).toEqual([]);
      expect(controller.humanSays('matá').note).toMatch(/pie/);
      if (!advance(controller, scheduler, () => controller.getState().hand.tricks.length >= 1 || controller.getState().phase === 'HAND_OVER'))
        continue;
      if (controller.getState().phase !== 'PLAYING') continue;
      expect(controller.humanInstructionOptions()).toContain('MATA');
      expect(controller.humanSays('pasá').ok).toBe(true);
      expect(controller.snapshot().instructions).toContainEqual({ from: HUMAN_ID, kind: 'PASA' });
      return;
    }
    throw new Error('no encontré semilla');
  });

  it('en 2 jugadores no hay consultas ni mesa abierta', () => {
    const scheduler = createManualScheduler();
    const controller = new GameController({ settings: { ...SETTINGS, playerCount: 2 }, seed: 4, scheduler, timing: FAST_TIMING });
    controller.start();
    expect(controller.getState().rules.openTable).toBeUndefined();
    expect(controller.snapshot().consult).toBeNull();
    expect(controller.snapshot().suggestions).toEqual([]);
  });
});

describe('más charla de equipo (pedido de Emmanuel 2026-09-28)', () => {
  it('te cantan truco en la 1ra baza: el pie que contesta ofrece «El envido está primero» y lo canta', () => {
    for (let seed = 1; seed < 600; seed++) {
      const { controller, scheduler } = make(seed, 5000, { difficulty: 'hard' });
      if (controller.humanIsPie()) continue;
      const found = advance(
        controller,
        scheduler,
        () => controller.snapshot().consult?.options.includes('El envido está primero') === true || controller.getState().hand.tricks.length > 0,
      );
      const consult = controller.snapshot().consult;
      if (!found || !consult?.options.includes('El envido está primero')) continue;
      expect(consult).toMatchObject({ kind: 'respuesta', question: '¿Qué hacemos?' });
      expect(controller.humanSays('El envido está primero').ok).toBe(true);
      scheduler.runNext();
      expect(controller.getState().hand.envido.chain.at(-1)).toMatchObject({ by: consult.askerId, call: 'E' });
      return;
    }
    throw new Error('no encontré semilla');
  });

  it('si sos el pie, tu compañero te pregunta qué juega antes de tirar, y sigue lo que le decís', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { controller, scheduler } = make(seed);
      if (!controller.humanIsPie()) continue;
      advance(controller, scheduler, () => controller.snapshot().consult !== null || controller.getState().hand.tricks.length > 0);
      const consult = controller.snapshot().consult;
      if (consult?.kind !== 'jugada') continue;
      expect(['¿Qué juego?', '¿Qué tiro?', '¿Qué hago?']).toContain(consult.question);
      expect(consult.options).toEqual(['¡Matá!', 'Pasá', 'Pardá', 'Jugá tranquilo']);
      const before = controller.getState().hand.currentTrick.plays.length;
      expect(controller.humanSays('Pasá').ok).toBe(true);
      expect(controller.snapshot().instructions).toContainEqual({ from: HUMAN_ID, kind: 'PASA' });
      scheduler.runNext();
      expect(controller.getState().hand.currentTrick.plays.length).toBe(before + 1);
      return;
    }
    throw new Error('no encontré semilla');
  });

  it('si ya le indicaste en esta baza, no te pregunta', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { controller, scheduler } = make(seed);
      if (!controller.humanIsPie()) continue;
      controller.sendHumanInstruction('MATA');
      advance(controller, scheduler, () => controller.snapshot().consult !== null || controller.getState().hand.tricks.length > 0);
      expect(controller.snapshot().consult?.kind).not.toBe('jugada');
      return;
    }
  });

  it('en la 1ra baza, el compañero que no es pie le pregunta al pie de la IA y el pie contesta (6 jugadores)', () => {
    for (let seed = 1; seed < 200; seed++) {
      const { controller, scheduler } = make(seed, 5000, { playerCount: 6, picaPica: false });
      if (controller.humanIsPie()) continue;
      advance(controller, scheduler, () =>
        controller.snapshot().speech.some((line) => ['¿Qué juego?', '¿Qué tiro?', '¿Qué hago?'].includes(line.text) && line.playerId !== HUMAN_ID),
      );
      const speech = controller.snapshot().speech;
      const i = speech.findIndex((line) => ['¿Qué juego?', '¿Qué tiro?', '¿Qué hago?'].includes(line.text) && line.playerId !== HUMAN_ID);
      if (i < 0) continue;
      const pie = ['p2', 'p4'].find((id) => controller.getState().hand.participants.includes(id) && id !== speech[i].playerId);
      expect(speech[i + 1]?.playerId).toBe(pie);
      return;
    }
    throw new Error('no encontré semilla');
  });

  it('si escribís durante una consulta, te espera (hasta 3 veces)', () => {
    const { controller } = withTantoConsult();
    const first = controller.snapshot().consult?.id;
    expect(controller.holdConsult()).toBe(true);
    expect(controller.snapshot().consult?.id).not.toBe(first);
    expect(controller.holdConsult()).toBe(true);
    expect(controller.holdConsult()).toBe(true);
    expect(controller.holdConsult()).toBe(false);
  });
});
