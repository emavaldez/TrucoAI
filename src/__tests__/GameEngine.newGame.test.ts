// Historia 0-3 (hotfix trabas legacy): después de una partida terminada,
// "Nuevo juego" (y volver a elegir cantidad desde el menú) tiene que arrancar
// con el marcador en 0-0 y sin restos de la partida anterior ([ENG-01] / [UI-01]).

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../core/GameEngine.js';
import type { PlayerConfig } from '../types.js';

/** 4 jugadores: player-0 humano (equipo 0) y el resto IA, alternando equipos. */
function makeFourPlayers(): PlayerConfig[] {
  return Array.from({ length: 4 }, (_, i) => ({
    id: `player-${i}`,
    name: `Jugador ${i + 1}`,
    isHuman: i === 0,
    isAI: i !== 0,
    difficulty: 'normal' as const,
    team: i % 2,
    position: i,
  }));
}

describe('Historia 0-3 · partida nueva sobre un motor ya usado', () => {
  it('[ENG-01] startGame después de una partida terminada deja el estado limpio', () => {
    const engine = new GameEngine();
    engine.startGame(makeFourPlayers(), { playerCount: 4, difficulty: 'normal' });

    // Una baza jugada (queda registrada en roundResults) y cantos en curso
    for (let i = 0; i < 4; i++) {
      expect(engine.playCard(engine.getCurrentTurnPlayerId(), 0).ok).toBe(true);
    }
    expect(engine.getRoundResults().length).toBeGreaterThan(0);

    const internal = engine as any;
    internal.truco = {
      level: 2, lastChallengerTeam: 0, accepted: true,
      pointsAwarded: 3, team0Scored: 3, team1Scored: 0,
    };
    internal.trucoWaitingForResponse = true;
    internal.envido = { ...internal.envido, phase: 'resolved', pointsAwarded: 2 };

    // Partida terminada
    engine.agregarPuntos(0, 30);
    expect(engine.getState().gameOver).toBe(true);

    // "Nuevo juego": otra partida en el mismo motor
    engine.startGame(makeFourPlayers(), { playerCount: 4, difficulty: 'normal' });

    const state = engine.getState();
    expect(engine.getScores()).toEqual({ team0: 0, team1: 0 });
    expect(state.gameOver).toBe(false);
    expect(state.currentRound).toBe(0);
    expect(state.roundResults).toEqual([]);
    expect(state.currentTrick).toEqual([]);
    expect(state.firstHandCompleted).toBe(false);
    expect(engine.getTrucoState().level).toBe(0);
    expect(engine.getTrucoState().accepted).toBe(false);
    expect(engine.getEnvidoState().phase).toBe('none');
    expect(engine.getEnvidoState().pointsAwarded).toBe(0);
    expect(engine.getInPicaPicaHand()).toBe(false);
    expect(engine.getPicaPicaSubmano()).toBe(0);
    expect(engine.getPicapicaResults()).toEqual([]);
    expect(engine.getPartidaHistory().hands).toEqual([]);
    expect(engine.getPartidaHistory().winningTeam).toBe(-1);

    // Y la partida nueva se juega de verdad: se reparte, se puede jugar y se puede sumar
    // (antes `gameOver` seguía en true: agregarPuntos no sumaba nada y no había ganador)
    expect(engine.agregarPuntos(1, 2)).toBe(2);
    expect(engine.getScores()).toEqual({ team0: 0, team1: 2 });
    const firstTurn = engine.getCurrentTurnPlayerId();
    expect(engine.getHands()[firstTurn]).toHaveLength(3);
    expect(engine.playCard(firstTurn, 0).ok).toBe(true);
  });
});
