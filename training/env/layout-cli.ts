// Imprime el layout de la observación (tramos, tamaño total, huella) para el learner de Python.
import { createMatch, getObservation } from '../../src/engine/index.js';
import { ACTION_NAMES } from '../../src/ai/rl/actions.js';
import { layoutHash, obsLayout, PRIV_DIM } from '../../src/ai/rl/encode.js';

// node --import tsx training/env/layout-cli.ts <jugadores> [--claims] [--reputation]
//   --claims: con lo dicho en voz alta (r4) · --reputation: con la reputación en la partida (r4-reputación)
const players = Number(process.argv[2] ?? 2) as 2 | 4 | 6;
const withClaims = process.argv.includes('--claims');
const withReputation = process.argv.includes('--reputation');
const layout = obsLayout(getObservation(createMatch({ rules: { playerCount: players, flor: false, picaPica: false }, seed: 1 }), 'p0'), withClaims, withReputation);
console.log(
  JSON.stringify({
    obsDim: layout.reduce((sum, part) => sum + part.size, 0),
    privDim: PRIV_DIM,
    nActions: ACTION_NAMES.length,
    actions: ACTION_NAMES,
    layoutHash: layoutHash(layout),
    layout,
  }),
);
