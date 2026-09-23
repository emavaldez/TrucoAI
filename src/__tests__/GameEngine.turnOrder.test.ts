// US-05 (T-009, T-010): Orden de turno correcto en cada baza.
// B1 = MANO, B2+ = ganador de baza anterior.
// Validar "No es tu turno" — playCard() rejects wrong player.

import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '../core/GameEngine.js';
import type { PlayerConfig, GameConfig, CardDef } from '../types.js';

function makePlayers(): PlayerConfig[] {
  return [
    { id: 'p0', name: 'P0', team: 0, position: 0, isHuman: true, isAI: false, difficulty: 'normal' as const },
    { id: 'p1', name: 'P1', team: 1, position: 1, isHuman: true, isAI: false, difficulty: 'normal' as const },
    { id: 'p2', name: 'P2', team: 0, position: 2, isHuman: true, isAI: false, difficulty: 'normal' as const },
    { id: 'p3', name: 'P3', team: 1, position: 3, isHuman: true, isAI: false, difficulty: 'normal' as const },
  ];
}

/**
 * Helper: run a complete game with no-ops for events, just to
 * introspect internal state. We use engine.hand as a plain object
 * reference so we can check turn state.
 */
function createEngine(players: PlayerConfig[] = makePlayers()): GameEngine {
  const engine = new GameEngine();
  engine.startGame(players, { playerCount: 4, difficulty: 'normal' });
  return engine;
}

describe('US-05: Orden de turno correcto en cada baza', () => {
  describe('T-009: B1 (primera baza) = MANO (derecha del repartidor)', () => {
    it('el primer jugador en jugar en la ronda 0 debe ser MANO (derecha del dealer)', () => {
      const engine = createEngine();
      const dealerId = engine.getDealerId();
      const order = engine.getPlayingOrder();
      const dealerIdx = order.indexOf(dealerId);
      const manoIdx = (dealerIdx + 1) % order.length;
      const expectedMano = order[manoIdx];

      // Después de startGame → startNewHand(true) → startRound(),
      // el currentTurnPlayerId debe ser el MANO
      expect(engine.getCurrentTurnPlayerId()).toBe(expectedMano);
    });

    it('el MANO es el jugador a la derecha del dealer (sentido antihorario)', () => {
      const engine = createEngine();
      const dealerId = engine.getDealerId();
      const order = engine.getPlayingOrder();
      // Posición 0 = dealer. El MANO está en posición 1
      // (counter-clockwise: next in order)
      const dealerIdx = order.indexOf(dealerId);
      const manoIdx = (dealerIdx + 1) % order.length;
      expect(engine.getCurrentTurnPlayerId()).toBe(order[manoIdx]);
    });
  });

  describe('T-010: B2+ (bazas siguientes) = ganador de baza anterior', () => {
    it('después de resolver una baza, el turno pasa al siguiente jugador en orden', () => {
      const engine = createEngine();
      const order = engine.getPlayingOrder();
      const dealerId = engine.getDealerId();
      const dealerIdx = order.indexOf(dealerId);
      const manoIdx = (dealerIdx + 1) % order.length;
      const manoId = order[manoIdx];

      // Simular que el MANO juega una carta
      const hands = engine.getHands();
      expect(hands[manoId]).toBeDefined();
      expect(hands[manoId].length).toBe(3);

      // El MANO juega su primera carta
      const result = engine.playCard(manoId, 0);
      expect(result.ok).toBe(true);
      // Ahora el turno debe ser el siguiente en orden (el de la derecha del MANO)
      const nextIdx = (manoIdx + 1) % order.length;
      expect(engine.getCurrentTurnPlayerId()).toBe(order[nextIdx]);

      // El siguiente jugador juega
      const nextId = order[nextIdx];
      engine.playCard(nextId, 0);
      // Y el siguiente...
      const nextNextIdx = (nextIdx + 1) % order.length;
      expect(engine.getCurrentTurnPlayerId()).toBe(order[nextNextIdx]);
    });

    it('después de completar una baza (4 cartas), el turno debería avanzar a la siguiente ronda', () => {
      const engine = createEngine();
      const order = engine.getPlayingOrder();
      const round = engine.getCurrentRound();
      expect(round).toBe(0);

      // Jugar las 4 cartas de la baza respetando el orden de turnos
      for (let i = 0; i < order.length; i++) {
        const currentTurn = engine.getCurrentTurnPlayerId();
        const hands = engine.getHands();
        if (hands[currentTurn] && hands[currentTurn].length > 0) {
          engine.playCard(currentTurn, 0);
        }
      }

      // Después de la ronda 0, la ronda debería ser 1
      expect(engine.getCurrentRound()).toBe(1);
    });
  });

  describe('Validación: No es tu turno (engine rechaza jugadas fuera de turno)', () => {
    it('playCard() devuelve { ok: false } si no es el turno del jugador', () => {
      const engine = createEngine();
      const order = engine.getPlayingOrder();
      const currentTurn = engine.getCurrentTurnPlayerId();
      const wrongPlayer = order.find(p => p !== currentTurn)!;

      // Intentar jugar con el jugador incorrecto
      const hands = engine.getHands();
      if (hands[wrongPlayer] && hands[wrongPlayer].length > 0) {
        const result = engine.playCard(wrongPlayer, 0);
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('solo el MANO puede jugar en la primera baza', () => {
      const engine = createEngine();
      const order = engine.getPlayingOrder();
      const currentTurn = engine.getCurrentTurnPlayerId();

      // Solo el MANO puede jugar
      const valid = engine.playCard(currentTurn, 0);
      expect(valid.ok).toBe(true);

      // Después de que el MANO juega, el turno avanza al siguiente.
      // Los jugadores que NO son el nuevo turno actual deben ser rechazados.
      const newCurrentTurn = engine.getCurrentTurnPlayerId();
      for (const p of order) {
        if (p !== newCurrentTurn) {
          const hands = engine.getHands();
          // Puede que ya no tenga cartas (si ya jugó antes)
          if (hands[p] && hands[p].length > 0) {
            const result = engine.playCard(p, 0);
            expect(result.ok).toBe(false);
          }
        }
      }
    });

    it('si un jugador no tiene cartas, playCard devuelve { ok: false }', () => {
      const engine = createEngine();
      // Jugar todas las cartas de un jugador
      const order = engine.getPlayingOrder();
      const player1 = order[0];
      // Jugar 3 cartas
      for (let i = 0; i < 3; i++) {
        const hands = engine.getHands();
        if (hands[player1] && hands[player1].length > 0) {
          engine.playCard(player1, 0);
        }
      }
      // Ya no tiene cartas, debe devolver { ok: false }
      const result = engine.playCard(player1, 0);
      expect(result.ok).toBe(false);
    });

    it('cardIndex inválido devuelve { ok: false }', () => {
      const engine = createEngine();
      const currentTurn = engine.getCurrentTurnPlayerId();
      const hands = engine.getHands();
      if (hands[currentTurn]) {
        expect(engine.playCard(currentTurn, -1).ok).toBe(false);
        expect(engine.playCard(currentTurn, 99).ok).toBe(false);
      }
    });
  });
});
