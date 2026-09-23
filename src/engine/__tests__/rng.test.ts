// Tests de src/engine/rng.ts — determinismo, rango, nextInt y shuffle.

import { describe, expect, it } from 'vitest';
import { createDeck } from '../cards.js';
import { createRng, nextInt, shuffle } from '../rng.js';
import { ids } from './helpers.js';

describe('createRng (mulberry32)', () => {
  it('next() siempre devuelve un número en [0, 1)', () => {
    const rng = createRng(12345);
    for (let i = 0; i < 5000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('es determinista: misma semilla ⇒ misma secuencia', () => {
    const a = createRng(2026);
    const b = createRng(2026);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('semillas distintas ⇒ secuencias distintas', () => {
    const a = Array.from({ length: 10 }, (_, i) => createRng(1 + i).next());
    expect(new Set(a).size).toBe(10);
  });

  it('distribución básica: media ~0.5 y buckets parejos', () => {
    const rng = createRng(4242);
    const buckets = new Array<number>(10).fill(0);
    const total = 20000;
    let sum = 0;
    for (let i = 0; i < total; i++) {
      const value = rng.next();
      sum += value;
      buckets[Math.floor(value * 10)] += 1;
    }
    expect(sum / total).toBeGreaterThan(0.47);
    expect(sum / total).toBeLessThan(0.53);
    for (const count of buckets) {
      expect(count).toBeGreaterThan(total * 0.07);
      expect(count).toBeLessThan(total * 0.13);
    }
  });

  it('getState() avanza con cada next() y permite reanudar la secuencia', () => {
    const rng = createRng(7);
    const initial = rng.getState();
    rng.next();
    expect(rng.getState()).not.toBe(initial);

    rng.next();
    rng.next();
    const resumed = createRng(rng.getState());
    expect([resumed.next(), resumed.next(), resumed.next()]).toEqual([rng.next(), rng.next(), rng.next()]);
  });
});

describe('nextInt', () => {
  it('devuelve enteros en [0, n) y con n = 1 siempre 0', () => {
    const rng = createRng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const value = nextInt(rng, 10);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
      seen.add(value);
    }
    expect(seen.size).toBe(10);
    expect(nextInt(rng, 1)).toBe(0);
  });
});

describe('shuffle (Fisher–Yates)', () => {
  it('devuelve una copia: no muta el arreglo original', () => {
    const deck = createDeck();
    const original = ids(deck);
    const shuffled = shuffle(deck, createRng(5));
    expect(shuffled).not.toBe(deck);
    expect(ids(deck)).toEqual(original);
    expect(ids(shuffled)).not.toEqual(original);
  });

  it('devuelve una permutación completa del mazo (40 cartas, sin repetir)', () => {
    const shuffled = shuffle(createDeck(), createRng(5));
    expect(shuffled).toHaveLength(40);
    expect(new Set(ids(shuffled)).size).toBe(40);
    expect([...ids(shuffled)].sort()).toEqual([...ids(createDeck())].sort());
  });

  it('es determinista con la misma semilla', () => {
    const a = shuffle(createDeck(), createRng(2026));
    const b = shuffle(createDeck(), createRng(2026));
    expect(ids(a)).toEqual(ids(b));
  });

  it('con 0 o 1 elementos devuelve una copia equivalente', () => {
    expect(shuffle([], createRng(1))).toEqual([]);
    expect(shuffle([1], createRng(1))).toEqual([1]);
  });
});
