// RNG con semilla (mulberry32) — determinista y serializable.
// El motor nunca usa aleatoriedad global: toda la aleatoriedad entra por acá.

import type { Rng } from './types.js';

/** Rng con estado serializable (para guardarlo en `MatchState.rngState`). */
export interface SeededRng extends Rng {
  getState(): number;
}

/**
 * mulberry32. `next()` devuelve un número en [0, 1).
 * El estado interno es un entero sin signo de 32 bits, así que `getState()`
 * se puede guardar en el `MatchState` y reinyectar con `createRng(state)`.
 */
export function createRng(state: number): SeededRng {
  let s = state >>> 0;
  return {
    next(): number {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    getState(): number {
      return s;
    },
  };
}

/** Entero uniforme en [0, n). Con `n <= 0` devuelve 0. */
export function nextInt(rng: Rng, n: number): number {
  return Math.floor(rng.next() * n);
}

/** Fisher–Yates. Devuelve una copia: no muta `arr`. */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
