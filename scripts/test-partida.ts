import { GameEngine } from '../src/core/GameEngine.js';
import { getCardRank, getCardName } from '../src/core/Rules.js';
import type { PlayerConfig, GameConfig, CardDef, PartidaHistory } from '../src/types.js';

const players: PlayerConfig[] = Array.from({ length: 4 }, (_, i) => ({
  id: `player-${i}`,
  name: `P${i}`,
  isHuman: false,
  isAI: true,
  difficulty: 'normal' as const,
  team: i % 2,
  position: i,
}));

// Test 1: Run 3 games to verify random initial dealer is not always player-0
console.log('=== Test 1: Random initial dealer (run 3 times) ===');
for (let run = 0; run < 3; run++) {
  const engine = new GameEngine();
  engine.startGame(players, { playerCount: 4, difficulty: 'normal' });
  const history = engine.getPartidaHistory();
  // Only check that it's NOT always the same fixed value
  const dealer = history.initialDealerId;
  console.log(`  Run ${run + 1}: initialDealerId=${dealer}, initialDealer.name=${players.find(p => p.id === dealer)?.name}`);
}

// Test 2: Run a full game and verify partida history accumulates
const engine2 = new GameEngine();
const q: Array<() => void> = [];

function run() {
  while (q.length > 0) {
    const fn = q.shift()!;
    fn();
  }
}

engine2.on('round-start', (d: any) => {
  // Just record
});
engine2.on('card-played', (d: any) => {
  // Just record
});
engine2.on('hand-resolved', (d: any) => {
  // Check partida history
  const h = engine2.getPartidaHistory();
  console.log(`  hand-resolved: hands=${h.hands.length}, scores=T0:${h.finalScores.team0} T1:${h.finalScores.team1}`);
});
engine2.on('game-over', (d: any) => {
  const h = engine2.getPartidaHistory();
  console.log('\n=== Game Over ===');
  console.log(`  Winner: Team ${h.winningTeam + 1}`);
  console.log(`  Total hands: ${h.totalHands}`);
  h.hands.forEach((hand, i) => {
    console.log(`  Hand ${i + 1}: dealer=${hand.dealerId}, winner=Team ${hand.handWinnerTeam + 1}, pts=${hand.pointsAwarded}, score=${hand.team0Score}-${hand.team1Score}`);
  });
});

engine2.startGame(players, { playerCount: 4, difficulty: 'normal' });
run();

console.log('\nInitial partida history after start:');
console.log(JSON.stringify(engine2.getPartidaHistory(), null, 2));