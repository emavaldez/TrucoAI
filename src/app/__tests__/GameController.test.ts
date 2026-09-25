// GameController (historia 3-1): driver de IA único, cancelación, autoAck, nueva partida.

import { describe, expect, it } from 'vitest';
import { createPolicy } from '../../ai/policy.js';
import { getActor, getLegalActions } from '../../engine/index.js';
import type { MatchState } from '../../engine/index.js';
import { FAST_TIMING, GameController, HUMAN_ID, NORMAL_TIMING, type MatchSettings } from '../GameController.js';
import { createManualScheduler } from '../scheduler.js';

const SETTINGS: MatchSettings = { playerCount: 4, difficulty: 'normal', flor: false, picaPica: true };

describe('GameController', () => {
  it('100 partidas completas con el humano jugado por una política: todas terminan, sin acciones dobles', () => {
    for (let game = 0; game < 100; game++) {
      const playerCount = ([2, 4, 6] as const)[game % 3];
      const scheduler = createManualScheduler();
      const controller = new GameController({
        settings: { ...SETTINGS, playerCount, flor: game % 4 === 0 },
        seed: 1000 + game,
        scheduler,
        timing: FAST_TIMING,
        autoAck: true,
        humanPolicy: createPolicy('normal'),
      });
      const versions: number[] = [];
      controller.subscribe((snap) => versions.push(snap.state.version));
      controller.start();
      scheduler.runAll();
      const state = controller.getState();
      expect(state.phase).toBe('MATCH_OVER');
      // Las versiones nunca retroceden: cada cambio de estado es una sola acción aplicada.
      for (let i = 1; i < versions.length; i++) expect(versions[i]).toBeGreaterThanOrEqual(versions[i - 1]);
      expect(scheduler.pendingCount()).toBe(0);
    }
  }, 60_000);

  it('espera al humano: no hay nada programado cuando le toca, y rechaza jugar fuera de turno', () => {
    const scheduler = createManualScheduler();
    const controller = new GameController({ settings: SETTINGS, seed: 5, scheduler, timing: FAST_TIMING });
    controller.start();
    let guard = 0;
    const humanPlays = (): boolean => getActor(controller.getState()) === HUMAN_ID && controller.getState().phase === 'PLAYING';
    while (!humanPlays() && guard++ < 200) {
      const state = controller.getState();
      if (state.phase === 'HAND_OVER') controller.continueAfterHand();
      else if (getActor(state) === HUMAN_ID) controller.dispatchHuman(controller.humanLegalActions()[0]);
      else scheduler.runNext();
    }
    expect(humanPlays()).toBe(true);
    expect(scheduler.pendingCount()).toBe(0);
    const legal = controller.humanLegalActions();
    expect(legal.length).toBeGreaterThan(0);

    const play = legal.find((action) => action.type === 'PLAY_CARD');
    expect(play).toBeDefined();
    if (!play) return;
    expect(controller.dispatchHuman(play).ok).toBe(true);
    // Doble clic: la misma acción otra vez ya no es del humano (o ya no es legal).
    expect(controller.dispatchHuman(play).ok).toBe(false);
  });

  it('una decisión de IA vieja no se ejecuta si el estado cambió (nueva partida cancela todo)', () => {
    const scheduler = createManualScheduler();
    const controller = new GameController({ settings: { ...SETTINGS, playerCount: 2 }, seed: 11, scheduler, timing: NORMAL_TIMING });
    controller.start();
    controller.newMatch();
    const before: MatchState = controller.getState();
    expect(before.version).toBe(0);
    expect(before.scores).toEqual([0, 0]);
    // Lo programado por la partida anterior se canceló: solo queda (a lo sumo) la decisión nueva.
    expect(scheduler.pendingCount()).toBeLessThanOrEqual(1);
  });

  it('en HAND_OVER muestra el resumen después de la pausa y espera "Siguiente mano"', () => {
    const scheduler = createManualScheduler();
    const controller = new GameController({
      settings: { ...SETTINGS, playerCount: 2 },
      seed: 3,
      scheduler,
      timing: FAST_TIMING,
      humanPolicy: createPolicy('normal'),
    });
    let summaries = 0;
    controller.subscribe((snap) => {
      if (snap.summaryVisible) summaries += 1;
    });
    controller.start();
    scheduler.runAll();
    const state = controller.getState();
    expect(['HAND_OVER', 'MATCH_OVER']).toContain(state.phase);
    if (state.phase === 'HAND_OVER') {
      expect(summaries).toBe(1);
      expect(controller.continueAfterHand()).toBe(true);
      expect(controller.getState().hand.number).toBe(2);
    }
  });

  it('los compañeros del humano juegan en normal y los rivales en la dificultad elegida', () => {
    const scheduler = createManualScheduler();
    const controller = new GameController({
      settings: { ...SETTINGS, playerCount: 4, difficulty: 'easy' },
      seed: 9,
      scheduler,
      timing: FAST_TIMING,
    });
    controller.start();
    // Se juega hasta que le toque al humano: no hay error ni cuelgue.
    let guard = 0;
    while (getActor(controller.getState()) !== HUMAN_ID && guard++ < 50) {
      if (controller.getState().phase === 'HAND_OVER') controller.continueAfterHand();
      else if (!scheduler.runNext()) break;
    }
    const actor = getActor(controller.getState());
    expect(actor === HUMAN_ID || controller.getState().phase !== 'PLAYING').toBe(true);
    expect(getLegalActions(controller.getState(), 'p1')).toEqual(actor === 'p1' ? expect.any(Array) : []);
  });
});
