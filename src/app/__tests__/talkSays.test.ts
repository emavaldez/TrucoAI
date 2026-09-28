// Lo que dice el humano en cada situación (humanSays): consultas, preguntas, afirmaciones y avisos.

import { describe, expect, it } from 'vitest';
import { getActor } from '../../engine/index.js';
import { FAST_TIMING, GameController, HUMAN_ID, type Consult, type MatchSettings } from '../GameController.js';
import { createManualScheduler, type ManualScheduler } from '../scheduler.js';

const SETTINGS: MatchSettings = { playerCount: 4, difficulty: 'hard', flor: false, picaPica: false };

function make(seed: number, settings: Partial<MatchSettings> = {}, consultWait = 5000) {
  const scheduler = createManualScheduler();
  const controller = new GameController({ settings: { ...SETTINGS, ...settings }, seed, scheduler, timing: { ...FAST_TIMING, consultWait } });
  controller.start();
  return { controller, scheduler };
}

function advance(controller: GameController, scheduler: ManualScheduler, until: () => boolean, limit = 300): boolean {
  for (let i = 0; i < limit; i++) {
    if (until()) return true;
    const state = controller.getState();
    if (state.phase === 'HAND_OVER' || state.phase === 'MATCH_OVER') return false;
    if (getActor(state) === HUMAN_ID) {
      const legal = controller.humanLegalActions();
      const action =
        legal.find((a) => a.type === 'PLAY_CARD') ?? legal.find((a) => a.type === 'ANSWER_TRUCO' || a.type === 'ANSWER_ENVIDO') ?? legal[0];
      if (!action) return false;
      controller.dispatchHuman(action);
    } else if (!scheduler.runNext()) return false;
  }
  return until();
}

/** Una partida parada en una consulta que cumpla `match`. */
function atConsult(match: (consult: Consult, controller: GameController) => boolean, settings: Partial<MatchSettings> = {}) {
  for (let seed = 1; seed < 800; seed++) {
    const made = make(seed, settings);
    const found = advance(made.controller, made.scheduler, () => {
      const consult = made.controller.snapshot().consult;
      return consult !== null && match(consult, made.controller);
    });
    if (found) return made;
  }
  throw new Error('no encontré semilla');
}

const last = (controller: GameController) => controller.snapshot().speech.at(-1);

describe('en 2 jugadores no hay equipo', () => {
  it('las preguntas las contesta el rival; indicar no vale', () => {
    const { controller } = make(4, { playerCount: 2 });
    for (const text of ['¿tenés tanto?', '¿qué hago?', '¿canto?', '¿tenés algo?']) {
      expect(controller.humanSays(text).ok).toBe(true);
      expect(last(controller)?.playerId).toBe('p1');
    }
    expect(controller.humanSays('matá').note).toMatch(/equipo/);
    expect(controller.humanSays('').ok).toBe(false);
  });

  it('mazo, cartas que no tenés y cantos fuera de turno avisan', () => {
    const { controller, scheduler } = make(4, { playerCount: 2 });
    advance(controller, scheduler, () => getActor(controller.getState()) === HUMAN_ID);
    const hand = controller.getState().hand.hands[HUMAN_ID];
    const missing = ['4-copa', '5-oro', '6-basto', '7-copa'].find((id) => !hand.some((c) => c.id === id)) as string;
    const [number, suit] = missing.split('-');
    expect(controller.humanSays(`tiro el ${number} de ${suit}`).note).toMatch(/No tenés esa carta/);
    expect(controller.humanSays('quiero').note).toMatch(/cantó nada/);
    expect(controller.humanSays('me voy al mazo').ok).toBe(true);
    expect(controller.humanSays('real envido').note).toMatch(/cantarlo/);
    expect(controller.humanSays('subile').note).toMatch(/nada para subir/);
    expect(controller.humanSays('tiro el ancho').ok).toBe(false);
  });
});

describe('en equipo', () => {
  it('si no sos el pie, el envido lo canta el pie; el consejo del tanto se le da al pie', () => {
    for (let seed = 1; seed < 100; seed++) {
      const { controller, scheduler } = make(seed, {}, 0);
      if (controller.humanIsPie()) continue;
      advance(controller, scheduler, () => getActor(controller.getState()) === HUMAN_ID);
      if (controller.getState().hand.tricks.length > 0 || controller.getState().phase !== 'PLAYING') continue;
      expect(controller.humanSays('envido').note).toMatch(/lo canta el pie/);
      expect(controller.humanSays('cantá el tanto').ok).toBe(true);
      expect(controller.humanSays('callado el tanto').ok).toBe(true);
      expect(controller.snapshot().suggestions).toEqual(['¿Qué juego?']);
      expect(controller.humanSays('¿qué juego?').ok).toBe(true);
      expect(last(controller)?.playerId).toBe('p2');
      expect(controller.humanSays('¿canto?').ok).toBe(true);
      expect(last(controller)?.text).toMatch(/Cantá|callado/);
      expect(controller.humanSays('tengo el ancho de espada').ok).toBe(true);
      expect(controller.humanSays('no tengo nada').ok).toBe(true);
      expect(controller.humanSays('mentiroso').ok).toBe(true);
      return;
    }
    throw new Error('no encontré semilla');
  });

  it('si sos el pie: el tanto lo decidís vos, y a «¿qué hago?» te dicen que decidas vos', () => {
    for (let seed = 1; seed < 100; seed++) {
      const { controller } = make(seed, {}, 0);
      if (!controller.humanIsPie()) continue;
      expect(controller.humanSays('cantá el tanto').note).toMatch(/sos vos/);
      expect(controller.humanSays('¿qué hago?').ok).toBe(true);
      expect(last(controller)?.text).toMatch(/Vos sos el pie/);
      expect(controller.humanSays('tengo 30').ok).toBe(true);
      expect(controller.holdConsult()).toBe(false);
      return;
    }
    throw new Error('no encontré semilla');
  });

  it('en tu turno más adelante te sugiere coordinar con el equipo', () => {
    for (let seed = 1; seed < 100; seed++) {
      const { controller, scheduler } = make(seed, {}, 0);
      if (controller.humanIsPie()) continue;
      const ok = advance(
        controller,
        scheduler,
        () =>
          controller.getState().hand.tricks.length >= 1 && getActor(controller.getState()) === HUMAN_ID && controller.getState().phase === 'PLAYING',
      );
      if (!ok) continue;
      expect(controller.snapshot().suggestions).toEqual(['¿Qué hago?', '¿Qué te queda?']);
      expect(controller.humanSays('¿qué te queda?').ok).toBe(true);
      return;
    }
    throw new Error('no encontré semilla');
  });
});

describe('contestar consultas', () => {
  const tanto = (consult: Consult) => consult.kind === 'tanto';
  it.each([
    ['Tengo tanto', 'E'],
    ['envido', 'E'],
    ['cantá', 'E'],
    ['No tengo nada', null],
    ['callado el tanto', null],
  ])('«%s» al «¿Canto tanto?»', (text, call) => {
    const { controller, scheduler } = atConsult(tanto);
    const asker = controller.snapshot().consult?.askerId;
    expect(controller.humanSays(text).ok).toBe(true);
    expect(last(controller)).toMatchObject({ playerId: asker, text: 'Dale.' });
    scheduler.runNext();
    const byAsker = controller.getState().hand.envido.chain.find((c) => c.by === asker);
    if (call) expect(byAsker?.call).toBe(call);
    else expect(byAsker).toBeUndefined();
  });

  const trucoResp = (consult: Consult, c: GameController) => consult.kind === 'respuesta' && c.getState().phase === 'AWAITING_TRUCO';
  it.each([
    ['Quiero', 'QUIERO'],
    ['No quiero', 'NO_QUIERO'],
    ['Subile', 'RAISE'],
    ['quiero retruco', 'RAISE'],
  ])('«%s» al «¿Qué hacemos?» de un truco', (text, expected) => {
    const { controller, scheduler } = atConsult(trucoResp);
    const asker = controller.snapshot().consult?.askerId as string;
    const level = controller.getState().hand.truco.level;
    expect(controller.humanSays('¿qué hacemos?').ok).toBe(true);
    expect(controller.humanSays(text).ok).toBe(true);
    scheduler.runNext();
    const truco = controller.getState().hand.truco;
    if (expected === 'NO_QUIERO') expect(controller.getState().phase).toMatch(/HAND_OVER|MATCH_OVER/);
    else if (expected === 'QUIERO') expect(truco.level).toBeGreaterThan(level);
    else expect(truco.pending?.callerId === asker || truco.level > level).toBe(true);
  });

  const envidoResp = (consult: Consult, c: GameController) => consult.kind === 'respuesta' && c.getState().phase === 'AWAITING_ENVIDO';
  it.each(['Quiero', 'No quiero', 'Subile', 'falta envido'])('«%s» al «¿Qué hacemos?» de un envido', (text) => {
    const { controller, scheduler } = atConsult(envidoResp);
    const chain = controller.getState().hand.envido.chain.length;
    expect(controller.humanSays(text).ok).toBe(true);
    scheduler.runNext();
    const envido = controller.getState().hand.envido;
    if (text === 'Quiero' || text === 'No quiero') expect(envido.pending).toBeNull();
    else expect(envido.chain.length).toBeGreaterThan(chain);
  });
});
