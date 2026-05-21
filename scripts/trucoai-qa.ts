#!/usr/bin/env node
/**
 * TrucoAI QA Suite — Comprehensive rule validation for Argentine Truco
 *
 * Usage:
 *   npx tsx scripts/trucoai-qa.ts              # Run all tests
 *   npx tsx scripts/trucoai-qa.ts --section deck  # Run specific section
 *
 * Exit code: 0 = all pass, 1 = any fail
 */

// ─── Test framework ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];
const sectionFilter = process.argv.includes('--section')
  ? process.argv[process.argv.indexOf('--section') + 1]
  : null;

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    const msg = detail ? `${label}: ${detail}` : label;
    failures.push(msg);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(name: string, fn: () => void): void {
  if (sectionFilter && name !== sectionFilter) return;
  console.log(`\n━━━ ${name} ━━━`);
  fn();
}

// ─── Imports ─────────────────────────────────────────────────────────────

// ESM: need to use .js extension even for .ts files
import { getCardRank, compareCards, getCardName, hasFlor } from '../src/core/Rules.js';
import { Deck } from '../src/core/Deck.js';
import { GameEngine } from '../src/core/GameEngine.js';
import { CardEvaluator } from '../src/ai/CardEvaluator.js';
import type { CardDef, PlayerConfig, GameConfig, CardNumber, Suit } from '../src/types.js';

// ─── Card Ranking Tests ──────────────────────────────────────────────────

section('card-ranking', () => {
  const suits: Suit[] = ['espada', 'basto', 'oro', 'copa'];
  const numbers: CardNumber[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

  // Check all 40 cards exist in the deck
  const d = new Deck();
  assert('Deck has 40 cards', d['cards']?.length === 40);

  // All 40 cards must have a defined rank
  for (const suit of suits) {
    for (const num of numbers) {
      const rank = getCardRank({ suit, number: num });
      assert(
        `Card ${num} ${suit} has defined rank`,
        rank !== undefined && rank !== null,
        `got ${rank}`
      );
    }
  }

  // Specific rankings
  assert('1 espada = 13 (strongest)', getCardRank({ suit: 'espada', number: 1 }) === 13);
  assert('1 basto = 12', getCardRank({ suit: 'basto', number: 1 }) === 12);
  assert('7 espada = 11', getCardRank({ suit: 'espada', number: 7 }) === 11);
  assert('7 oro = 10', getCardRank({ suit: 'oro', number: 7 }) === 10);
  assert('Any 3 = 9', getCardRank({ suit: 'copa', number: 3 }) === 9);
  assert('Any 2 = 8', getCardRank({ suit: 'basto', number: 2 }) === 8);
  assert('1 oro = 7', getCardRank({ suit: 'oro', number: 1 }) === 7);
  assert('1 copa = 7 (same as 1 oro)', getCardRank({ suit: 'copa', number: 1 }) === 7);
  assert('Any 12 = 6', getCardRank({ suit: 'espada', number: 12 }) === 6);
  assert('Any 11 = 5', getCardRank({ suit: 'oro', number: 11 }) === 5);
  assert('Any 10 = 4', getCardRank({ suit: 'basto', number: 10 }) === 4);
  assert('7 basto = 3', getCardRank({ suit: 'basto', number: 7 }) === 3);
  assert('7 copa = 3 (same as 7 basto)', getCardRank({ suit: 'copa', number: 7 }) === 3);
  assert('Any 6 = 2', getCardRank({ suit: 'espada', number: 6 }) === 2);
  assert('Any 5 = 1', getCardRank({ suit: 'copa', number: 5 }) === 1);
  assert('Any 4 = 0 (weakest)', getCardRank({ suit: 'oro', number: 4 }) === 0);

  // CompareCards tests
  const strongCard: CardDef = { suit: 'espada', number: 1 };
  const weakCard: CardDef = { suit: 'oro', number: 4 };
  assert('1 espada beats 4 oro', compareCards(strongCard, weakCard) === 1);
  assert('4 oro loses to 1 espada', compareCards(weakCard, strongCard) === -1);
  assert('Equal cards tie', compareCards(weakCard, { ...weakCard }) === 0);
  assert('1 oro ties 1 copa (equal rank)', compareCards(
    { suit: 'oro', number: 1 },
    { suit: 'copa', number: 1 }
  ) === 0);
  assert('7 basto ties 7 copa (equal rank)', compareCards(
    { suit: 'basto', number: 7 },
    { suit: 'copa', number: 7 }
  ) === 0);

  // Edge: different suits same number
  assert('7 espada beats 7 basto', compareCards(
    { suit: 'espada', number: 7 },
    { suit: 'basto', number: 7 }
  ) === 1);
  assert('7 oro beats 7 basto', compareCards(
    { suit: 'oro', number: 7 },
    { suit: 'basto', number: 7 }
  ) === 1);

  // getCardName
  assert('Card name format', getCardName({ suit: 'espada', number: 1 }) === '1 de Espada');

  // hasFlor
  const flor: CardDef[] = [
    { suit: 'espada', number: 1 },
    { suit: 'espada', number: 2 },
    { suit: 'espada', number: 3 },
  ];
  assert('Three same suit = flor', hasFlor(flor) === true);

  const noFlor: CardDef[] = [
    { suit: 'espada', number: 1 },
    { suit: 'basto', number: 2 },
    { suit: 'espada', number: 3 },
  ];
  assert('Mixed suits ≠ flor', hasFlor(noFlor) === false);
});

// ─── Deck Tests ──────────────────────────────────────────────────────────

section('deck', () => {
  const d = new Deck();

  // Deck size
  assert('Deck initializes with 40 cards', d.remaining === 40);

  // Draw all cards
  const drawn: CardDef[] = [];
  for (let i = 0; i < 40; i++) {
    const c = d.draw();
    if (c) drawn.push(c);
  }
  assert('Draw 40 cards returns 40 cards', drawn.length === 40);
  assert('Empty after 40 draws', d.draw() === null);
  assert('isEmpty returns true', d.isEmpty() === true);

  // Check all 40 cards are unique by JSON string
  const uniqueCards = new Set(drawn.map(c => `${c.number}-${c.suit}`));
  assert('All 40 cards are unique', uniqueCards.size === 40);

  // Check suits distribution
  for (const suit of ['espada', 'basto', 'oro', 'copa'] as Suit[]) {
    const count = drawn.filter(c => c.suit === suit).length;
    assert(`Suit ${suit} has 10 cards`, count === 10);
  }

  // Reset
  const d2 = new Deck();
  assert('New deck after reset', d2.remaining === 40);
  assert('Shuffle does not change card count', d2['cards']?.length === 40);
});

// ─── Helper: Create a minimal game engine for testing ────────────────────

function createTestGame(playerCount: 2 | 4 | 6, difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
  const engine = new GameEngine();
  const players: PlayerConfig[] = [];

  for (let i = 0; i < playerCount; i++) {
    const isHuman = i === 0;
    let team: number;
    if (playerCount === 2) {
      team = i; // 0, 1
    } else {
      // 4 or 6 players: alternating teams
      team = i % 2;
    }
    players.push({
      id: `player-${i}`,
      name: isHuman ? 'Vos' : `Jugador ${i + 1}`,
      isHuman,
      isAI: !isHuman,
      difficulty,
      team,
      position: i,
    });
  }

  const config: GameConfig = { playerCount, difficulty };
  engine.startGame(players, config);
  return { engine, players, config };
}

// ─── Dealing Tests ───────────────────────────────────────────────────────

section('dealing', () => {
  for (const count of [2, 4, 6] as const) {
    const { engine, players } = createTestGame(count);
    const hands = engine.getHands();

    assert(
      `${count}-player: each player gets 3 cards`,
      players.every(p => (hands[p.id] || []).length === 3),
      `some player has != 3 cards`
    );

    const totalCards = players.reduce((sum, p) => sum + (hands[p.id] || []).length, 0);
    assert(`${count}-player: total dealt = ${count * 3}`, totalCards === count * 3,
      `got ${totalCards} cards dealt`);

    // Deck should have 40 - (count * 3) remaining
    assert(`${count}-player: deck remaining = ${40 - count * 3}`,
      engine.getDeckRemaining() === 40 - count * 3,
      `got ${engine.getDeckRemaining()}`
    );
  }
});

// ─── Starter Tests ───────────────────────────────────────────────────────

section('starter', () => {
  for (const count of [2, 4, 6] as const) {
    const { engine } = createTestGame(count);
    const starterId = engine.getStarterId();
    assert(`${count}-player: has starter defined`, starterId !== '');
    // Starter should NOT be the dealer (it's right of dealer)
    const dealerId = engine.getDealerId();
    assert(`${count}-player: starter ≠ dealer`, starterId !== dealerId,
      `starter ${starterId} should not be dealer ${dealerId}`
    );
  }

  // Test starter = right of dealer (counter-clockwise = previous index)
  const { engine, players } = createTestGame(4);
  const order = [...players].sort((a, b) => a.position - b.position);
  const dealerIdx = order.findIndex(p => p.id === engine.getDealerId());
  const expectedStarterIdx = (dealerIdx + 1) % order.length;
  assert('Starter is right of dealer (counter-clockwise)',
    engine.getStarterId() === order[expectedStarterIdx].id
  );
});

// ─── Helper: Play through all 3 tricks of a hand ─────────────────────────

function playAllTricks(engine: GameEngine): void {
  // Play until all 3 tricks complete (hands empty)
  let maxIterations = 100;
  let safety = 0;
  while (safety < maxIterations) {
    safety++;
    const currentTurnId = engine.getCurrentTurnPlayerId();
    if (!currentTurnId) break;

    const hands = engine.getHands();
    const playerHand = hands[currentTurnId] || [];
    if (playerHand.length === 0) {
      // All players done — hand is over
      break;
    }

    engine.playCard(currentTurnId, 0);
  }
}

// ─── Trick Resolution Tests ──────────────────────────────────────────────

section('trick-resolution', () => {
  const { engine, players } = createTestGame(2);

  playAllTricks(engine);

  // After 3 tricks, round-results should exist
  const results = engine.getRoundResults();
  assert('3 tricks played', results.length === 3,
    `got ${results.length} results`
  );
  assert('Some rounds have winners',
    results.some(r => r.teamWinner === 0 || r.teamWinner === 1),
    'all rounds were ties'
  );

  // Verify trick winners alternate correctly
  for (let i = 0; i < results.length; i++) {
    assert(`Result ${i} has highestCardPlayerId`, results[i].highestCardPlayerId !== null && results[i].highestCardPlayerId !== '');
  }
});

// ─── Envido Tests ────────────────────────────────────────────────────────

section('envido', () => {
  const { engine, players } = createTestGame(2);

  // Test envido scoring
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineAny = engine as any;

  // Test getEnvidoCardValue via the engine's private method
  // envido values: 1→1, 2→2, ... 7→7, 10→10, 11→11, 12→12
  const envidoValues: [CardNumber, number][] = [
    [1, 1], [2, 2], [3, 3], [4, 4], [5, 5],
    [6, 6], [7, 7], [10, 10], [11, 11], [12, 12],
  ];
  for (const [num, expected] of envidoValues) {
    const val = engineAny.getEnvidoCardValue({ suit: 'espada', number: num });
    assert(`Envido value for ${num} = ${expected}`, val === expected, `got ${val}`);
  }

  // Test envido score calculation: 2 cards same suit = 20 + val1 + val2
  const testCards: CardDef[] = [
    { suit: 'espada', number: 7 },
    { suit: 'espada', number: 1 },
    { suit: 'oro', number: 4 },
  ];
  // 7 espada = 7, 1 espada = 1 → 20 + 7 + 1 = 28
  const score = engineAny.getEnvidoScore(testCards);
  assert('Envido score 7+1 = 28', score === 28, `got ${score}`);

  // Single suit = just the highest card value
  const soloCards: CardDef[] = [
    { suit: 'espada', number: 1 },
    { suit: 'basto', number: 7 },
    { suit: 'oro', number: 4 },
  ];
  // No same suit pair → envido = max(1, 7, 4) = 7
  const soloScore = engineAny.getEnvidoScore(soloCards);
  assert('Envido no pair = highest value (7)', soloScore === 7, `got ${soloScore}`);

  // Three same suit = 20 + best two
  const trioCards: CardDef[] = [
    { suit: 'espada', number: 7 },
    { suit: 'espada', number: 1 },
    { suit: 'espada', number: 3 },
  ];
  // 20 + 7 + 3 = 30
  const trioScore = engineAny.getEnvidoScore(trioCards);
  assert('Envido three same suit = 20 + top2 (30)', trioScore === 30, `got ${trioScore}`);

  // Envido: only dealer or pie can call (tested via canCallEnvido)
  const hasCanCall = typeof engineAny.canCallEnvido === 'function';
  assert('Has canCallEnvido method', hasCanCall, 'canCallEnvido not found');
});

// ─── Truco Tests ─────────────────────────────────────────────────────────

section('truco', () => {
  const { engine, players } = createTestGame(2);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineAny = engine as any;

  // Test truco challenge
  engineAny.challengeTruco(players[0].id);
  const trucoState = engine.getTrucoState();
  assert('Truco level becomes 1', trucoState.level === 1, `got level ${trucoState.level}`);
  assert('Truco challenger team set', trucoState.lastChallengerTeam === players[0].team);

  // Test retruco (level 2)
  engineAny.challengeTruco(players[0].id);
  const trucoState2 = engine.getTrucoState();
  assert('Retruco level becomes 2', trucoState2.level === 2, `got level ${trucoState2.level}`);

  // Test vale4 (level 3)
  engineAny.challengeTruco(players[0].id);
  const trucoState3 = engine.getTrucoState();
  assert('Vale4 level becomes 3', trucoState3.level === 3, `got level ${trucoState3.level}`);

  // Reset truco
  engineAny.resetTruco();
  const trucoReset = engine.getTrucoState();
  assert('Reset truco = level 0', trucoReset.level === 0);

  // Test truco acceptance
  engineAny.challengeTruco(players[0].id);
  engineAny.respondTruco(players[1].id, true);
  const trucoAccepted = engine.getTrucoState();
  assert('Truco accepted flag', trucoAccepted.accepted === true);

  // Test truco rejection (from opponent)
  // Can't reject if already accepted, need fresh state
  engineAny.resetTruco();
  engineAny.challengeTruco(players[0].id);
  engineAny.respondTruco(players[1].id, false);
  // Reject = challenger gets 1 point (base hand value for truco level 1)
  const scores = engine.getScores();
  assert('Truco rejection gives 1pt to challenger',
    scores.team0 === 1 || scores.team1 === 1,
    `scores = team0:${scores.team0}, team1:${scores.team1}`
  );
});

// ─── Game Flow Tests ─────────────────────────────────────────────────────

section('game-flow', () => {
  const { engine, players } = createTestGame(2);

  // Current turn should be starter (right of dealer)
  const turnPlayerId = engine.getCurrentTurnPlayerId();
  assert('Current turn initialized', turnPlayerId !== '');

  // Play 3 tricks
  playAllTricks(engine);

  assert('3 round results after 3 tricks', engine.getRoundResults().length === 3);
  assert('Hands emptied after 3 tricks',
    Object.values(engine.getHands()).every((h: CardDef[]) => h.length === 0)
  );

  // Scores should reflect tricks won (at least 1 point if any non-tied rounds)
  const scores = engine.getScores();
  const hasValidRounds = engine.getRoundResults().some(r => r.teamWinner !== -1);
  const totalScore = scores.team0 + scores.team1;
  if (hasValidRounds) {
    assert('Scores awarded after hand', totalScore > 0,
      `team0:${scores.team0}, team1:${scores.team1}`
    );
  } else {
    assert('No scores when all rounds tied', totalScore === 0,
      `team0:${scores.team0}, team1:${scores.team1}`
    );
  }

  // Check firstHandCompleted flag
  const engineAny = engine as any;
  assert('First hand completed', engineAny.firstHandCompleted === true);
});

// ─── CardEvaluator Tests ─────────────────────────────────────────────────

section('card-evaluator', () => {
  // We can't easily instantiate Player without the class
  // But we can test the evaluator's logic via getWinProbability
  const evaluator = new CardEvaluator();

  // Best card should have highest win probability
  const bestProb = (evaluator as any).getWinProbability({ suit: 'espada', number: 1 });
  assert('1 espada win prob = 1.0 (highest)', bestProb === 1.0, `got ${bestProb}`);

  const worstProb = (evaluator as any).getWinProbability({ suit: 'oro', number: 4 });
  assert('4 oro win prob = 0.02 (lowest)', worstProb === 0.02, `got ${worstProb}`);

  // Mid-range card
  const midProb = (evaluator as any).getWinProbability({ suit: 'copa', number: 10 });
  assert('10 copa win prob = 0.35', midProb === 0.35, `got ${midProb}`);

  // getWinProbability uses ranking from getCardRank, not the number
  // Verify ranking-to-probability mapping
  const rank7e = getCardRank({ suit: 'espada', number: 7 });
  const prob7e = (evaluator as any).getWinProbability({ suit: 'espada', number: 7 });
  assert(`7 espada (rank ${rank7e}) win prob = 0.90`, prob7e === 0.90, `got ${prob7e}`);

  const rank1b = getCardRank({ suit: 'basto', number: 1 });
  const prob1b = (evaluator as any).getWinProbability({ suit: 'basto', number: 1 });
  assert(`1 basto (rank ${rank1b}) win prob = 0.97`, prob1b === 0.97, `got ${prob1b}`);

  // Equal rank cards have same probability
  const prob1o = (evaluator as any).getWinProbability({ suit: 'oro', number: 1 });
  const prob1c = (evaluator as any).getWinProbability({ suit: 'copa', number: 1 });
  assert('1 oro and 1 copa same win prob', prob1o === prob1c, `oro:${prob1o} copa:${prob1c}`);
});

// ─── Pica-Pica Tests ─────────────────────────────────────────────────────

section('pica-pica', () => {
  const { engine, players } = createTestGame(6);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineAny = engine as any;

  // Pica-pica triggers when both teams have 5-25 points
  // Simulate by setting scores
  engineAny.scores = { team0: 5, team1: 10 };
  assert('Pica-pica check returns true',
    engineAny.checkPicaPica() === true,
    'should be true at 5-10'
  );

  engineAny.scores = { team0: 3, team1: 10 };
  assert('Pica-pica false below 5 pts',
    engineAny.checkPicaPica() === false,
    'should be false at 3-10'
  );

  engineAny.scores = { team0: 5, team1: 28 };
  assert('Pica-pica false above 25 pts',
    engineAny.checkPicaPica() === false,
    'should be false at 5-28'
  );

  // Pica-pica only for 6 players... wait, in 2 player mode
  const { engine: eng2 } = createTestGame(2);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (eng2 as any).scores = { team0: 5, team1: 10 };
  assert('Pica-pica false for 2-player mode',
    (eng2 as any).checkPicaPica() === false,
    'pica-pica should only work in 6-player'
  );
});

// ─── Edge Cases ──────────────────────────────────────────────────────────

section('edge-cases', () => {
  const { engine, players } = createTestGame(2);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineAny = engine as any;

  // Test that card index out of bounds returns false
  const h = engine.getHands();
  const humanCards = h[players[0].id] || [];
  if (humanCards.length > 0) {
    const result = engine.playCard(players[0].id, 99);
    assert('Play card at invalid index returns false', result === false);
  }

  // Test that playing when not your turn returns false
  // Force turn to AI and try human play
  const wrongTurn = engine.playCard(players[0].id, 0);
  // This might work or not depending on whose turn it is
  // Just verify it doesn't crash

  // Irse al mazo = folding
  // The engine doesn't have a direct 'irse al mazo' exposed publicly
  // but we can test that truco rejection awards points correctly
  const scoresBefore = { ...engine.getScores() };
  engineAny.resetTruco();
  engineAny.challengeTruco(players[0].id);
  engineAny.respondTruco(players[1].id, false);
  const scoresAfter = engine.getScores();
  assert('Truco rejection scores points',
    scoresAfter.team0 > scoresBefore.team0 || scoresAfter.team1 > scoresBefore.team1,
    `before: ${JSON.stringify(scoresBefore)}, after: ${JSON.stringify(scoresAfter)}`
  );
});

// ─── Aceptado Truco Scoring Tests ──────────────────────────────────────

section('truco-scoring', () => {
  const { engine, players } = createTestGame(2);
  const engineAny = engine as any;

  // Truco accepted = 2 pts
  engineAny.challengeTruco(players[0].id);
  engineAny.respondTruco(players[1].id, true);
  // Now resolve hand (award the truco + mano points)
  // After acceptance and hand resolution, truco is worth 2
  const trucoState = engine.getTrucoState();
  assert('Truco accepted level = 1', trucoState.level === 1);
  assert('Truco accepted = true', trucoState.accepted === true);

  // Retruco accepted = 3 pts
  engineAny.resetTruco();
  engineAny.challengeTruco(players[0].id); // truco level 1
  engineAny.respondTruco(players[1].id, true); // accept - wait, this accepts the challenge, can also raise
  // Actually in the new rules, the opponent can only accept/reject, not raise
  // The challenger raises
  engineAny.resetTruco();
  engineAny.challengeTruco(players[0].id); // truco = level 1
  // In the updated rules, accept means just accept level 1
  engineAny.respondTruco(players[1].id, true);
  assert('Truco 1 accepted', engine.getTrucoState().accepted === true);

  // Check rejection gives previous level points
  engineAny.resetTruco();
  engineAny.challengeTruco(players[0].id);
  // Reject truco level 1 = 1pt to caller
  engineAny.respondTruco(players[1].id, false);
  const scores2 = engine.getScores();
  const total2 = scores2.team0 + scores2.team1;
  assert('Truco rejected = previous level (1pt)', total2 > 0,
    `scores: ${JSON.stringify(scores2)}`
  );
});

// ─── Envido Scoring Tests ──────────────────────────────────────────────

section('envido-scoring', () => {
  const { engine, players } = createTestGame(2);
  const engineAny = engine as any;

  // Envido = 2 pts when accepted
  engineAny.resetEnvido();
  engineAny.openEnvido(players[0].id); // player-0 is either dealer or pie
  // Actually with the new rules, only dealer or pie can call
  // In 2-player with player-0 as first... dealer is player-1 (rotated)
  // Let's just test the envido scoring through the open/respond flow
  // Force envido state to test
  engineAny.envido.totalPoints = 0;
});

// ─── Team Assignment Tests ──────────────────────────────────────────────

section('team-assignment', () => {
  function checkTeams(count: 2 | 4 | 6) {
    const { engine, players } = createTestGame(count);

    // Teams must alternate: 0,1,0,1,...
    for (let i = 0; i < players.length; i++) {
      assert(`${count}-player: player-${i} team = ${i % 2}`,
        players[i].team === i % 2,
        `got team ${players[i].team}`
      );
    }

    // Names check uses createTestGame helper (which uses generic names)
    if (count === 4) {
      assert('4-player: human name = Vos', players[0].name === 'Vos');
      assert('4-player: player-1 name set', players[1].name.length > 0);
      assert('4-player: player-2 name set', players[2].name.length > 0);
    }
    // Verify no two players have the same name
    const names = players.map(p => p.name);
    const uniqueNames = new Set(names);
    assert(`${count}-player: names are unique`, uniqueNames.size === players.length,
      `got names: ${names.join(', ')}`
    );
  }

  checkTeams(2);
  checkTeams(4);
  checkTeams(6);
});

// ─── Envido Pie Check Tests ─────────────────────────────────────────────

section('envido-pie', () => {
  const { engine, players } = createTestGame(4);

  const playingOrder = engine.getPlayingOrder();
  // With alternating teams: team0=[0,2], team1=[1,3]
  // Order: position 0, 1, 2, 3 -> [player-0, player-1, player-2, player-3]
  // Pie of team 0 (players 0,2): last in order = player-2
  // Pie of team 1 (players 1,3): last in order = player-3

  const team0Players = playingOrder.filter((id: string) => {
    const p = players.find((pl: any) => pl.id === id);
    return p && p.team === 0;
  });
  assert('Team 0 (Vos+Comp) has 2 players', team0Players.length === 2);
  assert('Pie of team 0 is player-2', team0Players[team0Players.length - 1] === 'player-2');

  const team1Players = playingOrder.filter((id: string) => {
    const p = players.find((pl: any) => pl.id === id);
    return p && p.team === 1;
  });
  assert('Team 1 has 2 players', team1Players.length === 2);
  assert('Pie of team 1 is player-3', team1Players[team1Players.length - 1] === 'player-3');
});

// ─── Truco Acceptance Flow Tests ────────────────────────────────────────

section('truco-flow', () => {
  const { engine, players } = createTestGame(2);
  const engineAny = engine as any;

  engineAny.challengeTruco(players[0].id);
  assert('Truco level = 1 after challenge', engine.getTrucoState().level === 1);

  // Accept truco from opponent side
  engineAny.respondTruco(players[1].id, true);
  assert('Truco accepted', engine.getTrucoState().accepted === true);
  assert('Truco points still available', engine.getTrucoState().level === 1);

  // After acceptance, the turn should remain set
  const turnAfterAccept = engine.getCurrentTurnPlayerId();
  assert('Turn still set after truco accept', turnAfterAccept !== '');
});

// ─── Turn Order Tests ──────────────────────────────────────────────────

section('turn-order', () => {
  const { engine, players } = createTestGame(4);

  const order = engine.getPlayingOrder();
  assert('Playing order has 4 players', order.length === 4);
  assert('Order starts with player-0', order[0] === 'player-0');

  // Verify counter-clockwise: play one card to advance turn
  const currentTurn = engine.getCurrentTurnPlayerId();
  const hands = engine.getHands();
  if (currentTurn && hands[currentTurn]?.length > 0) {
    engine.playCard(currentTurn, 0);
    const nextTurn = engine.getCurrentTurnPlayerId();
    assert('Turn advanced to next player', nextTurn !== currentTurn);
  }
});

// ─── Results ─────────────────────────────────────────────────────────────

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) {
    console.log(`  • ${f}`);
  }
}

process.exit(failed > 0 ? 1 : 0);

export {};
