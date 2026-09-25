// Simulación masiva con invariantes — historia 1-6 (AC 4, AC 5).
// 200 partidas por modo (2p, 4p, 6p) con `check: true`, flor apagada (la flor con
// Modo de juego llega en 1-8 y pica-pica todavía no está en el motor (1-7).
// Todas tienen que terminar en MATCH_OVER sin violar ningún invariante, y dos
// simulaciones con la misma semilla tienen que dar exactamente el mismo estado [INV-11].

import { describe, expect, it } from 'vitest';
import { simulateMatch } from '../simulate.js';
import { getActor, getLegalActions } from '../../engine/index.js';
import type { Action, Observation, RuleSet } from '../../engine/index.js';

const GAMES_PER_MODE = 200;

type Mode = 2 | 4 | 6;

function rulesFor(playerCount: Mode): Partial<RuleSet> & Pick<RuleSet, 'playerCount'> {
  return { playerCount, flor: false, picaPica: false };
}

describe.each<Mode>([2, 4, 6])('simulateMatch %ip con invariantes (AC 4)', (playerCount) => {
  it(
    `[INV] ${GAMES_PER_MODE} partidas al azar terminan en MATCH_OVER sin violaciones`,
    () => {
      for (let game = 0; game < GAMES_PER_MODE; game++) {
        const seed = 10_000 + game * 7 + playerCount;
        const result = simulateMatch({ rules: rulesFor(playerCount), seed, check: true });
        expect(result.state.phase).toBe('MATCH_OVER');
        expect(result.state.winnerTeam).not.toBeNull();
        expect(result.steps).toBeGreaterThan(0);
        expect(result.events.length).toBeGreaterThan(0);
      }
    },
    18_000,
  );
});

describe('determinismo [INV-11] (AC 5)', () => {
  it('misma semilla → mismo estado final; otra semilla → estado distinto', () => {
    for (const playerCount of [2, 4, 6] as Mode[]) {
      const a = simulateMatch({ rules: rulesFor(playerCount), seed: 4242 });
      const b = simulateMatch({ rules: rulesFor(playerCount), seed: 4242 });
      expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));

      const c = simulateMatch({ rules: rulesFor(playerCount), seed: 999 });
      expect(JSON.stringify(c.state)).not.toBe(JSON.stringify(a.state));
    }
  });

  it('pickAction fija (primera legal) también es determinista y válida en todo momento', () => {
    const first = (legal: Action[]): Action => legal[0];
    const a = simulateMatch({ rules: rulesFor(4), seed: 7, pickAction: first });
    const b = simulateMatch({ rules: rulesFor(4), seed: 7, pickAction: first });
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.state.phase).toBe('MATCH_OVER');
  });

  it('la política recibe la Observation del actor con legalActions == la lista legal', () => {
    let observations = 0;
    const spy = (legal: Action[], _rng: unknown, obs: Observation): Action => {
      observations += 1;
      expect(legal.length).toBeGreaterThan(0);
      expect(obs.legalActions.map((a) => JSON.stringify(a))).toEqual(legal.map((a) => JSON.stringify(a)));
      return legal[legal.length - 1];
    };
    const result = simulateMatch({ rules: rulesFor(2), seed: 5, pickAction: spy });
    expect(result.state.phase).toBe('MATCH_OVER');
    expect(observations).toBe(result.steps);
  });

  it('en cada paso hay un actor con acciones legales hasta que la partida termina [INV-3]', () => {
    const result = simulateMatch({ rules: rulesFor(6), seed: 31337, check: true });
    expect(result.state.phase).toBe('MATCH_OVER');
    expect(getActor(result.state)).toBeNull();
    expect(getLegalActions(result.state, 'p0')).toEqual([]);
  });
});
