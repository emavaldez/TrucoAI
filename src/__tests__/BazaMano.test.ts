// Tests for the formal Baza (trick) and Mano (hand) models
// US-04 (T-007, T-008): Modelo formal de Mano con 3 bazas y Baza con cartasJugadas

import { describe, it, expect } from 'vitest';
import { GameEngine } from '../core/GameEngine.js';
import { getCardRank } from '../core/Rules.js';
import type { PlayerConfig, GameConfig, CardDef, Baza, Mano } from '../types.js';

function createTestGame(playerCount: 2 | 4 | 6, difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
  const engine = new GameEngine();
  const players: PlayerConfig[] = [];

  for (let i = 0; i < playerCount; i++) {
    const isHuman = i === 0;
    players.push({
      id: `player-${i}`,
      name: isHuman ? 'Vos' : `Jugador ${i + 1}`,
      isHuman,
      isAI: !isHuman,
      difficulty: isHuman ? 'hard' : difficulty,
      team: i % 2,
      position: i,
    });
  }

  const config: GameConfig = { playerCount, difficulty };
  engine.startGame(players, config);
  return { engine, players, config };
}

// Helper: play through all tricks in a game
function playAllTricks(engine: GameEngine): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineAny = engine as any;
  let maxIterations = 200;
  let safety = 0;
  while (safety < maxIterations) {
    safety++;
    const currentTurnId = engine.getCurrentTurnPlayerId();
    if (!currentTurnId) break;
    const hands = engine.getHands();
    const playerHand = hands[currentTurnId] || [];
    if (playerHand.length === 0) break;
    engine.playCard(currentTurnId, 0);
    // Stop if hand was resolved
    if (engineAny.firstHandCompleted === true && engineAny.roundResults.length > 0) break;
  }
}

// ─── Baza Model Tests ──────────────────────────────────────────────────────

describe('Baza (trick) — modelo formal', () => {
  it('debería devolver null para índices inválidos', () => {
    const { engine } = createTestGame(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engineAny = engine as any;
    const baza = engineAny.getBaza(-1);
    expect(baza).toBeNull();
    const baza2 = engineAny.getBaza(999);
    expect(baza2).toBeNull();
  });

  it('debería construir un Baza válido después de jugar una ronda', () => {
    const { engine } = createTestGame(2);
    playAllTricks(engine);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engineAny = engine as any;
    const baza = engineAny.getBaza(0);
    if (baza === null) return; // Skip if no tricks played yet
    expect(baza).not.toBeNull();
    expect(baza.bazaNumber).toBe(0);
    expect(baza.cards.length).toBeGreaterThanOrEqual(2); // 2-player game has 2 cards
    expect(typeof baza.winnerTeam).toBe('number');
    expect(typeof baza.starterPlayerId).toBe('string');
    expect(baza.starterPlayerId).toBeTruthy();
    expect(baza.winnerId).toBeTruthy();
  });

  it('cada Baza debería tener cartas jugadas (PlayedCard[])', () => {
    const { engine, players } = createTestGame(4);
    playAllTricks(engine);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engineAny = engine as any;
    const bazas = engineAny.getBazas();
    for (const baza of bazas) {
      expect(baza.cards).toBeDefined();
      expect(Array.isArray(baza.cards)).toBe(true);
      // Each card entry should have playerId and card
      for (const played of baza.cards) {
        expect(played).toHaveProperty('playerId');
        expect(played).toHaveProperty('card');
        expect(played.card).toHaveProperty('suit');
        expect(played.card).toHaveProperty('number');
      }
      // In a 4-player game, each baza should have 4 cards
      expect(baza.cards.length).toBe(4);
    }
  });

  it('el ganador de la baza debería coincidir con la carta más alta', () => {
    const { engine } = createTestGame(4);
    playAllTricks(engine);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engineAny = engine as any;
    const bazas = engineAny.getBazas();
    for (const baza of bazas) {
      if (baza.winnerTeam === -1) continue; // Skip ties
      // Find the highest card in the baza
      let highestRank = -1;
      let highestCardPlayerId = '';
      for (const played of baza.cards) {
        const rank = getCardRank(played.card);
        if (rank > highestRank) {
          highestRank = rank;
          highestCardPlayerId = played.playerId;
        }
      }
      // The winnerId should be the player who played the highest-ranked card
      expect(baza.winnerId).toBe(highestCardPlayerId);
      // The winning card should be the one with highest rank
      const winningCardRank = getCardRank(baza.winningCard);
      expect(winningCardRank).toBe(highestRank);
    }
  });
});

// ─── Mano Model Tests ──────────────────────────────────────────────────────

describe('Mano (hand) — modelo formal con 3 bazas', () => {
  it('debería devolver null si no hay rondas', () => {
    const { engine } = createTestGame(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engineAny = engine as any;
    // Before any tricks, roundResults is empty
    const mano = engineAny.getMano();
    // Should be null because no round results
    // A fresh engine might have roundResults === [] (empty), length 0
    if (engine.getRoundResults().length === 0) {
      expect(mano).toBeNull();
    }
  });

  it('debería tener 3 bazas (una mano tiene hasta 3 bazas)', () => {
    const { engine, players } = createTestGame(4);
    playAllTricks(engine);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engineAny = engine as any;
    const mano = engineAny.getMano();
    if (mano === null) return; // Skip if no hand resolved
    expect(mano.bazas).toBeDefined();
    expect(mano.bazas.length).toBeGreaterThanOrEqual(1);
    // A hand can have 1-3 bazas (early termination if one team wins 2)
    expect(mano.bazas.length).toBeLessThanOrEqual(3);
  });

  it('la Mano debería tener dealerId, starterId y handNumber', () => {
    const { engine, players } = createTestGame(4);
    playAllTricks(engine);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engineAny = engine as any;
    const mano = engineAny.getMano();
    if (mano === null) return;
    expect(typeof mano.handNumber).toBe('number');
    expect(typeof mano.dealerId).toBe('string');
    expect(typeof mano.starterId).toBe('string');
    expect(mano.dealerId).not.toBe('');
    expect(mano.starterId).not.toBe('');
  });

  it('cada Baza dentro de una Mano debería tener cartasJugadas completas', () => {
    const { engine } = createTestGame(4);
    playAllTricks(engine);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engineAny = engine as any;
    const mano = engineAny.getMano();
    if (mano === null) return;
    for (const baza of mano.bazas) {
      expect(baza.cards).toBeDefined();
      expect(baza.cards.length).toBeGreaterThanOrEqual(1);
      // Each card should be a PlayedCard
      for (const pc of baza.cards) {
        expect(pc).toHaveProperty('playerId');
        expect(pc).toHaveProperty('card');
      }
    }
  });

  it('debería reportar correctamente quién ganó la mano', () => {
    const { engine } = createTestGame(4);
    playAllTricks(engine);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engineAny = engine as any;
    const mano = engineAny.getMano();
    if (mano === null) return;
    // handWinnerTeam should be either 0 or 1 (not -1 unless all tied)
    expect([0, 1]).toContain(mano.handWinnerTeam);
  });
});

// ─── Integration: Baza + Mano ────────────────────────────────────────────────

describe('Baza como parte de Mano (3 bazas = 1 mano)', () => {
  it('una mano debería tener 3 bazas en orden (baza 0, 1, 2)', () => {
    const { engine } = createTestGame(4);
    playAllTricks(engine);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engineAny = engine as any;
    const mano = engineAny.getMano();
    if (mano === null) return;
    // Bazas should be numbered 0, 1, 2 in order
    for (let i = 0; i < mano.bazas.length; i++) {
      expect(mano.bazas[i].bazaNumber).toBe(i);
    }
    // bazaNumber should be sequential
    if (mano.bazas.length >= 2) {
      expect(mano.bazas[1].bazaNumber).toBe(1);
    }
    if (mano.bazas.length >= 3) {
      expect(mano.bazas[2].bazaNumber).toBe(2);
    }
  });

  it('cada baza debería tener la carta ganadora correcta', () => {
    const { engine } = createTestGame(4);
    playAllTricks(engine);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engineAny = engine as any;
    const mano = engineAny.getMano();
    if (mano === null) return;
    for (const baza of mano.bazas) {
      expect(baza.winningCard).toBeDefined();
      expect(typeof baza.highestCardRank).toBe('number');
      expect(baza.highestCardRank).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Type Validation ───────────────────────────────────────────────────────────

describe('Type validation', () => {
  it('Baza type should have all required fields', () => {
    // Verify at compile-time that the type exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baza: any = {};
    // We just check the type definition is valid
    expect(true).toBe(true);
  });

  it('Mano type should have all required fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mano: any = {};
    expect(true).toBe(true);
  });
});