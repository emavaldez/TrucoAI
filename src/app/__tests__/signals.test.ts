// Señas en el controlador: quién las hace, quién las ve, cuándo se pueden hacer.

import { describe, expect, it } from 'vitest';
import type { Action, Observation, Rng } from '../../engine/index.js';
import { getActor } from '../../engine/index.js';
import type { Policy } from '../../ai/policy.js';
import type { Signal } from '../../ai/signs.js';
import { FAST_TIMING, GameController, HUMAN_ID, type MatchSettings } from '../GameController.js';
import { createManualScheduler } from '../scheduler.js';

const SETTINGS: MatchSettings = { playerCount: 4, difficulty: 'normal', flor: false, picaPica: true };

function make(settings: Partial<MatchSettings> = {}, seed = 3) {
  const scheduler = createManualScheduler();
  const controller = new GameController({ settings: { ...SETTINGS, ...settings }, seed, scheduler, timing: FAST_TIMING });
  return { controller, scheduler };
}

describe('señas en el controlador', () => {
  it('con 4 jugadores tus compañeros te hacen señas al empezar la mano; nunca ves las de los rivales', () => {
    const { controller } = make();
    controller.start();
    const signals = controller.snapshot().signals;
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.from === 'p2')).toBe(true);
  });

  it('con 2 jugadores no hay señas', () => {
    const { controller } = make({ playerCount: 2 });
    controller.start();
    expect(controller.snapshot().signals).toEqual([]);
    expect(controller.humanSignalOptions()).toEqual([]);
  });

  it('en pica-pica no hay señas', () => {
    // Pica-pica arranca con 6 jugadores cuando un equipo pasa de 5 (con la regla activa); se fuerza el estado.
    const { controller } = make({ playerCount: 6 });
    controller.start();
    const state = controller.getState();
    expect(controller.snapshot().signals.every((signal) => ['p0', 'p2', 'p4'].includes(signal.from))).toBe(true);
    (state.hand as { picaPica: unknown }).picaPica = { submano: 0, pairs: [], results: [], startScores: [0, 0] };
    expect(controller.signalsAllowed()).toBe(false);
    expect(controller.humanSignalOptions()).toEqual([]);
  });

  it('el humano hace señas verdaderas, una vez cada una, y solo antes de jugar su primera carta', () => {
    const { controller, scheduler } = make({}, 11);
    controller.start();
    const options = controller.humanSignalOptions();
    expect(options.length).toBeGreaterThan(0);
    const kind = options[0];
    let notified = 0;
    controller.subscribe(() => (notified += 1));
    const version = controller.getState().version;
    expect(controller.sendHumanSignal(kind)).toBe(true);
    expect(notified).toBe(1);
    expect(controller.getState().version).toBe(version); // no es una acción del motor
    expect(controller.snapshot().events).toEqual([]);
    expect(controller.snapshot().signals.some((signal) => signal.from === HUMAN_ID && signal.kind === kind)).toBe(true);
    expect(controller.sendHumanSignal(kind)).toBe(false);
    expect(controller.humanSignalOptions()).not.toContain(kind);
    // Seña que no corresponde a sus cartas: rechazada.
    const all = ['ANCHO_ESPADA', 'ANCHO_BASTO', 'SIETE_ESPADA', 'SIETE_ORO', 'TRES', 'DOS', 'ANCHO_FALSO', 'NADA', 'FLOR', 'ENVIDO'] as const;
    const invalid = all.find((k) => !options.includes(k));
    if (invalid) expect(controller.sendHumanSignal(invalid)).toBe(false);

    // Jugar hasta que el humano tire su primera carta: después ya no hay señas.
    let guard = 0;
    while (controller.getState().hand.hands[HUMAN_ID].length === 3 && guard++ < 100) {
      const state = controller.getState();
      if (getActor(state) === HUMAN_ID) {
        const legal = controller.humanLegalActions();
        const play = legal.find((a) => a.type === 'PLAY_CARD') ?? legal[0];
        controller.dispatchHuman(play);
      } else if (!scheduler.runNext()) break;
    }
    if (controller.getState().phase !== 'HAND_OVER') expect(controller.humanSignalOptions()).toEqual([]);
  });

  it('cada IA recibe solo las señas de sus compañeros', () => {
    const seen = new Map<string, Signal[]>();
    const spy = (id: string): Policy => ({
      decide(obs: Observation, _rng: Rng, signals?: readonly Signal[]): Action {
        seen.set(id, [...(signals ?? [])]);
        return obs.legalActions.find((a) => a.type === 'PLAY_CARD') ?? obs.legalActions[0];
      },
    });
    const scheduler = createManualScheduler();
    const controller = new GameController({
      settings: SETTINGS,
      seed: 21,
      scheduler,
      timing: FAST_TIMING,
      humanPolicy: spy('p0'),
    });
    // Se reemplazan las políticas de la IA por espías.
    const policies = (controller as unknown as { policies: Map<string, Policy> }).policies;
    for (const id of ['p1', 'p2', 'p3']) policies.set(id, spy(id));
    controller.start();
    let guard = 0;
    while (seen.size < 4 && guard++ < 50 && controller.getState().phase !== 'HAND_OVER') scheduler.runNext();
    const team: Record<string, number> = { p0: 0, p1: 1, p2: 0, p3: 1 };
    for (const [id, signals] of seen) {
      for (const signal of signals) {
        expect(signal.from).not.toBe(id);
        expect(team[signal.from]).toBe(team[id]);
      }
    }
    expect(seen.get('p0')?.every((signal) => signal.from === 'p2')).toBe(true);
    expect((seen.get('p0') ?? []).length).toBeGreaterThan(0);
  });

  it('las señas se renuevan en cada mano', () => {
    const { controller, scheduler } = make({}, 5);
    controller.start();
    const first = controller.snapshot().signals;
    let guard = 0;
    while (controller.getState().phase !== 'HAND_OVER' && guard++ < 200) {
      if (getActor(controller.getState()) === HUMAN_ID) controller.dispatchHuman(controller.humanLegalActions()[0]);
      else if (!scheduler.runNext()) break;
    }
    controller.continueAfterHand();
    const second = controller.snapshot().signals;
    expect(second.length).toBeGreaterThan(0);
    expect(second.every((signal) => signal.from !== HUMAN_ID)).toBe(true);
    expect(first).not.toBe(second);
  });
});
