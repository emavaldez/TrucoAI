// Simulación masiva por línea de comando — historia 1-6 (AC 6).
//   npm run sim -- --games 1000 --players 4 --seed 1 [--flor] [--no-check]
// Corre N partidas por modo pedido (o los tres modos si no se pasa --players) y
// muestra: partidas, manos promedio, % de victorias por equipo, promedio de puntos
// por envido/truco y errores (debe ser 0). Sale con código 1 si hay errores.

import { simulateMatch } from '../src/sim/simulate.js';
import type { CantoRecord, MatchState } from '../src/engine/index.js';

interface Options {
  games: number;
  players: Array<2 | 4 | 6> | null; // null = los tres modos
  seed: number;
  flor: boolean;
  check: boolean;
}

/** CLI mínimo: flags `--clave valor` y booleanos. */
function parseArgs(argv: string[]): Options {
  const opts: Options = { games: 1000, players: null, seed: 1, flor: false, check: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--flor') opts.flor = true;
    else if (arg === '--no-check') opts.check = false;
    else if (arg === '--games') opts.games = Number(argv[++i]);
    else if (arg === '--players') opts.players = argv[++i].split(',').map((n) => Number(n) as 2 | 4 | 6);
    else if (arg === '--seed') opts.seed = Number(argv[++i]);
    else if (arg.startsWith('-')) throw new Error(`flag desconocida: ${arg}`);
  }
  if (!Number.isFinite(opts.games) || opts.games < 1) throw new Error('--games debe ser >= 1');
  for (const mode of opts.players ?? []) {
    if (![2, 4, 6].includes(mode)) throw new Error(`--players admite 2, 4 o 6 (recibido ${mode})`);
  }
  return opts;
}

const ENVIDO_KINDS = new Set(['ENVIDO', 'REAL_ENVIDO', 'FALTA_ENVIDO']);
const TRUCO_KINDS = new Set(['TRUCO', 'RETRUCO', 'VALE4']);

/** Puntos de envido cobrados en una mano cerrada (el de la cadena, una sola vez). */
function envidoPointsOf(record: { cantos: readonly CantoRecord[] }): number {
  const cantos = record.cantos.filter((c) => ENVIDO_KINDS.has(c.kind) && c.answer !== undefined);
  if (cantos.length === 0) return 0;
  return Math.max(...cantos.map((c) => c.points ?? 0));
}

/** Puntos de truco cobrados en una mano cerrada (querido o no querido, una sola vez). */
function trucoPointsOf(record: { cantos: readonly CantoRecord[]; points: number }): number {
  const cantos = record.cantos.filter((c) => TRUCO_KINDS.has(c.kind) && c.answer !== undefined);
  if (cantos.length === 0) return 0;
  return Math.max(...cantos.map((c) => c.points ?? 0));
}

interface ModeTotals {
  hands: number;
  wins: [number, number];
  envidoGames: number;
  envidoPoints: number;
  trucoGames: number;
  trucoPoints: number;
}

function accumulate(totals: ModeTotals, state: MatchState): void {
  totals.hands += state.history.length;
  if (state.winnerTeam !== null) totals.wins[state.winnerTeam] += 1;
  for (const record of state.history) {
    const envido = envidoPointsOf(record);
    const truco = trucoPointsOf(record);
    if (envido > 0) {
      totals.envidoGames += 1;
      totals.envidoPoints += envido;
    }
    if (truco > 0) {
      totals.trucoGames += 1;
      totals.trucoPoints += truco;
    }
  }
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const modes: Array<2 | 4 | 6> = opts.players ?? [2, 4, 6];
  let totalErrors = 0;

  for (const players of modes) {
    const totals: ModeTotals = {
      hands: 0,
      wins: [0, 0],
      envidoGames: 0,
      envidoPoints: 0,
      trucoGames: 0,
      trucoPoints: 0,
    };
    let errors = 0;

    for (let game = 0; game < opts.games; game++) {
      const seed = opts.seed + game;
      try {
        const result = simulateMatch({
          rules: { playerCount: players, flor: opts.flor },
          seed,
          check: opts.check,
        });
        accumulate(totals, result.state);
      } catch (error) {
        errors += 1;
        console.error(`  ERROR mode=${players} seed=${seed}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    totalErrors += errors;
    const pctGames = (n: number): string => `${((n / opts.games) * 100).toFixed(1)}%`;
    const pctHands = (n: number): string => `${totals.hands === 0 ? '—' : `${((n / totals.hands) * 100).toFixed(1)}%`}`;
    console.log(`\n== ${players} jugadores (flor ${opts.flor ? 'on' : 'off'}, check ${opts.check ? 'on' : 'off'}) ==`);
    console.log(`  partidas: ${opts.games} · errores: ${errors}`);
    console.log(`  manos promedio: ${(totals.hands / opts.games).toFixed(2)}`);
    console.log(`  victorias: equipo 0 ${pctGames(totals.wins[0])} · equipo 1 ${pctGames(totals.wins[1])}`);
    console.log(
      `  envido: ${pctHands(totals.envidoGames)} de las manos, promedio ${
        totals.envidoGames === 0 ? '—' : (totals.envidoPoints / totals.envidoGames).toFixed(2)
      } pts`,
    );
    console.log(
      `  truco: ${pctHands(totals.trucoGames)} de las manos, promedio ${
        totals.trucoGames === 0 ? '—' : (totals.trucoPoints / totals.trucoGames).toFixed(2)
      } pts`,
    );
  }

  console.log(`\nTotal errores: ${totalErrors}${totalErrors === 0 ? ' OK' : ' FAIL'}`);
  process.exit(totalErrors === 0 ? 0 : 1);
}

main();
