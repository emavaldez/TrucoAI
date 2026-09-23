#!/usr/bin/env node
/**
 * Stress test: N full games per player count (2, 4, 6) — catches
 * intermittent freezes that single runs miss. Same loop pattern as the
 * QA suite's simulacion-partidas but 10x per count.
 */
import { GameEngine } from '../src/core/GameEngine.js';
import type { PlayerConfig, GameConfig } from '../src/types.js';

function createTestGame(playerCount: 2 | 4 | 6) {
  const engine = new GameEngine();
  const players: PlayerConfig[] = [];
  for (let i = 0; i < playerCount; i++) {
    players.push({
      id: `player-${i}`,
      name: `Player ${i + 1}`,
      isAI: i !== 0,
      isHuman: i === 0,
      team: i % 2,
      position: i,
      difficulty: 'normal',
    } as any);
  }
  return { engine, players };
}

let totalOk = 0;
let totalFail = 0;

function simulateFullGame(playerCount: 2 | 4 | 6, difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
  const { engine, players } = createTestGame(playerCount);
  const e = engine as any;
  for (const p of players) p.difficulty = difficulty;
  engine.startGame(players, { playerCount, difficulty } as GameConfig);

  const MAX_ACTIONS = 600;
  let actionCount = 0;
  let stalledCount = 0;
  let lastStateKey = '';

  while (actionCount < MAX_ACTIONS) {
    actionCount++;
    const state = engine.getState();
    if (state.gameOver) return { ok: true, hands: state.partidaHistory.hands.length };

    const stateKey = `${state.phase}|${state.currentTurnPlayerId}|${state.currentRound}`;

    if (state.phase === 'round-resolving' || state.phase === 'round-over' || state.phase === 'picapica-resolving') {
      e.startNewHand();
      continue;
    }
    if (state.envido.phase === 'opening' && !state.envido.accepted) {
      const humanTeam = players[0].team;
      const isHumanCaller = state.envido.callerTeam === humanTeam;
      if (isHumanCaller) {
        const aiResponder = players.find(p => p.isAI && p.team === (humanTeam === 0 ? 1 : 0));
        if (aiResponder) e.respondEnvido(aiResponder.id, Math.random() < 0.6);
      } else {
        e.respondEnvido(players[0].id, Math.random() < 0.6);
      }
      continue;
    }
    if (state.truco.level > 0 && !state.truco.accepted) {
      const humanTeam = players[0].team;
      const isHumanChallenged = state.truco.lastChallengerTeam !== humanTeam;
      if (isHumanChallenged) {
        const roll = Math.random();
        if (roll < 0.5) e.respondTruco(players[0].id, true);
        else if (roll < 0.8) e.respondTruco(players[0].id, false);
        else e.respondTruco(players[0].id, true, true);
      } else {
        const aiResp = players.find(p => p.isAI && p.team !== humanTeam);
        if (aiResp) {
          const roll = Math.random();
          if (roll < 0.5) e.respondTruco(aiResp.id, true);
          else if (roll < 0.8) e.respondTruco(aiResp.id, false);
          else e.respondTruco(aiResp.id, true, true);
        }
      }
      continue;
    }
    const currentPlayerId = state.currentTurnPlayerId;
    if (!currentPlayerId) {
      stalledCount++;
      if (stalledCount > 5) return { ok: false, error: `No current player in phase=${state.phase}` };
      continue;
    }
    const hand = engine.getHands()[currentPlayerId] || [];
    if (hand.length > 0) {
      if (state.currentRound === 0 && state.envido.phase === 'none' && state.truco.level === 0) {
        if (currentPlayerId === players[0].id && Math.random() < 0.1) { e.openEnvido(players[0].id); continue; }
        const cp = players.find(p => p.id === currentPlayerId);
        if (cp && cp.isAI && Math.random() < 0.08) { e.openEnvido(currentPlayerId); continue; }
        if (Math.random() < 0.1) { e.challengeTruco(currentPlayerId); continue; }
      }
      const cardIdx = Math.floor(Math.random() * hand.length);
      const result = engine.playCard(currentPlayerId, cardIdx);
      if (result && !result.ok) {
        stalledCount++;
        if (stalledCount > 10) return { ok: false, error: `playCard failed: ${result.error}. Turn=${currentPlayerId} phase=${state.phase}` };
        continue;
      }
      stalledCount = 0;
      lastStateKey = stateKey;
      continue;
    }
    if (stateKey === lastStateKey) {
      stalledCount++;
      if (stalledCount > 5) return { ok: false, error: `Stuck: no cards for ${currentPlayerId}, phase=${state.phase}` };
    }
    lastStateKey = stateKey;
  }
  return { ok: false, error: `Exceeded max actions. Scores: ${JSON.stringify(engine.getScores())}` };
}

for (const pc of [2, 4, 6] as const) {
  let ok = 0;
  const fails: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = simulateFullGame(pc);
    if (r.ok) ok++;
    else fails.push(`#${i + 1}: ${r.error}`);
  }
  console.log(`${pc} jugadores: ${ok}/10 OK${fails.length ? '\n  FALLOS: ' + fails.join('\n  ') : ''}`);
  totalOk += ok;
  totalFail += fails.length;
}
console.log(`\nTOTAL: ${totalOk}/30 OK, ${totalFail} fail`);
process.exit(totalFail > 0 ? 1 : 0);
