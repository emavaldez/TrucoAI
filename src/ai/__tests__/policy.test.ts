// Tests de la IA (épica 2): legalidad, juego de cartas, decisiones de cantos y arena.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createMatch,
  createRng,
  getActor,
  getLegalActions,
  getObservation,
  startNextHand,
} from '../../engine/index.js';
import type { Card, CardNumber, MatchState, PlayerId, Suit, TeamId } from '../../engine/index.js';
import { runArena, wilson } from '../arena.js';
import { chooseCard } from '../cardPlay.js';
import { handDecided, handWinProbability } from '../estimate.js';
import { createPolicy, HeuristicPolicy, PROFILES, randomPolicy, type Difficulty } from '../policy.js';

function card(id: string): Card {
  const [number, suit] = id.split('-');
  return { id, number: Number(number) as CardNumber, suit: suit as Suit };
}

const TEAMS_4 = new Map<PlayerId, TeamId>([
  ['p0', 0],
  ['p1', 1],
  ['p2', 0],
  ['p3', 1],
]);

describe('juego de cartas (historia 2-2)', () => {
  it('abre con la más baja en la primera baza', () => {
    const hand = ['1-espada', '4-copa', '3-oro'].map(card);
    expect(chooseCard({ hand, plays: [], myTeam: 0, teams: TEAMS_4, results: [], rivalsAfter: 3 }).id).toBe('4-copa');
  });

  it('gana con la mínima que alcanza', () => {
    const hand = ['1-espada', '3-oro', '12-copa'].map(card);
    const plays = [{ playerId: 'p1', card: card('2-basto') }];
    expect(chooseCard({ hand, plays, myTeam: 0, teams: TEAMS_4, results: [], rivalsAfter: 1 }).id).toBe('3-oro');
  });

  it('no le gana al compañero que va ganando', () => {
    const hand = ['1-espada', '3-oro', '4-copa'].map(card);
    const plays = [
      { playerId: 'p0', card: card('7-espada') },
      { playerId: 'p1', card: card('5-oro') },
    ];
    expect(chooseCard({ hand, plays, myTeam: 0, teams: TEAMS_4, results: [], rivalsAfter: 1 }).id).toBe('4-copa');
  });

  it('empardar cuando ya ganamos una baza gana la mano', () => {
    const hand = ['3-copa', '12-oro'].map(card);
    const plays = [{ playerId: 'p1', card: card('3-espada') }];
    const teams2 = new Map<PlayerId, TeamId>([
      ['p0', 0],
      ['p1', 1],
    ]);
    expect(chooseCard({ hand, plays, myTeam: 0, teams: teams2, results: [0], rivalsAfter: 0 }).id).toBe('3-copa');
  });

  it('si no puede ganar, tira la más baja', () => {
    const hand = ['4-copa', '5-oro', '6-basto'].map(card);
    const plays = [{ playerId: 'p1', card: card('1-espada') }];
    expect(chooseCard({ hand, plays, myTeam: 0, teams: TEAMS_4, results: [], rivalsAfter: 1 }).id).toBe('4-copa');
  });

  it('handDecided respeta la tabla del GDD §4.2', () => {
    expect(handDecided([0, 0], 1)).toBe(0);
    expect(handDecided(['PARDA', 1], 0)).toBe(1);
    expect(handDecided([0, 'PARDA'], 1)).toBe(0);
    expect(handDecided([0, 1, 'PARDA'], 1)).toBe(0);
    expect(handDecided(['PARDA', 'PARDA', 'PARDA'], 1)).toBe(1);
    expect(handDecided([0, 1], 1)).toBeNull();
  });
});

/** Estados reales de partidas jugadas por la IA normal. */
function sampleStates(playerCount: 2 | 4 | 6, flor: boolean, count: number, seed: number): MatchState[] {
  const policy = createPolicy('normal');
  const states: MatchState[] = [];
  let game = 0;
  while (states.length < count) {
    let state = createMatch({ rules: { playerCount, flor }, seed: seed + game });
    const rng = createRng(seed + game);
    game += 1;
    while (state.phase !== 'MATCH_OVER' && states.length < count) {
      if (state.phase === 'HAND_OVER') {
        state = startNextHand(state).state;
        continue;
      }
      states.push(state);
      const actor = getActor(state) as string;
      const result = applyAction(state, actor, policy.decide(getObservation(state, actor), rng));
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
  }
  return states;
}

describe('la IA siempre devuelve una acción legal (historia 2-1)', () => {
  for (const [playerCount, flor] of [
    [2, false],
    [4, false],
    [6, false],
    [2, true],
    [6, true],
  ] as const) {
    it(`${playerCount}p${flor ? ' con flor' : ''}: 3 dificultades × 250 observaciones`, () => {
      const states = sampleStates(playerCount, flor, 250, 900 + playerCount);
      for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
        const policy = createPolicy(difficulty);
        const rng = createRng(17);
        for (const state of states) {
          const actor = getActor(state) as string;
          const obs = getObservation(state, actor);
          const action = policy.decide(obs, rng);
          expect(getLegalActions(state, actor)).toContainEqual(action);
        }
      }
    }, 30_000);
  }
});

describe('decisiones de cantos (historias 2-3, 2-4)', () => {
  it('con las dos cartas más altas y la mano ganada, la probabilidad es alta; con basura, baja', () => {
    const strong = createMatch({
      rules: { playerCount: 2 },
      seed: 1,
      firstDealerSeat: 1,
      deck: ['1-espada', '4-copa', '1-basto', '5-oro', '7-espada', '6-basto'].map(card),
    });
    const weak = createMatch({
      rules: { playerCount: 2 },
      seed: 1,
      firstDealerSeat: 1,
      deck: ['4-copa', '1-espada', '5-oro', '1-basto', '6-basto', '7-espada'].map(card),
    });
    const rng = createRng(3);
    expect(handWinProbability(getObservation(strong, 'p0'), rng, 200)).toBeGreaterThan(0.9);
    expect(handWinProbability(getObservation(weak, 'p0'), rng, 200)).toBeLessThan(0.1);
  });

  it('la IA normal nunca se va al mazo en su turno (jugar nunca es peor que irse)', () => {
    // Sin el ruido del 5%: la decisión razonada nunca es el mazo en el propio turno.
    const policy = new HeuristicPolicy({ ...PROFILES.normal, randomActionRate: 0 });
    const states = sampleStates(4, false, 300, 77);
    const rng = createRng(5);
    let checked = 0;
    for (const state of states) {
      if (state.phase !== 'PLAYING') continue;
      const actor = getActor(state) as string;
      const action = policy.decide(getObservation(state, actor), rng);
      expect(action.type).not.toBe('MAZO');
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('la IA no importa nada del motor salvo su API pública (justicia, ADR-4)', () => {
    const dir = fileURLToPath(new URL('../', import.meta.url));
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.ts'))) {
      const source = readFileSync(join(dir, file), 'utf8');
      for (const match of source.matchAll(/from '([^']+)'/g)) {
        const path = match[1];
        if (path.includes('engine')) expect(path).toBe('../engine/index.js');
        expect(path.includes('/core/')).toBe(false);
      }
    }
  });
});

describe('arena (historias 2-1, 2-5)', () => {
  it('wilson da un intervalo que contiene a la proporción', () => {
    const { low, high } = wilson(60, 100);
    expect(low).toBeLessThan(0.6);
    expect(high).toBeGreaterThan(0.6);
  });

  it('normal le gana claramente a la política aleatoria y a fácil (2 jugadores)', () => {
    const vsRandom = runArena({ playerCount: 2 }, createPolicy('normal'), randomPolicy, 60, 1);
    expect(vsRandom.rate).toBeGreaterThan(0.65);
    const vsEasy = runArena({ playerCount: 2 }, createPolicy('normal'), createPolicy('easy'), 80, 1);
    expect(vsEasy.low).toBeGreaterThan(0.5);
  }, 30_000);
});
