// Tests de pureza y determinismo del motor (AC 9): sin aleatoriedad ni DOM, serializable,
// determinista por semilla y sin imports del código legacy.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyAction, createMatch, getActor, getLegalActions } from '../index.js';
import type { MatchState } from '../types.js';

const ENGINE_DIR = fileURLToPath(new URL('../', import.meta.url));

/** Todos los .ts de src/engine, salteando `__tests__` (los tests pueden usar lo que sea). */
function engineSources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      found.push(...engineSources(full));
    } else if (entry.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

const SOURCES = engineSources(ENGINE_DIR);
const RELATIVE_SOURCES = SOURCES.map((file) => relative(ENGINE_DIR, file));

describe('motor puro', () => {
  it('[AI-11] ningún módulo de src/engine usa Math.random, Date.now, setTimeout, document ni window', () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(8);
    expect(RELATIVE_SOURCES).toContain('rng.ts');
    expect(RELATIVE_SOURCES).toContain('match.ts');
    expect(RELATIVE_SOURCES).toContain('apply.ts');

    const forbidden = ['Math.random', 'Date.now', 'setTimeout', 'document', 'window'];
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const source = readFileSync(file, 'utf8');
      for (const needle of forbidden) {
        if (source.includes(needle)) offenders.push(`${relative(ENGINE_DIR, file)}: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('ningún módulo de src/engine importa el código legacy ni el DOM', () => {
    const legacy = ['/core/', '/App.ts', '/ui/UIManager', 'AIPlayer', 'DecisionEngine', 'CardEvaluator'];
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const source = readFileSync(file, 'utf8');
      for (const needle of legacy) {
        if (source.includes(needle)) offenders.push(`${relative(ENGINE_DIR, file)}: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('estado serializable', () => {
  it('JSON.parse(JSON.stringify(state)) es igual a state', () => {
    const state = createMatch({ rules: { playerCount: 4 }, seed: 11, firstDealerSeat: 0 });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);

    const actor = state.hand.turnId;
    const result = applyAction(state, actor, { type: 'PLAY_CARD', cardId: state.hand.hands[actor][0].id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
  });

  it('el estado se puede clonar con structuredClone sin perder nada', () => {
    const state = createMatch({ rules: { playerCount: 6 }, seed: 12 });
    const clone = structuredClone(state);
    expect(clone).toEqual(state);
    expect(clone).not.toBe(state);
  });
});

describe('determinismo', () => {
  const fingerprint = (state: MatchState): string => JSON.stringify(state);

  it('misma semilla + mismas acciones ⇒ mismo estado', () => {
    const run = (): MatchState => {
      let state = createMatch({ rules: { playerCount: 4 }, seed: 2026, firstDealerSeat: 0 });
      for (let i = 0; i < 3; i++) {
        const actor = getActor(state);
        if (actor === null) break;
        const action = getLegalActions(state, actor)[0];
        const result = applyAction(state, actor, action);
        if (!result.ok) throw new Error(result.error);
        state = result.state;
      }
      return state;
    };
    const a = run();
    const b = run();
    expect(fingerprint(a)).toBe(fingerprint(b));
    expect(a.version).toBe(3);
  });

  it('semillas distintas ⇒ estados iniciales distintos', () => {
    const a = createMatch({ rules: { playerCount: 4 }, seed: 1 });
    const b = createMatch({ rules: { playerCount: 4 }, seed: 2 });
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });
});
