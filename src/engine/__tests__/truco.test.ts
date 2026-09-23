// Tests de src/engine/truco.ts — AC 1 a 9 de la historia 1-3: tabla única de puntos,
// legalidad de cantar y responder, transiciones de `truco.pending` y no quiero [ENG-03]
// que cierra la mano sin jugar ninguna carta más [ENG-02].

import { describe, expect, it } from 'vitest';
import { applyAction } from '../apply.js';
import { getActor, getLegalActions } from '../legal.js';
import { createMatch, startNextHand } from '../match.js';
import { createRng } from '../rng.js';
import { TRUCO_POINTS, applyAnswerTruco, canCallTruco, trucoPoints, trucoResponseActions } from '../truco.js';
import type { MatchState, PlayerId, TrucoLevel } from '../types.js';
import {
  answerTruco,
  callTruco,
  deckFor,
  engineSources,
  playFirstCard,
  randomLegalAction,
  withScores,
} from './helpers.js';

/** Manos fijas: el mano es p1 (equipo 1) y gana las dos primeras bazas. */
const MANOS: Record<PlayerId, string[]> = {
  p1: ['1-espada', '7-espada', '4-copa'],
  p0: ['3-basto', '5-copa', '12-oro'],
};

/** Partida de 2 jugadores con mazo fijo: repartidor p0 → mano p1, arranca p1 (equipo 1). */
function match2p(hands: Record<PlayerId, string[]> = MANOS): MatchState {
  return createMatch({ rules: { playerCount: 2 }, seed: 1, firstDealerSeat: 0, deck: deckFor(hands, 1, 2) });
}

/** Partida de 4 jugadores con mazo fijo: repartidor p0 → mano p1; participantes p1, p2, p3, p0. */
function match4p(): MatchState {
  return createMatch({ rules: { playerCount: 4 }, seed: 1, firstDealerSeat: 0, deck: deckFor({}, 1, 4) });
}

/** Canta truco y lo quiere: deja la mano en `PLAYING` con el truco querido y el turno del que cantó. */
function trucoQuerido(state: MatchState, caller: PlayerId, responder: PlayerId): MatchState {
  return answerTruco(callTruco(state, caller).state, responder, 'QUIERO').state;
}

describe('TRUCO_POINTS / trucoPoints (AC 7)', () => {
  it('[ENG-20] la tabla de puntos del truco vive solo en truco.ts', () => {
    const fuentes = engineSources();
    expect(fuentes.map(({ file }) => file)).toContain('truco.ts');
    const conLaTabla = fuentes
      .filter(({ source }) => /TRUCO_POINTS|rejected/.test(source))
      .map(({ file }) => file);
    expect(conLaTabla).toEqual(['truco.ts']);
  });

  it('[ENG-20] la tabla tiene los dos lados: querido y no querido (índice = nivel)', () => {
    expect(TRUCO_POINTS).toEqual({ accepted: [1, 2, 3, 4], rejected: [0, 1, 2, 3] });
  });

  it('sin canto la mano vale 1', () => {
    const state = match2p();
    expect(state.hand.truco.level).toBe(0);
    expect(trucoPoints(state)).toBe(1);
  });

  it('según el nivel querido: truco 2, retruco 3, vale cuatro 4 (GDD §5)', () => {
    const tabla: [TrucoLevel, number][] = [
      [1, 2],
      [2, 3],
      [3, 4],
    ];
    for (const [level, points] of tabla) {
      const state = match2p();
      state.hand.truco.level = level;
      expect(trucoPoints(state), `nivel ${level}`).toBe(points);
    }
  });

  it('sube con el nivel querido real, no con el cantado', () => {
    const querido = trucoQuerido(match2p(), 'p1', 'p0');
    expect(querido.hand.truco.level).toBe(1);
    expect(trucoPoints(querido)).toBe(2);
  });
});

describe('canCallTruco y CALL_TRUCO en PLAYING (AC 1)', () => {
  it('al empezar la mano el actor puede cantar truco, y va primero en las acciones legales', () => {
    const state = match2p();
    expect(getActor(state)).toBe('p1');
    expect(canCallTruco(state, 'p1')).toBe(true);
    expect(getLegalActions(state, 'p1')).toEqual([
      { type: 'CALL_TRUCO' },
      { type: 'PLAY_CARD', cardId: '1-espada' },
      { type: 'PLAY_CARD', cardId: '7-espada' },
      { type: 'PLAY_CARD', cardId: '4-copa' },
    ]);
    expect(canCallTruco(state, 'p0')).toBe(false);
  });

  it('cantar truco abre el canto: pending, fase, evento y CantoRecord (AC 1)', () => {
    const state = match2p();
    const snapshot = JSON.parse(JSON.stringify(state));

    const result = applyAction(state, 'p1', { type: 'CALL_TRUCO' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([{ type: 'TRUCO_CALLED', playerId: 'p1', level: 1 }]);
    expect(result.state.phase).toBe('AWAITING_TRUCO');
    expect(result.state.hand.truco).toEqual({
      level: 0,
      pending: { level: 1, callerId: 'p1', callerTeam: 1, responderId: 'p0' },
      quieroTeam: null,
    });
    expect(result.state.hand.cantos).toEqual([{ kind: 'TRUCO', by: 'p1', team: 1 }]);
    expect(result.state.version).toBe(1);
    // el estado recibido no se toca
    expect(state).toEqual(snapshot);
    expect(state.phase).toBe('PLAYING');
  });

  it('no deja cantar dos veces el mismo escalón ni subir sin el quiero (AC 1, AC 9)', () => {
    const state = trucoQuerido(match2p(), 'p1', 'p0'); // nivel 1, el quiero es del equipo 0
    expect(state.phase).toBe('PLAYING');
    expect(state.hand.turnId).toBe('p1');

    // el que cantó (equipo 1) no tiene el quiero: no puede subir
    expect(canCallTruco(state, 'p1')).toBe(false);
    expect(applyAction(state, 'p1', { type: 'CALL_TRUCO' })).toEqual({ ok: false, error: 'ILLEGAL_ACTION' });

    // el que quiso (equipo 0) sí, cuando le toca
    const despuesDeJugar = playFirstCard(state).state; // p1 juega: el turno pasa a p0
    expect(getActor(despuesDeJugar)).toBe('p0');
    expect(canCallTruco(despuesDeJugar, 'p0')).toBe(true);
    expect(getLegalActions(despuesDeJugar, 'p0')[0]).toEqual({ type: 'CALL_TRUCO' });
  });

  it('con el vale cuatro ya querido (nivel 3) no se puede cantar más', () => {
    const state = trucoQuerido(match2p(), 'p1', 'p0');
    state.hand.truco.level = 3;
    state.hand.truco.quieroTeam = 0;
    expect(canCallTruco(state, 'p0')).toBe(false);
    expect(getLegalActions(state, 'p1')).not.toContainEqual({ type: 'CALL_TRUCO' });
  });

  it('con un canto pendiente nadie puede cantar y solo decide el respondedor', () => {
    const state = callTruco(match2p(), 'p1').state;
    expect(canCallTruco(state, 'p0')).toBe(false);
    expect(canCallTruco(state, 'p1')).toBe(false);
    expect(getLegalActions(state, 'p1')).toEqual([]);
    expect(applyAction(state, 'p1', { type: 'CALL_TRUCO' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });
});

describe('AWAITING_TRUCO: actor y acciones del respondedor (AC 3)', () => {
  it('el actor es el respondedor y puede querer, no querer o subir', () => {
    const state = callTruco(match2p(), 'p1').state;

    expect(getActor(state)).toBe('p0');
    expect(getLegalActions(state, 'p0')).toEqual([
      { type: 'ANSWER_TRUCO', answer: 'QUIERO' },
      { type: 'ANSWER_TRUCO', answer: 'NO_QUIERO' },
      { type: 'CALL_TRUCO' },
    ]);
    expect(getLegalActions(state, 'p1')).toEqual([]);
    expect(applyAction(state, 'p1', { type: 'ANSWER_TRUCO', answer: 'QUIERO' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });

  it('con el vale cuatro pendiente no hay subida: quiero o no quiero', () => {
    // p1 truco → p0 quiero → p1 juega → p0 retruco → p1 quiero → p0 juega → p1 vale cuatro
    let state = trucoQuerido(match2p(), 'p1', 'p0');
    state = playFirstCard(state).state; // turno de p0
    state = callTruco(state, 'p0').state; // retruco (pendiente 2)
    state = answerTruco(state, 'p1', 'QUIERO').state; // nivel 2, el quiero es del equipo 1
    state = playFirstCard(state).state; // p0 juega: la baza 1 queda para p1
    state = callTruco(state, 'p1').state; // vale cuatro (pendiente 3)

    expect(state.phase).toBe('AWAITING_TRUCO');
    expect(state.hand.truco.pending).toEqual({ level: 3, callerId: 'p1', callerTeam: 1, responderId: 'p0' });
    expect(getActor(state)).toBe('p0');
    expect(getLegalActions(state, 'p0')).toEqual([
      { type: 'ANSWER_TRUCO', answer: 'QUIERO' },
      { type: 'ANSWER_TRUCO', answer: 'NO_QUIERO' },
    ]);
    expect(getLegalActions(state, 'p1')).toEqual([]);
  });

  it('[ENG-02] con un truco pendiente no se juega ninguna carta', () => {
    const state = callTruco(match2p(), 'p1').state;
    const cardId = state.hand.hands['p1'][0].id;

    // el que tenía el turno ya no es el actor
    expect(applyAction(state, 'p1', { type: 'PLAY_CARD', cardId })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    // y el respondedor no tiene PLAY_CARD entre sus acciones legales
    expect(applyAction(state, 'p0', { type: 'PLAY_CARD', cardId: state.hand.hands['p0'][0].id })).toEqual({
      ok: false,
      error: 'ILLEGAL_ACTION',
    });
    expect(getLegalActions(state, 'p0').some((action) => action.type === 'PLAY_CARD')).toBe(false);
  });

  it('trucoResponseActions es vacío sin respondedor o sin canto pendiente', () => {
    expect(trucoResponseActions(match2p(), 'p0')).toEqual([]);

    const incoherente = match2p();
    incoherente.hand.truco.level = 1;
    incoherente.phase = 'AWAITING_TRUCO';
    expect(trucoResponseActions(incoherente, 'p0')).toEqual([]);
  });

  it('tira NO_PENDING_TRUCO si se responde sin canto pendiente', () => {
    const state = match2p();
    expect(() => applyAnswerTruco(state, [], 'p0', 'QUIERO')).toThrow('NO_PENDING_TRUCO');
  });
});

describe('ANSWER_TRUCO QUIERO (AC 4)', () => {
  it('deja el nivel querido, vuelve a PLAYING y no cambia quién juega la carta', () => {
    const state = callTruco(match2p(), 'p1').state;
    const turnIdAntes = state.hand.turnId;

    const result = applyAction(state, 'p0', { type: 'ANSWER_TRUCO', answer: 'QUIERO' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([{ type: 'TRUCO_ANSWERED', playerId: 'p0', answer: 'QUIERO' }]);
    expect(result.state.phase).toBe('PLAYING');
    expect(result.state.hand.truco).toEqual({ level: 1, pending: null, quieroTeam: 0 });
    expect(result.state.hand.turnId).toBe(turnIdAntes);
    expect(getActor(result.state)).toBe('p1');
    expect(result.state.hand.cantos).toEqual([{ kind: 'TRUCO', by: 'p1', team: 1, answer: 'QUIERO' }]);
    // y ahora sí el equipo que cantó puede jugar su carta
    expect(getLegalActions(result.state, 'p1')).toContainEqual({ type: 'PLAY_CARD', cardId: '1-espada' });
  });

  it('el que quiso gana el derecho a subir en su turno (AC 9)', () => {
    const state = trucoQuerido(match2p(), 'p1', 'p0');
    const siguiente = playFirstCard(state).state; // p1 juega: el turno pasa a p0

    expect(getLegalActions(siguiente, 'p0')[0]).toEqual({ type: 'CALL_TRUCO' });
    const subido = callTruco(siguiente, 'p0').state;
    expect(subido.hand.truco.pending).toMatchObject({ level: 2, callerId: 'p0', callerTeam: 0 });
  });
});

describe('subir como respuesta: "quiero retruco" (AC 5)', () => {
  it('acepta el nivel pendiente y deja el siguiente canto a cargo del rival', () => {
    const state = callTruco(match2p(), 'p1').state;

    const result = applyAction(state, 'p0', { type: 'CALL_TRUCO' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([
      { type: 'TRUCO_ANSWERED', playerId: 'p0', answer: 'QUIERO' },
      { type: 'TRUCO_CALLED', playerId: 'p0', level: 2 },
    ]);
    expect(result.state.phase).toBe('AWAITING_TRUCO');
    expect(result.state.hand.truco).toEqual({
      level: 1,
      pending: { level: 2, callerId: 'p0', callerTeam: 0, responderId: 'p1' },
      quieroTeam: 0,
    });
    expect(result.state.hand.cantos).toEqual([
      { kind: 'TRUCO', by: 'p1', team: 1, answer: 'QUIERO' },
      { kind: 'RETRUCO', by: 'p0', team: 0 },
    ]);
    expect(getActor(result.state)).toBe('p1');
    // sigue pendiente: nadie juega carta todavía
    expect(getLegalActions(result.state, 'p1').some((action) => action.type === 'PLAY_CARD')).toBe(false);
  });

  it('encadena "quiero retruco" y "quiero vale cuatro" (AC 5)', () => {
    const retruco = callTruco(callTruco(match2p(), 'p1').state, 'p0').state;
    const vale4 = callTruco(retruco, 'p1');

    expect(vale4.events).toEqual([
      { type: 'TRUCO_ANSWERED', playerId: 'p1', answer: 'QUIERO' },
      { type: 'TRUCO_CALLED', playerId: 'p1', level: 3 },
    ]);
    expect(vale4.state.hand.truco).toEqual({
      level: 2,
      pending: { level: 3, callerId: 'p1', callerTeam: 1, responderId: 'p0' },
      quieroTeam: 1,
    });
    expect(vale4.state.hand.cantos).toEqual([
      { kind: 'TRUCO', by: 'p1', team: 1, answer: 'QUIERO' },
      { kind: 'RETRUCO', by: 'p0', team: 0, answer: 'QUIERO' },
      { kind: 'VALE4', by: 'p1', team: 1 },
    ]);
    expect(vale4.state.phase).toBe('AWAITING_TRUCO');

    const querido = answerTruco(vale4.state, 'p0', 'QUIERO').state;
    expect(querido.hand.truco).toEqual({ level: 3, pending: null, quieroTeam: 0 });
    expect(querido.phase).toBe('PLAYING');
    expect(querido.hand.turnId).toBe('p1');
  });
});

describe('ANSWER_TRUCO NO_QUIERO (AC 6) [ENG-03]', () => {
  it('termina la mano en el acto y el que cantó suma el valor no querido', () => {
    const state = callTruco(match2p(), 'p1').state;

    const result = applyAction(state, 'p0', { type: 'ANSWER_TRUCO', answer: 'NO_QUIERO' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([
      { type: 'TRUCO_ANSWERED', playerId: 'p0', answer: 'NO_QUIERO' },
      { type: 'POINTS', team: 1, points: 1, reason: 'NO_QUIERO' },
      { type: 'HAND_OVER', winnerTeam: 1, points: 1, reason: 'NO_QUIERO' },
    ]);
    expect(result.state.phase).toBe('HAND_OVER');
    expect(result.state.scores).toEqual([0, 1]);
    expect(result.state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'NO_QUIERO' });
    expect(result.state.hand.truco.pending).toBeNull();
    expect(result.state.hand.cantos).toEqual([{ kind: 'TRUCO', by: 'p1', team: 1, answer: 'NO_QUIERO' }]);
    expect(result.state.history[0]).toMatchObject({ points: 1, reason: 'NO_QUIERO', scoresAfter: [0, 1] });
    // no se jugó ninguna carta y no queda nada legal
    expect(result.state.hand.currentTrick.plays).toEqual([]);
    expect(result.state.hand.tricks).toEqual([]);
    expect(result.state.hand.hands['p1']).toHaveLength(3);
    expect(getActor(result.state)).toBeNull();
    expect(getLegalActions(result.state, 'p1')).toEqual([]);
    expect(applyAction(result.state, 'p1', { type: 'PLAY_CARD', cardId: '1-espada' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    });
  });

  it('el retruco no querido paga 2 y el vale cuatro no querido paga 3', () => {
    // nivel 1 querido por el equipo 0, turno de p0: p0 canta el retruco
    const conTurnoDeP0 = playFirstCard(trucoQuerido(match2p(), 'p1', 'p0')).state;
    const retruco = callTruco(conTurnoDeP0, 'p0').state;

    const retrucoNoQuerido = answerTruco(retruco, 'p1', 'NO_QUIERO').state;
    // el que cantó el retruco fue p0 (equipo 0) y el retruco no querido vale 2
    expect(retrucoNoQuerido.scores).toEqual([2, 0]);
    expect(retrucoNoQuerido.hand.result).toEqual({ winnerTeam: 0, points: 2, reason: 'NO_QUIERO' });

    // mismo camino pero queriendo: nivel 2, turno de p0 → p0 juega → p1 canta el vale cuatro
    const conRetrucoQuerido = playFirstCard(answerTruco(retruco, 'p1', 'QUIERO').state).state;
    const vale4 = callTruco(conRetrucoQuerido, 'p1').state;
    const vale4NoQuerido = answerTruco(vale4, 'p0', 'NO_QUIERO').state;
    // el vale cuatro lo cantó p1 (equipo 1) y vale 3 no querido
    expect(vale4NoQuerido.scores).toEqual([0, 3]);
    expect(vale4NoQuerido.hand.result).toEqual({ winnerTeam: 1, points: 3, reason: 'NO_QUIERO' });
  });

  it('si el no quiero lleva al rival a 30, la partida termina ahí', () => {
    const state = withScores(callTruco(match2p(), 'p1').state, [0, 29]);

    const result = applyAction(state, 'p0', { type: 'ANSWER_TRUCO', answer: 'NO_QUIERO' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('MATCH_OVER');
    expect(result.state.winnerTeam).toBe(1);
    expect(result.state.scores).toEqual([0, 30]);
    expect(result.events.map((event) => event.type)).toEqual(['TRUCO_ANSWERED', 'POINTS', 'MATCH_OVER']);
    expect(getActor(result.state)).toBeNull();
  });

  it('el no quiero paga trucoPoints querido de las bazas que ya no se juegan: 1 punto', () => {
    // Con el truco querido la mano valía 2; al no quererlo, el que cantó se lleva 1.
    const state = answerTruco(callTruco(match2p(), 'p1').state, 'p0', 'NO_QUIERO').state;
    expect(trucoPoints(state)).toBe(1);
    expect(state.hand.truco.level).toBe(0);
  });
});

describe('4 jugadores: quién responde (AC 10)', () => {
  it('p1 canta y responde el humano; p0 canta y responde p1; p2 canta y responde p3', () => {
    const state = match4p();
    expect(state.hand.participants).toEqual(['p1', 'p2', 'p3', 'p0']);

    const porP1 = callTruco(state, 'p1').state;
    expect(porP1.hand.truco.pending).toMatchObject({ callerId: 'p1', callerTeam: 1, responderId: 'p0' });
    expect(getActor(porP1)).toBe('p0');

    // el turno avanza: p1 juega y le queda la mano a p2, que canta
    const conTurnoDeP2 = playFirstCard(state).state;
    expect(getActor(conTurnoDeP2)).toBe('p2');
    const porP2 = callTruco(conTurnoDeP2, 'p2').state;
    expect(porP2.hand.truco.pending).toMatchObject({ callerId: 'p2', callerTeam: 0, responderId: 'p3' });
    expect(getActor(porP2)).toBe('p3');

    // p0 es el último de la vuelta: juega p2 y p3 antes
    let antesDeP0 = conTurnoDeP2;
    for (const esperado of ['p3', 'p0']) {
      antesDeP0 = playFirstCard(antesDeP0).state;
      expect(getActor(antesDeP0)).toBe(esperado);
    }
    const porP0 = callTruco(antesDeP0, 'p0').state;
    expect(porP0.hand.truco.pending).toMatchObject({ callerId: 'p0', callerTeam: 0, responderId: 'p1' });
    expect(getActor(porP0)).toBe('p1');
  });
});

describe('[ENG-18] coherencia entre la fase y el canto pendiente', () => {
  it('[ENG-18] `phase === "AWAITING_TRUCO"` ⇔ `truco.pending !== null` tras cada acción (50 manos random)', () => {
    const rng = createRng(2026);
    const reglas = { playerCount: 4 } as const;
    let state = createMatch({ rules: reglas, seed: 7, firstDealerSeat: 0 });
    let manosJugadas = 0;
    let cantosDeTruco = 0;
    let manosNoQueridas = 0;

    const coherencia = (candidate: MatchState): void => {
      expect(
        candidate.phase === 'AWAITING_TRUCO',
        `${candidate.phase} / pending ${JSON.stringify(candidate.hand.truco.pending)}`,
      ).toBe(candidate.hand.truco.pending !== null);
    };

    coherencia(state);

    while (manosJugadas < 50) {
      if (state.phase === 'MATCH_OVER') {
        // La partida llegó a 30: se arranca otra para seguir ejercitando el truco.
        state = createMatch({ rules: reglas, seed: 1000 + manosJugadas, firstDealerSeat: 0 });
        coherencia(state);
      }
      if (state.phase === 'HAND_OVER') {
        state = startNextHand(state).state;
        manosJugadas += 1;
        coherencia(state);
        continue;
      }

      const { playerId, action } = randomLegalAction(state, rng);
      if (action.type === 'CALL_TRUCO') cantosDeTruco += 1;

      const result = applyAction(state, playerId, action);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      if (result.events.some((event) => event.type === 'HAND_OVER' && event.reason === 'NO_QUIERO')) {
        manosNoQueridas += 1;
      }
      state = result.state;
      coherencia(state);
    }

    expect(manosJugadas).toBe(50);
    expect(cantosDeTruco).toBeGreaterThan(0); // el random jugó truco de verdad
    expect(manosNoQueridas).toBeGreaterThan(0); // y pasó por el cierre por no quiero
  });
});
