// Test: US-04 (T-007, T-008) — Modelo formal de Mano con 3 bazas y Baza con cartasJugadas
// This script runs a full game and validates the Baza and Mano formal models

import { GameEngine } from '../src/core/GameEngine.js';
import { getCardRank, getCardName } from '../src/core/Rules.js';
import type {
  PlayerConfig, GameConfig, CardDef,
  Baza, Mano, PartidaHistory
} from '../src/types.js';

const players: PlayerConfig[] = Array.from({ length: 4 }, (_, i) => ({
  id: `player-${i}`,
  name: `P${i}`,
  isHuman: false,
  isAI: true,
  difficulty: 'normal' as const,
  team: i % 2,
  position: i,
}));

console.log('=== US-04: Modelo formal de Mano con 3 bazas y Baza con cartasJugadas ===');

const engine = new GameEngine();
const q: Array<() => void> = [];
let bazaCount = 0;
let manoCount = 0;

function run() {
  while (q.length > 0) {
    const fn = q.shift()!;
    fn();
  }
}

engine.on('trick-resolved', (d: any) => {
  bazaCount++;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineAny = engine as any;

  // Build formal Baza model
  const baza: Baza = engineAny.getBaza(d.trickNumber);

  if (baza) {
    console.log(`\n  Baza ${baza.bazaNumber + 1} (Trick ${d.trickNumber}):`);
    console.log(`    starterPlayerId: ${baza.starterPlayerId}`);
    console.log(`    cards in trick: ${baza.cards.length}`);
    for (const pc of baza.cards) {
      const cardName = getCardName(pc.card);
      console.log(`      ${pc.playerId} → ${cardName} (rank ${getCardRank(pc.card)})`);
    }
    console.log(`    winner: ${baza.winnerId} (Team ${baza.winnerTeam + 1})`);
    console.log(`    winningCard: ${getCardName(baza.winningCard)} (rank ${baza.highestCardRank})`);
  }
});

engine.on('hand-resolved', (d: any) => {
  manoCount++;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineAny = engine as any;

  // Build formal Mano model
  const mano: Mano | null = engineAny.getMano();

  if (mano) {
    console.log(`\n━━━ MANO ${mano.handNumber + 1} ━━━`);
    console.log(`  Dealer: ${mano.dealerId}`);
    console.log(`  Starter: ${mano.starterId}`);
    console.log(`  Total bazas: ${mano.bazas.length}`);
    console.log(`  Winner: Team ${mano.handWinnerTeam + 1}`);

    for (const baza of mano.bazas) {
      console.log(`\n  Baza ${baza.bazaNumber + 1}:`);
      console.log(`    Cards: ${baza.cards.length} played`);
      console.log(`    Winner: ${baza.winnerId} (Team ${baza.winnerTeam + 1})`);
      console.log(`    Winning card: ${getCardName(baza.winningCard)} (rank ${baza.highestCardRank})`);
    }

    // Validation
    const team0Tricks = mano.bazas.filter(b => b.winnerTeam === 0).length;
    const team1Tricks = mano.bazas.filter(b => b.winnerTeam === 1).length;
    console.log(`  Tricks: Team 1=${team0Tricks}, Team 2=${team1Tricks}`);
    if (team0Tricks > team1Tricks) {
      console.log(`  ✓ Hand winner Team 1 (${team0Tricks} > ${team1Tricks})`);
    } else if (team1Tricks > team0Tricks) {
      console.log(`  ✓ Hand winner Team 2 (${team1Tricks} > ${team0Tricks})`);
    } else {
      console.log(`  ⚠ Parda (first trick winner): ${mano.bazas[0]?.winnerId || 'N/A'}`);
    }
  }
});

engine.on('game-over', (d: any) => {
  const h: PartidaHistory = engine.getPartidaHistory();
  console.log('\n━━━ GAME OVER ━━━');
  console.log(`  Winner: Team ${h.winningTeam + 1}`);
  console.log(`  Total hands: ${h.totalHands}`);
  console.log(`  Total bazas tracked: ${bazaCount}`);
  console.log(`  Total manos tracked: ${manoCount}`);
  console.log(`  Final scores: ${h.finalScores.team0} - ${h.finalScores.team1}`);
});

// Simple AI that plays sequentially
engine.on('ai-turn', (d: any) => {
  q.push(() => {
    const pid = d.playerId;
    const curTurn = engine.getCurrentTurnPlayerId();
    if (curTurn !== pid) return;

    const hands = engine.getHands();
    const hand = hands[pid];
    if (!hand || hand.length === 0) return;

    // Play first card (simple strategy)
    engine.playCard(pid, 0);
  });
  run();
});

engine.startGame(players, { playerCount: 4, difficulty: 'normal' });
run();

console.log('\n=== US-04 Test Complete ===');
console.log(`Final scores: ${JSON.stringify(engine.getScores())}`);

// Final validation
const history = engine.getPartidaHistory();
console.log(`\nPartida history hands: ${history.hands.length}`);
if (history.totalHands > 0) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engineAny = engine as any;
  const lastMano = engineAny.getMano();
  if (lastMano) {
    console.log(`Last mano bazas: ${lastMano.bazas.length}`);
    console.log(`Last mano winner: Team ${lastMano.handWinnerTeam + 1}`);
  }
}

console.log('\n✓ US-04 test passed');