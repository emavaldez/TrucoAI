// Mesa en equipo: lo que se dice en voz alta (y las mentiras), y la táctica de esperar y subir.

import { describe, expect, it } from 'vitest';
import { applyAction, createMatch, createRng, getActor, getObservation } from '../../../engine/index.js';
import { responderFor } from '../../../engine/turns.js';
import type { Action, MatchState, PlayerId, Rng } from '../../../engine/index.js';
import { card, deckFor } from '../../../engine/__tests__/helpers.js';
import { HeuristicPolicy, PROFILES } from '../../policy.js';
import type { Signal } from '../../signs.js';
import { aiTantoAnswer, aiTrucoOpinion, claimTest, mergeAdvice, rivalPieStillToAct, tacticalDecision, teamHasStrongTanto } from '../team.js';

// Con 4 y el repartidor en el asiento 3: el mano es p0; pies: p2 (equipo 0) y p3 (equipo 1).
const HANDS = {
  p0: ['7-oro', '6-oro', '4-basto'], // 33 de tanto
  p1: ['4-copa', '5-espada', '6-basto'],
  p2: ['1-espada', '12-copa', '3-oro'],
  p3: ['7-copa', '6-copa', '2-basto'], // 33 de tanto
};

function match(openTable = false): MatchState {
  return createMatch({ rules: { playerCount: 4, openTable }, seed: 1, firstDealerSeat: 3, deck: deckFor(HANDS, 0, 4) });
}

function act(state: MatchState, playerId: PlayerId, action: Action): MatchState {
  const result = applyAction(state, playerId, action);
  if (!result.ok) throw new Error(`${playerId}: ${result.error}`);
  return result.state;
}

function play(state: MatchState, cardId: string): MatchState {
  return act(state, getActor(state) as PlayerId, { type: 'PLAY_CARD', cardId });
}

const rng = (value: number): Rng => ({ next: () => value, getState: () => 0 }) as unknown as Rng;
const envidoSign: Signal = { from: 'p0', kind: 'ENVIDO', cardId: null };

describe('dichos públicos', () => {
  it('lo que se cree de cada dicho', () => {
    const tanto = (level: 'mucho' | 'algo' | 'nada') => claimTest({ from: 'p0', about: 'tanto', level });
    expect(tanto('mucho')([card('7-oro'), card('6-oro'), card('1-copa')])).toBe(true);
    expect(tanto('nada')([card('7-oro'), card('6-oro'), card('1-copa')])).toBe(false);
    expect(tanto('nada')([card('4-oro'), card('5-copa'), card('12-basto')])).toBe(true);
  });

  it('con mucho tanto y el pie rival sin jugar, a veces miente para que el rival cante', () => {
    const state = match();
    expect(rivalPieStillToAct(state, 'p0')).toBe(true);
    expect(aiTantoAnswer(state, 'p0', rng(0.1)).claim.level).toBe('nada');
    expect(aiTantoAnswer(state, 'p0', rng(0.9))).toMatchObject({ claim: { level: 'mucho' }, text: expect.stringMatching(/Cantá/) });
    // Sin tanto dice la verdad.
    expect(aiTantoAnswer(state, 'p1', rng(0.1)).claim.level).toBe('nada');
  });

  it('cuando el pie rival ya jugó, no hay a quién engañar: dice la verdad', () => {
    let state = match();
    for (const id of ['4-basto', '4-copa', '3-oro', '2-basto']) state = play(state, id);
    expect(rivalPieStillToAct(state, 'p0')).toBe(false);
    expect(aiTantoAnswer(state, 'p0', rng(0.1)).claim.level).toBe('mucho');
  });
});

describe('esperar y subir', () => {
  it('el pie con la seña de mucho tanto no canta si al pie rival le falta jugar', () => {
    const state = play(play(match(), '4-basto'), '4-copa');
    expect(getActor(state)).toBe('p2');
    expect(teamHasStrongTanto(state, 'p2', [envidoSign])).toBe(true);
    const tactic = tacticalDecision({ state, actor: 'p2', signals: [envidoSign], advice: {}, slowPlaying: false });
    expect(tactic?.slowPlay).toBe(true);
    expect(tactic?.exclude?.({ type: 'CALL_ENVIDO', call: 'E' })).toBe(true);
    expect(tactic?.exclude?.({ type: 'PLAY_CARD', cardId: '3-oro' })).toBe(false);
    // Si el equipo le dice «cantá el tanto», canta.
    expect(tacticalDecision({ state, actor: 'p2', signals: [envidoSign], advice: { tanto: 'canta' }, slowPlaying: false })?.action).toEqual({
      type: 'CALL_ENVIDO',
      call: 'E',
    });
    // Sin tanto ni consejo, decide la política.
    expect(tacticalDecision({ state, actor: 'p2', signals: [], advice: {}, slowPlaying: false })).toBeNull();
    // Con «jugá callado», no canta.
    expect(tacticalDecision({ state, actor: 'p2', signals: [], advice: { tanto: 'callado' }, slowPlaying: false })?.exclude).toBeDefined();
  });

  it('cuando el rival canta envido, el pie que esperó le sube', () => {
    let state = play(play(play(match(), '4-basto'), '4-copa'), '3-oro');
    state = act(state, 'p3', { type: 'CALL_ENVIDO', call: 'E' });
    expect(state.hand.envido.pending?.responderId).toBe('p2');
    const tactic = tacticalDecision({ state, actor: 'p2', signals: [envidoSign], advice: {}, slowPlaying: true });
    expect(tactic?.action).toEqual({ type: 'CALL_ENVIDO', call: 'R' });
    // Sin haber esperado, sigue el consejo del equipo.
    expect(tacticalDecision({ state, actor: 'p2', signals: [], advice: { resp: 'no' }, slowPlaying: false })?.action).toEqual({
      type: 'ANSWER_ENVIDO',
      answer: 'NO_QUIERO',
    });
  });

  it('en 2 jugadores no hay táctica de equipo', () => {
    const state = createMatch({ rules: { playerCount: 2 }, seed: 1 });
    const actor = getActor(state) as PlayerId;
    expect(tacticalDecision({ state, actor, signals: [], advice: { tanto: 'canta' }, slowPlaying: false })).toBeNull();
  });
});

describe('mesa abierta (solo en el juego)', () => {
  it('desde la 2da baza contesta el humano si es del equipo que responde', () => {
    let state = match(true);
    for (const id of ['4-basto', '4-copa', '3-oro', '2-basto']) state = play(state, id);
    // Desde la 2da baza, si canta alguien del equipo 1, contesta el humano (p0) y no el pie p2.
    expect(responderFor(state, 'p1')).toBe('p0');
    expect(responderFor(state, 'p0')).toBe('p3');
    const closed = createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: 3, deck: deckFor(HANDS, 0, 4) });
    let other = closed;
    for (const id of ['4-basto', '4-copa', '3-oro', '2-basto']) other = play(other, id);
    expect(responderFor(other, 'p1')).toBe('p2');
  });

  it('en la 1ra baza contesta siempre el pie', () => {
    const state = match(true);
    expect(responderFor(state, 'p1')).toBe('p2');
  });
});

describe('los rivales de la IA escuchan', () => {
  it('si el equipo rival dice «no tengo nada», el pie rival se anima a cantar; si dice «tengo muchos», no', () => {
    const hands = { ...HANDS, p0: ['4-basto', '5-oro', '6-espada'], p3: ['6-copa', '12-copa', '2-basto'] }; // p3: 26
    let state = createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: 3, deck: deckFor(hands, 0, 4) });
    for (const id of ['4-basto', '4-copa', '3-oro']) state = play(state, id);
    const obs = getObservation(state, 'p3');
    const policy = new HeuristicPolicy(PROFILES.hard);
    const calls = (level: 'nada' | 'mucho'): number => {
      const heard = [
        { from: 'p0', about: 'tanto' as const, level },
        { from: 'p2', about: 'tanto' as const, level },
      ];
      let n = 0;
      for (let i = 0; i < 80; i++) if (policy.decide(obs, createRng(i), [], [], heard).type === 'CALL_ENVIDO') n += 1;
      return n;
    };
    expect(calls('nada')).toBeGreaterThan(calls('mucho') + 30);
  });
});

describe('los compañeros opinan y el pie decide (Emmanuel 2026-10-20)', () => {
  it('la opinión sobre el truco: con dos grandes «cantá», seco «jugá callado», en el medio nada', () => {
    const state = match();
    expect(aiTrucoOpinion(state, 'p2')?.advice).toBe('canta'); // 1-espada, 12-copa, 3-oro
    expect(aiTrucoOpinion(state, 'p1')?.advice).toBe('espera'); // 4, 5, 6
    expect(aiTrucoOpinion(state, 'p0')).toBeNull(); // 7-oro, 6, 4: algo
  });

  it('junta opiniones: la más decidida gana', () => {
    expect(mergeAdvice({ resp: 'no' }, { resp: 'subile' }).resp).toBe('subile');
    expect(mergeAdvice({ resp: 'quiero' }, { resp: 'no' }).resp).toBe('quiero');
    expect(mergeAdvice({ truco: 'espera' }, { truco: 'canta' }).truco).toBe('canta');
    expect(mergeAdvice({ tanto: 'canta' }, { tanto: 'callado' }).tanto).toBe('canta');
  });

  it('«esperá» el truco lo sigue si no tiene una grande; «cantá», si tiene con qué y el tanto ya pasó', () => {
    // 2da baza (ya no hay envido): p2 con 12-copa y 3-oro después de haber tirado el ancho.
    let state = play(play(play(play(match(), '4-basto'), '4-copa'), '1-espada'), '2-basto');
    expect(state.hand.tricks.length).toBe(1);
    expect(getActor(state)).toBe('p2');
    const isTruco = (a: Action) => a.type === 'CALL_TRUCO';
    // Tiene el 3 (grande, pero no un ancho de espada ni 7 bravo): «esperá» lo frena.
    expect(tacticalDecision({ state, actor: 'p2', signals: [], advice: { truco: 'espera' }, slowPlaying: false })?.exclude?.({ type: 'CALL_TRUCO' })).toBe(true);
    // «Cantá» con el 3 en la mano: canta.
    expect(tacticalDecision({ state, actor: 'p2', signals: [], advice: { truco: 'canta' }, slowPlaying: false })?.action).toEqual({ type: 'CALL_TRUCO' });
    // p3 (7-copa, 6-copa) contestó; en la 1ra baza, con el envido abierto, «cantá» no pisa el tanto.
    state = play(play(match(), '4-basto'), '4-copa');
    expect(tacticalDecision({ state, actor: 'p2', signals: [], advice: { truco: 'canta' }, slowPlaying: false })?.action?.type ?? null).not.toBe('CALL_TRUCO');
    void isTruco;
  });

  it('un «no» de los compañeros no manda si el que contesta tiene mucho', () => {
    // p3 (33 de tanto) contesta el envido de p2: aunque le digan «no», decide la política.
    let state = play(play(play(match(), '4-basto'), '4-copa'), '3-oro');
    state = act(state, 'p3', { type: 'CALL_ENVIDO', call: 'E' });
    expect(tacticalDecision({ state, actor: 'p2', signals: [], advice: { resp: 'no' }, slowPlaying: false })?.action).toEqual({ type: 'ANSWER_ENVIDO', answer: 'NO_QUIERO' });
    const p3State = act(play(play(match(), '4-basto'), '4-copa'), 'p2', { type: 'CALL_ENVIDO', call: 'E' });
    expect(p3State.hand.envido.pending?.responderId).toBe('p3');
    expect(tacticalDecision({ state: p3State, actor: 'p3', signals: [], advice: { resp: 'no' }, slowPlaying: false })).toBeNull();
  });

  it('el compañero sincero no aconseja «cantá» mientras el pie pueda esperar y subir', () => {
    const state = match();
    // p0 tiene 33 y al pie rival le falta jugar: 30% dice la verdad, pero sin consejo.
    const honest = aiTantoAnswer(state, 'p0', rng(0.9));
    expect(honest.claim.level).toBe('mucho');
    expect(honest.advice).toBeUndefined();
    // Cuando el pie rival ya jugó (p3 es el pie del equipo 1), el consejo va.
    const later = play(play(play(play(match(), '4-basto'), '4-copa'), '3-oro'), '2-basto');
    expect(rivalPieStillToAct(later, 'p0')).toBe(false);
    expect(aiTantoAnswer(later, 'p0', rng(0.9)).advice).toBe('canta');
  });
});
