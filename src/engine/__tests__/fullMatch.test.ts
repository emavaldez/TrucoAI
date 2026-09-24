// AC 6 [ENG-01]: partidas completas de 2, 4 y 6 jugadores, con dos políticas (primera
// acción legal y aleatoria con semilla), sin trabas en ningún paso, y una segunda partida
// nueva después que arranca limpia (marcador 0-0, historial vacío, fase PLAYING).
// Los 6 jugadores van con `picaPica: false` hasta la historia 1-7.

import { describe, expect, it } from 'vitest';
import { applyAction } from '../apply.js';
import { getActor, getLegalActions } from '../legal.js';
import { createMatch, startNextHand } from '../match.js';
import { createRng } from '../rng.js';
import type { Action, GameEvent, MatchState, Rng } from '../types.js';
import { randomLegalAction } from './helpers.js';

type Politica = 'primera' | 'aleatoria';

/** Tope de acciones de una partida: si se pasa, algo quedó trabado. */
const MAX_ACCIONES = 20000;

interface Partida {
  state: MatchState;
  events: GameEvent[];
  acciones: number;
  manos: number;
}

/**
 * Juega hasta `MATCH_OVER` sin trabas: en cada paso tiene que haber actor y acciones
 * legales para él, el marcador solo puede subir y nunca pasar de 30, y cada acción
 * aplicada tiene que ser aceptada por el motor.
 */
function jugarPartidaCompleta(state: MatchState, politica: Politica, rng: Rng): Partida {
  let actual = state;
  const events: GameEvent[] = [];
  let acciones = 0;
  let manos = 0;
  let sumaAnterior = actual.scores[0] + actual.scores[1];

  while (actual.phase !== 'MATCH_OVER') {
    expect(acciones, `partida trabada en ${actual.phase}`).toBeLessThan(MAX_ACCIONES);

    if (actual.phase === 'HAND_OVER') {
      actual = startNextHand(actual).state;
      manos += 1;
      continue;
    }

    const actor = getActor(actual);
    expect(actor, `fase ${actual.phase} sin actor`).not.toBeNull();
    if (actor === null) break;

    const legal = getLegalActions(actual, actor);
    expect(legal.length, `${actor} sin acciones legales en ${actual.phase}`).toBeGreaterThan(0);
    if (legal.length === 0) break;

    const action: Action = politica === 'primera' ? legal[0] : randomLegalAction(actual, rng).action;
    const result = applyAction(actual, actor, action);
    expect(result.ok, `${actor} no puede ${action.type}`).toBe(true);
    if (!result.ok) break;

    actual = result.state;
    events.push(...result.events);
    acciones += 1;

    // el marcador solo sube, nunca pasa de 30 y el ganador sale una sola vez
    const suma = actual.scores[0] + actual.scores[1];
    expect(suma, `el marcador bajó en ${actual.phase}`).toBeGreaterThanOrEqual(sumaAnterior);
    expect(actual.scores[0]).toBeLessThanOrEqual(30);
    expect(actual.scores[1]).toBeLessThanOrEqual(30);
    sumaAnterior = suma;
  }

  return { state: actual, events, acciones, manos };
}

/** AC 4: la partida terminada no deja seguir jugando. */
function expectPartidaCerrada(partida: Partida): void {
  const { state, events } = partida;

  expect(state.phase).toBe('MATCH_OVER');
  expect(state.winnerTeam).not.toBeNull();
  if (state.winnerTeam === null) return;

  expect(state.scores[state.winnerTeam]).toBe(30);
  expect(state.scores[1 - state.winnerTeam]).toBeLessThan(30);
  expect(events.filter((event) => event.type === 'MATCH_OVER')).toHaveLength(1);
  expect(getActor(state)).toBeNull();

  for (const seat of state.seats) {
    expect(getLegalActions(state, seat.id), seat.id).toEqual([]);
    expect(applyAction(state, seat.id, { type: 'MAZO' })).toEqual({ ok: false, error: 'MATCH_OVER' });
  }
  expect(() => startNextHand(state)).toThrow('NOT_HAND_OVER');

  // el historial tiene todas las manos cerradas, numeradas y con su marcador
  expect(state.history.length).toBeGreaterThan(0);
  expect(state.history.map((record) => record.number)).toEqual(
    state.history.map((_record, index) => index + 1),
  );
  expect(state.history.at(-1)?.scoresAfter).toEqual([state.scores[0], state.scores[1]]);
}

function partidaNueva(playerCount: 2 | 4 | 6, seed: number): MatchState {
  return createMatch({ rules: { playerCount, picaPica: false }, seed, firstDealerSeat: 0 });
}

describe('AC 6 [ENG-01]: partida completa y después otra', () => {
  for (const playerCount of [2, 4, 6] as const) {
    for (const politica of ['primera', 'aleatoria'] as const) {
      it(`${playerCount} jugadores, política ${politica}: termina bien y la siguiente arranca limpia`, () => {
        const rng = createRng(2026);

        const primera = jugarPartidaCompleta(partidaNueva(playerCount, 11), politica, rng);
        expectPartidaCerrada(primera);
        expect(primera.acciones).toBeGreaterThan(0);

        // partida nueva desde cero: nada del partido anterior sobrevive [ENG-01]
        const fresh = partidaNueva(playerCount, 11);
        expect(fresh.scores).toEqual([0, 0]);
        expect(fresh.history).toEqual([]);
        expect(fresh.phase).toBe('PLAYING');
        expect(fresh.winnerTeam).toBeNull();
        expect(fresh.hand.number).toBe(1);
        expect(fresh.version).toBe(0);

        const segunda = jugarPartidaCompleta(fresh, politica, rng);
        expectPartidaCerrada(segunda);
        // y la semilla distinta (otra partida) también termina bien
        const tercera = jugarPartidaCompleta(partidaNueva(playerCount, 12), politica, createRng(7));
        expectPartidaCerrada(tercera);
      });
    }
  }
});
