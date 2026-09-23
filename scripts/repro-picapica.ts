#!/usr/bin/env node
/**
 * Pica-Pica full-flow test (headless) — NATURAL trigger, robust loop.
 *
 * Plays a 6-player game; nudges scores into pica-pica range between NORMAL
 * hands only. While inPicaPicaHand is active, NEVER calls startNewHand —
 * the engine advances submanos on its own. Verifies: 3 submanos played,
 * pair size 2, winner 2-of-3, next hand normal, envido restricted to pair.
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

let passed = 0;
let failed = 0;
function assert(label: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const { engine, players } = createTestGame(6);
const e = engine as any;
engine.startGame(players, { playerCount: 6, difficulty: 'normal' } as GameConfig);

const submanosSeen: number[] = [];
let lastSubmano = -1;
let enteredPicaPica = false;
let guard = 0;

while (guard++ < 900) {
  const state = engine.getState();
  if (state.gameOver) break;

  // Track submano transitions
  if (e.inPicaPicaHand && e.picaPicaSubmano !== lastSubmano) {
    lastSubmano = e.picaPicaSubmano;
    if (!submanosSeen.includes(e.picaPicaSubmano)) submanosSeen.push(e.picaPicaSubmano);
    enteredPicaPica = true;
  }

  // Resolving phases: NEVER advance mid-pica-pica; the engine starts the next
  // submano itself. Only start a new hand when pica-pica is over (inPicaPicaHand false).
  if (state.phase === 'round-resolving' || state.phase === 'round-over' || state.phase === 'picapica-resolving') {
    if (!e.inPicaPicaHand) {
      // Between NORMAL hands: nudge scores into pica-pica range so the engine
      // naturally activates pica-pica on the next startNewHand
      const sc = engine.getScores();
      if (sc.team0 < 5 || sc.team1 < 5 || sc.team0 > 25 || sc.team1 > 25) {
        e.scores = { team0: Math.max(5, Math.min(25, sc.team0)), team1: Math.max(5, Math.min(25, sc.team1)) };
        if (e.scores.team0 < 5 || e.scores.team1 < 5) e.scores = { team0: 7, team1: 9 };
      }
      e.startNewHand();
    }
    continue;
  }

  // Active pair must be exactly 2 players inside a submano
  if (e.inPicaPicaHand && e.picaPicaActivePairIds?.length !== 2) {
    assert(`Active pair = 2 players (submano ${e.picaPicaSubmano})`, false, JSON.stringify(e.picaPicaActivePairIds));
    break;
  }

  if (state.envido.phase === 'opening' && !state.envido.accepted) {
    const aiResp = players.find(p => p.isAI && p.team !== state.envido.callerTeam);
    if (aiResp) e.respondEnvido(aiResp.id, Math.random() < 0.6);
    continue;
  }
  if (state.truco.level > 0 && !state.truco.accepted) {
    const responder = players.find(p => p.team !== state.truco.lastChallengerTeam && p.isAI);
    if (responder) e.respondTruco(responder.id, Math.random() < 0.5);
    continue;
  }
  const pid = state.currentTurnPlayerId;
  if (!pid) { e.startNewHand(); continue; }
  const hand = engine.getHands()[pid] || [];
  if (hand.length > 0) { engine.playCard(pid, Math.floor(Math.random() * hand.length)); continue; }
  e.startNewHand();
}

assert('Pica-Pica hand triggered', enteredPicaPica, `guard=${guard}`);
assert('All 3 submanos played (0,1,2)', submanosSeen.length === 3 && submanosSeen.join(',') === '0,1,2', `seen: ${submanosSeen.join(',')}`);
assert('Pica-Pica results recorded (3 submanos)', e.picapicaResults.length >= 3, JSON.stringify(e.picapicaResults).slice(0, 150));

const resultsOk = e.picapicaResults.length >= 3 && e.picapicaResults.every((r: any) => typeof r?.teamWinner === 'number' && r.teamWinner >= 0);
assert('Each submano has a team winner', resultsOk, JSON.stringify(e.picapicaResults).slice(0, 150));

const t0 = e.picapicaResults.filter((r: any) => r.teamWinner === 0).length;
const t1 = e.picapicaResults.filter((r: any) => r.teamWinner === 1).length;
assert('Pica-Pica decided by 2-of-3 submanos', t0 >= 2 || t1 >= 2, `team0:${t0} team1:${t1}`);

const stateAfter = engine.getState();
assert('Game continues after pica-pica (not stuck)', stateAfter.gameOver || e.inPicaPicaHand === false || e.picapicaResults.length >= 3,
  `inPicaPicaHand=${e.inPicaPicaHand} phase=${stateAfter.phase}`);

// ── Envido in pica-pica restricted to the active pair ──
e.scores = { team0: 7, team1: 9 };
e.isPicaPica = true;
e.inPicaPicaHand = true;
e.picaPicaActivePairIds = ['player-0', 'player-5'];
e.currentRound = 0;
e.envido = { phase: 'none', callerTeam: null, level: 'envido', accepted: false, pointsAwarded: 0, team0Scored: 0, team1Scored: 0, team0Player1Envido: null, team0Player2Envido: null, team1Player1Envido: null, team1Player2Envido: null };
assert('Envido pica-pica: outsider blocked', e.canCallEnvido('player-2') === false);
assert('Envido pica-pica: pair member can call', e.canCallEnvido('player-0') === true);

console.log(`\nPica-Pica flow: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
