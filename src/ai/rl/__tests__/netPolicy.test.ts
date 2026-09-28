// Nivel "Experta": la red entrenada (public/models) jugando en el juego, con los mismos pesos que se
// publican. Partidas enteras sin acciones ilegales, el pie de la red indica, el modo consejo y el
// respaldo con la heurística cuando la red no sabe (flor, pica-pica).

import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMatch, createRng, getActor, getObservation, pieOf } from '../../../engine/index.js';
import type { Policy } from '../../policy.js';
import { createPolicy } from '../../policy.js';
import { FAST_TIMING, GameController, HUMAN_ID, type MatchSettings } from '../../../app/GameController.js';
import { createManualScheduler } from '../../../app/scheduler.js';
import { mlpFromBuffers, type MlpMeta } from '../mlp.js';
import { NetPolicy, netAdvice, netFor, setNetModels } from '../netPolicy.js';

function load(name: string) {
  const meta = JSON.parse(readFileSync(`public/models/${name}.json`, 'utf8')) as MlpMeta;
  const raw = readFileSync(`public/models/${name}.bin`);
  return mlpFromBuffers(meta, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer);
}

beforeAll(() => {
  setNetModels({ two: load('red-2'), teams: load('red-equipos') });
});

/** El humano también juega con la red: la partida corre sola hasta el final. */
function playOut(settings: MatchSettings, seed: number) {
  const scheduler = createManualScheduler();
  const humanPolicy: Policy = createPolicy('expert');
  const controller = new GameController({ settings, seed, scheduler, timing: FAST_TIMING, autoAck: true, humanPolicy });
  const warnings: unknown[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  let instructionsSeen = 0;
  try {
    controller.start();
    let guard = 0;
    while (controller.getState().phase !== 'MATCH_OVER' && guard++ < 20000) {
      instructionsSeen += controller.snapshot().instructions.length;
      if (!scheduler.runNext()) break;
    }
  } finally {
    console.warn = original;
  }
  return { state: controller.getState(), warnings, instructionsSeen };
}

describe('nivel Experta (la red en el juego)', () => {
  it('las redes publicadas son las entrenadas: r2 para 2 jugadores, r3 (con indicaciones) para 4 y 6', () => {
    const two = netFor(getObservation(createMatch({ rules: { playerCount: 2, flor: false }, seed: 1 }), 'p0'));
    const four = netFor(getObservation(createMatch({ rules: { playerCount: 4, flor: false }, seed: 1 }), 'p0'));
    expect(two?.meta.tag).toBe('r2/iter2000');
    expect(four?.meta.tag).toBe('r3/iter560');
    expect(four?.meta.nActions).toBe(19);
  });

  for (const playerCount of [2, 4, 6] as const) {
    it(`${playerCount} jugadores: partida entera sin acciones ilegales`, () => {
      const { state, warnings, instructionsSeen } = playOut({ playerCount, difficulty: 'expert', flor: false, picaPica: false }, 11);
      expect(state.phase).toBe('MATCH_OVER');
      expect(warnings).toEqual([]);
      if (playerCount > 2) expect(instructionsSeen).toBeGreaterThan(0);
    }, 60_000);
  }

  it('con flor juega la difícil de respaldo (la red no la aprendió), sin romperse', () => {
    const { state, warnings } = playOut({ playerCount: 4, difficulty: 'expert', flor: true, picaPica: false }, 5);
    expect(state.phase).toBe('MATCH_OVER');
    expect(warnings).toEqual([]);
    const obs = getObservation(createMatch({ rules: { playerCount: 4, flor: true }, seed: 1 }), 'p0');
    expect(netFor(obs)).toBeNull();
  }, 60_000);

  it('el pie de la red indica con la red (y sus compañeros también son la red)', () => {
    const scheduler = createManualScheduler();
    const controller = new GameController({
      settings: { playerCount: 4, difficulty: 'expert', flor: false, picaPica: false },
      seed: 21,
      scheduler,
      timing: FAST_TIMING,
    });
    controller.start();
    const state = controller.getState();
    const rivalsPie = pieOf(state, 1);
    const given = controller.snapshot().instructions;
    // El humano solo ve las de su equipo; las del rival no se muestran, pero el pie rival indicó.
    expect(given.every((instruction) => instruction.from !== rivalsPie)).toBe(true);
    const internal = (controller as unknown as { talk: { instructions: { from: string }[] } }).talk;
    expect(internal.instructions.some((instruction) => instruction.from === rivalsPie)).toBe(true);
  });

  it('modo consejo: acciones legales con probabilidades que suman 1, solo en el turno del humano', () => {
    const obs = getObservation(createMatch({ rules: { playerCount: 2, flor: false }, seed: 4 }), 'p0');
    const advice = netAdvice(obs);
    if (obs.legalActions.length > 0) {
      expect(advice.length).toBe(obs.legalActions.length);
      expect(advice.reduce((sum, a) => sum + a.prob, 0)).toBeCloseTo(1, 6);
      expect(advice[0].prob).toBeGreaterThanOrEqual(advice[advice.length - 1].prob);
    }
    const scheduler = createManualScheduler();
    const controller = new GameController({
      settings: { playerCount: 2, difficulty: 'expert', flor: false, picaPica: false },
      seed: 4,
      scheduler,
      timing: FAST_TIMING,
    });
    controller.start();
    let guard = 0;
    while (getActor(controller.getState()) !== HUMAN_ID && guard++ < 50) scheduler.runNext();
    expect(controller.humanAdvice().length).toBeGreaterThan(0);
  });

  it('la red decide igual que en el entrenamiento: misma observación y semilla, misma acción', () => {
    const policy = new NetPolicy(createPolicy('hard'));
    const obs = getObservation(createMatch({ rules: { playerCount: 4, flor: false }, seed: 9 }), getActor(createMatch({ rules: { playerCount: 4, flor: false }, seed: 9 })) as string);
    const a = policy.decide(obs, createRng(1));
    const b = policy.decide(obs, createRng(1));
    expect(a).toEqual(b);
  });
});
