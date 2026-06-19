// Simulate a full 4-player TrucoAI game - v4 with truco-rejected handling
import { GameEngine } from '../src/core/GameEngine.js';
import { getCardRank, getCardName } from '../src/core/Rules.js';
import type { PlayerConfig, GameConfig, CardDef } from '../src/types.js';

interface Step {
  type: string;
  description: string;
  details: Record<string, any>;
}

const steps: Step[] = [];
let safety = 5000;

const labels4 = ['Vos (Equipo 1)', 'Contrario 1 (Equipo 2)', 'Compañero (Equipo 1)', 'Contrario 2 (Equipo 2)'];
const players: PlayerConfig[] = Array.from({ length: 4 }, (_, i) => ({
  id: `player-${i}`, name: labels4[i],
  isHuman: false, isAI: true,
  difficulty: i === 0 ? 'hard' : 'normal',
  team: i % 2, position: i,
}));

const engine = new GameEngine();
const q: Array<() => void> = [];

function add(type: string, desc: string, det: Record<string, any> = {}) {
  steps.push({ type, description: desc, details: det });
}

function run() {
  while (q.length > 0 && safety > 0) {
    safety--;
    const fn = q.shift()!;
    fn();
  }
}

function resume() {
  const pid = engine.getCurrentTurnPlayerId();
  if (!pid) return;
  const p = players.find(x => x.id === pid);
  if (p?.isAI) q.push(() => aiTurn(pid));
}

function startNewHand() {
  (engine as any).startNewHand();
  run();
}

function aiTurn(pid: string) {
  if (safety <= 0) return;
  const p = players.find(x => x.id === pid);
  if (!p) return;
  const hand = engine.getHands()[pid];
  if (!hand?.length) return;
  if ((engine as any).currentTurnPlayerId !== pid) return;

  const truco = (engine as any).truco;
  const envido = (engine as any).envido;
  const curRound = engine.getCurrentRound();
  const curTrick = engine.getCurrentTrick();

  // Try truco
  if (truco.level === 0 && envido.phase === 'none' && Math.random() < 0.25) {
    (engine as any).challengeTruco(pid);
    return;
  }
  // Try envido
  if (curRound === 0 && envido.phase === 'none' && truco.level === 0
      && curTrick.length === 0 && Math.random() < 0.3) {
    const order = (engine as any).getPlayingOrder();
    const mates = order.filter((id: string) => players.find(x => x.id === id)?.team === p.team);
    if (pid === mates[mates.length - 1]) {
      (engine as any).openEnvido(pid);
      return;
    }
  }

  // Play card
  const sorted = hand.map((c: any, i: number) => ({ c, i }))
    .sort((a: any, b: any) => getCardRank(b.c) - getCardRank(a.c));
  const ci = p.difficulty === 'hard' ? sorted[0].i
    : Math.random() < 0.7 ? sorted[0].i : sorted[Math.floor(Math.random() * sorted.length)].i;
  engine.playCard(pid, ci);
}

// === EVENTS ===

(engine as any).on('round-start', (d: any) => {
  const dealer = players.find(p => p.id === d.dealerId);
  const starter = players.find(p => p.id === d.starterId);
  add('round-start',
    `Mano ${(d.handNumber ?? 0) + 1} - Ronda ${(d.roundNumber ?? 0) + 1} comienza`,
    { handNumber: d.handNumber, roundNumber: d.roundNumber,
      dealerName: dealer?.name, starterName: starter?.name,
      scoreTeam0: d.scores?.team0 ?? 0, scoreTeam1: d.scores?.team1 ?? 0 });
});

(engine as any).on('card-played', (d: any) => {
  const p = players.find(x => x.id === d.playerId);
  const card = d.card as CardDef;
  add('card-played', `${p?.name} juega ${getCardName(card)}`,
    { ...d, playerName: p?.name, cardName: getCardName(card), cardRank: getCardRank(card) });
});

(engine as any).on('trick-resolved', (d: any) => {
  const w = d.winnerTeam === 0 ? 'Equipo 1' : d.winnerTeam === 1 ? 'Equipo 2' : 'Empate';
  add('trick-resolved', `Baza ${d.trickNumber} - Gana ${w}`, { ...d });
});

(engine as any).on('envido-opened', (d: any) => {
  add('envido-opened', `ENVIDO cantado!`, { ...d });
  const opp = d.team === 0 ? 1 : 0;
  const order = (engine as any).getPlayingOrder();
  const ids = order.filter((id: string) => players.find(p => p.id === id)?.team === opp);
  if (!ids.length) return;
  const pie = ids[ids.length - 1];
  q.push(() => {
    const wants = Math.random() < 0.6;
    if (wants && Math.random() < 0.25 && d.level !== 'falta-envido') {
      (engine as any).respondEnvido(pie, true, d.level === 'envido' ? 'real-envido' : 'falta-envido');
    } else {
      (engine as any).respondEnvido(pie, wants);
    }
  });
  run();
});

(engine as any).on('envido-raised', (d: any) => {
  add('envido-raised', `Sube a ${d.level}`, { ...d });
  const opp = d.team === 0 ? 1 : 0;
  const order = (engine as any).getPlayingOrder();
  const ids = order.filter((id: string) => players.find(p => p.id === id)?.team === opp);
  if (!ids.length) return;
  const pie = ids[ids.length - 1];
  q.push(() => {
    const wants = Math.random() < 0.6;
    if (wants && d.level !== 'falta-envido' && Math.random() < 0.25) {
      (engine as any).respondEnvido(pie, true, d.level === 'envido' ? 'real-envido' : 'falta-envido');
    } else {
      (engine as any).respondEnvido(pie, wants);
    }
  });
  run();
});

(engine as any).on('envido-resolved', (d: any) => {
  add('envido-resolved', `Envido: Equipo ${(d.winnerTeam ?? 0) + 1} gana ${d.points} pts`, { ...d });
  resume();
  run();
});

(engine as any).on('truco-challenged', (d: any) => {
  const lt = { 1: 'Truco', 2: 'Retruco', 3: 'Vale 4' } as Record<number, string>;
  add('truco-challenged', `${lt[d.level] ?? '?'} cantado!`, { ...d });
  const opp = d.challengerTeam === 0 ? 1 : 0;
  const order = (engine as any).getPlayingOrder();
  const ids = order.filter((id: string) => players.find(p => p.id === id)?.team === opp);
  if (!ids.length) return;
  q.push(() => {
    const wants = Math.random() < 0.65;
    if (wants && Math.random() < 0.3 && (engine as any).truco.level < 3) {
      (engine as any).respondTruco(ids[0], true, true);
    } else {
      (engine as any).respondTruco(ids[0], wants);
    }
  });
  run();
});

(engine as any).on('truco-raised', (d: any) => {
  const lt = { 1: 'Truco', 2: 'Retruco', 3: 'Vale 4' } as Record<number, string>;
  add('truco-raised', `Sube a ${lt[d.level]}!`, { ...d });
  const opp = d.team === 0 ? 1 : 0;
  const order = (engine as any).getPlayingOrder();
  const ids = order.filter((id: string) => players.find(p => p.id === id)?.team === opp);
  if (!ids.length) return;
  q.push(() => {
    const wants = Math.random() < 0.65;
    const raises = Math.random() < 0.3 && (engine as any).truco.level < 3;
    if (raises) (engine as any).respondTruco(ids[0], true, true);
    else (engine as any).respondTruco(ids[0], wants);
  });
  run();
});

(engine as any).on('truco-accepted', (d: any) => {
  add('truco-accepted', `Truco aceptado - se juega al doble`, { ...d });
  resume();
  run();
});

(engine as any).on('truco-resolved', (d: any) => {
  add('truco-resolved', `Truco: Equipo ${(d.winnerTeam ?? 0) + 1} gana ${d.points} pts`, { ...d });
  // Truco rejected/ended = start new hand
  startNewHand();
});

(engine as any).on('hand-resolved', (d: any) => {
  const winner = d.handWinnerTeam === 0 ? 'Equipo 1' : d.handWinnerTeam === 1 ? 'Equipo 2' : 'Empate';
  add('hand-resolved',
    `Mano ${(d.handNumber ?? 0) + 1} - Gana ${winner} (${d.pointsAwarded ?? 0} pts)`,
    { handNumber: d.handNumber, winnerTeam: d.handWinnerTeam,
      pointsAwarded: d.pointsAwarded, scoreTeam0: d.scoreTeam0, scoreTeam1: d.scoreTeam1 });
  // After hand resolved and if not game-over, new hand starts automatically via engine's resolveHand
});

(engine as any).on('game-over', (d: any) => {
  add('game-over', `JUEGO TERMINADO - Equipo ${(d.winningTeam ?? 0) + 1} GANA!`,
    { winningTeam: d.winningTeam, finalScoreTeam0: d.scores?.team0, finalScoreTeam1: d.scores?.team1 });
});

(engine as any).on('ai-turn', (d: any) => {
  q.push(() => aiTurn(d.playerId));
  run();
});

// === GO ===
engine.startGame(players, { playerCount: 4, difficulty: 'normal' });

console.error(`Done. Steps: ${steps.length}, Score: ${engine.getScores().team0}-${engine.getScores().team1}`);

const result = {
  players: players.map(p => ({ id: p.id, name: p.name, team: p.team })),
  steps,
  finalScores: engine.getScores(),
  totalSteps: steps.length,
};
console.log(JSON.stringify(result, null, 2));
