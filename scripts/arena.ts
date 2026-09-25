// Arena de IA: `npm run arena -- --a normal --b easy --players 4 --games 1000 --seed 1 [--flor]`
// Imprime el % de victorias de A con intervalo de confianza 95% (Wilson).

import { runArena } from '../src/ai/arena.js';
import { createPolicy, randomPolicy, type Difficulty, type Policy } from '../src/ai/policy.js';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback;
}

function policyOf(name: string): Policy {
  if (name === 'random') return randomPolicy;
  return createPolicy(name as Difficulty);
}

const a = arg('a', 'normal');
const b = arg('b', 'easy');
const players = Number(arg('players', '2')) as 2 | 4 | 6;
const games = Number(arg('games', '200'));
const seed = Number(arg('seed', '1'));
const flor = process.argv.includes('--flor');

const started = Date.now();
const result = runArena({ playerCount: players, flor }, policyOf(a), policyOf(b), games, seed);
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
console.log(`${a} vs ${b} · ${players} jugadores${flor ? ' · con flor' : ''} · ${games} partidas (semilla ${seed})`);
console.log(`  ${a} gana ${result.winsA}/${games} = ${pct(result.rate)}  [IC95 ${pct(result.low)} – ${pct(result.high)}]`);
console.log(`  ${((Date.now() - started) / 1000).toFixed(1)} s`);
