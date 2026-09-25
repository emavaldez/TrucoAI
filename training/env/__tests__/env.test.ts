// Entorno de entrenamiento: la codificación y las acciones tienen que ser estables y exactas,
// porque la misma red se usa en el entrenamiento y en el juego.

import { describe, expect, it } from 'vitest';
import { applyAction, createMatch, createRng, getActor, getObservation, startNextHand } from '../../../src/engine/index.js';
import type { MatchState } from '../../../src/engine/index.js';
import { createPolicy } from '../../../src/ai/policy.js';
import { actionIndex, legalMask, N_ACTIONS } from '../actions.js';
import { encodeObs, encodePriv, layoutHash, obsLayout, PRIV_DIM } from '../encode.js';
import { Mlp } from '../mlp.js';
import { computeWTable, wValue } from '../wtable.js';

function states(players: 2 | 4 | 6, count: number, seed: number): MatchState[] {
  const policy = createPolicy('normal');
  const rng = createRng(seed);
  const out: MatchState[] = [];
  let state = createMatch({ rules: { playerCount: players, flor: false, picaPica: false }, seed });
  while (out.length < count) {
    if (state.phase === 'MATCH_OVER') state = createMatch({ rules: { playerCount: players, flor: false, picaPica: false }, seed: seed + out.length });
    if (state.phase === 'HAND_OVER') {
      state = startNextHand(state).state;
      continue;
    }
    out.push(state);
    const actor = getActor(state) as string;
    state = (applyAction(state, actor, policy.decide(getObservation(state, actor), rng)) as { state: MatchState }).state;
  }
  return out;
}

describe('codificación de la observación', () => {
  const sample = getObservation(createMatch({ rules: { playerCount: 2, flor: false }, seed: 1 }), 'p0');
  const layout = obsLayout(sample);
  const dim = layout.reduce((sum, part) => sum + part.size, 0);

  it('layout fijo (si cambia, las redes entrenadas dejan de servir: hay que cambiar esta huella a propósito)', () => {
    expect(dim).toBe(1006);
    expect(layoutHash(layout)).toBe('78d8b04c');
  });

  for (const players of [2, 4, 6] as const) {
    it(`${players} jugadores: vectores del mismo tamaño, en [0,1] y cuantizados a k/255`, () => {
      for (const state of states(players, 150, 7)) {
        const actor = getActor(state) as string;
        const x = encodeObs(getObservation(state, actor));
        expect(x.length).toBe(dim);
        for (const v of x) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
          expect(Math.abs(v * 255 - Math.round(v * 255))).toBeLessThan(1e-4);
        }
        const priv = encodePriv(state, actor);
        expect(priv.length).toBe(PRIV_DIM);
      }
    });
  }

  it('la observación no depende de las manos ajenas (la privada sí)', () => {
    const a = createMatch({ rules: { playerCount: 2, flor: false }, seed: 3 });
    const b: MatchState = structuredClone(a);
    // Cambio las cartas del rival por otras: lo que ve p0 tiene que ser idéntico.
    b.hand.hands.p1 = b.hand.hands.p1.map((card) => ({ ...card }));
    const swap = b.hand.hands.p1[0];
    b.hand.hands.p1[0] = { id: swap.id === '4-copa' ? '5-copa' : '4-copa', number: swap.id === '4-copa' ? 5 : 4, suit: 'copa' };
    expect(Array.from(encodeObs(getObservation(a, 'p0')))).toEqual(Array.from(encodeObs(getObservation(b, 'p0'))));
    expect(Array.from(encodePriv(a, 'p0'))).not.toEqual(Array.from(encodePriv(b, 'p0')));
  });
});

describe('acciones', () => {
  for (const players of [2, 4] as const) {
    it(`${players} jugadores: cada acción legal tiene un índice propio y vuelve a la misma acción`, () => {
      for (const state of states(players, 200, 11)) {
        const obs = getObservation(state, getActor(state) as string);
        const { mask, actions } = legalMask(obs);
        expect(mask.reduce((sum, v) => sum + v, 0)).toBe(obs.legalActions.length);
        for (const action of obs.legalActions) {
          const index = actionIndex(action, obs);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(N_ACTIONS);
          expect(actions[index]).toEqual(action);
        }
      }
    });
  }
});

describe('red en TypeScript', () => {
  it('forward y máscara: nunca elige una acción ilegal', () => {
    const meta = { format: 'trucoai-mlp-v1' as const, obsDim: 3, nActions: 4, layers: [{ in: 3, out: 2 }, { in: 2, out: 4 }], layoutHash: 'x' };
    // capa 1: W = [[1,0,0],[0,1,0]], b = [0, -1]; capa 2: W = I extendida, b = 0
    const data = Float32Array.from([1, 0, 0, 0, 1, 0, 0, -1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
    const mlp = new Mlp(meta, data);
    const logits = mlp.forward(Float32Array.from([2, 0.5, 9]));
    // oculta: [2, relu(0.5-1)=0] → salida: [2, 0, 2, 0]
    expect(Array.from(logits)).toEqual([2, 0, 2, 0]);
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      const { action } = mlp.act(Float32Array.from([2, 0.5, 9]), Uint8Array.from([0, 1, 0, 1]), rng);
      expect([1, 3]).toContain(action);
    }
  });
});

describe('tabla de probabilidad de ganar', () => {
  const table = computeWTable(
    [
      [1, 0, 0.3],
      [0, 1, 0.25],
      [2, 0, 0.15],
      [0, 2, 0.15],
      [3, 2, 0.1],
      [0, 4, 0.05],
    ],
    'test',
  );
  it('es suma cero: W(a,b,m) + W(b,a,1−m) = 1', () => {
    for (const [a, b] of [[0, 0], [10, 3], [28, 29], [15, 15], [5, 27]]) {
      for (const m of [0, 1]) expect(wValue(table, a, b, m) + wValue(table, b, a, 1 - m)).toBeCloseTo(1, 9);
    }
  });
  it('más puntos, más chances', () => {
    expect(wValue(table, 29, 0, 0)).toBeGreaterThan(0.99);
    expect(wValue(table, 20, 10, 1)).toBeGreaterThan(wValue(table, 10, 10, 1));
    expect(wValue(table, 30, 12, 0)).toBe(1);
  });
});
