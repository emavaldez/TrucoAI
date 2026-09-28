// Fase de equipos (4 y 6): charla de la mesa compartida con el juego, indicaciones del pie como
// acciones de la red y premio por obedecer.

import { describe, expect, it } from 'vitest';
import { createMatch, getObservation, pieOf } from '../../../src/engine/index.js';
import type { Card, CardNumber, Observation, Suit } from '../../../src/engine/index.js';
import { EMPTY_TALK, dealTalk, instructionsFor, isPieNow, signalsFor, teamInstructions, withInstruction } from '../../../src/ai/tableTalk.js';
import {
  ACTION_NAMES,
  N_ACTIONS,
  N_ENGINE_ACTIONS,
  instructionIndex,
  instructionMask,
  instructionOf,
} from '../../../src/ai/rl/actions.js';
import { encodeObs, layoutHash, obsLayout, talkExtras } from '../../../src/ai/rl/encode.js';
import { compliance } from '../obey.js';

function card(id: string): Card {
  const [number, suit] = id.split('-');
  return { id, number: Number(number) as CardNumber, suit: suit as Suit };
}

function match4() {
  return createMatch({ rules: { playerCount: 4, flor: false, picaPica: false }, seed: 11 });
}

describe('charla de la mesa (compartida con el juego)', () => {
  it('con 2 jugadores no hay señas ni indicaciones', () => {
    const state = createMatch({ rules: { playerCount: 2, flor: false }, seed: 1 });
    expect(dealTalk(state, () => true)).toEqual(EMPTY_TALK);
  });

  it('las señas le llegan solo al pie; las indicaciones, a sus compañeros (y el pie sabe lo que dijo)', () => {
    const state = match4();
    const talk = dealTalk(state, () => true);
    const pie0 = pieOf(state, 0);
    const other0 = state.seats.find((seat) => seat.team === 0 && seat.id !== pie0)?.id as string;
    expect(talk.signals.length).toBeGreaterThan(0);
    expect(talk.signals.some((signal) => isPieNow(state, signal.from))).toBe(false);
    expect(signalsFor(state, talk, pie0).every((signal) => signal.from === other0)).toBe(true);
    expect(signalsFor(state, talk, other0)).toEqual([]);
    let told = withInstruction(state, talk, { from: pie0, kind: 'MATA' });
    told = withInstruction(state, told, { from: pie0, kind: 'CANTA_TRUCO' });
    told = withInstruction(state, told, { from: pie0, kind: 'PASA' });
    expect(instructionsFor(state, told, other0).sort()).toEqual(['CANTA_TRUCO', 'PASA']);
    expect(instructionsFor(state, told, pie0)).toEqual([]);
    expect(teamInstructions(state, told, pie0).sort()).toEqual(['CANTA_TRUCO', 'PASA']);
    // El otro equipo no ve nada de esto.
    const rival = state.seats.find((seat) => seat.team === 1)?.id as string;
    expect(instructionsFor(state, told, rival)).toEqual([]);
  });

  it('la observación ve señas e indicaciones sin cambiar el layout de las redes', () => {
    const state = match4();
    const pie0 = pieOf(state, 0);
    const other0 = state.seats.find((seat) => seat.team === 0 && seat.id !== pie0)?.id as string;
    const talk = withInstruction(state, dealTalk(state, () => true), { from: pie0, kind: 'MATA' });
    const obs = getObservation(state, other0);
    const layout = obsLayout(obs);
    expect(layoutHash(layout)).toBe('78d8b04c');
    const plain = encodeObs(obs);
    const withTalk = encodeObs(obs, talkExtras(state, talk, other0));
    expect(Array.from(withTalk)).not.toEqual(Array.from(plain));
    const pieView = encodeObs(getObservation(state, pie0), talkExtras(state, talk, pie0));
    expect(Array.from(pieView)).not.toEqual(Array.from(encodeObs(getObservation(state, pie0))));
  });
});

describe('indicaciones como acciones de la red', () => {
  it('7 acciones nuevas después de las 12 del motor', () => {
    expect(N_ENGINE_ACTIONS).toBe(12);
    expect(N_ACTIONS).toBe(19);
    expect(ACTION_NAMES.slice(12)).toEqual([
      'INDICA_MATA',
      'INDICA_PASA',
      'INDICA_PARDA',
      'INDICA_TRANQUILO',
      'INDICA_CANTA_TRUCO',
      'INDICA_ESPERA',
      'INDICA_NADA_TRUCO',
    ]);
  });

  it('máscaras separadas para cartas y truco; ida y vuelta con lo que indica la heurística', () => {
    expect(Array.from(instructionMask('cartas')).map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([12, 13, 14, 15]);
    expect(Array.from(instructionMask('truco')).map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([16, 17, 18]);
    expect(instructionIndex('cartas', ['PASA', 'CANTA_TRUCO'])).toBe(13);
    expect(instructionIndex('truco', ['PASA', 'CANTA_TRUCO'])).toBe(16);
    expect(instructionIndex('truco', ['TRANQUILO'])).toBe(18);
    expect(instructionOf(15)).toBe('TRANQUILO');
    expect(instructionOf(18)).toBeNull();
  });
});

describe('premio por obedecer al pie', () => {
  const base = getObservation(match4(), 'p0');
  const hand = [card('1-espada'), card('7-oro'), card('4-copa')]; // ordenada: 1e (13), 7o (10), 4c (0)
  function obsWith(plays: { playerId: string; card: Card }[]): Observation {
    return { ...base, myHand: hand, currentTrick: { ...base.currentTrick, plays } } as Observation;
  }
  const cardsMask = Uint8Array.from([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const withTruco = Uint8Array.from([1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const rival = base.seats.find((seat) => seat.team !== base.selfTeam)?.id as string;

  it('pasá: la más baja', () => {
    expect(compliance(obsWith([]), ['PASA'], 2, cardsMask)).toBe(1);
    expect(compliance(obsWith([]), ['PASA'], 0, cardsMask)).toBe(-1);
  });

  it('¡matá!: abriendo, la más alta; si el rival va ganando y puedo, superarlo', () => {
    expect(compliance(obsWith([]), ['MATA'], 0, cardsMask)).toBe(1);
    expect(compliance(obsWith([]), ['MATA'], 2, cardsMask)).toBe(-1);
    const rivalThree = obsWith([{ playerId: rival, card: card('3-oro') }]); // rango 9
    expect(compliance(rivalThree, ['MATA'], 1, cardsMask)).toBe(1);
    expect(compliance(rivalThree, ['MATA'], 2, cardsMask)).toBe(-1);
  });

  it('pardá: si el rival va ganando y tengo una igual', () => {
    const rivalSeven = obsWith([{ playerId: rival, card: card('7-oro') }]);
    const handWithSeven = { ...rivalSeven, myHand: [card('1-espada'), card('7-oro'), card('4-copa')] } as Observation;
    expect(compliance(handWithSeven, ['PARDA'], 1, cardsMask)).toBe(1);
    expect(compliance(handWithSeven, ['PARDA'], 0, cardsMask)).toBe(-1);
    expect(compliance(obsWith([]), ['PARDA'], 0, cardsMask)).toBe(0);
  });

  it('cantá truco / esperá, cuando puede cantarlo en su turno', () => {
    expect(compliance(obsWith([]), ['CANTA_TRUCO'], 3, withTruco)).toBe(1);
    expect(compliance(obsWith([]), ['CANTA_TRUCO'], 1, withTruco)).toBe(-1);
    expect(compliance(obsWith([]), ['ESPERA'], 3, withTruco)).toBe(-1);
    expect(compliance(obsWith([]), ['ESPERA'], 1, withTruco)).toBe(1);
    expect(compliance(obsWith([]), ['ESPERA'], 1, cardsMask)).toBe(0);
  });

  it('jugá tranquilo o sin indicación: nada', () => {
    expect(compliance(obsWith([]), ['TRANQUILO'], 0, withTruco)).toBe(0);
    expect(compliance(obsWith([]), [], 0, withTruco)).toBe(0);
  });
});
