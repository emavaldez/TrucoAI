// Historia 0-3 (hotfix trabas legacy): en 6 jugadores la submano de pica-pica
// arranca con la pareja activa y, si el primero de la pareja es IA, nadie
// disparaba su turno → la partida quedaba congelada ([UI-02] / [AI-04]).

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../core/GameEngine.js';
import type { PlayerConfig } from '../types.js';

/** 6 jugadores: player-0 es el humano (equipo 0) y el resto son IA, alternando equipos. */
function makeSixPlayers(): PlayerConfig[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `player-${i}`,
    name: `Jugador ${i + 1}`,
    isHuman: i === 0,
    isAI: i !== 0,
    difficulty: 'normal' as const,
    team: i % 2,
    position: i,
  }));
}

interface PicaPicaFixture {
  engine: GameEngine;
  /** Eventos `ai-turn` de la mano de pica-pica, en orden. */
  aiTurns: any[];
  /** Submanos que arrancaron (`round-start` con `isPicaPica`). */
  submanoStarts: number[];
  /** Manos cerradas (`round-over`). */
  roundOvers: any[];
}

/**
 * Engine en 6p con una mano de pica-pica forzada: con el marcador en 10-10 la
 * regla (5..25) lo activa y `picaPicaHandAlternation = false` hace que la
 * próxima mano sea de pica-pica. Los listeners se registran después de
 * `startGame` (para no capturar la mano normal del arranque) y antes de forzar
 * la mano de pica-pica.
 */
function engineInPicaPicaHand(): PicaPicaFixture {
  const engine = new GameEngine();
  engine.startGame(makeSixPlayers(), { playerCount: 6, difficulty: 'normal' });

  const fixture: PicaPicaFixture = { engine, aiTurns: [], submanoStarts: [], roundOvers: [] };
  engine.on('ai-turn', (data: any) => fixture.aiTurns.push(data));
  engine.on('round-start', (data: any) => {
    if (data.isPicaPica) fixture.submanoStarts.push(data.picaPicaSubmano);
  });
  engine.on('round-over', (data: any) => fixture.roundOvers.push(data));

  const internal = engine as any;
  internal.scores = { team0: 10, team1: 10 };
  internal.isPicaPica = true;
  internal.picaPicaHandAlternation = false;
  internal.startNewHand();

  return fixture;
}

describe('Historia 0-3 · pica-pica sin trabarse', () => {
  it('[AI-04] pica-pica: al iniciar cada submano con una IA de mano se emite ai-turn', () => {
    const { engine, aiTurns } = engineInPicaPicaHand();
    const internal = engine as any;

    // Submano 0: pareja (player-0 humano, player-3 IA) → arranca el humano: sin ai-turn
    expect(engine.getInPicaPicaHand()).toBe(true);
    expect(internal.picaPicaActivePairIds).toEqual(['player-0', 'player-3']);
    expect(engine.getPicaPicaSubmano()).toBe(0);
    expect(engine.getCurrentTurnPlayerId()).toBe('player-0');
    expect(aiTurns).toEqual([]);

    // Submano 1: pareja (player-1, player-4), las dos IA → el de mano debe recibir su turno
    // (mismo camino que usa el motor al avanzar de submano: `startNextPicaPicaSubmano`)
    internal.picaPicaSubmano = 1;
    internal.startNextPicaPicaSubmano();
    expect(engine.getPicaPicaSubmano()).toBe(1);
    expect(engine.getCurrentTurnPlayerId()).toBe('player-1');
    expect(aiTurns).toHaveLength(1);
    expect(aiTurns[0]).toMatchObject({
      playerId: 'player-1',
      isPicaPica: true,
      picaPicaSubmano: 1,
    });

    // Submano 2: pareja (player-2, player-5) → mismo caso
    internal.picaPicaSubmano = 2;
    internal.startNextPicaPicaSubmano();
    expect(engine.getPicaPicaSubmano()).toBe(2);
    expect(engine.getCurrentTurnPlayerId()).toBe('player-2');
    expect(aiTurns.map(e => e.playerId)).toEqual(['player-1', 'player-2']);
    expect(aiTurns[1]).toMatchObject({ picaPicaSubmano: 2, isPicaPica: true });
  });

  it('pica-pica: las 3 submanos se juegan completas y la mano termina sin trabarse', () => {
    const { engine, aiTurns, submanoStarts, roundOvers } = engineInPicaPicaHand();

    // Se juega siempre con el turno que marca el motor: si una submano arranca
    // con una IA de mano y no se emite su `ai-turn`, el turno no avanza y el
    // loop no llega a las 3 submanos (es el bug que congelaba la partida en 6p).
    let steps = 0;
    while (engine.getPicapicaResults().length < 3 && steps < 200) {
      const turnId = engine.getCurrentTurnPlayerId();
      const hand = engine.getHands()[turnId] || [];
      expect(hand.length).toBeGreaterThan(0);
      expect(engine.playCard(turnId, 0).ok).toBe(true);
      steps++;
    }

    expect(steps).toBeLessThan(200);
    expect(submanoStarts).toEqual([0, 1, 2]);

    // Las 3 submanos quedaron jugadas y la mano se resolvió (la siguiente arranca sola)
    expect(engine.getPicapicaResults().map(r => r.submanoNumber)).toEqual([0, 1, 2]);
    expect(roundOvers).toHaveLength(1);
    expect(engine.isFirstHandCompleted()).toBe(true);

    // El humano (player-0) no juega en las submanos 1 y 2: se juegan igual entre las IA.
    // El `ai-turn` de arranque de submano existe para las que empieza una IA
    // (submano 0 la empieza el humano, así que solo se ve el turno de su pareja
    // IA, que dispara `nextTurn` al jugar el humano).
    const iaStarts = aiTurns
      .filter(e => e.isPicaPica)
      .map(e => `${e.picaPicaSubmano}:${e.playerId}`);
    expect(iaStarts).toEqual(['1:player-1', '2:player-2']);
    expect(aiTurns.map(e => e.playerId)).toContain('player-3');
  });
});
