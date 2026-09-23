// Tests de src/engine/tricks.ts — bazas, pardas, ganador de la mano, líder siguiente y cierre.

import { describe, expect, it } from 'vitest';
import { getActor } from '../legal.js';
import { createMatch } from '../match.js';
import { completeTrick, nextLeader, resolveHandWinner, resolveTrick } from '../tricks.js';
import type { MatchState, PlayerId, Seat, TeamId, TrickResult } from '../types.js';
import { card, deckFor, engineSources, playTrick, playTricks } from './helpers.js';

/** Asiento suelto para los tests de `resolveTrick` (sin partida de por medio). */
function seat(id: PlayerId, team: TeamId, index: number): Seat {
  return { id, seat: index, team, name: id, isHuman: false };
}

/** Partida de 2 jugadores con mazo fijo: repartidor p0 → mano p1 (equipo 1). */
function match2p(hands: Record<PlayerId, string[]>): MatchState {
  return createMatch({ rules: { playerCount: 2 }, seed: 1, firstDealerSeat: 0, deck: deckFor(hands, 1, 2) });
}

describe('resolveTrick', () => {
  const seats2p = [seat('p1', 1, 1), seat('p0', 0, 0)];

  it('gana el equipo de la carta de mayor rango', () => {
    const plays = [
      { playerId: 'p1', card: card('3-basto') },
      { playerId: 'p0', card: card('1-espada') },
    ];
    expect(resolveTrick(plays, seats2p)).toEqual({ winnerTeam: 0, winnerPlayerId: 'p0' });
  });

  it('es parda si el rango máximo lo jugaron equipos distintos, sin importar el resto', () => {
    const plays = [
      { playerId: 'p1', card: card('3-basto') },
      { playerId: 'p0', card: card('3-oro') },
    ];
    expect(resolveTrick(plays, seats2p)).toEqual({ winnerTeam: 'PARDA', winnerPlayerId: null });
  });

  it('si las dos cartas máximas son del mismo equipo gana ese equipo, con el primero que la jugó', () => {
    const seats4p = [seat('p1', 1, 1), seat('p2', 0, 2), seat('p3', 1, 3), seat('p0', 0, 0)];
    const plays = [
      { playerId: 'p1', card: card('4-copa') },
      { playerId: 'p2', card: card('3-espada') },
      { playerId: 'p3', card: card('5-copa') },
      { playerId: 'p0', card: card('3-copa') },
    ];
    expect(resolveTrick(plays, seats4p)).toEqual({ winnerTeam: 0, winnerPlayerId: 'p2' });
  });

  it('con 6 jugadores resuelve igual (los pares de pica-pica no cambian nada acá)', () => {
    const seats6p = [0, 1, 2, 3, 4, 5].map((index) => seat(`p${index}`, (index % 2) as TeamId, index));
    const plays = [
      { playerId: 'p1', card: card('12-oro') },
      { playerId: 'p2', card: card('2-espada') },
      { playerId: 'p3', card: card('7-espada') },
      { playerId: 'p4', card: card('7-copa') },
      { playerId: 'p5', card: card('4-oro') },
      { playerId: 'p0', card: card('6-copa') },
    ];
    expect(resolveTrick(plays, seats6p)).toEqual({ winnerTeam: 1, winnerPlayerId: 'p3' });
  });

  it('tira si la baza no tiene jugadas', () => {
    expect(() => resolveTrick([], seats2p)).toThrow('EMPTY_TRICK');
  });

  it('tira si alguien que jugó no está sentado', () => {
    expect(() => resolveTrick([{ playerId: 'p9', card: card('1-espada') }], seats2p)).toThrow('UNKNOWN_PLAYER: p9');
  });
});

describe('resolveHandWinner', () => {
  type Resultado = 'X' | 'Y' | 'P';

  /** Tabla de AC 2 (GDD §4.2): `bazas` es la secuencia mínima que decide y `at` dónde se decide. */
  const TABLA: { bazas: Resultado[]; winner: 'X' | 'Y'; at: number }[] = [
    { bazas: ['X', 'X'], winner: 'X', at: 2 },
    { bazas: ['X', 'P'], winner: 'X', at: 2 },
    { bazas: ['X', 'Y', 'X'], winner: 'X', at: 3 },
    { bazas: ['X', 'Y', 'Y'], winner: 'Y', at: 3 },
    { bazas: ['X', 'Y', 'P'], winner: 'X', at: 3 },
    { bazas: ['Y', 'Y'], winner: 'Y', at: 2 },
    { bazas: ['Y', 'P'], winner: 'Y', at: 2 },
    { bazas: ['Y', 'X', 'X'], winner: 'X', at: 3 },
    { bazas: ['Y', 'X', 'Y'], winner: 'Y', at: 3 },
    { bazas: ['Y', 'X', 'P'], winner: 'Y', at: 3 },
    { bazas: ['P', 'X'], winner: 'X', at: 2 },
    { bazas: ['P', 'Y'], winner: 'Y', at: 2 },
    { bazas: ['P', 'P', 'X'], winner: 'X', at: 3 },
    { bazas: ['P', 'P', 'Y'], winner: 'Y', at: 3 },
    { bazas: ['P', 'P', 'P'], winner: 'X', at: 3 }, // X = equipo del mano
  ];

  const RESULTADOS: Resultado[] = ['X', 'Y', 'P'];
  const COMBINACIONES: Resultado[][] = [];
  for (const primera of RESULTADOS) {
    for (const segunda of RESULTADOS) {
      for (const tercera of RESULTADOS) COMBINACIONES.push([primera, segunda, tercera]);
    }
  }

  const otro = (team: TeamId): TeamId => (team === 0 ? 1 : 0);
  const aEquipo = (resultado: 'X' | 'Y', manoTeam: TeamId): TeamId => (resultado === 'X' ? manoTeam : otro(manoTeam));
  const aBaza = (resultado: Resultado, manoTeam: TeamId): TeamId | 'PARDA' =>
    resultado === 'P' ? 'PARDA' : aEquipo(resultado, manoTeam);

  it('[ENG-08] las 27 combinaciones dan el ganador y la baza de decisión de la tabla', () => {
    expect(COMBINACIONES).toHaveLength(27);

    for (const manoTeam of [0, 1] as TeamId[]) {
      for (const combinacion of COMBINACIONES) {
        const clave = combinacion.join('');
        const fila = TABLA.find((candidata) => candidata.bazas.every((r, index) => r === combinacion[index]));
        expect(fila, clave).toBeDefined();
        if (fila === undefined) continue;

        const esperado = { decided: true, winnerTeam: aEquipo(fila.winner, manoTeam) };
        const jugadas = combinacion.slice(0, fila.at).map((r) => aBaza(r, manoTeam));

        expect(resolveHandWinner(jugadas, manoTeam), `${clave} se decide en la ${fila.at}ª`).toEqual(esperado);
        if (fila.at > 1) {
          expect(resolveHandWinner(jugadas.slice(0, -1), manoTeam), `${clave} todavía no en la ${fila.at - 1}ª`).toEqual({
            decided: false,
          });
        }
        // La 3ª puede no jugarse: el resultado ya decidido no cambia con lo que pase después.
        const completas = combinacion.map((r) => aBaza(r, manoTeam));
        expect(resolveHandWinner(completas, manoTeam), `${clave} con la 3ª jugada`).toEqual(esperado);
      }
    }
  });

  it('todavía no decide con una baza, con dos repartidas ni con las dos primeras pardas', () => {
    expect(resolveHandWinner([], 0)).toEqual({ decided: false });
    expect(resolveHandWinner([0], 0)).toEqual({ decided: false });
    expect(resolveHandWinner([1], 1)).toEqual({ decided: false });
    expect(resolveHandWinner([0, 1], 0)).toEqual({ decided: false });
    expect(resolveHandWinner([1, 0], 1)).toEqual({ decided: false });
    expect(resolveHandWinner(['PARDA'], 0)).toEqual({ decided: false });
    expect(resolveHandWinner(['PARDA', 'PARDA'], 0)).toEqual({ decided: false });
  });

  it('ganar las dos primeras cierra la mano y la tercera no hace falta', () => {
    expect(resolveHandWinner([1, 1], 0)).toEqual({ decided: true, winnerTeam: 1 });
    expect(resolveHandWinner([0, 'PARDA'], 1)).toEqual({ decided: true, winnerTeam: 0 });
  });

  it('con las tres pardas gana el equipo del mano, sea cual sea', () => {
    expect(resolveHandWinner(['PARDA', 'PARDA', 'PARDA'], 0)).toEqual({ decided: true, winnerTeam: 0 });
    expect(resolveHandWinner(['PARDA', 'PARDA', 'PARDA'], 1)).toEqual({ decided: true, winnerTeam: 1 });
  });

  it('con dos pardas decide la tercera: gana quien la ganó, no el equipo del mano', () => {
    expect(resolveHandWinner(['PARDA', 'PARDA', 0], 1)).toEqual({ decided: true, winnerTeam: 0 });
    expect(resolveHandWinner(['PARDA', 'PARDA', 1], 0)).toEqual({ decided: true, winnerTeam: 1 });
  });
});

describe('nextLeader', () => {
  const baza = (winnerPlayerId: PlayerId | null, leaderId: PlayerId): TrickResult => ({
    plays: [],
    winnerTeam: winnerPlayerId === null ? 'PARDA' : 0,
    winnerPlayerId,
    leaderId,
  });

  it('[ENG-07] tras una parda abre el mismo que abrió la baza', () => {
    expect(nextLeader(baza(null, 'p2'))).toBe('p2');
    expect(nextLeader(baza(null, 'p1'))).toBe('p1');
  });

  it('abre el ganador de la baza', () => {
    expect(nextLeader(baza('p0', 'p1'))).toBe('p0');
    expect(nextLeader(baza('p3', 'p2'))).toBe('p3');
  });
});

describe('completeTrick', () => {
  it('no cierra una baza a la que le faltan jugadas', () => {
    expect(() => completeTrick(match2p({ p1: ['1-espada', '4-copa', '2-oro'], p0: ['1-basto', '5-copa', '12-oro'] }), [])).toThrow(
      'INCOMPLETE_TRICK',
    );
  });

  it('registra la baza con su líder y emite TRICK_WON con el índice ya actualizado [ENG-16]', () => {
    const state = match2p({ p1: ['1-espada', '4-copa', '2-oro'], p0: ['1-basto', '5-copa', '12-oro'] });

    const { state: after, events } = playTrick(state, { p1: '1-espada', p0: '1-basto' });

    expect(events).toEqual([
      { type: 'CARD_PLAYED', playerId: 'p1', card: card('1-espada') },
      { type: 'CARD_PLAYED', playerId: 'p0', card: card('1-basto') },
      { type: 'TRICK_WON', trick: 0, winnerTeam: 1, winnerPlayerId: 'p1' },
    ]);
    expect(after.hand.tricks).toEqual([
      {
        plays: [
          { playerId: 'p1', card: card('1-espada') },
          { playerId: 'p0', card: card('1-basto') },
        ],
        winnerTeam: 1,
        winnerPlayerId: 'p1',
        leaderId: 'p1',
      },
    ]);
    // el evento sale con el estado ya actualizado: el índice es el de la baza recién cerrada
    expect(after.hand.tricks.length - 1).toBe(0);
    expect(after.hand.currentTrick).toEqual({ leaderId: 'p1', plays: [] });
    expect(after.hand.turnId).toBe('p1');
    expect(getActor(after)).toBe('p1');
    expect(after.phase).toBe('PLAYING');
  });

  it('[ENG-16] en una parda el evento no inventa ganador del equipo 0', () => {
    const state = match2p({ p1: ['3-basto', '1-espada', '4-copa'], p0: ['3-oro', '12-oro', '5-copa'] });

    const { state: after, events } = playTrick(state, { p1: '3-basto', p0: '3-oro' });

    expect(events[events.length - 1]).toEqual({
      type: 'TRICK_WON',
      trick: 0,
      winnerTeam: 'PARDA',
      winnerPlayerId: null,
    });
    expect(after.hand.tricks[0]).toMatchObject({ winnerTeam: 'PARDA', winnerPlayerId: null, leaderId: 'p1' });
  });

  it('[ENG-07] tras una parda abre la baza siguiente el mismo líder', () => {
    const state = match2p({ p1: ['3-basto', '1-espada', '4-copa'], p0: ['3-oro', '12-oro', '5-copa'] });

    const { state: after } = playTrick(state, { p1: '3-basto', p0: '3-oro' });

    expect(after.hand.currentTrick).toEqual({ leaderId: 'p1', plays: [] });
    expect(after.hand.turnId).toBe('p1');
    expect(getActor(after)).toBe('p1');
  });

  it('cuando la mano queda decidida la cierra en el acto (BAZAS, 1 punto, HAND_OVER)', () => {
    const state = match2p({ p1: ['1-espada', '7-espada', '4-copa'], p0: ['3-basto', '5-copa', '12-oro'] });

    const primera = playTrick(state, { p1: '1-espada', p0: '3-basto' });
    expect(primera.state.phase).toBe('PLAYING');
    expect(primera.state.hand.tricks).toHaveLength(1);

    const segunda = playTrick(primera.state, { p1: '7-espada', p0: '5-copa' });

    expect(segunda.state.phase).toBe('HAND_OVER');
    expect(segunda.state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'BAZAS' });
    expect(segunda.state.scores).toEqual([0, 1]);
    expect(segunda.state.history).toHaveLength(1);
    expect(segunda.state.history[0].reason).toBe('BAZAS');
    expect(segunda.events.slice(-2)).toEqual([
      { type: 'POINTS', team: 1, points: 1, reason: 'MANO' },
      { type: 'HAND_OVER', winnerTeam: 1, points: 1, reason: 'BAZAS' },
    ]);
    expect(getActor(segunda.state)).toBeNull();
  });

  it('la tercera baza decide la mano cuando las dos primeras se repartieron', () => {
    const state = match2p({ p1: ['1-espada', '4-copa', '7-espada'], p0: ['3-basto', '2-oro', '5-copa'] });

    const mano = playTricks(
      state,
      { p1: '1-espada', p0: '3-basto' },
      { p1: '4-copa', p0: '2-oro' },
      { p0: '5-copa', p1: '7-espada' },
    );

    expect(mano.state.hand.tricks.map((trick) => trick.winnerTeam)).toEqual([1, 0, 1]);
    expect(mano.state.phase).toBe('HAND_OVER');
    expect(mano.state.hand.result).toEqual({ winnerTeam: 1, points: 1, reason: 'BAZAS' });
    expect(mano.state.history[0].tricks).toHaveLength(3);
  });

  it('con la mano del lado del equipo 0 las tres pardas se la dan a ese equipo', () => {
    const hands = { p1: ['3-basto', '3-copa', '2-basto'], p0: ['3-espada', '3-oro', '2-espada'] };
    const state = createMatch({ rules: { playerCount: 2 }, seed: 1, firstDealerSeat: 1, deck: deckFor(hands, 0, 2) });

    const mano = playTricks(
      state,
      { p0: '3-espada', p1: '3-basto' },
      { p0: '3-oro', p1: '3-copa' },
      { p0: '2-espada', p1: '2-basto' },
    );

    expect(mano.state.hand.participants[0]).toBe('p0');
    expect(mano.state.hand.tricks.map((trick) => trick.winnerTeam)).toEqual(['PARDA', 'PARDA', 'PARDA']);
    expect(mano.state.hand.result).toEqual({ winnerTeam: 0, points: 1, reason: 'BAZAS' });
  });
});

describe('jerarquía única', () => {
  it('[ENG-20] la tabla de truco vive solo en cards.ts y `resolveTrick` se define una sola vez', () => {
    const fuentes = engineSources();

    const tablasDeRango = fuentes
      .filter(({ source }) => /RANK_BY|'1-espada':/.test(source))
      .map(({ file }) => file);
    expect(tablasDeRango).toEqual(['cards.ts']);

    const resolvedores = fuentes.filter(({ source }) => /export function resolveTrick/.test(source)).map(({ file }) => file);
    expect(resolvedores).toEqual(['tricks.ts']);
  });
});
