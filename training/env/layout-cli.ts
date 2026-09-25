// Imprime el layout de la observación (tramos, tamaño total, huella) para el learner de Python.
import { createMatch, getObservation } from '../../src/engine/index.js';
import { ACTION_NAMES } from './actions.js';
import { layoutHash, obsLayout, PRIV_DIM } from './encode.js';

const players = Number(process.argv[2] ?? 2) as 2 | 4 | 6;
const layout = obsLayout(getObservation(createMatch({ rules: { playerCount: players, flor: false, picaPica: false }, seed: 1 }), 'p0'));
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
