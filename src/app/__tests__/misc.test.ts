// urlConfig, scheduler real y caminos del controlador (pausa, autoAck, flor automática, IA rota).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Policy } from '../../ai/policy.js';
import { createDeck, getActor } from '../../engine/index.js';
import { FAST_TIMING, GameController, HUMAN_ID, type MatchSettings } from '../GameController.js';
import { createManualScheduler, createTimerScheduler } from '../scheduler.js';
import { parseUrlConfig } from '../urlConfig.js';

const SETTINGS: MatchSettings = { playerCount: 2, difficulty: 'normal', flor: false, picaPica: true };

describe('parseUrlConfig', () => {
  it('lee los parámetros de prueba y de arranque', () => {
    const config = parseUrlConfig('?seed=12&fast=1&aiDelay=300&autoAck=true&test=1&autostart=1&players=6&difficulty=hard&flor=1&picaPica=0');
    expect(config).toEqual({
      seed: 12,
      fast: true,
      aiDelay: 300,
      autoAck: true,
      test: true,
      autostart: true,
      players: 6,
      difficulty: 'hard',
      flor: true,
      picaPica: false,
    });
  });

  it('ignora valores inválidos', () => {
    const config = parseUrlConfig('?seed=abc&players=5&difficulty=imposible&aiDelay=');
    expect(config.seed).toBeNull();
    expect(config.players).toBeNull();
    expect(config.difficulty).toBeNull();
    expect(config.aiDelay).toBeNull();
    expect(config.flor).toBeNull();
    expect(config.fast).toBe(false);
  });
});

describe('createTimerScheduler', () => {
  afterEach(() => vi.useRealTimers());

  it('corre lo programado, cancela uno y cancela todo', () => {
    vi.useFakeTimers();
    const scheduler = createTimerScheduler();
    const ran: string[] = [];
    scheduler.schedule(10, () => ran.push('a'));
    const cancelB = scheduler.schedule(20, () => ran.push('b'));
    scheduler.schedule(30, () => ran.push('c'));
    cancelB();
    vi.advanceTimersByTime(15);
    expect(ran).toEqual(['a']);
    scheduler.cancelAll();
    vi.advanceTimersByTime(100);
    expect(ran).toEqual(['a']);
  });
});

describe('GameController — caminos especiales', () => {
  it('pausa (stop) y resume sin perder la decisión pendiente ni repetir eventos', () => {
    const scheduler = createManualScheduler();
    const controller = new GameController({ settings: { ...SETTINGS, playerCount: 4 }, seed: 21, scheduler, timing: FAST_TIMING });
    const batches: number[] = [];
    controller.subscribe((snap) => batches.push(snap.events.length));
    controller.start();
    controller.stop();
    expect(scheduler.pendingCount()).toBe(0);
    controller.resume();
    // Resume no vuelve a mandar los eventos de antes.
    expect(batches[batches.length - 1]).toBe(0);
    if (getActor(controller.getState()) !== HUMAN_ID) expect(scheduler.pendingCount()).toBe(1);
  });

  it('autoAck pasa sola a la mano siguiente, y se puede prender con el resumen abierto', () => {
    const scheduler = createManualScheduler();
    const human: Policy = { decide: (obs) => obs.legalActions.find((a) => a.type === 'MAZO') ?? obs.legalActions[0] };
    const controller = new GameController({ settings: SETTINGS, seed: 2, scheduler, timing: FAST_TIMING, humanPolicy: human });
    controller.start();
    // Juega hasta el primer fin de mano con el resumen visible.
    let guard = 0;
    while (!(controller.getState().phase === 'HAND_OVER' && controller.snapshot().summaryVisible) && guard++ < 200) {
      if (!scheduler.runNext()) break;
    }
    expect(controller.getState().phase).toBe('HAND_OVER');
    controller.setAutoAck(true);
    scheduler.runAll(5);
    expect(controller.getState().hand.number).toBeGreaterThanOrEqual(2);
    expect(controller.continueAfterHand()).toBe(controller.getState().phase === 'HAND_OVER');
  });

  it('la flor del humano se canta sola', () => {
    const scheduler = createManualScheduler();
    // Mazo fijo por semilla no sirve: se busca una semilla donde el humano tenga flor y sea mano.
    let found: GameController | null = null;
    for (let seed = 1; seed < 4000 && !found; seed++) {
      const controller = new GameController({ settings: { ...SETTINGS, flor: true }, seed, scheduler, timing: FAST_TIMING });
      const state = controller.getState();
      const dealt = state.hand.dealt[HUMAN_ID];
      if (state.hand.manoId === HUMAN_ID && dealt.every((card) => card.suit === dealt[0].suit)) found = controller;
    }
    expect(found).not.toBeNull();
    if (!found) return;
    scheduler.cancelAll();
    found.start();
    expect(found.humanLegalActions()).toEqual([{ type: 'DECLARE_FLOR' }]);
    scheduler.runNext();
    expect(found.getState().hand.flor.declared.map((d) => d.playerId)).toContain(HUMAN_ID);
  });

  it('si la IA falla o elige algo ilegal, juega la primera acción legal (nunca se cuelga)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const scheduler = createManualScheduler();
    const broken: Policy = {
      decide: (obs) => {
        if (obs.myHand.length === 3) throw new Error('rota');
        return { type: 'PLAY_CARD', cardId: '99-copa' };
      },
    };
    const controller = new GameController({ settings: SETTINGS, seed: 8, scheduler, timing: FAST_TIMING, humanPolicy: broken, autoAck: true });
    controller.start();
    scheduler.runAll();
    expect(controller.getState().phase).toBe('MATCH_OVER');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('newMatch con reglas nuevas arranca de cero', () => {
    const scheduler = createManualScheduler();
    const controller = new GameController({ settings: SETTINGS, seed: 1, scheduler, timing: FAST_TIMING });
    controller.start();
    controller.newMatch({ playerCount: 6, difficulty: 'easy', flor: true, picaPica: false }, 99);
    const state = controller.getState();
    expect(state.seats).toHaveLength(6);
    expect(state.rules).toEqual({ playerCount: 6, targetScore: 30, flor: true, picaPica: false });
    expect(state.seed).toBe(99);
    expect(createDeck()).toHaveLength(40);
  });
});
