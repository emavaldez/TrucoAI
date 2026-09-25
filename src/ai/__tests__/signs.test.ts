// Señas entre compañeros: tabla, qué seña puede hacer cada mano, qué hace la IA y cómo las usa.

import { describe, expect, it } from 'vitest';
import { createMatch, createRng, getObservation } from '../../engine/index.js';
import type { Card, CardNumber, PlayerId, Suit, TeamId } from '../../engine/index.js';
import { chooseCard } from '../cardPlay.js';
import { envidoWinProbability, handWinProbability } from '../estimate.js';
import { HeuristicPolicy, PROFILES } from '../policy.js';
import {
  SIGNS,
  aiSigns,
  availableSigns,
  signalKnowledge,
  signaledTopRank,
  signTest,
  type Signal,
} from '../signs.js';

function card(id: string): Card {
  const [number, suit] = id.split('-');
  return { id, number: Number(number) as CardNumber, suit: suit as Suit };
}

function cards(...ids: string[]): Card[] {
  return ids.map(card);
}

/** Partida de 4 con el humano (p0) de mano y estas manos (p0..p3). */
function match4(hands: [string[], string[], string[], string[]]) {
  const deck: Card[] = [];
  for (let k = 0; k < 3; k++) for (let p = 0; p < 4; p++) deck.push(card(hands[p][k]));
  return createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: 3, deck });
}

const TEAMS_4 = new Map<PlayerId, TeamId>([
  ['p0', 0],
  ['p1', 1],
  ['p2', 0],
  ['p3', 1],
]);

describe('tabla de señas (confirmada por Emmanuel)', () => {
  it('diez señas, cada una con su gesto; la nariz es envido y la lengua el ancho falso', () => {
    expect(SIGNS).toHaveLength(10);
    const byKind = new Map(SIGNS.map((sign) => [sign.kind, sign]));
    expect(byKind.get('ANCHO_ESPADA')?.gesture).toMatch(/cejas/);
    expect(byKind.get('ANCHO_BASTO')?.gesture).toMatch(/Guiñar/);
    expect(byKind.get('SIETE_ESPADA')?.gesture).toMatch(/derecha/);
    expect(byKind.get('SIETE_ORO')?.gesture).toMatch(/izquierda/);
    expect(byKind.get('TRES')?.gesture).toMatch(/labio/);
    expect(byKind.get('ENVIDO')?.gesture).toMatch(/nariz/);
    expect(byKind.get('ANCHO_FALSO')?.gesture).toMatch(/lengua/);
    expect(byKind.get('NADA')?.gesture).toMatch(/ojos/);
  });
});

describe('qué señas puede hacer una mano', () => {
  it('una por cada carta con seña, más envido de 27 o más', () => {
    const hand = cards('1-espada', '7-espada', '3-copa');
    const kinds = availableSigns(hand, hand, false).map((sign) => sign.kind);
    expect(kinds).toEqual(['ANCHO_ESPADA', 'SIETE_ESPADA', 'TRES', 'ENVIDO']);
  });

  it('sin cartas con seña: "nada" (y envido si tiene)', () => {
    const hand = cards('4-copa', '6-oro', '12-basto');
    expect(availableSigns(hand, hand, false).map((sign) => sign.kind)).toEqual(['NADA']);
    const withEnvido = cards('6-copa', '7-copa', '12-oro');
    expect(availableSigns(withEnvido, withEnvido, false).map((sign) => sign.kind)).toEqual(['ENVIDO', 'NADA']);
  });

  it('con flor (y la regla activa) se señala la flor en vez del envido', () => {
    const hand = cards('1-oro', '5-oro', '6-oro');
    expect(availableSigns(hand, hand, true).map((sign) => sign.kind)).toEqual(['ANCHO_FALSO', 'FLOR']);
    expect(availableSigns(hand, hand, false).map((sign) => sign.kind)).toEqual(['ANCHO_FALSO', 'ENVIDO']);
  });

  it('la IA señala sus dos cartas más fuertes con seña y el envido', () => {
    const hand = cards('2-copa', '1-basto', '3-oro');
    const signals = aiSigns('p2', hand, hand, false);
    expect(signals.map((signal) => signal.kind)).toEqual(['ANCHO_BASTO', 'TRES']);
    expect(signals.every((signal) => signal.from === 'p2')).toBe(true);
  });
});

describe('lo que la IA saca de las señas', () => {
  it('cada seña es una condición sobre las cartas repartidas', () => {
    expect(signTest('TRES')(cards('3-oro', '4-copa', '5-copa'))).toBe(true);
    expect(signTest('TRES')(cards('2-oro', '4-copa', '5-copa'))).toBe(false);
    expect(signTest('NADA')(cards('4-oro', '5-copa', '12-basto'))).toBe(true);
    expect(signTest('NADA')(cards('4-oro', '1-copa', '12-basto'))).toBe(false);
    expect(signTest('ENVIDO')(cards('7-oro', '6-oro', '12-basto'))).toBe(true);
    expect(signTest('FLOR')(cards('7-oro', '6-oro', '12-oro'))).toBe(true);
  });

  it('las cartas exactas señadas y no vistas quedan en la mano del compañero', () => {
    const unseen = cards('1-espada', '7-oro', '4-copa');
    const signals: Signal[] = [
      { from: 'p2', kind: 'ANCHO_ESPADA', cardId: '1-espada' },
      { from: 'p2', kind: 'TRES', cardId: '3-basto' },
    ];
    const knowledge = signalKnowledge('p0', signals, unseen);
    expect(knowledge.forced.get('p2')?.map((c) => c.id)).toEqual(['1-espada']);
    expect(knowledge.tests.get('p2')).toHaveLength(2);
    // Una seña propia no se usa.
    expect(signalKnowledge('p2', signals, unseen).forced.size).toBe(0);
  });

  it('la carta más alta que seguro le queda al compañero', () => {
    const signals: Signal[] = [
      { from: 'p2', kind: 'SIETE_ORO', cardId: '7-oro' },
      { from: 'p2', kind: 'TRES', cardId: '3-copa' },
    ];
    expect(signaledTopRank('p2', signals, [])).toBe(10);
    expect(signaledTopRank('p2', signals, cards('7-oro'))).toBe(9);
    expect(signaledTopRank('p0', signals, [])).toBe(-1);
  });

  it('sabiendo que el compañero tiene el ancho de espada, la mano vale más', () => {
    const state = match4([
      ['4-copa', '5-copa', '6-basto'],
      ['7-espada', '3-oro', '2-oro'],
      ['1-espada', '4-oro', '5-oro'],
      ['1-basto', '3-copa', '2-basto'],
    ]);
    const obs = getObservation(state, 'p0');
    const blind = handWinProbability(obs, createRng(1), 300);
    const knowledge = signalKnowledge('p0', [{ from: 'p2', kind: 'ANCHO_ESPADA', cardId: '1-espada' }], obs.unseenCards);
    const informed = handWinProbability(obs, createRng(1), 300, undefined, knowledge);
    expect(informed).toBeGreaterThan(blind + 0.1);
  });

  it('la nariz del compañero (27 o más) sube la chance de ganar el envido', () => {
    const state = match4([
      ['4-copa', '5-oro', '12-basto'],
      ['7-espada', '3-oro', '2-oro'],
      ['7-copa', '6-copa', '5-basto'],
      ['1-basto', '3-copa', '2-basto'],
    ]);
    const obs = getObservation(state, 'p0');
    const blind = envidoWinProbability(obs, createRng(2), 300);
    const knowledge = signalKnowledge('p0', [{ from: 'p2', kind: 'ENVIDO', cardId: null }], obs.unseenCards);
    const informed = envidoWinProbability(obs, createRng(2), 300, undefined, knowledge);
    expect(informed).toBeGreaterThan(blind + 0.2);
  });

  it('si el compañero que juega después tiene una carta grande, no gasto la mía', () => {
    const hand = cards('3-oro', '4-copa');
    const plays = [{ playerId: 'p1', card: card('2-copa') }];
    const base = { hand, plays, myTeam: 0 as TeamId, teams: TEAMS_4, results: [], rivalsAfter: 1 };
    expect(chooseCard(base).id).toBe('3-oro');
    expect(chooseCard({ ...base, teammateAfterTop: 13 }).id).toBe('4-copa');
    // Con una seña chica (un 3) no alcanza para confiarse.
    expect(chooseCard({ ...base, teammateAfterTop: 9 }).id).toBe('3-oro');
  });

  it('la política ignora señas de rivales y las suyas propias', () => {
    const state = match4([
      ['4-copa', '5-copa', '6-basto'],
      ['7-espada', '3-oro', '2-oro'],
      ['1-espada', '4-oro', '5-oro'],
      ['1-basto', '3-copa', '2-basto'],
    ]);
    const policy = new HeuristicPolicy({ ...PROFILES.normal, randomActionRate: 0 });
    const obs = getObservation(state, 'p0');
    const rivalOnly: Signal[] = [{ from: 'p1', kind: 'SIETE_ESPADA', cardId: '7-espada' }];
    const a = policy.decide(obs, createRng(9), rivalOnly);
    const b = policy.decide(obs, createRng(9), []);
    expect(a).toEqual(b);
  });
});
